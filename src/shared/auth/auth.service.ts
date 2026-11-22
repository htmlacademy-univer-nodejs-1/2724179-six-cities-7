import {randomUUID} from 'node:crypto';
import {DocumentType} from '@typegoose/typegoose';
import {Request} from 'express';
import {StatusCodes} from 'http-status-codes';
import {inject, injectable} from 'inversify';
import jwt, {JwtPayload} from 'jsonwebtoken';
import {UserModel} from '../../modules/user/user.entity.js';
import {UserType} from '../../types/user.type.js';
import {UserEntity} from '../../modules/user/user.entity.js';
import {UserService} from '../../modules/user/user-service.interface.js';
import {Config} from '../config/config.interface.js';
import {Component} from '../container/component.js';
import {HttpError} from '../errors/http-error.js';

export type AuthSession = {user: DocumentType<UserEntity>; sessionId: string};

@injectable()
export class AuthService {
  constructor(
    @inject(Component.UserService) private readonly users: UserService,
    @inject(Component.Config) private readonly config: Config
  ) {}

  public async issue(user: DocumentType<UserEntity>): Promise<string> {
    const sessionId = randomUUID();
    user.sessions.push(sessionId);
    await user.save();
    return jwt.sign({sub: user.id, jti: sessionId}, this.config.get('SALT'), {expiresIn: '7d'});
  }

  public async optional(req: Request): Promise<AuthSession | null> {
    const header = req.get('Authorization');
    if (!header) {
      return null;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Недействительный токен');
    }
    let payload: JwtPayload | string;
    try {
      payload = jwt.verify(match[1], this.config.get('SALT'), {algorithms: ['HS256']});
    } catch {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Недействительный токен');
    }
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Недействительный токен');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.sessions.includes(payload.jti)) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Недействительный токен');
    }
    return {user, sessionId: payload.jti};
  }

  public async current(req: Request): Promise<AuthSession> {
    const session = await this.optional(req);
    if (session) {
      return session;
    }
    const user = await UserModel.findOneAndUpdate(
      {_id: '000000000000000000000001'},
      {$setOnInsert: {name: 'Аноним', email: 'anonymous@local.invalid', password: randomUUID(), type: UserType.Regular}},
      {upsert: true, new: true, setDefaultsOnInsert: true}
    ).exec();
    return {user, sessionId: ''};
  }

  public async require(req: Request): Promise<AuthSession> {
    const session = await this.optional(req);
    if (!session) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Требуется авторизация');
    }
    return session;
  }
}
