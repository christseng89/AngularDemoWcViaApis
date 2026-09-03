import { parseAmountShorthand } from './amount-shorthand';

export interface MakerBalanceWarningState {
  formLocked: boolean;
  amountProtected: boolean;
  amount: string | number | null | undefined;
  movementType: string | null | undefined;
  availableBalance: string | number;
  tightAvailableBalance: string | number | null;
  checksAgainstPlainAvailable: boolean;
  checksAgainstTightAvailable: boolean;
  contractInstrumentType: string | null | undefined;
  offBalanceExposure: string | number | null | undefined;
  usesDocumentArrivalWithSg: boolean;
  arrivalSgOutstanding: string | number | null;
  referencedPresentationAmount: string | number | null;
}

/** Produces mutually exclusive pre-submit capacity warnings from already-derived Maker state. */
export function deriveMakerBalanceWarnings(state: MakerBalanceWarningState): string[] {
  // These are input-time warnings. A protected amount is carried or system-derived, so calling it a
  // "Typed amount" and comparing it again with the current Available Balance is both misleading and,
  // for A4, wrong: the selected Document Arrival already owns the earmark being settled.
  if (state.formLocked || state.amountProtected || state.amount === null || state.amount === undefined || state.amount === '') return [];

  // The live warning must interpret Amount exactly like the shared A1-style input and Submit path.
  // Number('500k') is NaN, which made the old `amount <= Tight Available` guard false and displayed a
  // bogus over-capacity warning while the user was still typing valid h/k/m shorthand. Invalid syntax
  // belongs to the Amount field validator, not the independent capacity-warning channel.
  const parsedAmount = parseAmountShorthand(state.amount);
  if (!parsedAmount.ok) return [];
  const amount = Number(parsedAmount.value);
  const available = Number(state.availableBalance);
  if (state.checksAgainstPlainAvailable && amount > available) {
    return [`⚠ Typed amount (${state.amount}) exceeds Available Balance — this will be rejected (Design doc §6).`];
  }

  if (
    !state.checksAgainstTightAvailable ||
    state.tightAvailableBalance === null ||
    (state.checksAgainstPlainAvailable && amount > available) ||
    amount <= Number(state.tightAvailableBalance)
  ) {
    return [];
  }

  const capacitySource =
    state.contractInstrumentType === 'EPLC_CONFIRMATION'
      ? 'Present Docs Earmark'
      : `off-balance-sheet (SHGT) exposure ${state.offBalanceExposure ?? '—'}`;
  let netting = '';
  if (state.usesDocumentArrivalWithSg && state.arrivalSgOutstanding !== null) {
    netting = `, netted against the selected SG's own Outstanding (${state.arrivalSgOutstanding})`;
  } else if ((state.movementType === 'HONOUR' || state.movementType === 'ACCEPT') && state.referencedPresentationAmount !== null) {
    netting = `, netted against the referenced presentation's own amount (${state.referencedPresentationAmount})`;
  }
  const suggestion =
    state.movementType === 'UTILIZE' && !state.usesDocumentArrivalWithSg
      ? ` If this Document Arrival is meant to consume a specific outstanding Shipping Guarantee's reserved capacity, use "Document Arrival w/ Shipping Gtee" instead — it nets that SG's own exposure out of this check.`
      : '';

  return [
    `⚠ Typed amount (${state.amount}) exceeds Tight Available Balance (${state.tightAvailableBalance}) — this will be rejected (Design doc §6.1/§6.2: Confirmed Balance minus still-PENDING decreases minus outstanding ${capacitySource}${netting} — only APPROVED amounts count as usable capacity).${suggestion}`,
  ];
}
