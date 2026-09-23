import { deriveExcessFunctionCapacity, prepareExcessFunctionSplit, type ExcessFunctionCapacityInput } from '../../../src/domain/excessFunctionStrategy';

describe('V4 Excess function strategies', () => {
  test.each<{
    label: string;
    input: ExcessFunctionCapacityInput;
    expectedCapacity: string;
  }>([
    {
      label: 'A3 uses the Import LC Tight Available',
      input: {
        functionCode: 'A3',
        transactionCurrency: 'EUR',
        ownerCurrency: 'EUR',
        importLcTightAvailableOwner: '70',
      },
      expectedCapacity: '70',
    },
    {
      label: 'A3S adds the current main SG redemption to normalized base parent Tight',
      input: {
        functionCode: 'A3S',
        transactionCurrency: 'EUR',
        ownerCurrency: 'EUR',
        baseParentTightAvailableOwner: '30',
        currentSgRedemptionAmountOwner: '40',
      },
      expectedCapacity: '70',
    },
    {
      label: 'B3 uses the Export Confirmation Tight Available',
      input: {
        functionCode: 'B3',
        transactionCurrency: 'JPY',
        ownerCurrency: 'JPY',
        confirmationTightAvailableOwner: '900',
      },
      expectedCapacity: '900',
    },
  ])('$label', ({ input, expectedCapacity }) => {
    expect(deriveExcessFunctionCapacity(input)).toEqual({
      functionCode: input.functionCode,
      ownerCurrency: input.ownerCurrency,
      authoritativeCoveredCapacityOwner: expectedCapacity,
    });
  });

  test('A3S normalizes its pending self legs and calculates the V2 concrete split', () => {
    expect(
      prepareExcessFunctionSplit({
        functionCode: 'A3S',
        transactionCurrency: 'USD',
        ownerCurrency: 'USD',
        transactionAmountOwner: '10200',
        baseParentTightAvailableOwner: '4000',
        currentSgRedemptionAmountOwner: '6000',
      }),
    ).toEqual({
      functionCode: 'A3S',
      ownerCurrency: 'USD',
      authoritativeCoveredCapacityOwner: '10000',
      coveredAmountOwner: '10000',
      proposedExcessOwner: '200',
    });
  });

  test.each([
    {
      functionCode: 'A3' as const,
      ownerLabel: 'Import LC',
      extra: { importLcTightAvailableOwner: '80' },
    },
    {
      functionCode: 'A3S' as const,
      ownerLabel: 'Import LC',
      extra: { baseParentTightAvailableOwner: '40', currentSgRedemptionAmountOwner: '40' },
    },
    {
      functionCode: 'B3' as const,
      ownerLabel: 'Export Confirmation',
      extra: { confirmationTightAvailableOwner: '80' },
    },
  ])('$functionCode rejects transaction currency mismatch before producing FX/persistence input', ({ functionCode, ownerLabel, extra }) => {
    expect(() =>
      prepareExcessFunctionSplit({
        functionCode,
        transactionCurrency: 'USD',
        ownerCurrency: 'EUR',
        transactionAmountOwner: '100',
        ...extra,
      } as Parameters<typeof prepareExcessFunctionSplit>[0]),
    ).toThrow(`${functionCode} transaction currency USD must equal ${ownerLabel} owner currency EUR`);
  });

  test('preserves a negative raw Tight Available so the shared split applies its zero floor', () => {
    expect(
      prepareExcessFunctionSplit({
        functionCode: 'A3',
        transactionCurrency: 'USD',
        ownerCurrency: 'USD',
        transactionAmountOwner: '10',
        importLcTightAvailableOwner: '-1',
      }),
    ).toEqual({
      functionCode: 'A3',
      ownerCurrency: 'USD',
      authoritativeCoveredCapacityOwner: '-1',
      coveredAmountOwner: '0',
      proposedExcessOwner: '10',
    });
  });

  test('A3S never lets a negative normalized base parent Tight erode current SG redemption coverage', () => {
    expect(
      deriveExcessFunctionCapacity({
        functionCode: 'A3S',
        transactionCurrency: 'USD',
        ownerCurrency: 'USD',
        baseParentTightAvailableOwner: '-10',
        currentSgRedemptionAmountOwner: '40',
      }),
    ).toEqual({ functionCode: 'A3S', ownerCurrency: 'USD', authoritativeCoveredCapacityOwner: '40' });
  });
});
