import {NextFunction, Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import {HttpError} from '../errors/http-error.js';
import {Middleware} from './middleware.interface.js';

export class ValidateObjectIdMiddleware implements Middleware {
  constructor(private readonly parameter: string) {}

  public execute(req: Request, _res: Response, next: NextFunction): void {
    if (!/^[a-f\d]{24}$/i.test(req.params[this.parameter])) {
      return next(new HttpError(StatusCodes.BAD_REQUEST, `Некорректный идентификатор: ${this.parameter}`));
    }
    next();
  }
}
