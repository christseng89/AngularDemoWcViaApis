/**
 * §7 of Payment_Component_Calculation_Validation.docx — Step 5 of the Confirm
 * flow: SWIFT/ISO 20022 message generation and cross-field validation.
 *
 * Source: CPYT_PAY_ADV_MSG() / CPYT_PAY_COV_MSG() onChange handlers —
 * X/CALJS/CDOSCRLEVEL/SSSS_PaymentCredit.js:344-400. Credit-leg only.
 *
 * Note (v1.3.0): message type here is selected purely from the leg's own
 * payAdviceMsgType/payCoverMsgType fields — never from accountType. A
 * NOSTRO leg with rtgsIndicator=true flows through identically to a plain
 * NOSTRO leg; there is no RTGS-specific message type in source or in this
 * schema (confirmed — see types.ts's AccountType doc comment). The flag is
 * preserved on the leg (never coerced away) so a future message-routing
 * distinction, if one is ever added, has something to key off.
 */
import { randomUUID } from 'crypto';
import type { PaymentLeg, SwiftMessage, SwiftMessageType } from '../types';
import { BusinessValidationError } from '../errors';

const ADV_REQUIRES_COVER_ADVICE: readonly string[] = ['MT103', 'PACS008'];
const COVER_REQUIRES_ADVICE: readonly string[] = ['MT202COV', 'PACS009COV'];

/**
 * Cross-field rule (§7, consolidated from both onChange handlers):
 *   IF payCoverMsgType ∈ {MT202COV, PACS009COV}:
 *       payAdviceMsgType MUST BE ∈ {MT103, PACS008}
 *   ELSE reject.
 * Applied per credit leg — throws BusinessValidationError (-> 409) on the
 * first violation found.
 */
export function validateSwiftCrossField(creditLegs: readonly PaymentLeg[]): void {
  creditLegs.forEach((leg, index) => {
    const cover = leg.payCoverMsgType;
    const advice = leg.payAdviceMsgType;
    if (cover && COVER_REQUIRES_ADVICE.includes(cover)) {
      if (!advice || !ADV_REQUIRES_COVER_ADVICE.includes(advice)) {
        throw new BusinessValidationError(
          'SWIFT_ADV_COV_MISMATCH',
          `Credit leg[${index}] (accountNo=${leg.accountNo}): The Payment Advice Message should be ` +
            'MT103 or PACS008, while the Payment Cover Message is MT202COV or PACS009COV.',
        );
      }
    }
  });
}

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `swift-${Date.now()}-${messageIdCounter}`;
}

/**
 * §7.1 field mapping — applies only when payAdviceMsgType resolves to
 * MT103/PACS008.
 *
 * H-3 fix (2026-08-09): 32A (interbank SETTLED amount) and 33B (INSTRUCTED
 * amount) are NO LONGER forced equal. The traced source populated both from
 * the same field (CPYT_CR_AMT_CRCCY, §7.1/§12.5), which is only correct for a
 * SAME-currency payment. For a genuine cross-currency payment they differ:
 *   - 32A = settlementCurrency (the leg's own/account currency) + the amount
 *     actually settled in it (amountAccountCcy).
 *   - 33B = instructedCurrency (the TRANSACTION currency the payment was
 *     ordered in) + the transaction-currency amount (amountTxCcy).
 * For a same-currency leg (no amountAccountCcy, leg.currency === transaction
 * currency) both collapse to the identical currency+amount, exactly matching
 * the old behaviour — so single-currency payments are byte-for-byte unchanged.
 *
 * `uetr` (H-3): a SWIFT gpi UETR — mandatory on CBPR+ pacs.008 / gpi MT103.
 * The SAME uetr is shared by a leg's advice AND its cover message, per gpi
 * (the cover that funds an MT103 carries that MT103's UETR). Generated as a
 * v4 UUID (randomUUID(), already lowercase 8-4-4-4-12 — the required format).
 */
function buildAdviceMessage(instructionId: string, leg: PaymentLeg, transactionCurrency: string, uetr: string): SwiftMessage {
  return {
    messageId: nextMessageId(),
    instructionId,
    legId: leg.legId,
    messageType: leg.payAdviceMsgType as SwiftMessageType,
    status: 'PENDING',
    settlementCurrency: leg.currency,
    settlementAmount: leg.amountAccountCcy ?? leg.amountTxCcy,
    instructedCurrency: transactionCurrency,
    instructedAmount: leg.amountTxCcy,
    valueDate: leg.valueDate,
    uetr,
  };
}

function buildCoverMessage(instructionId: string, leg: PaymentLeg, uetr: string): SwiftMessage {
  return {
    messageId: nextMessageId(),
    instructionId,
    legId: leg.legId,
    messageType: leg.payCoverMsgType as SwiftMessageType,
    status: 'PENDING',
    // A cover (MT202/MT202COV) settles the interbank amount only — 32A, no 33B.
    settlementCurrency: leg.currency,
    settlementAmount: leg.amountAccountCcy ?? leg.amountTxCcy,
    valueDate: leg.valueDate,
    uetr,
  };
}

/**
 * Produces one SwiftMessage per credit leg where payAdviceMsgType and/or
 * payCoverMsgType resolve to a non-'None' value (FSD §5.4 step 5). Call
 * validateSwiftCrossField() first — this function assumes the cross-field
 * rule already passed.
 *
 * `transactionCurrency` (the instruction's transaction currency,
 * debitLegs[0].currency) drives 33B's instructedCurrency — see
 * buildAdviceMessage. NOT set here: serviceTypeId / isGpiMember, which are
 * gpi-participation configuration (per-BIC / per-corridor), not derivable from
 * the request — left for a config-driven follow-up rather than fabricated.
 */
export function buildSwiftMessages(
  instructionId: string,
  creditLegs: readonly PaymentLeg[],
  transactionCurrency: string,
): SwiftMessage[] {
  const messages: SwiftMessage[] = [];
  for (const leg of creditLegs) {
    // One UETR per leg, shared by its advice + cover (gpi ties them together).
    const uetr = randomUUID();
    if (leg.payAdviceMsgType && leg.payAdviceMsgType !== 'None') {
      messages.push(buildAdviceMessage(instructionId, leg, transactionCurrency, uetr));
    }
    if (leg.payCoverMsgType && leg.payCoverMsgType !== 'None') {
      messages.push(buildCoverMessage(instructionId, leg, uetr));
    }
  }
  return messages;
}
