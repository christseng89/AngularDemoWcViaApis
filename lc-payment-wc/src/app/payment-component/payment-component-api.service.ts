import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import type {
  ApiErrorBody,
  ClassifyPreviewResult,
  PaymentInstruction,
  PaymentInstructionConfirmRequest,
  PaymentLegInput,
} from './payment-component.types';

/** Thrown by this service so callers get a flat, human-readable message regardless of HTTP status. */
export class PaymentComponentApiError extends Error {
  constructor(public readonly status: number, public readonly body: ApiErrorBody | string) {
    super(typeof body === 'string' ? body : `${body.code}: ${body.message}`);
    this.name = 'PaymentComponentApiError';
  }
}

export interface ConfirmOutcome {
  instruction: PaymentInstruction;
  /**
   * true only for a genuinely new instruction (HTTP 201). false for a
   * dryRun preview OR for an idempotent replay (HTTP 200) — i.e. the same
   * (originModule, mainRef, sequence) natural key was already confirmed
   * earlier, so the server returned that ORIGINAL result unchanged
   * regardless of what's in this request's legs (FSD §6.1). The UI must
   * distinguish this from a fresh confirm, or a replay showing old data
   * reads as a bug.
   */
  created: boolean;
}

@Injectable({ providedIn: 'root' })
export class PaymentComponentApiService {
  private readonly base = '/payment-component/v1';

  constructor(private readonly http: HttpClient) {}

  /**
   * POST /payment-instructions. Pass dryRun:true for the live onChange preview
   * (PASS cases) — never persisted, safe to call on every keystroke. Pass
   * dryRun:false (or omit) for the real Confirm action.
   */
  confirm(request: PaymentInstructionConfirmRequest, dryRun: boolean): Observable<ConfirmOutcome> {
    return this.http
      .post<PaymentInstruction>(`${this.base}/payment-instructions`, { ...request, dryRun }, { observe: 'response' })
      .pipe(
        map((res) => ({ instruction: res.body as PaymentInstruction, created: res.status === 201 })),
        catchError((err) => this.rethrow(err)),
      );
  }

  /**
   * POST /payment-instructions/classify. Used only by RPFM's GAP-verdict cases,
   * which have no voucher-assembly routine to run through the full confirm flow.
   */
  classify(
    debitLegs: PaymentLegInput[],
    creditLegs: PaymentLegInput[],
    balanceTolerance?: number,
  ): Observable<ClassifyPreviewResult> {
    return this.http
      .post<ClassifyPreviewResult>(`${this.base}/payment-instructions/classify`, {
        debitLegs,
        creditLegs,
        balanceTolerance,
      })
      .pipe(catchError((err) => this.rethrow(err)));
  }

  private rethrow(err: HttpErrorResponse): Observable<never> {
    const body: ApiErrorBody | string =
      err.error && typeof err.error === 'object' && 'code' in err.error && 'message' in err.error
        ? (err.error as ApiErrorBody)
        : err.message;
    return throwError(() => new PaymentComponentApiError(err.status, body));
  }
}
