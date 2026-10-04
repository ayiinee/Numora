import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const tooLarge =
      exception instanceof Error && 'type' in exception && exception.type === 'entity.too.large';
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : tooLarge
          ? 413
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const message = details.detail ?? details.message;
    const detail =
      exception instanceof HttpException
        ? Array.isArray(message)
          ? message.join('; ')
          : typeof message === 'string'
            ? message
            : exception.message
        : tooLarge
          ? 'Request body exceeds 2 MiB.'
          : 'An unexpected error occurred.';
    const request = host.switchToHttp().getRequest<{ url: string }>();
    const response = host.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
      status(code: number): { type(value: string): { json(value: unknown): void } };
    }>();
    if (status === 429 && typeof details.retryAfter === 'number')
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil(details.retryAfter))));
    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail,
        instance: request.url,
        ...(typeof details.code === 'string' ? { code: details.code } : {}),
        ...(details.code === 'IMPORT_VALIDATION_FAILED' ? { report: details.report } : {}),
      });
  }
}
