import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[ERROR] ${req.method} ${req.path} - ${statusCode}: ${message}`);
  if (err.stack && statusCode === 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    error: message,
    ...(err.details && { details: err.details }),
  });
}

export function createError(message: string, statusCode: number, details?: any): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}
