import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';
import {
  GENERATED_HTTP_RETRY_COUNT,
  GENERATED_HTTP_RETRY_INITIAL_DELAY_MS,
  GENERATED_HTTP_RETRY_MAX_DELAY_MS,
} from './http-retry.config.generated';

export interface HttpRetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
}

export const HTTP_RETRY_POLICY = new InjectionToken<HttpRetryPolicy>('HTTP_RETRY_POLICY', {
  factory: () => ({
    maxRetries: GENERATED_HTTP_RETRY_COUNT,
    initialDelayMs: GENERATED_HTTP_RETRY_INITIAL_DELAY_MS,
    maxDelayMs: GENERATED_HTTP_RETRY_MAX_DELAY_MS,
  }),
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const SKIP_SAFE_READ_RETRY = new HttpContextToken<boolean>(() => false);

export function isTransientHttpError(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

export const safeReadRetryInterceptor: HttpInterceptorFn = (request, next) => {
  const policy = inject(HTTP_RETRY_POLICY);
  if (request.context.get(SKIP_SAFE_READ_RETRY) || !SAFE_METHODS.has(request.method) || policy.maxRetries === 0) return next(request);

  return next(request).pipe(
    retry({
      count: policy.maxRetries,
      delay: (error, retryNumber) => {
        if (!isTransientHttpError(error)) return throwError(() => error);
        const delayMs = Math.min(policy.initialDelayMs * 2 ** (retryNumber - 1), policy.maxDelayMs);
        return timer(delayMs);
      },
    }),
  );
};
