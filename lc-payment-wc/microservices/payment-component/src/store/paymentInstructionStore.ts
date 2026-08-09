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
  /**
   * The request payload fingerprint stored alongside the instruction at its
   * natural key (C-2 idempotency-conflict detection — see
   * domain/confirmPaymentInstruction.ts). undefined when no instruction exists
   * for that key, or when one was saved without a fingerprint.
   */
  findFingerprint(originModule: OriginModule, mainRef: string, sequence: number): string | undefined;
  /** `fingerprint` (C-2): an opaque canonical hash of the request that produced this instruction. */
  save(instruction: PaymentInstruction, fingerprint?: string): void;
  search(filter: { originModule?: OriginModule; mainRef?: string }): PaymentInstruction[];
}

export function createInMemoryPaymentInstructionStore(): PaymentInstructionStore {
  const byNaturalKey = new Map<string, PaymentInstruction>();
  const byId = new Map<string, PaymentInstruction>();
  const fingerprintByNaturalKey = new Map<string, string>();

  return {
    find(originModule, mainRef, sequence) {
      return byNaturalKey.get(naturalKey(originModule, mainRef, sequence));
    },
    findFingerprint(originModule, mainRef, sequence) {
      return fingerprintByNaturalKey.get(naturalKey(originModule, mainRef, sequence));
    },
    findById(instructionId) {
      return byId.get(instructionId);
    },
    save(instruction, fingerprint) {
      const key = naturalKey(instruction.originModule, instruction.mainRef, instruction.sequence);
      byNaturalKey.set(key, instruction);
      byId.set(instruction.instructionId, instruction);
      if (fingerprint !== undefined) fingerprintByNaturalKey.set(key, fingerprint);
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
