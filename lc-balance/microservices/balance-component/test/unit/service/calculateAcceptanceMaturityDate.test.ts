/**
 * `BalanceService.calculateAcceptanceMaturityDate()` — the one genuinely async method on this class (see
 * its own doc comment in balanceService.ts). Mocks `clients/standingClient` entirely — this method's own
 * job is pure orchestration (sourceDate math + shaping the Standing request/response), not HTTP; the
 * client itself has its own dedicated test/unit/clients/standingClient.test.ts.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import * as standingClient from '../../../src/clients/standingClient';

jest.mock('../../../src/clients/standingClient');
const adjustBusinessDayMock = standingClient.adjustBusinessDay as jest.MockedFunction<typeof standingClient.adjustBusinessDay>;

describe('BalanceService.calculateAcceptanceMaturityDate (A6/B4 Calculated Maturity Date, 2026-08-23)', () => {
  afterEach(() => jest.clearAllMocks());

  test('computes sourceDate from acceptanceDate+tenorDays and returns Standing\'s adjustedDate/calculationId', async () => {
    adjustBusinessDayMock.mockResolvedValue({
      calculationId: 'calc-abc',
      adjustedDate: '2026-12-28',
      wasAdjusted: true,
      adjustmentDays: 3,
      contractualDateChanged: false,
      calendarAssessments: [],
      adjustedDateAssessments: [],
      skippedDates: [],
    });
    const service = new BalanceService(createDb(':memory:'));

    const result = await service.calculateAcceptanceMaturityDate({
      acceptanceDate: '2026-09-26', // 2026-09-26 + 90 days = 2026-12-25 (the design doc's own canonical sourceDate)
      tenorDays: 90,
      currency: 'USD',
      calendars: [{ calendarType: 'CURRENCY_CLEARING', code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }],
    });

    expect(result).toEqual({ maturityDate: '2026-12-28', standingCalculationId: 'calc-abc' });
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
      calendarAssessments: [],
      adjustedDateAssessments: [],
      skippedDates: [],
    });
    const service = new BalanceService(createDb(':memory:'));

    await service.calculateAcceptanceMaturityDate({
      acceptanceDate: '2026-06-01',
      tenorDays: 0,
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
        acceptanceDate: '2026-01-01',
        tenorDays: 30,
        calendars: [{ calendarType: 'CURRENCY_CLEARING', code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }],
      }),
    ).rejects.toThrow(CalendarServiceError);
  });
});
