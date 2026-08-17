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
 * BAL-003 (God Component) — the pure, state-derivation half of
 * `TransactionBuilderComponent`'s own getters, extracted 2026-08-17.
 *
 * Every function here is a pure function of the small state slice it is handed: no `this`, no API
 * calls, no component mutation. That is the whole selection criterion — a getter earned a place in
 * this module only if it derives a value; anything that fetches, mutates, or orchestrates stayed on
 * the component (or had already moved to `CheckerActionsService`/`MakerSubmitService`/
 * `LookUpPanelService`/`CatalogPickerService` in this session's own earlier BAL-003 passes).
 *
 * The component's own getters are now one-line delegations to these functions, so every business
 * instruction each rule encodes travels WITH the rule rather than being left behind on a class that
 * no longer contains the logic — the same convention `balance-component.model.ts` already follows for
 * the `IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS` registry itself.
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
  /** Business instruction 2026-08-14 — generic secondary reference (Amendment No./IB Number/…), required on every function except LC Issue (A1/B1). Sent as sourceTransactionRef. */
  secondaryRef?: string;
  /** Design doc §7 Tenor Type Routing (v0.7) — mandatory on Acceptance (A6/B4). */
  tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE';
  tenorDays?: number;
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
 * (EB) — same underlying `ibNumber` field, different real-world label.
 *
 * Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — generalized from
 * checking EPLC_ACCEPTANCE specifically to activeFunctionSide, since B3 (EPLC_EXAMINATION) and B4's
 * own EPLC_DUE_FROM_ISSUING_BANK/EPLC_ACCEPTANCE_REIMB_RECEIVABLE asset creation both need "EB
 * Number" too — every Export instrumentType uses EB terminology, not just EPLC_ACCEPTANCE.
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
 * Business instruction 2026-08-16 ("A1 Currency Code = Input; A2-A9 = Carry from A1 + Protected" /
 * "B1 = Input; B2-B5 = Carry from B1 + Protected") — every function except LC Issue (A1) / Confirm LC
 * (B1) operates on an existing LC/Confirmation, or a record that hangs off one, whose own Currency was
 * already fixed the moment it was first created — never re-typed a second time. Same "carry from
 * whichever contract is currently resolved, protected" shape as the existing Amount/Tenor precedent
 * (buildFields()'s amountLocked/tenorLocked), just unconditional across every function rather than
 * gated to specific ones, since A1/B1 structurally never populate selectedParent/selectedContract at
 * all (they create a brand-new record with no existing target to pick). `selectedParent` is checked
 * first — for a hasParent function (A6/A7/A8/A9/B3/B5) it resolves at Step 1, before any Step-2 child
 * picker/search does, so currency locks in as soon as the LC/Confirmation itself is picked.
 */
export function carriedCurrency(selectedParent: BalanceContract | null, selectedContract: BalanceContract | null): string | null {
  return selectedParent?.currency ?? selectedContract?.currency ?? null;
}

/** Business instruction 2026-08-14 — LC+IB / LC+SG two-field search replaces the flat Catalog dropdown for these instrumentTypes. */
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
 * Business instruction 2026-08-15 ("Look Up Current Balance should use the existing LC Number on
 * Screen... instead of keyin") — whatever LC Number is currently resolved for THIS function, from
 * whichever picker shape it came from (freely typed A1/B1, Parent picker A6/A8, flat Catalog
 * A2-A5/A3S, or the LC+IB/SG two-field search A7/A9/B5). Feeds both the Checker queue and
 * runLookup()'s auto-fill.
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

/** Business instruction 2026-08-14 ("A6 => ...", "A7 should filter out LC records Tenor = Sight") — shared by loadParentPage()'s server-side filter and filteredParentCatalog()'s client-side one. */
export function parentTenorFamily(selectedFunction: TransactionFunction | null): 'SIGHT' | 'USANCE' | undefined {
  if (selectedFunction?.tenorTypeOptions?.length) return 'USANCE';
  if (selectedFunction?.catalogTenorFilter === 'USANCE') return 'USANCE';
  return undefined;
}
