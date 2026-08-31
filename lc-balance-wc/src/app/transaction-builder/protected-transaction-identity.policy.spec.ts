import { ProtectedIdentityState, deriveProtectedIdentityItems } from './protected-transaction-identity.policy';

const state: ProtectedIdentityState = {
  lcNumber: 'LC-1',
  secondaryRef: 'IB-1',
  carriedSecondaryRef: null,
  requiredNaturalKeyFields: ['ibNumber'],
  isCreatingMovement: false,
  settlesDocumentArrival: false,
  releasesExistingMovementInPlace: false,
  ibNumberLabel: 'IB Number',
};

describe('deriveProtectedIdentityItems', () => {
  it('renders an ordinary existing LC and IB identity', () => {
    expect(deriveProtectedIdentityItems(state)).toEqual([
      { label: 'LC Number', value: 'LC-1' },
      { label: 'IB Number', value: 'IB-1' },
    ]);
  });

  it('keeps A6 carried IB visible while creating its acceptance', () => {
    expect(deriveProtectedIdentityItems({ ...state, isCreatingMovement: true, settlesDocumentArrival: true })).toHaveLength(2);
  });

  it('does not duplicate a new A8/B3 secondary reference as protected', () => {
    expect(deriveProtectedIdentityItems({ ...state, requiredNaturalKeyFields: ['sgNumber'], isCreatingMovement: true })).toEqual([
      { label: 'LC Number', value: 'LC-1' },
    ]);
  });

  it('renders an existing Shipping Guarantee secondary identity', () => {
    expect(deriveProtectedIdentityItems({ ...state, requiredNaturalKeyFields: ['sgNumber'], secondaryRef: 'SG-1' })).toEqual([
      { label: 'LC Number', value: 'LC-1' },
      { label: 'SG Number', value: 'SG-1' },
    ]);
  });

  it('adds A4 carried document-arrival IB and preserves empty fallbacks', () => {
    expect(
      deriveProtectedIdentityItems({
        ...state,
        lcNumber: null,
        requiredNaturalKeyFields: [],
        releasesExistingMovementInPlace: true,
        carriedSecondaryRef: null,
      }),
    ).toEqual([
      { label: 'LC Number', value: '—' },
      { label: 'IB Number', value: '—' },
    ]);
  });
});
