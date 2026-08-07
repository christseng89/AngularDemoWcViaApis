/**
 * Typed errors that map 1:1 onto the OAS response codes for
 * POST /payment-instructions: 400 (request validation) vs 409 (business
 * validation) are deliberately distinct error classes so the route handler
 * never has to guess which status a thrown error implies.
 */
import type { ApiErrorBody } from './types';

export abstract class ApiError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message };
  }
}

/** OAS 400: "Request validation failed (e.g. missing required leg fields)" */
export class RequestValidationError extends ApiError {
  readonly httpStatus = 400;
  readonly code = 'REQUEST_VALIDATION_FAILED';
}

/** OAS 409: "Business validation failed (e.g. legs unbalanced, missing mandatory account type)" */
export class BusinessValidationError extends ApiError {
  readonly httpStatus = 409;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class NotFoundError extends ApiError {
  readonly httpStatus = 404;
  readonly code = 'NOT_FOUND';
}
