import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [CurrencyService] });
    service = TestBed.inject(CurrencyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('codes()', () => {
    it('fetches from GET /api/currencies and returns just the codes', async () => {
      const promise = firstValueFrom(service.codes());
      const req = httpMock.expectOne('/api/currencies');
      expect(req.request.method).toBe('GET');
      req.flush({ currencies: [{ code: 'USD', name: 'US Dollar', decimals: 2 }, { code: 'JPY', name: 'Japanese Yen', decimals: 0 }] });

      expect(await promise).toEqual(['USD', 'JPY']);
    });

    it('caches — a second call does not issue a second HTTP request', async () => {
      const first = firstValueFrom(service.codes());
      httpMock.expectOne('/api/currencies').flush({ currencies: [{ code: 'USD' }] });
      await first;

      const second = await firstValueFrom(service.codes());
      httpMock.expectNone('/api/currencies');
      expect(second).toEqual(['USD']);
    });

    it('resolves to [] on HTTP error rather than throwing', async () => {
      const promise = firstValueFrom(service.codes());
      httpMock.expectOne('/api/currencies').flush('boom', { status: 500, statusText: 'Server Error' });
      expect(await promise).toEqual([]);
    });

    it('defaults to [] when the response body has no currencies field', async () => {
      const promise = firstValueFrom(service.codes());
      httpMock.expectOne('/api/currencies').flush({});
      expect(await promise).toEqual([]);
    });
  });

  describe('options()', () => {
    it('maps codes to Formly-shaped {label, value} pairs', async () => {
      const promise = firstValueFrom(service.options());
      httpMock.expectOne('/api/currencies').flush({ currencies: [{ code: 'USD' }, { code: 'EUR' }] });

      expect(await promise).toEqual([
        { label: 'USD', value: 'USD' },
        { label: 'EUR', value: 'EUR' },
      ]);
    });
  });

  describe('decimals()', () => {
    it('maps each currency code to its own decimals field', async () => {
      const promise = firstValueFrom(service.decimals());
      httpMock.expectOne('/api/currencies').flush({
        currencies: [
          { code: 'USD', decimals: 2 },
          { code: 'JPY', decimals: 0 },
        ],
      });

      expect(await promise).toEqual({ USD: 2, JPY: 0 });
    });

    it('falls back to 2 for a currency with no decimals field', async () => {
      const promise = firstValueFrom(service.decimals());
      httpMock.expectOne('/api/currencies').flush({ currencies: [{ code: 'USD' }] });

      expect(await promise).toEqual({ USD: 2 });
    });

    it('shares the same cached HTTP response as codes() — no second request', async () => {
      const first = firstValueFrom(service.codes());
      httpMock.expectOne('/api/currencies').flush({ currencies: [{ code: 'USD', decimals: 2 }] });
      await first;

      const second = await firstValueFrom(service.decimals());
      httpMock.expectNone('/api/currencies');
      expect(second).toEqual({ USD: 2 });
    });
  });
});
