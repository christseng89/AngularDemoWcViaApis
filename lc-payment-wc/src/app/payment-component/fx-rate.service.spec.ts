import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { FxRateService } from './fx-rate.service';

describe('FxRateService', () => {
  let service: FxRateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [FxRateService] });
    service = TestBed.inject(FxRateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('rates()', () => {
    it('fetches from GET /api/fx/rates and returns the rates map', async () => {
      const promise = firstValueFrom(service.rates());
      const req = httpMock.expectOne('/api/fx/rates');
      expect(req.request.method).toBe('GET');
      req.flush({ rates: { 'USD/TWD': 32.5 } });

      expect(await promise).toEqual({ 'USD/TWD': 32.5 });
    });

    it('caches — a second call does not issue a second HTTP request', async () => {
      const first = firstValueFrom(service.rates());
      httpMock.expectOne('/api/fx/rates').flush({ rates: { 'USD/TWD': 32.5 } });
      await first;

      const second = await firstValueFrom(service.rates());
      httpMock.expectNone('/api/fx/rates');
      expect(second).toEqual({ 'USD/TWD': 32.5 });
    });

    it('resolves to {} on HTTP error rather than throwing', async () => {
      const promise = firstValueFrom(service.rates());
      httpMock.expectOne('/api/fx/rates').flush('boom', { status: 500, statusText: 'Server Error' });
      expect(await promise).toEqual({});
    });

    it('defaults to {} when the response body has no rates field', async () => {
      const promise = firstValueFrom(service.rates());
      httpMock.expectOne('/api/fx/rates').flush({});
      expect(await promise).toEqual({});
    });
  });

  describe('crossRate()', () => {
    const rates = { 'USD/TWD': 32.5, 'EUR/TWD': 35.2, 'GBP/TWD': 41.2 };

    it('returns 1 when from === to', () => {
      expect(service.crossRate(rates, 'USD', 'USD')).toBe(1);
    });

    it('treats TWD as always worth 1 TWD without needing a table entry', () => {
      expect(service.crossRate({}, 'TWD', 'TWD')).toBe(1);
    });

    it('resolves a direct "<ccy>/TWD" entry', () => {
      expect(service.crossRate(rates, 'USD', 'TWD')).toBe(32.5);
    });

    it('resolves the inverse "TWD/<ccy>" entry when only that direction is present', () => {
      const inverseOnly = { 'TWD/JPY': 4.587 };
      expect(service.crossRate(inverseOnly, 'JPY', 'TWD')).toBeCloseTo(1 / 4.587, 10);
    });

    it('bridges two non-TWD currencies through TWD', () => {
      const result = service.crossRate(rates, 'USD', 'EUR');
      expect(result).toBeCloseTo(32.5 / 35.2, 10);
    });

    it('returns null when a currency has no rate info in either direction', () => {
      expect(service.crossRate(rates, 'USD', 'XYZ')).toBeNull();
      expect(service.crossRate(rates, 'XYZ', 'USD')).toBeNull();
    });
  });
});
