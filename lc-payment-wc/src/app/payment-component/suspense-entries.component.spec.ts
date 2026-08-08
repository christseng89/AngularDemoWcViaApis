import { of } from 'rxjs';
import { SuspenseEntriesComponent, type SuspenseEntry } from './suspense-entries.component';
import type { CurrencyService } from './currency.service';

function makeComponent() {
  const mockCurrency = {
    codes: jest.fn(() => of(['USD', 'EUR', 'JPY'])),
  } as unknown as CurrencyService;

  const comp = new SuspenseEntriesComponent(mockCurrency);
  comp.label = 'Suspense Debit';

  const emitted: SuspenseEntry[][] = [];
  comp.entriesChange.subscribe((entries) => emitted.push(entries));

  return { comp, mockCurrency, emitted };
}

describe('SuspenseEntriesComponent', () => {
  it('starts with no rows and does not emit anything until a row is added', () => {
    const { comp, emitted } = makeComponent();
    expect(comp.rows).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it('addRow() appends a blank row and emits the current entries list', () => {
    const { comp, emitted } = makeComponent();
    comp.addRow();

    expect(comp.rows).toHaveLength(1);
    expect(comp.rows[0]!.amount).toBe('');
    expect(comp.rows[0]!.currency).toBe('');
    expect(emitted[emitted.length - 1]).toEqual([{ amount: '', currency: '' }]);
  });

  it('addRow() seeds the new row\'s currency from defaultCurrency when set', () => {
    const { comp, emitted } = makeComponent();
    comp.defaultCurrency = 'EUR';
    comp.addRow();

    expect(comp.rows[0]!.currency).toBe('EUR');
    expect(comp.rows[0]!.amount).toBe('');
    expect(emitted[emitted.length - 1]).toEqual([{ amount: '', currency: 'EUR' }]);
  });

  it('addRow() does not retroactively change an existing row when defaultCurrency changes afterwards', () => {
    const { comp } = makeComponent();
    comp.addRow(); // defaultCurrency still '' at this point
    comp.defaultCurrency = 'JPY';
    comp.addRow();

    expect(comp.rows[0]!.currency).toBe('');
    expect(comp.rows[1]!.currency).toBe('JPY');
  });

  it('addRow() twice keeps both rows independent, each with its own id', () => {
    const { comp } = makeComponent();
    comp.addRow();
    comp.addRow();
    expect(comp.rows).toHaveLength(2);
    expect(comp.rows[0]!.id).not.toBe(comp.rows[1]!.id);
  });

  it('onFieldChange() re-emits the current amount+currency for every row, in order', () => {
    const { comp, emitted } = makeComponent();
    comp.addRow();
    comp.addRow();
    comp.rows[0]!.amount = '100';
    comp.rows[0]!.currency = 'EUR';
    comp.rows[1]!.amount = '250';
    comp.rows[1]!.currency = 'JPY';
    comp.onFieldChange();

    expect(emitted[emitted.length - 1]).toEqual([
      { amount: '100', currency: 'EUR' },
      { amount: '250', currency: 'JPY' },
    ]);
  });

  it('removeRow() drops only the targeted row and re-emits the remainder', () => {
    const { comp, emitted } = makeComponent();
    comp.addRow();
    comp.addRow();
    const [first, second] = comp.rows;
    first!.amount = '10';
    second!.amount = '20';

    comp.removeRow(first!);

    expect(comp.rows).toHaveLength(1);
    expect(comp.rows[0]!.id).toBe(second!.id);
    expect(emitted[emitted.length - 1]).toEqual([{ amount: '20', currency: '' }]);
  });

  it('removeRow() on the last row leaves an empty list (not an error)', () => {
    const { comp, emitted } = makeComponent();
    comp.addRow();
    comp.removeRow(comp.rows[0]!);
    expect(comp.rows).toEqual([]);
    expect(emitted[emitted.length - 1]).toEqual([]);
  });

  it('trackById returns the row id, stable across re-renders', () => {
    const { comp } = makeComponent();
    comp.addRow();
    const row = comp.rows[0]!;
    expect(comp.trackById(0, row)).toBe(row.id);
  });

  it('exposes currencies$ sourced from CurrencyService.codes()', (done) => {
    const { comp, mockCurrency } = makeComponent();
    comp.currencies$.subscribe((codes) => {
      expect(codes).toEqual(['USD', 'EUR', 'JPY']);
      expect(mockCurrency.codes).toHaveBeenCalled();
      done();
    });
  });
});
