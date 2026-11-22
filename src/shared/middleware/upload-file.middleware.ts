import {mkdir, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {NextFunction, Request, Response} from 'express';
import {StatusCodes} from 'http-status-codes';
import {extension} from 'mime-types';
import multer from 'multer';
import {nanoid} from 'nanoid';
import {Config} from '../config/config.interface.js';
import {HttpError} from '../errors/http-error.js';
import {Middleware} from './middleware.interface.js';

export class UploadFileMiddleware implements Middleware {
  private readonly upload = multer({storage: multer.memoryStorage(), limits: {fileSize: 5 * 1024 * 1024}}).single('avatar');

  constructor(private readonly config: Config, private readonly required = false) {}

  public execute(req: Request, res: Response, next: NextFunction): void {
    this.upload(req, res, (error: unknown) => {
      if (error) {
        return next(error);
      }
      if (!req.file) {
        return this.required ? next(new HttpError(StatusCodes.BAD_REQUEST, 'Файл аватара обязателен')) : next();
      }
      const {file} = req;
      const png = file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
      const jpeg = file.mimetype === 'image/jpeg' && file.buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
      const ext = extension(file.mimetype);
      if ((!png && !jpeg) || !ext) {
        return next(new HttpError(StatusCodes.BAD_REQUEST, 'Допустимы только изображения JPG и PNG'));
      }
      const directory = this.config.get('UPLOAD_DIRECTORY');
      const filename = `${nanoid()}.${ext}`;
      const path = join(directory, filename);
      void mkdir(directory, {recursive: true}).then(() => writeFile(path, file.buffer, {flag: 'wx'})).then(() => {
        file.filename = filename;
        file.path = path;
        res.once('finish', () => {
          if (res.statusCode >= 400) {
            void unlink(path).catch(() => undefined);
          }
        });
        next();
      }).catch(next);
    });
  }
}
