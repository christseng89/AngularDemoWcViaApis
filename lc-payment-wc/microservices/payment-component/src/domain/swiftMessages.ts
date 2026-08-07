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
 * MT103/PACS008. Note (documented, not silently "fixed"): settlement amount
 * (32A) and instructed amount (33B) are populated from the SAME source field
 * (CPYT_CR_AMT_CRCCY) in the traced source, so they are intentionally equal
 * here too — see §7.1/§12.5 of the Calculation & Validation doc.
 */
function buildAdviceMessage(instructionId: string, leg: PaymentLeg): SwiftMessage {
  return {
    messageId: nextMessageId(),
    instructionId,
    legId: leg.legId,
    messageType: leg.payAdviceMsgType as SwiftMessageType,
    status: 'PENDING',
    settlementCurrency: leg.currency,
    settlementAmount: leg.amountAccountCcy ?? leg.amountTxCcy,
    instructedAmount: leg.amountAccountCcy ?? leg.amountTxCcy,
    valueDate: leg.valueDate,
  };
}

function buildCoverMessage(instructionId: string, leg: PaymentLeg): SwiftMessage {
  return {
    messageId: nextMessageId(),
    instructionId,
    legId: leg.legId,
    messageType: leg.payCoverMsgType as SwiftMessageType,
    status: 'PENDING',
    settlementCurrency: leg.currency,
    settlementAmount: leg.amountAccountCcy ?? leg.amountTxCcy,
    valueDate: leg.valueDate,
  };
}

/**
 * Produces one SwiftMessage per credit leg where payAdviceMsgType and/or
 * payCoverMsgType resolve to a non-'None' value (FSD §5.4 step 5). Call
 * validateSwiftCrossField() first — this function assumes the cross-field
 * rule already passed.
 */
export function buildSwiftMessages(instructionId: string, creditLegs: readonly PaymentLeg[]): SwiftMessage[] {
  const messages: SwiftMessage[] = [];
  for (const leg of creditLegs) {
    if (leg.payAdviceMsgType && leg.payAdviceMsgType !== 'None') {
      messages.push(buildAdviceMessage(instructionId, leg));
    }
    if (leg.payCoverMsgType && leg.payCoverMsgType !== 'None') {
      messages.push(buildCoverMessage(instructionId, leg));
    }
  }
  return messages;
}
