import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { defer, firstValueFrom, of, throwError } from 'rxjs';
import { BalanceCaseApiService, BusinessCaseRunResult, BusinessCaseSummary } from './balance-case-api.service';
import type { HttpClient } from '@angular/common/http';
import { SKIP_SAFE_READ_RETRY } from '../core/http-retry/http-retry.interceptor';

/**
 * Direct-instantiation style (house convention, see lc-payment-wc's
 * business-case-runner.component.spec.ts) — a mocked HttpClient object is
 * simpler here than TestBed/HttpTestingController for a two-method thin
 * wrapper with no other DI needs.
 */
function makeService(overrides: { get?: jest.Mock; post?: jest.Mock } = {}) {
  const mockHttp = {
    get: overrides.get ?? jest.fn(() => of([])),
    post: overrides.post ?? jest.fn(() => of({})),
  } as unknown as HttpClient;

  return { service: new BalanceCaseApiService(mockHttp), mockHttp };
}

describe('BalanceCaseApiService', () => {
  describe('listCases', () => {
    it('GETs /api/business-cases and returns the emitted list', (done) => {
      const cases: BusinessCaseSummary[] = [{ id: 'case-1', title: 'Import LC Case 1', description: 'desc', stepCount: 3 }];
      const get = jest.fn((url: string, options?: { context: HttpContext }) => {
        void url;
        void options;
        return of(cases);
      });
      const { service } = makeService({ get });

      service.listCases().subscribe((result) => {
        expect(result).toEqual(cases);
        expect(get).toHaveBeenCalledWith('/api/business-cases', expect.objectContaining({ context: expect.any(HttpContext) }));
        expect(get.mock.calls[0]?.[1]?.context.get(SKIP_SAFE_READ_RETRY)).toBe(true);
        expect(get).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('listCasesWhenReady performs bounded low-frequency retries and bypasses the generic retry interceptor', async () => {
      let attempts = 0;
      const cases: BusinessCaseSummary[] = [{ id: 'case-1', title: 'Import LC Case 1', description: 'desc', stepCount: 3 }];
      const get = jest.fn((url: string, options?: { context: HttpContext }) => {
        void url;
        void options;
        return defer(() => {
          attempts += 1;
          return attempts < 3 ? throwError(() => new HttpErrorResponse({ status: 0 })) : of(cases);
        });
      });
      const { service } = makeService({ get });

      await expect(firstValueFrom(service.listCasesWhenReady({ maxRetries: 2, intervalMs: 0 }))).resolves.toEqual(cases);
      expect(attempts).toBe(3);
      expect(get.mock.calls[0]?.[1]?.context.get(SKIP_SAFE_READ_RETRY)).toBe(true);
    });

    it('listCasesWhenReady does not retry a non-transient client error', async () => {
      let attempts = 0;
      const get = jest.fn((url: string, options?: { context: HttpContext }) => {
        void url;
        void options;
        return defer(() => {
          attempts += 1;
          return throwError(() => new HttpErrorResponse({ status: 400 }));
        });
      });
      const { service } = makeService({ get });

      await expect(firstValueFrom(service.listCasesWhenReady({ maxRetries: 2, intervalMs: 0 }))).rejects.toMatchObject({ status: 400 });
      expect(attempts).toBe(1);
    });
  });

  describe('runCase', () => {
    it('POSTs /api/business-cases/:id/run with an empty body and returns the emitted result', (done) => {
      const result: BusinessCaseRunResult = { id: 'case-1', title: 'Import LC Case 1', description: 'desc', trace: [] };
      const post = jest.fn(() => of(result));
      const { service } = makeService({ post });

      service.runCase('case-1').subscribe((r) => {
        expect(r).toEqual(result);
        expect(post).toHaveBeenCalledWith('/api/business-cases/case-1/run', {});
        expect(post).toHaveBeenCalledTimes(1);
        done();
      });
    });

    it('interpolates the given id into the URL path', () => {
      const post = jest.fn(() => of({} as BusinessCaseRunResult));
      const { service } = makeService({ post });

      service.runCase('export-case-5').subscribe();

      expect(post).toHaveBeenCalledWith('/api/business-cases/export-case-5/run', {});
    });
  });

  describe('resetDatabase', () => {
    it('POSTs /api/admin/reset-database with an empty body and returns the emitted result', (done) => {
      const post = jest.fn(() => of({ status: 'ok' }));
      const { service } = makeService({ post });

      service.resetDatabase().subscribe((result) => {
        expect(result).toEqual({ status: 'ok' });
        expect(post).toHaveBeenCalledWith('/api/admin/reset-database', {});
        expect(post).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });
});
