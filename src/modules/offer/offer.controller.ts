import {DocumentType} from '@typegoose/typegoose';
import {Request, Response} from 'express';
import {ParamsDictionary} from 'express-serve-static-core';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import {AuthService, AuthSession} from '../../shared/auth/auth.service.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {HttpError} from '../../shared/errors/http-error.js';
import {CreateOfferDto} from './create-offer.dto.js';
import {OfferEntity} from './offer.entity.js';
import {OfferService} from './offer-service.interface.js';
import {toOffer, toSummary} from './offer.rdo.js';
import {ValidateMiddleware} from '../../shared/middleware/validate.middleware.js';
import {ValidateObjectIdMiddleware} from '../../shared/middleware/validate-object-id.middleware.js';
import {cityParamsSchema, createOfferSchema, updateOfferSchema} from '../../shared/middleware/schemas.js';
import {UpdateOfferDto} from './update-offer.dto.js';

type OfferBody = Omit<CreateOfferDto, 'authorId' | 'isFavorite' | 'commentsCount'>;

@injectable()
export class OfferController extends Controller {
  constructor(
    @inject(Component.OfferService) private readonly service: OfferService,
    @inject(Component.AuthService) private readonly auth: AuthService
  ) {
    super();
    this.addRoutes([
      {path: '/offers', method: 'get', handler: this.index},
      {path: '/offers', method: 'post', middleware: [new ValidateMiddleware(createOfferSchema)], handler: this.create},
      {path: '/offers/:offerId', method: 'get', middleware: [new ValidateObjectIdMiddleware('offerId')], handler: this.show},
      {path: '/offers/:offerId', method: 'patch', middleware: [new ValidateObjectIdMiddleware('offerId'), new ValidateMiddleware(updateOfferSchema)], handler: this.update},
      {path: '/offers/:offerId', method: 'delete', middleware: [new ValidateObjectIdMiddleware('offerId')], handler: this.delete},
      {path: '/cities/:city/offers/premium', method: 'get', middleware: [new ValidateMiddleware(cityParamsSchema, 'params')], handler: this.premium}
    ]);
  }

  private favoriteIds(session: AuthSession | null): string[] {
    return session ? session.user.favorites.map(String) : [];
  }

  private response(offer: DocumentType<OfferEntity>, session: AuthSession | null): object {
    return {...offer.toObject({virtuals: true}), isFavorite: this.favoriteIds(session).includes(offer.id)};
  }

  private async getOffer(id: string): Promise<DocumentType<OfferEntity>> {
    const offer = await this.service.findById(id);
    if (!offer) {
      throw new HttpError(StatusCodes.NOT_FOUND, 'Предложение не найдено');
    }
    return offer;
  }

  private async index(req: Request, res: Response): Promise<void> {
    const session = await this.auth.optional(req);
    const limit = req.query.limit === undefined ? 60 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new HttpError(StatusCodes.BAD_REQUEST, 'Некорректный параметр limit');
    }
    const offers = await this.service.find(limit);
    this.ok(res, offers.map((offer) => toSummary(this.response(offer, session))));
  }

  private async show(req: Request, res: Response): Promise<void> {
    const session = await this.auth.optional(req);
    this.ok(res, toOffer(this.response(await this.getOffer(req.params.offerId), session)));
  }

  private async premium(req: Request, res: Response): Promise<void> {
    const session = await this.auth.optional(req);
    const offers = await this.service.findPremiumByCity(req.params.city);
    this.ok(res, offers.map((offer) => toSummary(this.response(offer, session))));
  }

  private async create(req: Request<ParamsDictionary, object, OfferBody>, res: Response): Promise<void> {
    const session = await this.auth.current(req);
    const {title, description, postDate, city, previewImage, images, isPremium, rating, type, rooms, guests, price, facilities, location} = req.body;
    const created = await this.service.create({title, description, postDate, city, previewImage, images, isPremium, rating, type, rooms, guests, price, facilities, location, authorId: session.user.id, isFavorite: false, commentsCount: 0});
    const offer = await this.getOffer(created.id);
    this.created(res, toOffer(this.response(offer, session)));
  }

  private async update(req: Request<ParamsDictionary, object, UpdateOfferDto>, res: Response): Promise<void> {
    const session = await this.auth.current(req);
    const offer = await this.getOffer(req.params.offerId);
    const allowed: (keyof UpdateOfferDto)[] = ['title', 'description', 'postDate', 'city', 'previewImage', 'images', 'isPremium', 'rating', 'type', 'rooms', 'guests', 'price', 'facilities', 'location'];
    const data = Object.fromEntries(allowed.filter((key) => key in req.body).map((key) => [key, req.body[key]])) as UpdateOfferDto;
    const updated = await this.service.updateById(offer.id, data);
    if (!updated) {
      throw new HttpError(StatusCodes.NOT_FOUND, 'Предложение не найдено');
    }
    this.ok(res, toOffer(this.response(updated, session)));
  }

  private async delete(req: Request, res: Response): Promise<void> {
    const offer = await this.getOffer(req.params.offerId);
    await this.service.deleteById(offer.id);
    this.noContent(res);
  }

}
