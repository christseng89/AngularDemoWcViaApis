import { adjustBusinessDay, type AdjustBusinessDayRequest, type StandingCalendarRef } from '../../../src/clients/standingClient';
import { CalendarServiceError } from '../../../src/errors';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

function connectionError(code: string): Error {
  const err = new TypeError('fetch failed') as TypeError & { cause?: { code: string } };
  err.cause = { code };
  return err;
}

const calendars: StandingCalendarRef[] = [{ calendarType: 'CURRENCY_CLEARING', code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }];

function sampleRequest(): AdjustBusinessDayRequest {
  return {
    sourceDate: '2026-12-25',
    sourceDateType: 'CONTRACTUAL_MATURITY_DATE',
    calculationPurpose: 'OPERATIONAL_PAYMENT_DATE',
    calendars,
    combinationRule: 'ALL_REQUIRED_OPEN',
    convention: 'FOLLOWING',
  };
}

// 2026-08-23 — mirrors lc-balance/backend/server.js's own fetchWithRetry test suite (same retry
// schedule/reasoning: this client's one endpoint is read/computation-only, safe to retry unlike a
// mutating Balance Component call).
describe('standingClient.adjustBusinessDay', () => {
  const originalEnv = process.env.STANDING_SERVICE_URL;

  afterEach(() => {
    process.env.STANDING_SERVICE_URL = originalEnv;
    jest.restoreAllMocks();
  });

  test('POSTs to the default base URL (localhost:4400) with the request JSON-encoded and returns the parsed response', async () => {
    const responseBody = { calculationId: 'calc-1', adjustedDate: '2026-12-28', wasAdjusted: true, adjustmentDays: 3, contractualDateChanged: false, calendarAssessments: [], adjustedDateAssessments: [], skippedDates: [] };
    global.fetch = jest.fn(async () => jsonResponse(200, responseBody)) as unknown as typeof fetch;

    const result = await adjustBusinessDay(sampleRequest());

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:4400/business-days/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleRequest()),
    });
    expect(result).toEqual(responseBody);
  });

  test('honors STANDING_SERVICE_URL when set', async () => {
    process.env.STANDING_SERVICE_URL = 'http://standing.internal:9000';
    global.fetch = jest.fn(async () => jsonResponse(200, { calculationId: 'calc-2', adjustedDate: '2026-12-25', wasAdjusted: false, adjustmentDays: 0, contractualDateChanged: false, calendarAssessments: [], adjustedDateAssessments: [], skippedDates: [] })) as unknown as typeof fetch;

    await adjustBusinessDay(sampleRequest());

    expect(global.fetch).toHaveBeenCalledWith('http://standing.internal:9000/business-days/adjust', expect.anything());
  });

  test('a non-2xx response throws CalendarServiceError naming the HTTP status and Standing errorCode', async () => {
    global.fetch = jest.fn(async () => jsonResponse(422, { errorCode: 'CALENDAR_NOT_CONFIGURED', message: 'No such calendar.', correlationId: 'c1', retryable: false })) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(CalendarServiceError);
    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(/HTTP 422 CALENDAR_NOT_CONFIGURED.*No such calendar\./);
    expect(global.fetch).toHaveBeenCalledTimes(2); // one call per assertion above, each a fresh request
  });

  test('a non-JSON response body throws CalendarServiceError rather than propagating the JSON parse error', async () => {
    global.fetch = jest.fn(async () => ({ status: 429, statusText: 'Too Many Requests', ok: false, json: () => Promise.reject(new Error('Unexpected token < in JSON')) }) as unknown as Response) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(CalendarServiceError);
    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(/non-JSON response/);
  });

  test('a non-2xx response missing errorCode/message still throws a sensible CalendarServiceError (?? fallbacks)', async () => {
    global.fetch = jest.fn(async () => jsonResponse(500, {})) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(/HTTP 500 [^:]*: no message/);
  });

  test('a connection failure that is not an Error instance (e.g. a plain string throw) still produces a readable CalendarServiceError', async () => {
    global.fetch = jest.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'boom (not an Error instance)';
    }) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(/boom \(not an Error instance\)/);
  });

  test('a JSON-parse failure whose thrown value is not an Error instance still produces a readable CalendarServiceError', async () => {
    global.fetch = jest.fn(async () => ({ status: 502, statusText: 'Bad Gateway', ok: false, json: () => Promise.reject('not-an-error-object') }) as unknown as Response) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(/non-JSON response.*not-an-error-object/);
  });

  test('retries a transient ECONNRESET and succeeds on the second attempt', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw connectionError('ECONNRESET');
      return jsonResponse(200, { calculationId: 'calc-3', adjustedDate: '2026-12-28', wasAdjusted: true, adjustmentDays: 3, contractualDateChanged: false, calendarAssessments: [], adjustedDateAssessments: [], skippedDates: [] });
    }) as unknown as typeof fetch;

    const result = await adjustBusinessDay(sampleRequest());

    expect(calls).toBe(2);
    expect(result.adjustedDate).toBe('2026-12-28');
  });

  test('exhausts both retries (3 attempts total) then throws CalendarServiceError wrapping the final connection error', async () => {
    global.fetch = jest.fn(async () => {
      throw connectionError('ECONNREFUSED');
    }) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(CalendarServiceError);
    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(/Standing service unreachable/);
    expect(global.fetch).toHaveBeenCalledTimes(6); // 3 attempts x 2 assertions above (each awaits its own call)
  });

  test('a non-retryable error (no recognizable connection-error code) fails immediately without retrying', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('boom, not a connection error');
    }) as unknown as typeof fetch;

    await expect(adjustBusinessDay(sampleRequest())).rejects.toThrow(CalendarServiceError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
