import { DrCrEntry, fmt } from './shared';

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  CA:     '#2563eb',
  Nostro: '#7c3aed',
  IBL:    '#b45309',
  EBL:    '#0f766e',
  Margin: '#be185d',
  Income: '#16a34a',
  FX:     '#dc2626',
};

export class JournalEntryElement extends HTMLElement {
  static observedAttributes = ['entries'];

  private _shadow: ShadowRoot;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this._draw();
  }

  attributeChangedCallback(): void {
    this._draw();
  }

  private _parseEntries(): DrCrEntry[] {
    const raw = this.getAttribute('entries');
    if (!raw) return [];
    try {
      return JSON.parse(raw) as DrCrEntry[];
    } catch {
      return [];
    }
  }

  private _typeBadge(t: string): string {
    const color = ACCOUNT_TYPE_COLORS[t] ?? '#6b7280';
    return `<span style="
      background:${color};
      color:#fff;
      border-radius:4px;
      padding:1px 7px;
      font-size:11px;
      font-weight:600;
      letter-spacing:0.03em;
    ">${t}</span>`;
  }

  private _draw(): void {
    const entries = this._parseEntries();

    if (entries.length === 0) {
      this._shadow.innerHTML = `
        <style>
          :host { display: block; font-family: sans-serif; }
          .empty { color: #9ca3af; text-align: center; padding: 20px; font-style: italic; font-size: 14px; border: 1px dashed #e5e7eb; border-radius: 6px; }
        </style>
        <div class="empty">No journal entries — submit the form to calculate.</div>
      `;
      return;
    }

    const totalDr = entries.filter(e => e.leg === 'Dr').reduce((s, e) => s + e.amountTwd, 0);
    const totalCr = entries.filter(e => e.leg === 'Cr').reduce((s, e) => s + e.amountTwd, 0);
    const balanced = Math.abs(totalDr - totalCr) < 1;

    const rows = entries.map(e => {
      const rowBg = e.leg === 'Dr' ? '#dbeafe' : '#dcfce7';
      const legColor = e.leg === 'Dr' ? '#1d4ed8' : '#15803d';
      return `
        <tr style="background:${rowBg};">
          <td style="font-weight:700;color:${legColor};padding:7px 10px;white-space:nowrap;">${e.leg}</td>
          <td style="padding:7px 10px;font-size:13px;">${e.account}</td>
          <td style="padding:7px 10px;">${this._typeBadge(e.accountType)}</td>
          <td style="padding:7px 10px;font-weight:600;color:#374151;">${e.ccy}</td>
          <td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:13px;">${fmt(e.amount, e.ccy)}</td>
          <td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:13px;">${fmt(e.amountTwd, 'TWD')}</td>
          <td style="padding:7px 10px;font-size:12px;color:#6b7280;">${e.description}</td>
        </tr>
      `;
    }).join('');

    const balanceColor = balanced ? '#15803d' : '#dc2626';
    const balanceText  = balanced ? 'BALANCED' : 'UNBALANCED';

    this._shadow.innerHTML = `
      <style>
        :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .wrapper { overflow-x: auto; border-radius: 8px; border: 1px solid #e5e7eb; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead tr { background: #f9fafb; }
        thead th {
          padding: 8px 10px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #6b7280;
          border-bottom: 1px solid #e5e7eb;
        }
        thead th:nth-child(5),
        thead th:nth-child(6) { text-align: right; }
        tbody tr + tr { border-top: 1px solid rgba(255,255,255,0.6); }
        tfoot tr { background: #f1f5f9; border-top: 2px solid #cbd5e1; }
        tfoot td { padding: 7px 10px; font-size: 12px; font-weight: 700; }
        .balance-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          background: ${balanced ? '#dcfce7' : '#fee2e2'};
          color: ${balanceColor};
          border: 1px solid ${balanced ? '#86efac' : '#fca5a5'};
        }
      </style>
      <div class="wrapper">
        <table>
          <thead>
            <tr>
              <th>Leg</th>
              <th>Account</th>
              <th>Type</th>
              <th>CCY</th>
              <th>Amount</th>
              <th>TWD Equiv</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="4">
                <span class="balance-badge">${balanceText}</span>
              </td>
              <td></td>
              <td style="text-align:right;font-family:monospace;">
                Dr: ${fmt(totalDr, 'TWD')}<br>
                Cr: ${fmt(totalCr, 'TWD')}
              </td>
              <td style="color:#6b7280;font-weight:400;">TWD net: ${fmt(totalDr - totalCr, 'TWD')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }
}

customElements.define('journal-entry', JournalEntryElement);
