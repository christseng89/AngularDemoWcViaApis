import { hasManualRouteOverride } from './resolution-route-selection';

describe('resolution route confirmation visibility', () => {
  const recommended = { ssiId: 'SSI-PRIMARY' };

  it('does not require a button when only the recommended route exists', () => {
    expect(
      hasManualRouteOverride(
        { recommendedRoute: recommended, alternatives: [] },
        recommended.ssiId,
      ),
    ).toBe(false);
  });

  it('does not require a button while the recommended route remains selected', () => {
    expect(
      hasManualRouteOverride(
        {
          recommendedRoute: recommended,
          alternatives: [{ ssiId: 'SSI-SECONDARY' }],
        },
        recommended.ssiId,
      ),
    ).toBe(false);
  });

  it('requires confirmation after the user selects an alternative route', () => {
    expect(
      hasManualRouteOverride(
        {
          recommendedRoute: recommended,
          alternatives: [{ ssiId: 'SSI-SECONDARY' }],
        },
        'SSI-SECONDARY',
      ),
    ).toBe(true);
  });
});
