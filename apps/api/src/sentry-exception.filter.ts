import {
  type ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import * as Sentry from "@sentry/node";

const shouldCapture = (exception: unknown): boolean => {
  if (!(exception instanceof HttpException)) {
    return true;
  }

  return exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR;
};

@Catch()
export class ApiSentryExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  constructor(protected readonly httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (shouldCapture(exception)) {
      Sentry.captureException(exception);
    }

    super.catch(exception, host);
  }
}
