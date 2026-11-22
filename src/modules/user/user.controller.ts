import {randomUUID} from 'node:crypto';
import {mkdir, writeFile, unlink} from 'node:fs/promises';
import {Request, Response} from 'express';
import {ParamsDictionary} from 'express-serve-static-core';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import multer from 'multer';
import {AuthService} from '../../shared/auth/auth.service.js';
import {verifyPassword} from '../../shared/auth/password.js';
import {Component} from '../../shared/container/component.js';
import {Controller} from '../../shared/controller/controller.js';
import {ValidateMiddleware} from '../../shared/middleware/validate.middleware.js';
import {createUserSchema, loginUserSchema} from '../../shared/middleware/schemas.js';
import {HttpError} from '../../shared/errors/http-error.js';
import {CreateUserDto} from './create-user.dto.js';
import {LoginUserDto} from './login-user.dto.js';
import {UserService} from './user-service.interface.js';
import {toUser} from './user.rdo.js';

const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 5 * 1024 * 1024}});

@injectable()
export class UserController extends Controller {
  constructor(
    @inject(Component.UserService) private readonly users: UserService,
    @inject(Component.AuthService) private readonly auth: AuthService
  ) {
    super();
    this.addRoutes([
      {path: '/users/register', method: 'post', middleware: [{execute: upload.single('avatar')}, new ValidateMiddleware(createUserSchema)], handler: this.create},
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
    let avatarPath: string | undefined;
    if (req.file) {
      const file = req.file;
      const png = file.buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
      const jpeg = file.buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
      if (!png && !jpeg) {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Допустимы только изображения JPG и PNG');
      }
      const filename = `${randomUUID()}.${png ? 'png' : 'jpg'}`;
      await mkdir('uploads', {recursive: true});
      await writeFile(`uploads/${filename}`, file.buffer);
      avatarPath = `/upload/${filename}`;
    }
    try {
      const user = await this.users.create({name, email, password, type, avatarPath});
      this.created(res, toUser(user.toObject({virtuals: true})));
    } catch (error) {
      if (avatarPath) {
        await unlink(`uploads/${avatarPath.split('/').pop()}`);
      }
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
