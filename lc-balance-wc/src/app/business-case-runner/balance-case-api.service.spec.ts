import { of } from 'rxjs';
import { BalanceCaseApiService, BusinessCaseRunResult, BusinessCaseSummary } from './balance-case-api.service';
import type { HttpClient } from '@angular/common/http';

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
      const get = jest.fn(() => of(cases));
      const { service } = makeService({ get });

      service.listCases().subscribe((result) => {
        expect(result).toEqual(cases);
        expect(get).toHaveBeenCalledWith('/api/business-cases');
        expect(get).toHaveBeenCalledTimes(1);
        done();
      });
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
});
