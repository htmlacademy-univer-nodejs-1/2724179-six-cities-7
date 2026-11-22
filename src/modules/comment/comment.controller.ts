import {Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import {AuthService} from '../../shared/auth/auth.service.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {HttpError} from '../../shared/errors/http-error.js';
import {createCommentSchema} from '../../shared/middleware/schemas.js';
import {ValidateObjectIdMiddleware} from '../../shared/middleware/validate-object-id.middleware.js';
import {ValidateMiddleware} from '../../shared/middleware/validate.middleware.js';
import {OfferService} from '../offer/offer-service.interface.js';
import {toUser} from '../user/user.rdo.js';
import {CommentService} from './comment-service.interface.js';
import {CommentEntity} from './comment.entity.js';
import {DocumentType} from '@typegoose/typegoose';

@injectable()
export class CommentController extends Controller {
  constructor(
    @inject(Component.CommentService) private readonly comments: CommentService,
    @inject(Component.OfferService) private readonly offers: OfferService,
    @inject(Component.AuthService) private readonly auth: AuthService
  ) {
    super();
    this.addRoutes([
      {path: '/offers/:offerId/comments', method: 'get', middleware: [new ValidateObjectIdMiddleware('offerId')], handler: this.index},
      {path: '/offers/:offerId/comments', method: 'post', middleware: [new ValidateObjectIdMiddleware('offerId'), new ValidateMiddleware(createCommentSchema)], handler: this.create}
    ]);
  }

  private async checkOffer(id: string): Promise<void> {
    if (!await this.offers.findById(id)) {
      throw new HttpError(StatusCodes.NOT_FOUND, 'Предложение не найдено');
    }
  }

  private response(comment: DocumentType<CommentEntity>): object {
    const data = comment.toObject({virtuals: true});
    return {id: comment.id, text: data.text, rating: data.rating, postDate: data.postDate, author: toUser(data.author as object)};
  }

  private async index(req: Request, res: Response): Promise<void> {
    await this.checkOffer(req.params.offerId);
    this.ok(res, (await this.comments.findByOfferId(req.params.offerId)).map((comment) => this.response(comment)));
  }

  private async create(req: Request, res: Response): Promise<void> {
    await this.checkOffer(req.params.offerId);
    const session = await this.auth.current(req);
    const comment = await this.comments.create({text: req.body.text, rating: req.body.rating, offerId: req.params.offerId, userId: session.user.id});
    await comment.populate('author');
    this.created(res, this.response(comment));
  }
}
