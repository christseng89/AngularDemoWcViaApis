import { describeApiError } from './api-error';

describe('describeApiError', () => {
  it('prefers the server JSON error body message (err.error.message) — this service\'s own ApiError.toBody() shape', () => {
    expect(describeApiError({ error: { message: 'NATURAL_KEY_ALREADY_EXISTS' } })).toBe('NATURAL_KEY_ALREADY_EXISTS');
  });

  it('falls back to err.message when there is no server JSON error body — a connection-level HttpErrorResponse (server unreachable/CORS/DNS)', () => {
    expect(describeApiError({ message: 'Http failure response for http://localhost:4200/x: 0 Unknown Error' })).toBe(
      'Http failure response for http://localhost:4200/x: 0 Unknown Error',
    );
  });

  it('err.error.message wins over err.message when both are present', () => {
    expect(describeApiError({ error: { message: 'server said no' }, message: 'generic http message' })).toBe('server said no');
  });

  it('a genuine Error instance is described via its own .message (the new fallback), not String(err) — cleaner than the old "Error: boom", and never literally "[object Object]"', () => {
    expect(describeApiError(new Error('boom'))).toBe('boom');
  });

  it('a bare object with neither .error.message nor .message still stringifies (last-resort, may read "[object Object]" — the specific bug this function used to have for connection-level failures is now closed by the .message fallback above)', () => {
    expect(describeApiError({})).toBe('[object Object]');
  });
});
