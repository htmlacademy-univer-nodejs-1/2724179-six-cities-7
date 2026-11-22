import {NextFunction, Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import {Schema} from 'joi';
import {HttpError} from '../errors/http-error.js';
import {Middleware} from './middleware.interface.js';

export class ValidateMiddleware implements Middleware {
  constructor(private readonly schema: Schema, private readonly source: 'body' | 'params' | 'query' = 'body') {}

  public execute(req: Request, _res: Response, next: NextFunction): void {
    const {error} = this.schema.validate(req[this.source], {abortEarly: false, convert: false});
    if (error) {
      return next(new HttpError(StatusCodes.BAD_REQUEST, error.details.map((detail) => detail.message).join('; ')));
    }
    next();
  }
}
