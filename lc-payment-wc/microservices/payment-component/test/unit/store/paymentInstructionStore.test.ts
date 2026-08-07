import { createInMemoryPaymentInstructionStore } from '../../../src/store/paymentInstructionStore';
import type { PaymentInstruction, OriginModule } from '../../../src/types';

function instruction(overrides: Partial<PaymentInstruction> = {}): PaymentInstruction {
  return {
    instructionId: `id-${Math.random().toString(36).slice(2)}`,
    sequence: 1,
    originModule: 'IPLC',
    mainRef: 'REF-1',
    debitLegs: [],
    creditLegs: [],
    classification: {
      instructionId: 'x',
      debitTypes: [],
      creditTypes: [],
      customerXor: false,
      nostroXor: false,
      vostroXor: false,
      paymentComponentRelated: false,
    },
    accountEntries: [],
    swiftMessages: [],
    ...overrides,
  };
}

describe('createInMemoryPaymentInstructionStore', () => {
  it('find() returns undefined before anything is saved', () => {
    const store = createInMemoryPaymentInstructionStore();
    expect(store.find('IPLC', 'REF-1', 1)).toBeUndefined();
  });

  it('save() then find() by the same natural key returns the saved instruction', () => {
    const store = createInMemoryPaymentInstructionStore();
    const instr = instruction({ instructionId: 'id-1', originModule: 'IPLC', mainRef: 'REF-1', sequence: 1 });
    store.save(instr);
    expect(store.find('IPLC', 'REF-1', 1)).toBe(instr);
  });

  it('findById() returns the saved instruction by instructionId', () => {
    const store = createInMemoryPaymentInstructionStore();
    const instr = instruction({ instructionId: 'id-abc' });
    store.save(instr);
    expect(store.findById('id-abc')).toBe(instr);
    expect(store.findById('missing')).toBeUndefined();
  });

  it('a different originModule misses the natural key even with same mainRef/sequence', () => {
    const store = createInMemoryPaymentInstructionStore();
    store.save(instruction({ originModule: 'IPLC', mainRef: 'REF-1', sequence: 1 }));
    expect(store.find('EPLC', 'REF-1', 1)).toBeUndefined();
  });

  it('a different mainRef misses the natural key', () => {
    const store = createInMemoryPaymentInstructionStore();
    store.save(instruction({ originModule: 'IPLC', mainRef: 'REF-1', sequence: 1 }));
    expect(store.find('IPLC', 'REF-2', 1)).toBeUndefined();
  });

  it('a different sequence misses the natural key', () => {
    const store = createInMemoryPaymentInstructionStore();
    store.save(instruction({ originModule: 'IPLC', mainRef: 'REF-1', sequence: 1 }));
    expect(store.find('IPLC', 'REF-1', 2)).toBeUndefined();
  });

  describe('search', () => {
    function makeStoreWithMultiple() {
      const store = createInMemoryPaymentInstructionStore();
      const a = instruction({ instructionId: 'a', originModule: 'IPLC', mainRef: 'REF-A', sequence: 1 });
      const b = instruction({ instructionId: 'b', originModule: 'IPLC', mainRef: 'REF-B', sequence: 1 });
      const c = instruction({ instructionId: 'c', originModule: 'EPLC', mainRef: 'REF-A', sequence: 1 });
      store.save(a);
      store.save(b);
      store.save(c);
      return { store, a, b, c };
    }

    it('with no filter returns every saved instruction', () => {
      const { store } = makeStoreWithMultiple();
      expect(store.search({})).toHaveLength(3);
    });

    it('filters by originModule only', () => {
      const { store, a, b } = makeStoreWithMultiple();
      const result = store.search({ originModule: 'IPLC' as OriginModule });
      expect(result.sort((x, y) => x.instructionId.localeCompare(y.instructionId))).toEqual(
        [a, b].sort((x, y) => x.instructionId.localeCompare(y.instructionId)),
      );
    });

    it('filters by mainRef only', () => {
      const { store, a, c } = makeStoreWithMultiple();
      const result = store.search({ mainRef: 'REF-A' });
      expect(result.sort((x, y) => x.instructionId.localeCompare(y.instructionId))).toEqual(
        [a, c].sort((x, y) => x.instructionId.localeCompare(y.instructionId)),
      );
    });

    it('filters by both originModule and mainRef together', () => {
      const { store, a } = makeStoreWithMultiple();
      const result = store.search({ originModule: 'IPLC' as OriginModule, mainRef: 'REF-A' });
      expect(result).toEqual([a]);
    });

    it('returns an empty array when nothing matches both filters', () => {
      const { store } = makeStoreWithMultiple();
      expect(store.search({ originModule: 'EPLC' as OriginModule, mainRef: 'REF-B' })).toEqual([]);
    });
  });
});
