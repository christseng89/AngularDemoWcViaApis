import { presentApiError, presentValidationError } from './api-error-presenter';

describe('presentApiError', () => {
  it('presents a 404 search as an informational no-match with the query', () => {
    expect(presentApiError({ status: 404, error: { code: 'NOT_FOUND' } }, 'SEARCH', 'LC S001')).toEqual(
      expect.objectContaining({ severity: 'INFO', title: 'No matching transaction', message: 'No transaction matched LC S001.', retryable: false }),
    );
  });

  it('maps duplicate natural keys to a non-retryable business warning', () => {
    expect(presentApiError({ error: { message: 'NATURAL_KEY_ALREADY_EXISTS' } }, 'SUBMIT')).toEqual(
      expect.objectContaining({ severity: 'WARNING', title: 'Transaction already exists', retryable: false }),
    );
  });

  it('maps conflicts to a refreshable already-processed warning', () => {
    expect(presentApiError({ status: 409 }, 'APPROVE')).toEqual(
      expect.objectContaining({ severity: 'WARNING', title: 'Transaction already processed', retryable: true }),
    );
  });

  it('presents an initial Excess limit rejection as zero-write, never as an already-processed conflict', () => {
    expect(
      presentApiError({ status: 409, error: { code: 'EXCESS_LIMIT_EXCEEDED', message: 'The current Excess allowance is insufficient.' } }, 'SUBMIT'),
    ).toMatchObject({
      severity: 'WARNING',
      title: 'Excess limit exceeded',
      message: 'The transaction exceeds the current Excess allowance. No pending transaction or Excess reservation was created.',
      retryable: false,
      supportCode: 'EXCESS_LIMIT_EXCEEDED',
      technicalCode: 'EXCESS_LIMIT_EXCEEDED',
    });
  });

  it.each([
    ['SUBMIT', 'No pending transaction or Excess reservation was created.'],
    ['FIX', 'original pending transaction and Excess reservation were retained unchanged.'],
    ['APPROVE', 'pending transaction and Excess reservation were retained.'],
  ] as const)('EXCESS_LIMIT_EXCEEDED preserves the %s lifecycle boundary', (context, expectedMessage) => {
    const result = presentApiError({ status: 409, error: { code: 'EXCESS_LIMIT_EXCEEDED' } }, context);
    expect(result).toMatchObject({ supportCode: 'EXCESS_LIMIT_EXCEEDED', message: expect.stringContaining(expectedMessage) });
    expect(JSON.stringify(result)).not.toContain('FX_RATE_PENDING');
  });

  it.each(['FX_RATE_UNAVAILABLE', 'FX_RATE_STALE'] as const)('%s distinguishes initial Submit, Fix and Checker retention', (code) => {
    const error = { status: 409, error: { code } };

    expect(presentApiError(error, 'SUBMIT')).toMatchObject({
      title: code === 'FX_RATE_STALE' ? 'Booking rate is stale' : 'Booking rate unavailable',
      message: expect.stringContaining('No pending transaction or Excess reservation was created.'),
      retryable: true,
      supportCode: code,
    });
    expect(presentApiError(error, 'FIX')).toMatchObject({
      message: expect.stringContaining('original pending transaction and Excess reservation were retained unchanged.'),
      retryable: true,
      supportCode: code,
    });
    expect(presentApiError(error, 'APPROVE')).toMatchObject({
      message: expect.stringContaining('pending transaction and Excess reservation were retained.'),
      retryable: true,
      supportCode: code,
    });
    for (const context of ['SUBMIT', 'FIX', 'APPROVE'] as const) {
      expect(JSON.stringify(presentApiError(error, context))).not.toContain('FX_RATE_PENDING');
    }
  });

  it('shows Minimum Required Increase only after the server returns final over-limit guidance', () => {
    const result = presentApiError(
      {
        status: 409,
        error: {
          code: 'EXCESS_LIMIT_EXCEEDED',
          guidance: { outcome: 'FINITE', minimumRequiredIncreaseOwner: '300.00' },
        },
      },
      'SUBMIT',
    );
    expect(result.nextAction).toContain('Minimum Required Increase: 300.00');
    expect(result.nextAction).toContain('A2/B2');
  });

  it('requires A3S Eligible SG re-selection first and does not simultaneously show increase guidance', () => {
    const result = presentApiError(
      {
        status: 409,
        error: {
          code: 'A3S_RESELECT_ELIGIBLE_SG',
          eligibleAlternatives: [{ sgNumber: 'SG-002' }],
          guidance: { outcome: 'FINITE', minimumRequiredIncreaseOwner: '300.00' },
        },
      },
      'SUBMIT',
    );
    expect(result).toMatchObject({ title: 'Re-select Eligible SG', retryable: false });
    expect(`${result.message} ${result.nextAction}`).toContain('SG-002');
    expect(`${result.message} ${result.nextAction}`).not.toContain('Minimum Required Increase');
  });

  it.each([400, 422])('maps HTTP %s business validation without BAL-UI-UNEXPECTED', (status) => {
    const result = presentApiError({ status, error: { code: 'REQUEST_VALIDATION_FAILED', message: 'Amount exceeds the available balance.' } }, 'SUBMIT');
    expect(result).toMatchObject({
      severity: 'WARNING',
      title: 'Transaction rejected',
      message: 'Amount exceeds the available balance.',
      retryable: false,
      supportCode: 'REQUEST_VALIDATION_FAILED',
    });
    expect(result.supportCode).not.toBe('BAL-UI-UNEXPECTED');
  });

  it('does not expose unsafe backend validation details as primary copy', () => {
    const result = presentApiError({ status: 400, error: { message: 'See http://internal/private for a stack trace' } }, 'SUBMIT');
    expect(result.message).toBe('The service rejected one or more transaction details. Your input has been kept.');
    expect(result.message).not.toContain('http://internal/private');
  });

  it('maps other HTTP 4xx statuses without treating them as client exceptions', () => {
    expect(presentApiError({ status: 418, error: { code: 'POLICY_REJECTED' } }, 'SUBMIT')).toMatchObject({
      supportCode: 'POLICY_REJECTED',
      retryable: false,
    });
  });

  it('presents APPLICANT_WAIVER_REQUIRED as an actionable retained-pending Checker decision', () => {
    expect(presentApiError({ status: 409, error: { code: 'APPLICANT_WAIVER_REQUIRED' } }, 'APPROVE')).toMatchObject({
      severity: 'WARNING',
      title: 'Applicant waiver confirmation required',
      message: expect.stringContaining('pending transaction and Excess reservation were retained'),
      supportCode: 'APPLICANT_WAIVER_REQUIRED',
      retryable: false,
    });
  });

  it.each([
    [401, 'Authentication required'],
    [403, 'Permission denied'],
    [404, 'Transaction target not found'],
  ])('maps submit HTTP %s to an actionable client error', (status, title) => {
    expect(presentApiError({ status }, 'SUBMIT')).toMatchObject({ title, retryable: false, supportCode: `BAL-API-HTTP-${status}` });
  });

  it('presents local validation separately from API failures', () => {
    expect(presentValidationError('Amendment No. is mandatory.')).toEqual(
      expect.objectContaining({ severity: 'WARNING', title: 'Check transaction details', retryable: false }),
    );
    expect(presentValidationError('Amendment No. is mandatory.').supportCode).toBeUndefined();
  });

  it('maps connection failures without exposing the request URL as primary copy', () => {
    const result = presentApiError({ status: 0, message: 'Http failure response for http://localhost/private: 0 Unknown Error' }, 'LOAD');
    expect(result).toEqual(expect.objectContaining({ severity: 'ERROR', title: 'Balance service unavailable', retryable: true }));
    expect(`${result.title} ${result.message} ${result.nextAction}`).not.toContain('http://localhost/private');
  });

  it('maps backend 5xx responses to a retryable service failure', () => {
    const result = presentApiError({ status: 500, error: { message: 'internal stack detail' } }, 'REJECT');
    expect(result).toEqual(
      expect.objectContaining({
        severity: 'ERROR',
        title: 'Balance service temporarily unavailable',
        supportCode: 'BAL-SVC-HTTP-500',
        technicalCode: 'internal stack detail',
      }),
    );
    expect(result.message).not.toContain('internal stack detail');
  });

  it('reserves BAL-UI-UNEXPECTED for an unclassified error with no HTTP status', () => {
    expect(presentApiError({ message: 'unexpected client exception' }, 'SUBMIT')).toMatchObject({ supportCode: 'BAL-UI-UNEXPECTED' });
  });

  it('covers message extraction and fallback branches without leaking technical copy', () => {
    expect(presentApiError(undefined, 'LOAD')).toMatchObject({ severity: 'ERROR', title: 'Unable to load the queue' });
    expect(presentApiError({ error: 'record not found' }, 'SEARCH')).toMatchObject({
      severity: 'INFO',
      message: 'No transaction matched your search.',
      technicalCode: 'record not found',
    });
    expect(presentApiError({ error: { code: 'NATURAL_KEY_ALREADY_EXISTS' } }, 'SUBMIT')).toMatchObject({ severity: 'WARNING' });
    expect(presentApiError({ message: 'Failed to fetch' }, 'LOAD')).toMatchObject({ severity: 'ERROR', title: 'Balance service unavailable' });
  });
});
