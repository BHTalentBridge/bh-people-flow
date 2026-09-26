import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return res.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `A record with this ${target} already exists.`,
        });
      }
      if (exception.code === 'P2025') {
        return res.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found.',
        });
      }
      if (exception.code === 'P2003') {
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'This record is still referenced by other data.',
        });
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
