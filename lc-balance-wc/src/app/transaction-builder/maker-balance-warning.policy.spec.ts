import { MakerBalanceWarningState, deriveMakerBalanceWarnings } from './maker-balance-warning.policy';

const state: MakerBalanceWarningState = {
  formLocked: false,
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
