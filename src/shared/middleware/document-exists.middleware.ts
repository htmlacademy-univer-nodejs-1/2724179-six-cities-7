import {NextFunction, Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import {HttpError} from '../errors/http-error.js';
import {Middleware} from './middleware.interface.js';

export interface DocumentLookup {
  findById(id: string): Promise<unknown | null>;
}

export class DocumentExistsMiddleware implements Middleware {
  constructor(private readonly service: DocumentLookup, private readonly parameter: string, private readonly name: string) {}

  public async execute(req: Request, res: Response, next: NextFunction): Promise<void> {
    const document = await this.service.findById(req.params[this.parameter]);
    if (!document) {
      return next(new HttpError(StatusCodes.NOT_FOUND, `${this.name} не найдено`));
    }
    res.locals.document = document;
    next();
  }
}
