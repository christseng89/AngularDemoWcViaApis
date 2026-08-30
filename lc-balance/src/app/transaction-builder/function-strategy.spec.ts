import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import { FUNCTION_STRATEGIES, deriveFunctionStrategy, functionSupportsFixPending, resolveFunctionForMovement, payExistingUtilizeFunctionFor } from './function-strategy';

/**
 * Equivalence proof for `FUNCTION_STRATEGIES` — a derived projection over the registry, not a second
 * source of truth.
 */
describe('PR-2 — FunctionStrategy is a faithful projection of the current registry (not yet consumed by production code)', () => {
  it('uses the closed default strategy for an unregistered extension code', () => {
    const strategy = deriveFunctionStrategy({ code: 'X1' } as any);
    expect(strategy).toMatchObject({ code: 'X1', fixPendingEnabled: false, fixPendingMode: null });
    expect(strategy.compoundSubmission.possibleShapes).toEqual(['plain']);
  });
  it('every one of the 18 registered function codes has exactly one FunctionStrategy entry', () => {
    const allCodes = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((f) => f.code);
    expect(allCodes).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
    expect(Object.keys(FUNCTION_STRATEGIES).sort()).toEqual([...allCodes].sort());
  });

  it('enables same-session Maker Result Delete Pending for A1 and A3 only', () => {
    const enabled = Object.values(FUNCTION_STRATEGIES)
      .filter((strategy) => strategy.makerResultDeletePendingEnabled)
      .map((strategy) => strategy.code);
    expect(enabled).toEqual(['A1', 'A3']);
  });

  describe('movementDerivation — matches PR-1\'s autoRedeemType/settlesAcceptanceOnMature/movementTypeFromContractTenor characterization', () => {
    it('A9 (autoRedeemType) -> REDEEM, no other function derives REDEEM', () => {
      expect(FUNCTION_STRATEGIES['A9'].movementDerivation.amountVsAvailableDerivation).toBe('REDEEM');
      const redeemCodes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === 'REDEEM');
      expect(redeemCodes.map((s) => s.code)).toEqual(['A9']);
    });

    it('B5 (settlesAcceptanceOnMature) -> SETTLE, no other function derives SETTLE', () => {
      expect(FUNCTION_STRATEGIES['B5'].movementDerivation.amountVsAvailableDerivation).toBe('SETTLE');
      const settleCodes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === 'SETTLE');
      expect(settleCodes.map((s) => s.code)).toEqual(['B5']);
    });

    it('every other function derives neither (null) — A10/B6/A11/B7 included: amountAutoFilledFrom/amountFixed are genuinely different dimensions, see those fields\' own doc comments', () => {
      const neither = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === null);
      expect(neither.map((s) => s.code).sort()).toEqual(
        ['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A10', 'A11', 'B1', 'B2', 'B3', 'B4', 'B6', 'B7'].sort(),
      );
    });

    it('A10/B6 (amountAutoFilledFrom) -> confirmedBalance, no other function derives it', () => {
      expect(FUNCTION_STRATEGIES['A10'].movementDerivation.amountAutoFilledFrom).toBe('confirmedBalance');
      expect(FUNCTION_STRATEGIES['B6'].movementDerivation.amountAutoFilledFrom).toBe('confirmedBalance');
      const autoFilled = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountAutoFilledFrom !== null);
      expect(autoFilled.map((s) => s.code).sort()).toEqual(['A10', 'B6']);
    });

    it('A11/B7 (Reopen, F1) -> amountFixed \'0\', no other function derives it — genuinely different from A10/B6\'s own amountAutoFilledFrom above (a fixed literal, never carried from a live balance)', () => {
      expect(FUNCTION_STRATEGIES['A11'].movementDerivation.amountFixed).toBe('0');
      expect(FUNCTION_STRATEGIES['B7'].movementDerivation.amountFixed).toBe('0');
      const fixed = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountFixed !== null);
      expect(fixed.map((s) => s.code).sort()).toEqual(['A11', 'B7']);
    });

    it('B4 (movementTypeFromContractTenor) is the ONLY function reading movementType from the contract\'s own tenor', () => {
      const tenorDerived = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.derivesMovementTypeFromTenor);
      expect(tenorDerived.map((s) => s.code)).toEqual(['B4']);
    });
  });

  describe('compoundSubmission — matches PR-1\'s MakerSubmitService dispatch-table characterization', () => {
    it('A3S (documentArrivalWithSg) -> possibleShapes includes documentArrivalWithSg, only A3S does', () => {
      expect(FUNCTION_STRATEGIES['A3S'].compoundSubmission.possibleShapes).toEqual(['documentArrivalWithSg']);
      const withShape = Object.values(FUNCTION_STRATEGIES).filter((s) => s.compoundSubmission.possibleShapes.includes('documentArrivalWithSg'));
      expect(withShape.map((s) => s.code)).toEqual(['A3S']);
    });

    it('B4 is the ONLY function with two possible shapes — Honour and Accept, chosen at runtime by movementType, never fixed', () => {
      expect(FUNCTION_STRATEGIES['B4'].compoundSubmission.possibleShapes).toEqual(['confirmationHonourWithReceivable', 'confirmationAcceptWithReceivable']);
      const twoShapes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.compoundSubmission.possibleShapes.length > 1);
      expect(twoShapes.map((s) => s.code)).toEqual(['B4']);
    });

    it('B5 (settlesAcceptanceOnMature) -> acceptanceSettleWithReceivable, only B5', () => {
      expect(FUNCTION_STRATEGIES['B5'].compoundSubmission.possibleShapes).toEqual(['acceptanceSettleWithReceivable']);
    });

    it('every function without a compound flag falls back to plain (matches "no matching flag -> submitPlain" in PR-1)', () => {
      const plainCodes = Object.values(FUNCTION_STRATEGIES)
        .filter((s) => s.compoundSubmission.possibleShapes.length === 1 && s.compoundSubmission.possibleShapes[0] === 'plain')
        .map((s) => s.code)
        .sort();
      expect(plainCodes).toEqual(['A1', 'A2', 'A3', 'A4', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'B1', 'B2', 'B3', 'B6', 'B7'].sort());
    });
  });

  describe('checkerRelease — matches PR-1\'s CheckerActionsService A6-vs-B4 asymmetry characterization', () => {
    it('A4 (payExistingUtilize) -> releasesExistingMovementInPlace, only A4', () => {
      const inPlace = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.releasesExistingMovementInPlace);
      expect(inPlace.map((s) => s.code)).toEqual(['A4']);
    });

    it('A6 and B4 (settlesDocumentArrival) -> exactly these two', () => {
      const settles = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.settlesDocumentArrival);
      expect(settles.map((s) => s.code)).toEqual(['A6', 'B4']);
    });

    it('the A6-vs-B4 asymmetry itself: only B4 has sourceAlreadyReleasedBeforePick true — this is the exact fact that makes A6 release its source first while B4 does not', () => {
      expect(FUNCTION_STRATEGIES['A6'].checkerRelease.sourceAlreadyReleasedBeforePick).toBe(false);
      expect(FUNCTION_STRATEGIES['B4'].checkerRelease.sourceAlreadyReleasedBeforePick).toBe(true);
    });

    it('A3 and A3S (deferSettlement) -> exactly these two (B3 lost this flag in the 2026-08-18 redesign, per PR-1)', () => {
      const defer = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.deferSettlement);
      expect(defer.map((s) => s.code)).toEqual(['A3', 'A3S']);
    });
  });

  describe('selectionFlow', () => {
    it('B5 (settleableBalanceIndex) -> usesSettleableBalanceIndex, only B5', () => {
      const uses = Object.values(FUNCTION_STRATEGIES).filter((s) => s.selectionFlow.usesSettleableBalanceIndex);
      expect(uses.map((s) => s.code)).toEqual(['B5']);
    });
  });

  it('deriveFunctionStrategy is a pure function — calling it twice on the same registry entry yields deep-equal, independent objects', () => {
    const b4 = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === 'B4')!;
    const first = deriveFunctionStrategy(b4);
    const second = deriveFunctionStrategy(b4);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});

/** Mirrors `resolveFunctionForMovement()`/`payExistingUtilizeFunctionFor()` in `function-strategy.ts` — see that file's own doc comment. */
describe('resolveFunctionForMovement', () => {
  it('resolves a literal fn.movementType match (A1 — IPLC_LC/ISSUE)', () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'ISSUE')?.code).toBe('A1');
  });

  it('resolves via subChoice.options (A2 — IPLC_LC/AMEND_INCREASE and AMEND_DECREASE, both from the same A2 subChoice)', () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_INCREASE')?.code).toBe('A2');
    expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_DECREASE')?.code).toBe('A2');
  });

  it('resolves via derivesMovementTypeFromTenor for BOTH derived movementTypes (B4 — EPLC_CONFIRMATION/HONOUR and ACCEPT)', () => {
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'HONOUR')?.code).toBe('B4');
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'ACCEPT')?.code).toBe('B4');
  });

  it('bug fixed 2026-08-21 (user-reported, U03\'s own CLOSE event displayed as "B4 Honour/Acceptance" in Look Up/Inquire Events): derivesMovementTypeFromTenor must NOT swallow every other EPLC_CONFIRMATION movementType into B4 — ISSUE/AMEND/CLOSE each resolve to their OWN function, not B4', () => {
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'ISSUE')?.code).toBe('B1');
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'AMEND')?.code).toBe('B2');
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'CLOSE')?.code).toBe('B6');
  });

  it("resolves the derived PARTIAL_REDEEM via amountVsAvailableDerivation 'REDEEM' (A9), not only the registry's own literal FULL_REDEEM default", () => {
    expect(resolveFunctionForMovement('SHGT', 'FULL_REDEEM')?.code).toBe('A9');
    expect(resolveFunctionForMovement('SHGT', 'PARTIAL_REDEEM')?.code).toBe('A9');
  });

  it("resolves the derived PARTIAL_SETTLE via amountVsAvailableDerivation 'SETTLE' (B5), not only the registry's own literal FULL_SETTLE default", () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'FULL_SETTLE')?.code).toBe('B5');
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'PARTIAL_SETTLE')?.code).toBe('B5');
  });

  it('returns undefined for a movementType/instrumentType combination no current function produces', () => {
    expect(resolveFunctionForMovement('EPLC_EXAMINATION', 'AMEND')).toBeUndefined();
  });

  // B4's Usance compound leg (EPLC_ACCEPTANCE/CREATE) has no direct registry match — B4's own entry is
  // instrumentType EPLC_CONFIRMATION (unlike A6, whose entry IS IPLC_ACCEPTANCE/CREATE).
  it("resolves EPLC_ACCEPTANCE/CREATE (B4's own Usance Acceptance-liability compound leg) to B4, via compoundSubmission.possibleShapes including confirmationAcceptWithReceivable, not a direct instrumentType match", () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'CREATE')?.code).toBe('B4');
  });

  it('the fallback above is scoped to EPLC_ACCEPTANCE/CREATE only — a different movementType on the same instrumentType still resolves normally (B5) rather than also falling back to B4', () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE', 'FULL_SETTLE')?.code).toBe('B5');
  });

  // Bug fixed 2026-08-28 (reviewer-reported live in Maker Queue — "只是一筆EVENT 為何出現2 筆" / a bare
  // "—" Function on a real PENDING row): a single B4 Submit creates a THIRD-instrumentType asset-side
  // secondary leg beyond EPLC_ACCEPTANCE/CREATE above, in the SAME businessEventId — EPLC_ACCEPTANCE_
  // REIMB_RECEIVABLE/CREATE (Usance shape) or EPLC_DUE_FROM_ISSUING_BANK/CREATE (Sight shape) — neither
  // had a fallback registered, so Maker Queue's own functionFor() rendered a bare "—" for that row.
  it("resolves EPLC_ACCEPTANCE_REIMB_RECEIVABLE/CREATE (B4's own Usance Reimbursement Receivable compound leg) to B4, via compoundSubmission.possibleShapes including confirmationAcceptWithReceivable", () => {
    expect(resolveFunctionForMovement('EPLC_ACCEPTANCE_REIMB_RECEIVABLE', 'CREATE')?.code).toBe('B4');
  });

  it("resolves EPLC_DUE_FROM_ISSUING_BANK/CREATE (B4's own Sight Due-from-Issuing-Bank compound leg) to B4, via compoundSubmission.possibleShapes including confirmationHonourWithReceivable", () => {
    expect(resolveFunctionForMovement('EPLC_DUE_FROM_ISSUING_BANK', 'CREATE')?.code).toBe('B4');
  });

  it("known limitation, explicitly accepted (see the function's own doc comment): IPLC_LC/UTILIZE is produced by BOTH A3 and A3S (both literal movementType: 'UTILIZE') — the resolver deterministically returns the first registry match, A3, since it's declared first", () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'UTILIZE')?.code).toBe('A3');
  });

  it("F1: resolves AMEND_EXPIRY_DATE on IPLC_LC to A2 via its subChoice option's own literal value (no movementTypeOverride needed — A2's subChoice key is already 'movementType')", () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'AMEND_EXPIRY_DATE')?.code).toBe('A2');
  });

  it("F1 regression: resolves AMEND_EXPIRY_DATE on EPLC_CONFIRMATION to B2 via its subChoice option's movementTypeOverride, NOT the option's own 'EXPIRY_DATE' value — without checking movementTypeOverride in movementTypeMatchesFunction(), this would return undefined (and B2's own Checker Queue would never surface a PENDING AMEND_EXPIRY_DATE movement it had itself Maker-Submitted)", () => {
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'AMEND_EXPIRY_DATE')?.code).toBe('B2');
  });

  it('F1: resolves REOPEN to A11 (IPLC_LC) and B7 (EPLC_CONFIRMATION), each via a literal fn.movementType match', () => {
    expect(resolveFunctionForMovement('IPLC_LC', 'REOPEN')?.code).toBe('A11');
    expect(resolveFunctionForMovement('EPLC_CONFIRMATION', 'REOPEN')?.code).toBe('B7');
  });
});

// InquireEventsService uses this instead of resolveFunctionForMovement() for the LATER (Release) half
// of a finalized Sight Document Arrival, since the generic resolver always returns A3 for that pair.
describe('payExistingUtilizeFunctionFor', () => {
  it('resolves IPLC_LC + Sight to A4 — the one function in the registry with releasesExistingMovementInPlace set', () => {
    expect(payExistingUtilizeFunctionFor('IPLC_LC', 'SIGHT')?.code).toBe('A4');
  });

  // Business-confirmed 2026-08-27 ("A6 必須... 承接並正式轉換 A3/A3S 的 EARMARKED exposure") — A6 finalizes
  // the SAME referenced UTILIZE for Usance, via its own release() cascade rather than a direct in-place
  // release; settlesDocumentArrival && !sourceAlreadyReleasedBeforePick picks out A6 specifically (B4
  // also sets settlesDocumentArrival, but its own referenced B3 is already released before pick).
  it('resolves IPLC_LC + either Usance tenor to A6', () => {
    expect(payExistingUtilizeFunctionFor('IPLC_LC', 'SELLERS_USANCE')?.code).toBe('A6');
    expect(payExistingUtilizeFunctionFor('IPLC_LC', 'BUYERS_USANCE')?.code).toBe('A6');
  });

  it('returns undefined when tenorType is omitted/null — a legacy null-tenorType contract has no finalizing Function at all', () => {
    expect(payExistingUtilizeFunctionFor('IPLC_LC')).toBeUndefined();
    expect(payExistingUtilizeFunctionFor('IPLC_LC', null)).toBeUndefined();
  });

  it('returns undefined for any instrumentType with no matching function of its own (e.g. SHGT, EPLC_CONFIRMATION — no Export equivalent exists)', () => {
    expect(payExistingUtilizeFunctionFor('SHGT', 'SIGHT')).toBeUndefined();
    expect(payExistingUtilizeFunctionFor('EPLC_CONFIRMATION', 'SIGHT')).toBeUndefined();
  });
});

// Fix Pending trial (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
// 2026-08-27; shared-derivation redesign 2026-08-28, "頁面配置檔原先輸入或FIX PENDING可共用") —
// `fixPendingEnabled` is now the ONLY Fix-Pending-specific fact this registry declares (the trial-scope
// opt-in gate); WHICH fields are genuinely editable once entered is derived elsewhere
// (builder-fields.ts's own deriveFixPendingLockFlags()/isFixPendingFieldEditable(), covered by that
// file's own spec) from the same lock flags a fresh Submit already computes, not declared here.
describe('FunctionStrategy.fixPendingEnabled / functionSupportsFixPending', () => {
  // Widened 2026-08-28 ("把這A1 A3 修改要求放置B1 A2試試看") from the original A1/A3-only trial —
  // A2 (non-creating, same isCreatingMovement(model)-derived field shape as A3) and B1 (creating, same
  // shape as A1) needed zero change to deriveFixPendingLockFlags() itself, only this registry flag.
  // Widened again the SAME day ("使用同樣方式處理A3 A35 A4 & B2") — B2 (same shape as A2) and A3S (Phase
  // 4, the one compound shape scoped/implemented — see BalanceService.applyArrivalWithSgCompoundEdit()
  // and MakerQueueService.fixPendingSupported()'s own doc comments); A4 stays deliberately excluded
  // (structurally has no movement of its own to edit — flipping this flag for it would be a no-op).
  // Widened again ("更正: A8 A9 A10 A11 B6 B7 加上FIX PENDING功能") — A8 (plain creating ISSUE, same
  // shape as A1/B1), A10/A11/B6/B7 (Amount fully locked, but Reason Code — F1 §13.1 mandatory for
  // Close/Reopen — is the genuinely editable target). A9 deliberately excluded (user-confirmed via
  // AskUserQuestion) — every field on its own screen is already locked at fresh Submit.
  // Widened once more same day ("Use the same method for B3 with Fix Pending") — B3 (plain creating
  // CREATE, same shape as A8, its own Export counterpart, simply not included in the original batch).
  it('supports Fix Pending for every registered function; locked functions use Remarks-only mode', () => {
    const supported = Object.values(FUNCTION_STRATEGIES)
      .filter((s) => functionSupportsFixPending(s))
      .map((s) => s.code)
      .sort();
    expect(supported).toEqual(['A1', 'A10', 'A11', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
    for (const code of ['A4', 'A6', 'A7', 'A9', 'B4', 'B5']) expect(FUNCTION_STRATEGIES[code].fixPendingMode).toBe('REMARKS_ONLY');
    expect(FUNCTION_STRATEGIES['A1'].fixPendingMode).toBe('STANDARD');
  });

  it('functionSupportsFixPending is false for null/undefined (no Function selected)', () => {
    expect(functionSupportsFixPending(null)).toBe(false);
    expect(functionSupportsFixPending(undefined)).toBe(false);
  });

  it('deriveFunctionStrategy() carries fixPendingEnabled through into a fresh object, not just the registry literal', () => {
    const a1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1')!;
    const a4 = IMPORT_FUNCTIONS.find((f) => f.code === 'A4')!;
    expect(functionSupportsFixPending(deriveFunctionStrategy(a1))).toBe(true);
    expect(functionSupportsFixPending(deriveFunctionStrategy(a4))).toBe(true);
  });
});
