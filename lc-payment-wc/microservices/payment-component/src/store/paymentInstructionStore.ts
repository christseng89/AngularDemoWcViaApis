/**
 * Idempotency store keyed by the natural key (originModule, mainRef, sequence)
 * — FSD §6.1: "重複送入已存在的付款指令,直接回傳既有的已確認結果(200),
 * 不會重新觸發總帳/SWIFT 輸出;天然鍵不存在時才建立新記錄並回傳(201)".
 *
 * PRODUCTION NOTE: this is an in-memory Map for demonstration/testing only —
 * it does not survive a process restart and does not work across multiple
 * service instances. A real deployment MUST replace this with a persistent
 * store (e.g. a table with a UNIQUE constraint on (origin_module, main_ref,
 * sequence), written via an atomic upsert) — see Payment_Component_Calculation_Validation.docx
 * §9 V5 and the FSD's own note that the persistence layer needs this
 * uniqueness constraint.
 */
import type { OriginModule, PaymentInstruction } from '../types';

function naturalKey(originModule: OriginModule, mainRef: string, sequence: number): string {
  return `${originModule}::${mainRef}::${sequence}`;
}

export interface PaymentInstructionStore {
  find(originModule: OriginModule, mainRef: string, sequence: number): PaymentInstruction | undefined;
  findById(instructionId: string): PaymentInstruction | undefined;
  save(instruction: PaymentInstruction): void;
  search(filter: { originModule?: OriginModule; mainRef?: string }): PaymentInstruction[];
}

export function createInMemoryPaymentInstructionStore(): PaymentInstructionStore {
  const byNaturalKey = new Map<string, PaymentInstruction>();
  const byId = new Map<string, PaymentInstruction>();

  return {
    find(originModule, mainRef, sequence) {
      return byNaturalKey.get(naturalKey(originModule, mainRef, sequence));
    },
    findById(instructionId) {
      return byId.get(instructionId);
    },
    save(instruction) {
      byNaturalKey.set(naturalKey(instruction.originModule, instruction.mainRef, instruction.sequence), instruction);
      byId.set(instruction.instructionId, instruction);
    },
    search(filter) {
      return Array.from(byId.values()).filter((pi) => {
        if (filter.originModule && pi.originModule !== filter.originModule) return false;
        if (filter.mainRef && pi.mainRef !== filter.mainRef) return false;
        return true;
      });
    },
  };
}
