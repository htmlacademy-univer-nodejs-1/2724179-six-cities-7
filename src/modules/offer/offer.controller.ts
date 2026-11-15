import {DocumentType} from '@typegoose/typegoose';
import {Request, Response} from 'express';
import {ParamsDictionary} from 'express-serve-static-core';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import {isValidObjectId} from 'mongoose';
import {AuthService, AuthSession} from '../../shared/auth/auth.service.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {HttpError} from '../../shared/errors/http-error.js';
import {CreateOfferDto} from './create-offer.dto.js';
import {OfferEntity} from './offer.entity.js';
import {OfferService} from './offer-service.interface.js';
import {toOffer, toSummary} from './offer.rdo.js';
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
      {path: '/offers', method: 'post', handler: this.create},
      {path: '/offers/:offerId', method: 'get', handler: this.show},
      {path: '/offers/:offerId', method: 'patch', handler: this.update},
      {path: '/offers/:offerId', method: 'delete', handler: this.delete},
      {path: '/cities/:city/offers/premium', method: 'get', handler: this.premium}
    ]);
  }

  private favoriteIds(session: AuthSession | null): string[] {
    return session ? session.user.favorites.map(String) : [];
  }

  private response(offer: DocumentType<OfferEntity>, session: AuthSession | null): object {
    return {...offer.toObject({virtuals: true}), isFavorite: this.favoriteIds(session).includes(offer.id)};
  }

  private async getOffer(id: string): Promise<DocumentType<OfferEntity>> {
    if (!isValidObjectId(id)) {
      throw new HttpError(StatusCodes.BAD_REQUEST, 'Некорректный идентификатор предложения');
    }
    const offer = await this.service.findById(id);
    if (!offer) {
      throw new HttpError(StatusCodes.NOT_FOUND, 'Предложение не найдено');
    }
    return offer;
  }

  private assertOwner(offer: DocumentType<OfferEntity>, session: AuthSession): void {
    const author = offer.toObject().author as unknown as {_id?: unknown};
    if (String(author?._id ?? author) !== session.user.id) {
      throw new HttpError(StatusCodes.FORBIDDEN, 'Изменять предложение может только автор');
    }
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
    const session = await this.auth.require(req);
    const {title, description, postDate, city, previewImage, images, isPremium, rating, type, rooms, guests, price, facilities, location} = req.body;
    const created = await this.service.create({title, description, postDate, city, previewImage, images, isPremium, rating, type, rooms, guests, price, facilities, location, authorId: session.user.id, isFavorite: false, commentsCount: 0});
    const offer = await this.getOffer(created.id);
    this.created(res, toOffer(this.response(offer, session)));
  }

  private async update(req: Request<ParamsDictionary, object, UpdateOfferDto>, res: Response): Promise<void> {
    const session = await this.auth.require(req);
    const offer = await this.getOffer(req.params.offerId);
    this.assertOwner(offer, session);
    const allowed: (keyof UpdateOfferDto)[] = ['title', 'description', 'postDate', 'city', 'previewImage', 'images', 'isPremium', 'rating', 'type', 'rooms', 'guests', 'price', 'facilities', 'location'];
    const data = Object.fromEntries(allowed.filter((key) => key in req.body).map((key) => [key, req.body[key]])) as UpdateOfferDto;
    const updated = await this.service.updateById(offer.id, data);
    if (!updated) {
      throw new HttpError(StatusCodes.NOT_FOUND, 'Предложение не найдено');
    }
    this.ok(res, toOffer(this.response(updated, session)));
  }

  private async delete(req: Request, res: Response): Promise<void> {
    const session = await this.auth.require(req);
    const offer = await this.getOffer(req.params.offerId);
    this.assertOwner(offer, session);
    await this.service.deleteById(offer.id);
    this.noContent(res);
  }

}
