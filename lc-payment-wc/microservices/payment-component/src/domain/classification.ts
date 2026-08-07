/**
 * §4 of Payment_Component_Calculation_Validation.docx — Step 2 of the Confirm
 * flow: Payment Component Identification Rule (Rev. 2), recapped from
 * PaymentComponent-Microservice-FSD-zh.docx §2.3.
 *
 *   paymentComponentRelated =
 *         ( Dr_has(CUSTOMER) XOR Cr_has(CUSTOMER) )
 *      OR ( Dr_has(NOSTRO)   XOR Cr_has(NOSTRO)   )
 *      OR ( Dr_has(VOSTRO)   XOR Cr_has(VOSTRO)   )
 *
 *   Dr_has(t) := true iff t appears as the accountType of ANY debit leg
 *   Cr_has(t) := true iff t appears as the accountType of ANY credit leg
 *
 * SUSPENSE and INTERNAL are not tested by any XOR term — matches FSD §2.3.
 * RTGS (RPFM only) is likewise not a term of its own: v1.3.0 stopped
 * modeling it as a distinct AccountType and represents it instead as
 * accountType='NOSTRO' + the rtgsIndicator flag (see types.ts), so an RTGS
 * leg already participates in nostroXor exactly like any other Nostro leg —
 * no special-casing needed here. This step never blocks the request; it is
 * informational only (§4 note, §6.1 of the FSD: Account Entry generation is
 * unconditional).
 *
 * Regression-tested in Payment_Component_Calculation_Validation.docx §13.1
 * against all 6 FSD-verified scenarios (§2.3.2, §2.3.3, §6.5) — see
 * test/regression.ts for the same 6 vectors run against this implementation.
 */
import type { AccountType, ClassificationResult, PaymentLegInput } from '../types';

function distinctAccountTypes(legs: readonly PaymentLegInput[]): AccountType[] {
  return Array.from(new Set(legs.map((leg) => leg.accountType)));
}

function has(types: readonly AccountType[], t: AccountType): boolean {
  return types.includes(t);
}

function xor(a: boolean, b: boolean): boolean {
  return a !== b;
}

export function classify(
  instructionId: string,
  debitLegs: readonly PaymentLegInput[],
  creditLegs: readonly PaymentLegInput[],
): ClassificationResult {
  const debitTypes = distinctAccountTypes(debitLegs);
  const creditTypes = distinctAccountTypes(creditLegs);

  const customerXor = xor(has(debitTypes, 'CUSTOMER'), has(creditTypes, 'CUSTOMER'));
  const nostroXor = xor(has(debitTypes, 'NOSTRO'), has(creditTypes, 'NOSTRO'));
  const vostroXor = xor(has(debitTypes, 'VOSTRO'), has(creditTypes, 'VOSTRO'));

  return {
    instructionId,
    debitTypes,
    creditTypes,
    customerXor,
    nostroXor,
    vostroXor,
    paymentComponentRelated: customerXor || nostroXor || vostroXor,
  };
}
