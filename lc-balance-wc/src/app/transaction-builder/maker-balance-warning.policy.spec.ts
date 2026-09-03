import { MakerBalanceWarningState, deriveMakerBalanceWarnings } from './maker-balance-warning.policy';

const state: MakerBalanceWarningState = {
  formLocked: false,
  amountProtected: false,
  amount: '90',
  movementType: 'UTILIZE',
  availableBalance: '100',
  tightAvailableBalance: '80',
  checksAgainstPlainAvailable: true,
  checksAgainstTightAvailable: true,
  contractInstrumentType: 'IPLC_LC',
  offBalanceExposure: '20',
  usesDocumentArrivalWithSg: false,
  arrivalSgOutstanding: null,
  referencedPresentationAmount: null,
};

describe('deriveMakerBalanceWarnings', () => {
  it('returns no warning for blank, locked, or sufficient amounts', () => {
    expect(deriveMakerBalanceWarnings({ ...state, amount: '' })).toEqual([]);
    expect(deriveMakerBalanceWarnings({ ...state, formLocked: true })).toEqual([]);
    expect(deriveMakerBalanceWarnings({ ...state, amount: '70' })).toEqual([]);
  });

  it('never applies a Typed amount warning to a protected carried amount', () => {
    expect(
      deriveMakerBalanceWarnings({
        ...state,
        amountProtected: true,
        amount: '100000',
        availableBalance: '0',
        tightAvailableBalance: '0',
      }),
    ).toEqual([]);
  });

  it.each([
    ['500k', '1100000'],
    ['5K', '6000'],
    ['20.5h', '3000'],
    ['3h2h', '600'],
    ['1m2k3h', '1002300'],
  ])('uses the shared h/k/m parser before comparing %s with Tight Available', (amount, tightAvailableBalance) => {
    expect(
      deriveMakerBalanceWarnings({
        ...state,
        amount,
        availableBalance: tightAvailableBalance,
        tightAvailableBalance,
      }),
    ).toEqual([]);
  });

  it.each([
    ['A1', 'ISSUE', false, false],
    ['A2 Increase', 'AMEND_INCREASE', false, false],
    ['A2 Decrease', 'AMEND_DECREASE', true, true],
    ['A3', 'UTILIZE', true, true],
    ['A3S', 'UTILIZE', true, true],
    ['A4', 'UTILIZE', true, true],
    ['A6', 'CREATE', false, false],
    ['A7', 'PARTIAL_SETTLE', false, false],
    ['A8', 'ISSUE', false, true],
    ['A9', 'FULL_REDEEM', false, false],
    ['A10', 'CLOSE', false, false],
    ['A11', 'REOPEN', false, false],
    ['B1', 'ISSUE', false, false],
    ['B2 Increase', 'AMEND', false, false],
    ['B2 Decrease', 'AMEND', true, true],
    ['B3', 'CREATE', false, true],
    ['B4 Sight', 'HONOUR', true, true],
    ['B4 Usance', 'ACCEPT', true, true],
    ['B5', 'FULL_SETTLE', false, false],
    ['B6', 'CLOSE', false, false],
    ['B7', 'REOPEN', false, false],
  ])('%s does not misreport 500k against 1,100,000', (_functionCode, movementType, checksAgainstPlainAvailable, checksAgainstTightAvailable) => {
    expect(
      deriveMakerBalanceWarnings({
        ...state,
        amount: '500k',
        movementType,
        availableBalance: '1100000',
        tightAvailableBalance: '1100000',
        checksAgainstPlainAvailable,
        checksAgainstTightAvailable,
      }),
    ).toEqual([]);
  });

  it('warns when a normalized shorthand amount really exceeds capacity', () => {
    const warnings = deriveMakerBalanceWarnings({ ...state, amount: '2m', availableBalance: '1100000', tightAvailableBalance: '1100000' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Typed amount (2m) exceeds Available Balance');
  });

  it('leaves invalid shorthand to the Amount validator instead of showing a false Balance warning', () => {
    expect(deriveMakerBalanceWarnings({ ...state, amount: '1t' })).toEqual([]);
    expect(deriveMakerBalanceWarnings({ ...state, amount: 'not-an-amount' })).toEqual([]);
  });

  it('gives the plain Available warning precedence when both ceilings are exceeded', () => {
    const warnings = deriveMakerBalanceWarnings({ ...state, amount: '110' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('exceeds Available Balance');
    expect(warnings[0]).not.toContain('Tight Available');
  });

  it('shows the Tight warning for B3/A8 even when plain Available is also exceeded', () => {
    const warnings = deriveMakerBalanceWarnings({ ...state, amount: '110', movementType: 'CREATE', checksAgainstPlainAvailable: false });
    expect(warnings[0]).toContain('exceeds Tight Available Balance');
  });

  it('describes SG and presentation widening using the selected source', () => {
    expect(
      deriveMakerBalanceWarnings({ ...state, usesDocumentArrivalWithSg: true, arrivalSgOutstanding: '30' })[0],
    ).toContain("selected SG's own Outstanding (30)");
    expect(
      deriveMakerBalanceWarnings({ ...state, movementType: 'HONOUR', referencedPresentationAmount: '25' })[0],
    ).toContain("referenced presentation's own amount (25)");
  });

  it('uses the Present Docs explanation for Export Confirmed LC', () => {
    expect(deriveMakerBalanceWarnings({ ...state, contractInstrumentType: 'EPLC_CONFIRMATION' })[0]).toContain('Present Docs Earmark');
  });
});
