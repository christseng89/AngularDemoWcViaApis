import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { PaymentComponentApiService, PaymentComponentApiError } from './payment-component-api.service';
import type { PaymentInstructionConfirmRequest, PaymentInstruction } from './payment-component.types';

const minimalRequest: PaymentInstructionConfirmRequest = {
  originModule: 'IPLC',
  mainRef: 'REF-1',
  sequence: 1,
  unitCode: 'HQ',
  debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
  creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }],
};

const minimalInstruction = { instructionId: 'i1' } as PaymentInstruction;

describe('PaymentComponentApiService', () => {
  let service: PaymentComponentApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [PaymentComponentApiService] });
    service = TestBed.inject(PaymentComponentApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('confirm()', () => {
    it('posts to /payment-component/v1/payment-instructions with dryRun merged into the body', async () => {
      const promise = firstValueFrom(service.confirm(minimalRequest, true));
      const req = httpMock.expectOne('/payment-component/v1/payment-instructions');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ...minimalRequest, dryRun: true });
      req.flush(minimalInstruction, { status: 200, statusText: 'OK' });

      expect(await promise).toEqual({ instruction: minimalInstruction, created: false });
    });

    it('reports created:true only for HTTP 201', async () => {
      const promise = firstValueFrom(service.confirm(minimalRequest, false));
      httpMock.expectOne('/payment-component/v1/payment-instructions').flush(minimalInstruction, { status: 201, statusText: 'Created' });
      expect((await promise).created).toBe(true);
    });

    it('reports created:false for HTTP 200 (idempotent replay)', async () => {
      const promise = firstValueFrom(service.confirm(minimalRequest, false));
      httpMock.expectOne('/payment-component/v1/payment-instructions').flush(minimalInstruction, { status: 200, statusText: 'OK' });
      expect((await promise).created).toBe(false);
    });

    it('rethrows a structured API error body as PaymentComponentApiError', async () => {
      const promise = firstValueFrom(service.confirm(minimalRequest, false));
      httpMock.expectOne('/payment-component/v1/payment-instructions').flush(
        { code: 'LEGS_UNBALANCED', message: 'legs do not balance' },
        { status: 409, statusText: 'Conflict' },
      );

      await expect(promise).rejects.toMatchObject({
        status: 409,
        message: 'LEGS_UNBALANCED: legs do not balance',
        name: 'PaymentComponentApiError',
      });
    });

    it('falls back to the raw HttpErrorResponse message when the error body is not the {code,message} shape', async () => {
      const promise = firstValueFrom(service.confirm(minimalRequest, false));
      httpMock.expectOne('/payment-component/v1/payment-instructions').flush('plain text error', { status: 500, statusText: 'Server Error' });

      await expect(promise).rejects.toBeInstanceOf(PaymentComponentApiError);
    });
  });

  describe('classify()', () => {
    it('posts to /payment-component/v1/payment-instructions/classify with the two leg arrays and tolerance', async () => {
      const promise = firstValueFrom(service.classify(minimalRequest.debitLegs, minimalRequest.creditLegs, 0.5));
      const req = httpMock.expectOne('/payment-component/v1/payment-instructions/classify');
      expect(req.request.body).toEqual({ debitLegs: minimalRequest.debitLegs, creditLegs: minimalRequest.creditLegs, balanceTolerance: 0.5 });
      req.flush({ classification: {}, balance: {}, accountEntries: [] });

      await expect(promise).resolves.toBeDefined();
    });

    it('rethrows on error the same way confirm() does', async () => {
      const promise = firstValueFrom(service.classify(minimalRequest.debitLegs, minimalRequest.creditLegs));
      httpMock.expectOne('/payment-component/v1/payment-instructions/classify').flush(
        { code: 'REQUEST_VALIDATION_FAILED', message: 'bad body' },
        { status: 400, statusText: 'Bad Request' },
      );

      await expect(promise).rejects.toMatchObject({ status: 400, message: 'REQUEST_VALIDATION_FAILED: bad body' });
    });
  });
});
