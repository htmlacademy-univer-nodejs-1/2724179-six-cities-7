import {DocumentType} from '@typegoose/typegoose';
import {Request, Response} from 'express';
import {inject, injectable} from 'inversify';
import {Types} from 'mongoose';
import {OfferEntity} from '../offer/offer.entity.js';
import {OfferService} from '../offer/offer-service.interface.js';
import {toOffer, toSummary} from '../offer/offer.rdo.js';
import {AuthService, AuthSession} from '../../shared/auth/auth.service.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {DocumentExistsMiddleware} from '../../shared/middleware/document-exists.middleware.js';
import {ValidateObjectIdMiddleware} from '../../shared/middleware/validate-object-id.middleware.js';

@injectable()
export class FavoriteController extends Controller {
  constructor(
    @inject(Component.OfferService) private readonly service: OfferService,
    @inject(Component.AuthService) private readonly auth: AuthService
  ) {
    super();
    this.addRoutes([
      {path: '/favorites', method: 'get', handler: this.index},
      {path: '/favorites/:offerId', method: 'put', middleware: [new ValidateObjectIdMiddleware('offerId'), new DocumentExistsMiddleware(this.service, 'offerId', 'Предложение')], handler: this.create},
      {path: '/favorites/:offerId', method: 'delete', middleware: [new ValidateObjectIdMiddleware('offerId'), new DocumentExistsMiddleware(this.service, 'offerId', 'Предложение')], handler: this.delete}
    ]);
  }

  private ids(session: AuthSession): string[] {
    return session.user.favorites.map(String);
  }

  private async index(req: Request, res: Response): Promise<void> {
    const session = await this.auth.current(req);
    const offers = await this.service.findFavorites(this.ids(session));
    this.ok(res, offers.map((offer) => toSummary({...offer.toObject({virtuals: true}), isFavorite: true})));
  }

  private async create(req: Request, res: Response): Promise<void> {
    const session = await this.auth.current(req);
    const offer = res.locals.document as DocumentType<OfferEntity>;
    if (!this.ids(session).includes(offer.id)) {
      session.user.favorites.push(new Types.ObjectId(offer.id));
      await session.user.save();
    }
    this.ok(res, toOffer({...offer.toObject({virtuals: true}), isFavorite: true}));
  }

  private async delete(req: Request, res: Response): Promise<void> {
    const session = await this.auth.current(req);
    const offer = res.locals.document as DocumentType<OfferEntity>;
    session.user.favorites = session.user.favorites.filter((id) => String(id) !== offer.id);
    await session.user.save();
    this.noContent(res);
  }
}
