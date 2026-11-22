import {ErrorRequestHandler} from 'express';
import {StatusCodes} from 'http-status-codes';
import {MulterError} from 'multer';
import {Logger} from '../logger/logger.interface.js';
import {HttpError} from './http-error.js';

export function createExceptionFilter(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const malformedJson = error instanceof SyntaxError && 'status' in error && error.status === StatusCodes.BAD_REQUEST;
    let code: number = StatusCodes.INTERNAL_SERVER_ERROR;
    let message = 'Внутренняя ошибка сервера';
    if (error instanceof HttpError) {
      code = error.statusCode;
      message = error.message;
    } else if (malformedJson) {
      code = StatusCodes.BAD_REQUEST;
      message = 'Некорректный JSON';
    } else if (error instanceof MulterError) {
      code = StatusCodes.BAD_REQUEST;
      message = 'Не удалось загрузить файл';
    }
    logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
    res.status(code).json({code, message});
  };
}
