import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { defer, firstValueFrom, of, throwError } from 'rxjs';
import { HTTP_RETRY_POLICY, safeReadRetryInterceptor } from './http-retry.interceptor';

describe('safeReadRetryInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: HTTP_RETRY_POLICY, useValue: { maxRetries: 3, initialDelayMs: 0, maxDelayMs: 0 } }],
    });
  });

  it('retries a transient GET failure three times before succeeding', async () => {
    let attempts = 0;
    const next = jest.fn(() =>
      defer(() => {
        attempts += 1;
        return attempts < 4
          ? throwError(() => new HttpErrorResponse({ status: 503 }))
          : of(new HttpResponse({ status: 200, body: 'ok' }));
      }),
    );

    const response = await firstValueFrom(
      TestBed.runInInjectionContext(() => safeReadRetryInterceptor(new HttpRequest('GET', '/balance-component/test'), next)),
    );

    expect(response).toBeInstanceOf(HttpResponse);
    expect(attempts).toBe(4);
  });

  it('never automatically retries a POST command', async () => {
    let attempts = 0;
    const next = jest.fn(() =>
      defer(() => {
        attempts += 1;
        return throwError(() => new HttpErrorResponse({ status: 503 }));
      }),
    );

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => safeReadRetryInterceptor(new HttpRequest('POST', '/balance-component/test', {}), next))),
    ).rejects.toBeInstanceOf(HttpErrorResponse);
    expect(attempts).toBe(1);
  });
});
