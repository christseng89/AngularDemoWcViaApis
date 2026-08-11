/**
 * Orchestrates the Confirm flow (FSD §5.4 / Payment_Component_Calculation_Validation.docx
 * §3-§7) for POST /payment-instructions in the exact order the source
 * ConfirmBusinessCall-equivalents run it, plus the idempotency check that
 * precedes all steps (FSD §6.1), and — added v1.4.0, NOT part of the legacy
 * trace — suspenseBridge expansion, which runs before step 1 so the balance
 * check already sees the bridge's legs (see domain/suspenseBridge.ts).
 *
 * v1.6.0 architecture decision, NOT legacy-traced: the §6.2 Charge Voucher
 * and §6.3 Liability Voucher streams (chargeContext/liabilityContext) were
 * removed from this service entirely. A Balance Component or Charge
 * Component that participates via suspenseBridge books ITS OWN leg on its
 * own books — e.g. Balance Component: "Dr IBL / Cr Suspense"; this service
 * then only books its own offsetting leg — e.g. "Dr Suspense / Cr Nostro".
 * Every leg this service posts is therefore an ordinary Settlement leg
 * (§6.1) — SuspenseEntry.sourceComponent (types.ts) is pure provenance/audit
 * metadata, never a trigger for Charge/Liability Account Entry generation,
 * because this service no longer generates those at all. (v1.5.0 had
 * instead kept chargeContext/liabilityContext alongside a
 * SUSPENSE_CONTEXT_CONFLICT guard rail preventing the two from coexisting;
 * v1.6.0 removed the legacy path outright rather than keep guarding against
 * a combination that no longer needs to exist.)
 */
import Decimal from 'decimal.js';
import { randomUUID, createHash } from 'crypto';
import type { PaymentInstruction } from '../types';
import type { ValidatedConfirmRequest } from '../validation/requestSchema';
import { validateDrCrBalance } from './balanceValidation';
import { classify } from './classification';
import { enrichLegs, resolveVoucherCodePrefix } from './voucherDescription';
import { buildSettlementEntries } from './accountEntries';
import { expandSuspenseBridge } from './suspenseBridge';
import { validateSwiftCrossField, buildSwiftMessages } from './swiftMessages';
import { BusinessValidationError } from '../errors';
import type { PaymentInstructionStore } from '../store/paymentInstructionStore';

/**
 * Order-independent canonical JSON of a value: object keys sorted, undefined
 * keys dropped (so an absent optional field and an explicit `undefined` hash
 * identically); ARRAY order is preserved (leg order is significant). Used only
 * to derive a stable idempotency fingerprint — never sent on the wire.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * C-2 idempotency fingerprint: a canonical hash of the request PAYLOAD (the
 * validated OAS body). Two confirms sharing a natural key
 * (originModule, mainRef, sequence) but carrying different payloads must NOT
 * silently replay the first result — they hash differently, so the caller gets
 * a 409 IDEMPOTENCY_KEY_CONFLICT instead of a misleading 200 (see
 * confirmPaymentInstruction below). An identical resend hashes identically and
 * replays as before.
 */
function requestFingerprint(request: ValidatedConfirmRequest): string {
  return createHash('sha256').update(stableStringify(request)).digest('hex');
}

export interface ConfirmPaymentInstructionOptions {
  /**
   * Resolves the {MODULE}{FuncCode} voucher prefix (§5). Required unless
   * voucherCodePrefixOverride is supplied directly. NOT part of the official
   * OAS request body — see voucherDescription.ts's doc comment for why.
   */
  sourceFunctionCode?: string;
  /** Direct override, required for the two FSD rows with an unresolved dual prefix (EPLC PayAccept, EXCO SettlementAtMaturity). */
  voucherCodePrefixOverride?: string;
  /**
   * V8 tolerance override (§3/§9). Defaults to **exact equality (0) for EVERY
   * originModule, including RPFM** (M-7): a GL voucher must balance Dr = Cr
   * exactly — the legacy RPFM ±0.01 was a screen-level percentage-split slack,
   * not a posting rule, and a genuine rounding residual belongs on an explicit
   * rounding-difference leg, not swept under a tolerance. This remains as a
   * deliberate, explicit per-call escape hatch only; it is never applied
   * automatically.
   */
  balanceTolerance?: Decimal.Value;
  /**
   * Preview mode for the Business Case Simulator's live onChange recompute
   * (lc-payment-wc). Skips the idempotency lookup (step 0) AND the final
   * store.save — every dryRun call runs steps 1-5 fresh against the current
   * input and is never persisted, so it never collides with a real Confirm
   * using the same natural key, and never blocks on a stale cached result
   * from an earlier preview. Real (non-dryRun) Confirm semantics are
   * completely unaffected by this flag ever having been used.
   */
  dryRun?: boolean;
}

export interface ConfirmResult {
  instruction: PaymentInstruction;
  /** true -> HTTP 201 (new instruction created); false -> HTTP 200 (idempotent replay of an existing one). */
  created: boolean;
}

export function confirmPaymentInstruction(
  store: PaymentInstructionStore,
  request: ValidatedConfirmRequest,
  options: ConfirmPaymentInstructionOptions,
): ConfirmResult {
  // C-2: fingerprint of THIS request's payload — used both to detect an
  // idempotency-key conflict below and, on a genuine create, stored alongside
  // the instruction for the next call to compare against. Computed once.
  const fingerprint = requestFingerprint(request);

  // Step 0 (FSD §6.1): idempotent replay — return the existing result without
  // re-running any of steps 1-5, so GL/SWIFT output is never re-triggered.
  // Skipped entirely in dryRun mode (see ConfirmPaymentInstructionOptions.dryRun).
  if (!options.dryRun) {
    const existing = store.find(request.originModule, request.mainRef, request.sequence);
    if (existing) {
      // C-2: only replay when the payload is byte-for-byte the same one that
      // produced `existing`. A DIFFERENT payload on the same natural key (an
      // operator re-submitting corrected amounts under the same sequence, or two
      // genuinely different transactions colliding on the key) must NOT silently
      // return the stale result as HTTP 200 — that hides the discrepancy. Reject
      // with 409 IDEMPOTENCY_KEY_CONFLICT so the caller learns the key is taken
      // by different content. (A prior instruction saved WITHOUT a fingerprint —
      // priorFingerprint undefined — falls through to a plain replay, preserving
      // legacy behaviour.)
      const priorFingerprint = store.findFingerprint(request.originModule, request.mainRef, request.sequence);
      if (priorFingerprint !== undefined && priorFingerprint !== fingerprint) {
        throw new BusinessValidationError(
          'IDEMPOTENCY_KEY_CONFLICT',
          `A payment instruction already exists for (originModule=${request.originModule}, ` +
            `mainRef=${request.mainRef}, sequence=${request.sequence}) with a DIFFERENT request payload. ` +
            'The idempotency key is already taken by different content — refusing to return the earlier ' +
            'result. Resend the identical payload to replay it, or use a new sequence for a corrected/new instruction.',
        );
      }
      return { instruction: existing, created: false };
    }
  }

  // v1.4.0: expand suspenseBridge (if present) into additional legs BEFORE step 1,
  // so the balance check already sees them (see domain/suspenseBridge.ts). v1.10.0:
  // transaction currency now comes from request.transactionCurrency (independent of any
  // leg's own currency — see PaymentInstructionConfirmRequest.transactionCurrency's doc
  // comment in types.ts), falling back to debitLegs[0].currency only for callers that
  // omit the new field; the `!` reflects debitLegs' zod-enforced minItems:1, not a `?? []`
  // fallback for a condition that can't reach this line. v1.7.0: also passes the
  // caller's own debitLegs/creditLegs through — expandSuspenseBridge nets/combines each
  // foreign-currency Suspense bucket against same-currency legs on the matching side.
  const transactionCurrency = request.transactionCurrency ?? request.debitLegs[0]!.currency;
  const bridge = expandSuspenseBridge(request.suspenseBridge, transactionCurrency, request.debitLegs, request.creditLegs);

  // v1.7.1 ordering: the FX Exchange pair should read as one adjacent Dr/Cr block in the
  // Settlement Vouchers table (accounting-review best practice — lets a reviewer confirm
  // the conversion/rate/per-currency balance at a glance, without hunting for the matching
  // leg elsewhere). Bridge legs never land on debit except FX-pair legs (every Suspense
  // leg is credit-direction, unconditionally — see suspenseBridge.ts), so bridge.debit is
  // pure FX and already lands last simply by being appended after the caller's own
  // debitLegs. bridge.credit mixes FX-pair legs (accountType INTERNAL) with Suspense legs
  // (accountType SUSPENSE) — split them so the FX ones lead (immediately following the FX
  // debit leg above) and the Suspense ones trail, after the caller's own creditLegs:
  //   Normal Debits -> FX Debit -> FX Credit -> Normal Credits -> Suspense Credit
  const bridgeFxCredit = bridge.credit.filter((l) => l.accountType === 'INTERNAL');
  const bridgeSuspenseCredit = bridge.credit.filter((l) => l.accountType !== 'INTERNAL');
  const debitLegsInput = [...request.debitLegs, ...bridge.debit];
  const creditLegsInput = [...bridgeFxCredit, ...request.creditLegs, ...bridgeSuspenseCredit];

  // Step 1 (§3): Dr/Cr balance validation (V8) — throws BusinessValidationError (409) on failure.
  // M-7: EXACT equality (tolerance 0) for EVERY originModule — RPFM no longer gets the automatic
  // ±0.01 slack (a GL voucher must balance exactly; the legacy 0.01 was a screen-level split check,
  // not a posting rule — see ConfirmPaymentInstructionOptions.balanceTolerance). An explicit
  // options.balanceTolerance is still honoured as a deliberate per-call escape hatch.
  const tolerance = options.balanceTolerance ?? 0;
  validateDrCrBalance(debitLegsInput, creditLegsInput, tolerance);

  const instructionId = randomUUID();

  // Step 2 (§4): classification — informational only, never blocks, never gates step 4.
  const classification = classify(instructionId, debitLegsInput, creditLegsInput);

  // Step 3 (§5): voucher description code assembly per leg.
  const voucherCodePrefix =
    options.voucherCodePrefixOverride ?? resolveVoucherCodePrefix(request.originModule, options.sourceFunctionCode ?? '');
  const debitLegs = enrichLegs(debitLegsInput, 'DEBIT', voucherCodePrefix);
  const creditLegs = enrichLegs(creditLegsInput, 'CREDIT', voucherCodePrefix);

  // Step 4 (§6.1): Settlement Account Entry generation — unconditional, independent of
  // classification. §6.2/§6.3 removed v1.6.0 — see this file's header doc comment.
  const accountEntries = [
    ...buildSettlementEntries(instructionId, debitLegs, 'DEBIT'),
    ...buildSettlementEntries(instructionId, creditLegs, 'CREDIT'),
  ];

  // Step 5 (§7): SWIFT cross-field validation (409 on violation), then message generation.
  validateSwiftCrossField(creditLegs);
  const swiftMessages = buildSwiftMessages(instructionId, creditLegs, transactionCurrency);

  const instruction: PaymentInstruction = {
    instructionId,
    sequence: request.sequence,
    originModule: request.originModule,
    mainRef: request.mainRef,
    tenorType: request.tenorType,
    maturityDate: request.maturityDate,
    payInstrFlag: request.payInstrFlag,
    unpaidFlag: false,
    debitLegs,
    creditLegs,
    classification,
    accountEntries,
    swiftMessages,
  };

  if (options.dryRun) {
    return { instruction, created: false };
  }

  store.save(instruction, fingerprint);
  return { instruction, created: true };
}
