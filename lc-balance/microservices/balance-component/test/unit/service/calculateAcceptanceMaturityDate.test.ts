/**
 * `BalanceService.calculateAcceptanceMaturityDate()` — the one genuinely async method on this class (see
 * its own doc comment in balanceService.ts). Mocks `clients/standingClient` entirely — this method's own
 * job is pure orchestration (shaping the Standing request/response), not HTTP, and no longer performs any
 * Base Date resolution itself (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §8 — the caller resolves
 * `sourceDate`, e.g. `fixedMaturityDate` directly for tenorBasis='FIXED_MATURITY_DATE'); the client itself
 * has its own dedicated test/unit/clients/standingClient.test.ts.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import * as standingClient from '../../../src/clients/standingClient';

jest.mock('../../../src/clients/standingClient');
const adjustBusinessDayMock = standingClient.adjustBusinessDay as jest.MockedFunction<typeof standingClient.adjustBusinessDay>;

describe('BalanceService.calculateAcceptanceMaturityDate (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §8)', () => {
  afterEach(() => jest.clearAllMocks());

  test('passes the caller-resolved sourceDate straight through and returns Standing\'s adjustedDate/calculationId/calendarSnapshotId', async () => {
    adjustBusinessDayMock.mockResolvedValue({
      calculationId: 'calc-abc',
      adjustedDate: '2026-12-28',
      wasAdjusted: true,
      adjustmentDays: 3,
      contractualDateChanged: false,
      calendarSnapshotId: 'snap-1',
      calendarVersions: [],
      calendarAssessments: [],
      adjustedDateAssessments: [],
      skippedDates: [],
    });
    const service = new BalanceService(createDb(':memory:'));

    const result = await service.calculateAcceptanceMaturityDate({
      sourceDate: '2026-12-25', // the design doc's own canonical sourceDate
      currency: 'USD',
      calendars: [{ calendarType: 'CURRENCY_CLEARING', code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }],
    });

    expect(result).toEqual({ operationalPaymentDate: '2026-12-28', standingCalculationId: 'calc-abc', calendarSnapshotId: 'snap-1' });
    expect(adjustBusinessDayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDate: '2026-12-25',
        sourceDateType: 'CONTRACTUAL_MATURITY_DATE',
        calculationPurpose: 'OPERATIONAL_PAYMENT_DATE',
        currency: 'USD',
        combinationRule: 'ALL_REQUIRED_OPEN',
        convention: 'FOLLOWING',
      }),
    );
  });

  test('passes an explicit combinationRule/convention through to Standing instead of the defaults', async () => {
    adjustBusinessDayMock.mockResolvedValue({
      calculationId: 'calc-def',
      adjustedDate: '2026-06-01',
      wasAdjusted: false,
      adjustmentDays: 0,
      contractualDateChanged: false,
      calendarSnapshotId: 'snap-2',
      calendarVersions: [],
      calendarAssessments: [],
      adjustedDateAssessments: [],
      skippedDates: [],
    });
    const service = new BalanceService(createDb(':memory:'));

    await service.calculateAcceptanceMaturityDate({
      sourceDate: '2026-06-01',
      calendars: [{ calendarType: 'COUNTRY', code: 'TW', role: 'SETTLEMENT', required: true }],
      combinationRule: 'ANY_ELIGIBLE_OPEN',
      convention: 'NEAREST',
    });

    expect(adjustBusinessDayMock).toHaveBeenCalledWith(expect.objectContaining({ combinationRule: 'ANY_ELIGIBLE_OPEN', convention: 'NEAREST' }));
  });

  test('propagates a CalendarServiceError from Standing unchanged (fail-closed, no silent fallback)', async () => {
    const { CalendarServiceError } = jest.requireActual('../../../src/errors');
    adjustBusinessDayMock.mockRejectedValue(new CalendarServiceError('Standing service unreachable at http://localhost:4400: connect ECONNREFUSED'));
    const service = new BalanceService(createDb(':memory:'));

    await expect(
      service.calculateAcceptanceMaturityDate({
        sourceDate: '2026-01-31',
        calendars: [{ calendarType: 'CURRENCY_CLEARING', code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }],
      }),
    ).rejects.toThrow(CalendarServiceError);
  });
});
