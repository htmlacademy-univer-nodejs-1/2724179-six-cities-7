import express, {Express} from 'express';
import {inject, injectable} from 'inversify';
import {FavoriteController} from './modules/favorite/favorite.controller.js';
import {OfferController} from './modules/offer/offer.controller.js';
import {UserController} from './modules/user/user.controller.js';
import {Config} from './shared/config/config.interface.js';
import {Component} from './shared/container/component.js';
import {DatabaseClient} from './shared/database-client/database-client.interface.js';
import {createExceptionFilter} from './shared/errors/exception-filter.js';
import {Logger} from './shared/logger/logger.interface.js';

@injectable()
export class Application {
  private readonly app: Express = express();

  constructor(
    @inject(Component.Logger) private readonly logger: Logger,
    @inject(Component.Config) private readonly config: Config,
    @inject(Component.DatabaseClient) private readonly database: DatabaseClient,
    @inject(Component.OfferController) private readonly offerController: OfferController,
    @inject(Component.UserController) private readonly userController: UserController,
    @inject(Component.FavoriteController) private readonly favoriteController: FavoriteController
  ) {}

  private registerMiddleware(): void {
    this.app.use(express.json());
    this.app.use('/upload', express.static('uploads'));
    this.app.use('/img', express.static('markup/img'));
  }

  public async init(): Promise<void> {
    this.config.init();
    const uri = this.config.get('DB_URI') || `mongodb://${this.config.get('DB_HOST')}:27017/six-cities`;
    await this.database.connect(uri);
    this.registerMiddleware();
    this.app.use('/api', this.offerController.router, this.userController.router, this.favoriteController.router);
    this.app.use(createExceptionFilter(this.logger));
    const port = this.config.get('PORT');
    await new Promise<void>((resolve, reject) => {
      const server = this.app.listen(port, () => {
        this.logger.info(`Сервер запущен на порту ${port}`);
        resolve();
      });
      server.once('error', reject);
    });
  }
}
