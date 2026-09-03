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
  toleranceChangePct?: string;
  eventSeq?: number;
  createdBy?: string;
  /** Generic secondary reference (Amendment No./IB Number/…), required on every function except LC Issue (A1/B1). Sent as sourceTransactionRef. */
  secondaryRef?: string;
  /** Design doc §7 Tenor Type Routing (v0.7) — mandatory on Acceptance (A6/B4). */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE';
  tenorDays?: number;
  /** F1 (external BA review, v1.19.0) — A1/B1 (ISSUE) only, optional. UCP 600 Art.6(d) expiry/validity date. */
  expiryDate?: string;
  /** F1 — A2/B2's third subChoice option (AMEND_EXPIRY_DATE) only. */
  newExpiryDate?: string;
  /** F1 proposal §13.1 item 4/3(a) (BA-ratified 2026-08-25) — A10/B6 (Close) and A11/B7 (Reopen) only, mandatory. */
  reasonCode?: string;
  /** Optional operational note. A9 exposes this as its sole Remarks-only Fix Pending field. */
  remarks?: string;
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
 * (freely typed A1/B1, Parent picker A6/A8, flat Catalog A2/A3/A3S/A4, or the LC+IB/SG two-field search
 * A7/A9/B5). Feeds both the Checker queue and runLookup()'s auto-fill.
 *
 * `lcNumberFromParent` (A6/A8/B3) falls back to `s.naturalKey.lcNumber` when `selectedParent` is null —
 * bug found live 2026-08-28 ("Maker Queue -> Fix Pending... LC Number —"): Fix Pending's own screen
 * reconstruction never re-resolves `selectedParent` (no Parent LC picker interaction happens during
 * review), only `naturalKey.lcNumber` itself — but that field is ALREADY kept in sync with
 * `selectedParent.naturalKey.lcNumber` during a normal live flow too (`onSelectParent()`'s own
 * `this.naturalKey.lcNumber = this.selectedParent.naturalKey.lcNumber` assignment, unconditional for
 * every creating function), so this fallback is a genuine no-op outside Fix Pending, not a new source of
 * truth — it just also works during Fix Pending's own reconstructed-model-only state.
 */
export function contextLcNumber(s: ContextRefState): string | null {
  if (lcNumberFromParent(s.model)) return s.selectedParent?.naturalKey.lcNumber ?? (s.naturalKey.lcNumber || null);
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
 * Whatever Tenor Type is currently resolved for THIS function's own target contract, from whichever
 * picker shape supplied it — 2026-08-28, "A2 - A11, B2 - B7 display the Tenor Type as protected field".
 * `selectedContract` (the specific SG/Acceptance/etc. record, once Step 2 resolves) is checked first —
 * SHGT contracts carry no `tenorType` of their own (Tenor doesn't apply to Shipping Guarantees), so the
 * `??` fallback to `selectedParent` (the LC itself) picks up the right value for A9 automatically, same
 * reasoning `carriedCurrency`'s own fallback order already uses. A1/B1 (still typing/choosing it) and A6
 * (its own dedicated `tenorTypeOptions`-driven Formly field, already "carried from the parent LC,
 * protected") are excluded by the TEMPLATE's own gate, not by this function — both would resolve a real
 * value here too if called, this is simply the wrong display mechanism for their own shape.
 */
export function contextTenorType(s: ContextRefState): string | null {
  return s.selectedContract?.tenorType ?? s.selectedParent?.tenorType ?? null;
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
