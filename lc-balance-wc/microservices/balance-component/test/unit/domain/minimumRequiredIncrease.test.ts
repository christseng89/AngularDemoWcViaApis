import { calculateMinimumRequiredIncrease } from '../../../src/domain/minimumRequiredIncrease';

describe('Minimum Required Increase — authoritative owner-currency predicate', () => {
  const base = {
    transactionAmountOwner: '120',
    effectiveCapacityOwner: '100',
    approvedContractualMaximumOwner: '100',
    allowancePercentage: '10',
    configuredMaximumOwner: '1000',
    approvedUtilizedOwner: '0',
    otherPendingReservedOwner: '0',
    ownerCurrencyPrecision: 2,
    capacityGainPerIncrease: '1',
    snapshotTime: '2026-09-23T00:00:00.000Z',
  } as const;

  test('returns the smallest owner-currency minor unit that satisfies the same rounded predicate', () => {
    const result = calculateMinimumRequiredIncrease(base);

    expect(result).toMatchObject({
      outcome: 'FINITE',
      minimumRequiredIncreaseOwner: '9.09',
      snapshotTime: base.snapshotTime,
      fxContribution: false,
    });
    expect(result.evidence).toMatchObject({
      effectiveCapacityOwner: '100',
      approvedContractualMaximumOwner: '100',
      allowancePercentage: '10',
      configuredMaximumOwner: '1000',
    });
  });

  test('marks provider FX contribution when the converted configured maximum is the binding limit', () => {
    const result = calculateMinimumRequiredIncrease({
      ...base,
      allowancePercentage: '30',
      configuredMaximumOwner: '15',
      fxEvidence: {
        rateOrigin: 'PROVIDER_SUPPLIED',
        bookingRate: '0.015',
        providerRateId: 'rate-1',
        providerRateVersion: 'v7',
        rateTimestamp: '2026-09-22T23:59:00.000Z',
      },
    });

    expect(result).toMatchObject({
      outcome: 'FINITE',
      minimumRequiredIncreaseOwner: '5',
      fxContribution: true,
      fxEvidence: expect.objectContaining({ providerRateId: 'rate-1', bookingRate: '0.015' }),
    });
  });

  test('returns INCREASE_ALONE_CANNOT_RESOLVE instead of an invented amount when capacity cannot increase and the hard cap is insufficient', () => {
    const fxEvidence = {
      rateOrigin: 'PROVIDER_SUPPLIED',
      bookingRate: '0.015',
      providerRateId: 'rate-no-finite',
      providerRateVersion: 'v8',
      rateTimestamp: '2026-09-22T23:59:00.000Z',
    };
    const result = calculateMinimumRequiredIncrease({
      ...base,
      allowancePercentage: '30',
      configuredMaximumOwner: '15',
      capacityGainPerIncrease: '0',
      fxEvidence,
    });

    expect(result).toEqual({
      outcome: 'INCREASE_ALONE_CANNOT_RESOLVE',
      snapshotTime: base.snapshotTime,
      fxContribution: true,
      fxEvidence,
      evidence: expect.objectContaining({ proposedExcessOwner: '20' }),
    });
  });

  test('holds committed Approved and other Pending Excess fixed while solving', () => {
    const result = calculateMinimumRequiredIncrease({
      ...base,
      allowancePercentage: '30',
      configuredMaximumOwner: '30',
      approvedUtilizedOwner: '25',
    });

    expect(result).toMatchObject({ outcome: 'FINITE', minimumRequiredIncreaseOwner: '15' });
  });

  test('stops at full transaction coverage because the authoritative predicate becomes NOT_REQUIRED without curing Approved Excess', () => {
    const result = calculateMinimumRequiredIncrease({
      ...base,
      allowancePercentage: '30',
      configuredMaximumOwner: '100',
      approvedUtilizedOwner: '80',
    });

    expect(result).toMatchObject({ outcome: 'FINITE', minimumRequiredIncreaseOwner: '20' });
  });

  test('can resolve by contractual allowance growth even when the transaction capacity itself cannot grow', () => {
    const result = calculateMinimumRequiredIncrease({
      ...base,
      allowancePercentage: '30',
      approvedUtilizedOwner: '25',
      capacityGainPerIncrease: '0',
    });

    expect(result).toMatchObject({ outcome: 'FINITE', minimumRequiredIncreaseOwner: '49.99', fxContribution: false });
  });

  test('rejects a call that is not currently over-limit', () => {
    expect(() => calculateMinimumRequiredIncrease({ ...base, transactionAmountOwner: '105' })).toThrow(
      'Minimum Required Increase is only calculated for a current LIMIT_EXCEEDED result',
    );
  });

  test('rejects invalid precision, negative monetary input and a zero allowance contract', () => {
    expect(() => calculateMinimumRequiredIncrease({ ...base, ownerCurrencyPrecision: 4 })).toThrow('ownerCurrencyPrecision');
    expect(() => calculateMinimumRequiredIncrease({ ...base, approvedUtilizedOwner: '-0.01' })).toThrow('approvedUtilizedOwner must be non-negative');
    expect(() => calculateMinimumRequiredIncrease({ ...base, allowancePercentage: '0' })).toThrow('allowancePercentage must be positive');
  });
});
