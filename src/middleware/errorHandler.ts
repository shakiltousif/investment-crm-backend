import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

export interface ApiError extends Error {
  statusCode?: number;
  details?: unknown;
}

export const errorHandler = (
  err: ApiError | Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle ZodError
  if (err && typeof err === 'object' && 'issues' in err) {
    const zodError = err as { issues: Array<{ message: string; path: Array<string | number> }> };
    const firstIssue = zodError.issues[0];
    const message = firstIssue ? firstIssue.message : 'Validation failed';

    logger.error({
      message: 'Validation error',
      statusCode: 400,
      details: zodError.issues,
    });

    res.status(400).json({
      error: {
        message,
        statusCode: 400,
        ...(process.env.NODE_ENV === 'development' && { details: zodError.issues }),
      },
    });
    return;
  }

  const statusCode = (err as ApiError).statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  logger.error({
    message,
    statusCode,
    stack: err.stack,
    details: (err as ApiError).details,
  });

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

export class ValidationError extends Error implements ApiError {
  statusCode = 400;

  constructor(
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements ApiError {
  statusCode = 401;

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements ApiError {
  statusCode = 403;

  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;

  constructor(message: string = 'Not Found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409;

  constructor(message: string = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}
