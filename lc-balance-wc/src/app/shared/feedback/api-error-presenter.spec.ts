import { presentApiError } from './api-error-presenter';

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
