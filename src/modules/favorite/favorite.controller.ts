import {DocumentType} from '@typegoose/typegoose';
import {Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import {isValidObjectId, Types} from 'mongoose';
import {OfferEntity} from '../offer/offer.entity.js';
import {OfferService} from '../offer/offer-service.interface.js';
import {toOffer, toSummary} from '../offer/offer.rdo.js';
import {AuthService, AuthSession} from '../../shared/auth/auth.service.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {HttpError} from '../../shared/errors/http-error.js';

@injectable()
export class FavoriteController extends Controller {
  constructor(
    @inject(Component.OfferService) private readonly service: OfferService,
    @inject(Component.AuthService) private readonly auth: AuthService
  ) {
    super();
    this.addRoutes([
      {path: '/favorites', method: 'get', handler: this.index},
      {path: '/favorites/:offerId', method: 'put', handler: this.add},
      {path: '/favorites/:offerId', method: 'delete', handler: this.remove}
    ]);
  }

  private ids(session: AuthSession): string[] {
    return session.user.favorites.map(String);
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

  private async index(req: Request, res: Response): Promise<void> {
    const session = await this.auth.require(req);
    const offers = await this.service.findFavorites(this.ids(session));
    this.ok(res, offers.map((offer) => toSummary({...offer.toObject({virtuals: true}), isFavorite: true})));
  }

  private async add(req: Request, res: Response): Promise<void> {
    const session = await this.auth.require(req);
    const offer = await this.getOffer(req.params.offerId);
    if (!this.ids(session).includes(offer.id)) {
      session.user.favorites.push(new Types.ObjectId(offer.id));
      await session.user.save();
    }
    this.ok(res, toOffer({...offer.toObject({virtuals: true}), isFavorite: true}));
  }

  private async remove(req: Request, res: Response): Promise<void> {
    const session = await this.auth.require(req);
    const offer = await this.getOffer(req.params.offerId);
    session.user.favorites = session.user.favorites.filter((id) => String(id) !== offer.id);
    await session.user.save();
    this.noContent(res);
  }
}
