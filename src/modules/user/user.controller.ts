import {Request, Response} from 'express';
import {ParamsDictionary} from 'express-serve-static-core';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import {AuthService} from '../../shared/auth/auth.service.js';
import {verifyPassword} from '../../shared/auth/password.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {Config} from '../../shared/config/config.interface.js';
import {UploadFileMiddleware} from '../../shared/middleware/upload-file.middleware.js';
import {ValidateMiddleware} from '../../shared/middleware/validate.middleware.js';
import {createUserSchema, loginUserSchema} from '../../shared/middleware/schemas.js';
import {HttpError} from '../../shared/errors/http-error.js';
import {CreateUserDto} from './create-user.dto.js';
import {LoginUserDto} from './login-user.dto.js';
import {UserService} from './user-service.interface.js';
import {toUser} from './user.rdo.js';

@injectable()
export class UserController extends Controller {
  constructor(
    @inject(Component.UserService) private readonly users: UserService,
    @inject(Component.AuthService) private readonly auth: AuthService,
    @inject(Component.Config) private readonly config: Config
  ) {
    super();
    this.addRoutes([
      {path: '/users/register', method: 'post', middleware: [new UploadFileMiddleware(this.config), new ValidateMiddleware(createUserSchema)], handler: this.create},
      {path: '/users/login', method: 'post', middleware: [new ValidateMiddleware(loginUserSchema)], handler: this.login},
      {path: '/users/logout', method: 'delete', handler: this.logout},
      {path: '/users/status', method: 'get', handler: this.status}
    ]);
  }

  private async create(req: Request<ParamsDictionary, object, CreateUserDto>, res: Response): Promise<void> {
    const {name, email, password, type} = req.body;
    if (await this.users.findByEmail(email)) {
      throw new HttpError(StatusCodes.CONFLICT, 'Пользователь с таким email уже существует');
    }
    const avatarPath = req.file ? `/upload/${req.file.filename}` : undefined;
    try {
      const user = await this.users.create({name, email, password, type, avatarPath});
      this.created(res, toUser(user.toObject({virtuals: true})));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new HttpError(StatusCodes.CONFLICT, 'Пользователь с таким email уже существует');
      }
      throw error;
    }
  }

  private async login(req: Request<ParamsDictionary, object, LoginUserDto>, res: Response): Promise<void> {
    const {email, password} = req.body;
    const user = await this.users.findByEmail(email);
    if (!user || !await verifyPassword(password, user.password)) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Неверный email или пароль');
    }
    this.ok(res, {token: await this.auth.issue(user)});
  }

  private async logout(req: Request, res: Response): Promise<void> {
    const {user, sessionId} = await this.auth.current(req);
    user.sessions = user.sessions.filter((id) => id !== sessionId);
    await user.save();
    this.noContent(res);
  }

  private async status(req: Request, res: Response): Promise<void> {
    const {user} = await this.auth.current(req);
    this.ok(res, toUser(user.toObject({virtuals: true})));
  }
}
