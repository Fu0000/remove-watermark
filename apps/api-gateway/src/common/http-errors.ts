import { HttpException, HttpStatus } from "@nestjs/common";

export function badRequest(code: number, message: string, requestId?: string): never {
  throw new HttpException(
    {
      code,
      message,
      requestId: requestId || crypto.randomUUID()
    },
    HttpStatus.BAD_REQUEST
  );
}

export function unauthorized(code: number, message: string, requestId?: string): never {
  throw new HttpException(
    {
      code,
      message,
      requestId: requestId || crypto.randomUUID()
    },
    HttpStatus.UNAUTHORIZED
  );
}

export function forbidden(code: number, message: string, requestId?: string): never {
  throw new HttpException(
    {
      code,
      message,
      requestId: requestId || crypto.randomUUID()
    },
    HttpStatus.FORBIDDEN
  );
}

export function notFound(code: number, message: string, requestId?: string): never {
  throw new HttpException(
    {
      code,
      message,
      requestId: requestId || crypto.randomUUID()
    },
    HttpStatus.NOT_FOUND
  );
}

export function conflict(code: number, message: string, requestId?: string): never {
  throw new HttpException(
    {
      code,
      message,
      requestId: requestId || crypto.randomUUID()
    },
    HttpStatus.CONFLICT
  );
}

export function unprocessableEntity(code: number, message: string, requestId?: string): never {
  throw new HttpException(
    {
      code,
      message,
      requestId: requestId || crypto.randomUUID()
    },
    HttpStatus.UNPROCESSABLE_ENTITY
  );
}
