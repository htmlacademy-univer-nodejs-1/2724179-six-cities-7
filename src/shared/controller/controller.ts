import {RequestHandler, Response, Router} from 'express';
import asyncHandler from 'express-async-handler';
import {Middleware} from '../middleware/middleware.interface.js';
import {StatusCodes} from 'http-status-codes';

export interface Route {
  path: string;
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  handler: RequestHandler;
  middleware?: Middleware[];
}

export interface ControllerInterface {
  readonly router: Router;
}

export abstract class Controller implements ControllerInterface {
  public readonly router = Router();

  protected addRoutes(routes: Route[]): void {
    for (const route of routes) {
      this.router[route.method](route.path, ...(route.middleware ?? []).map((middleware) => asyncHandler(middleware.execute.bind(middleware))), asyncHandler(route.handler.bind(this)));
    }
  }

  protected ok(res: Response, data: unknown): void {
    res.status(StatusCodes.OK).json(data);
  }

  protected created(res: Response, data: unknown): void {
    res.status(StatusCodes.CREATED).json(data);
  }

  protected noContent(res: Response): void {
    res.status(StatusCodes.NO_CONTENT).send();
  }
}
