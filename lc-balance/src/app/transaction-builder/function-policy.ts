import { BalanceContract } from './balance-component-api.service';
import {
  CREATING_MOVEMENT_TYPES,
  HAS_PARENT,
  InstrumentType,
  NATURAL_KEY_FIELDS_BY_INSTRUMENT,
  PARENT_INSTRUMENT_OPTIONS,
  TransactionFunction,
  isToleranceApplicable,
} from './balance-component.model';

/**
 * The pure, state-derivation half of `TransactionBuilderComponent`'s own getters. Every function here
 * is a pure function of the small state slice it is handed: no `this`, no API calls, no component
 * mutation — anything that fetches, mutates, or orchestrates stays on the component or an extracted
 * service. The component's own getters are one-line delegations to these functions.
 */

/** The Transaction Builder's own Formly model. Moved here (from the component file, where it was a non-exported local interface) so the pure rule modules that read it needn't import from the component. */
export interface BuilderModel {
  instrumentType?: InstrumentType;
  movementType?: string;
  amount?: string;
  currency?: string;
  tolerancePct?: string;
  eventSeq?: number;
  createdBy?: string;
  /** Generic secondary reference (Amendment No./IB Number/…), required on every function except LC Issue (A1/B1). Sent as sourceTransactionRef. */
  secondaryRef?: string;
  /** Design doc §7 Tenor Type Routing (v0.7) — mandatory on Acceptance (A6/B4). */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE';
  tenorDays?: number;
  /** A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1 — A1/B1 root ISSUE only. Required (400 server-side if missing). */
  expiryDate?: string;
  /** §1 — A1/B1 root ISSUE only. Optional; server defaults to today's Business Date when omitted. */
  issueDate?: string;
  /** §2/§3 — A3/A3S (Import) and B3 (Export) only. */
  documentPresentationDate?: string;
  /** UI-only reference field (2026-08-23) — the parent LC/Confirmation's own Expiry Date, shown read-only on A6/B4-Usance while Maturity Date entry is still gated on Maturity-Date-Business-Day-Convention-Decision-Request.md. Never submitted — buildSubmitRequest() never reads this key. */
  parentExpiryDateReference?: string;
  /** UI-only reference field (2026-08-23) — the picked LC/Confirmation's own CURRENT Expiry Date, shown read-only on A2/B2 Extend Expiry (the same record being amended, no parent involved). Never submitted — buildSubmitRequest() never reads this key. */
  originalExpiryDateReference?: string;
  /**
   * A6/B4 Calculated Maturity Date (2026-08-23) — A1/B1's own single "Calendar Profile" dropdown pick
   * (see MATURITY_DATE_CALENDAR_PROFILES), and A2/B2's own AMEND_MATURITY_CALENDARS pick. UI-only key —
   * `buildSubmitRequest()` expands the selected profile's `value` into the real
   * `maturityDateCalendars`/`maturityDateCombinationRule`/`maturityDateConvention` fields at Submit time,
   * this raw string is never itself sent over the wire.
   */
  maturityDateProfile?: string;
  /** UI-only reference field (2026-08-23) — read-only display of the underlying LC/Confirmation's own currently-configured calendars (A3/A3S/B3, "供 Maker 參考，跟 A6/B4 最終會用到的一致"). Never submitted. */
  maturityDateCalendarsReference?: string;
}

/** The three natural-key components a Maker can type or have carried in — shared shape of `naturalKey` and `searchNaturalKey`. */
export interface NaturalKeyFields {
  lcNumber: string;
  ibNumber: string;
  sgNumber: string;
}

/** Everything `contextLcNumber()`/`contextSecondaryRef()` need to resolve "whichever LC/IB/SG Number is currently in play for THIS function", from whichever of the four picker shapes it came from. */
export interface ContextRefState {
  model: BuilderModel;
  naturalKey: NaturalKeyFields;
  searchNaturalKey: NaturalKeyFields;
  selectedParent: BalanceContract | null;
  selectedContract: BalanceContract | null;
  selectedFunction: TransactionFunction | null;
}

export function isCreatingMovement(model: BuilderModel): boolean {
  return !!model.movementType && CREATING_MOVEMENT_TYPES.has(model.movementType);
}

export function requiredNaturalKeyFields(model: BuilderModel): ('ibNumber' | 'sgNumber')[] {
  return model.instrumentType ? NATURAL_KEY_FIELDS_BY_INSTRUMENT[model.instrumentType] : [];
}

/**
 * IPLC_ACCEPTANCE uses Import Bill terminology (IB); EPLC_ACCEPTANCE uses Export Bill terminology
 * (EB) — same underlying `ibNumber` field, different real-world label. Keyed off activeFunctionSide
 * rather than EPLC_ACCEPTANCE specifically, since every Export instrumentType uses EB terminology.
 */
export function ibNumberLabel(activeFunctionSide: 'IMPORT' | 'EXPORT'): string {
  return activeFunctionSide === 'EXPORT' ? 'EB Number' : 'IB Number';
}

export function hasParent(model: BuilderModel): boolean {
  return !!model.instrumentType && HAS_PARENT.has(model.instrumentType);
}

export function parentOptions(model: BuilderModel): InstrumentType[] {
  return model.instrumentType ? PARENT_INSTRUMENT_OPTIONS[model.instrumentType] : [];
}

/**
 * Every function except A1/B1 operates on an existing LC/Confirmation whose Currency is already fixed —
 * carried and protected, never re-typed. `selectedParent` is checked first — for a hasParent function it
 * resolves at Step 1, before any Step-2 picker/search, so currency locks in as soon as the
 * LC/Confirmation itself is picked.
 */
export function carriedCurrency(selectedParent: BalanceContract | null, selectedContract: BalanceContract | null): string | null {
  return selectedParent?.currency ?? selectedContract?.currency ?? null;
}

/** LC+IB / LC+SG two-field search replaces the flat Catalog dropdown for these instrumentTypes. */
export function usesTwoFieldSearch(model: BuilderModel): boolean {
  return !isCreatingMovement(model) && requiredNaturalKeyFields(model).length > 0;
}

export function toleranceApplicable(model: BuilderModel): boolean {
  return !!model.instrumentType && !!model.movementType && isToleranceApplicable(model.instrumentType, model.movementType);
}

/** True once the function is fully resolved (no pending subChoice) and ready to show the rest of the form. */
export function isReady(selectedFunction: TransactionFunction | null, model: BuilderModel): boolean {
  return !!selectedFunction && !!model.instrumentType && !!model.movementType;
}

/** True when the natural key's LC Number is sourced from the Parent picker (A6/B4/A8) rather than freely typed (A1/B1). */
export function lcNumberFromParent(model: BuilderModel): boolean {
  return isCreatingMovement(model) && hasParent(model);
}

/**
 * Whatever LC Number is currently resolved for THIS function, from whichever picker shape it came from
 * (freely typed A1/B1, Parent picker A6/A8, flat Catalog A2-A5/A3S, or the LC+IB/SG two-field search
 * A7/A9/B5). Feeds both the Checker queue and runLookup()'s auto-fill.
 */
export function contextLcNumber(s: ContextRefState): string | null {
  if (lcNumberFromParent(s.model)) return s.selectedParent?.naturalKey.lcNumber ?? null;
  if (isCreatingMovement(s.model)) return s.naturalKey.lcNumber || null;
  if (usesTwoFieldSearch(s.model)) return s.selectedContract?.naturalKey.lcNumber ?? (s.searchNaturalKey.lcNumber || null);
  return s.selectedContract?.naturalKey.lcNumber ?? null;
}

/**
 * Same idea as contextLcNumber, for the SG/IB Number half of a two-field natural key
 * (SHGT/Acceptance) — the LC Number is never sourced from the Parent picker for this half, even on
 * A6/A8, since SG/IB Number is always freely typed by the Maker. Feeds syncCheckerToContext().
 */
export function contextSecondaryRef(s: ContextRefState): string | null {
  const field = checkerSecondaryField(s.selectedFunction);
  if (!field) return null;
  if (isCreatingMovement(s.model)) return s.naturalKey[field] || null;
  if (usesTwoFieldSearch(s.model)) return s.selectedContract?.naturalKey[field] ?? (s.searchNaturalKey[field] || null);
  return s.selectedContract?.naturalKey[field] ?? null;
}

/**
 * Which second natural-key field (if any) the Checker's own search needs, for THIS function's own
 * instrumentType (selectedFunction.instrumentType — available immediately, unlike
 * model.instrumentType, which stays unset until a subChoice resolves).
 */
export function checkerSecondaryField(selectedFunction: TransactionFunction | null): 'ibNumber' | 'sgNumber' | null {
  return selectedFunction?.instrumentType ? (NATURAL_KEY_FIELDS_BY_INSTRUMENT[selectedFunction.instrumentType][0] ?? null) : null;
}

export function checkerSecondaryLabel(selectedFunction: TransactionFunction | null): string {
  return checkerSecondaryField(selectedFunction) === 'ibNumber'
    ? selectedFunction?.instrumentType === 'EPLC_ACCEPTANCE'
      ? 'EB Number'
      : 'IB Number'
    : 'SG Number';
}

/** Shared by the parent picker's server-side filter and filteredParentCatalog()'s client-side one. */
export function parentTenorFamily(selectedFunction: TransactionFunction | null): 'SIGHT' | 'USANCE' | undefined {
  if (selectedFunction?.tenorTypeOptions?.length) return 'USANCE';
  if (selectedFunction?.catalogTenorFilter === 'USANCE') return 'USANCE';
  return undefined;
}
