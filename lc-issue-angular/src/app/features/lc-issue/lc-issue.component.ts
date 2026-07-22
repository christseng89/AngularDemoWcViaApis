import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService, EventBus } from '../../web-components/shared';

@Component({
  selector: 'app-lc-issue',
  templateUrl: './lc-issue.component.html',
  styleUrls: ['./lc-issue.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LcIssueComponent implements OnInit, OnDestroy {
  form  = new FormGroup({});
  model: Record<string, unknown> = {
    tolerancePct:  5,
    commissionPct: 0.25,
  };
  fields: FormlyFieldConfig[] = this._buildFields();
  isReady     = false;
  isSubmitting = false;
  toastMsg    = '';
  toastOk     = true;

  private _destroy$ = new Subject<void>();

  constructor(private _cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Sync model → Web Component attributes on every form value change
    // updateOn:'blur' in Formly ensures this only fires after the user leaves a field
    this.form.valueChanges.pipe(
      debounceTime(0),
      takeUntil(this._destroy$)
    ).subscribe(() => this._push());

    // payment-ready → enable Submit
    EventBus.on('payment-ready', () => {
      this.isReady = true;
      this._cdr.markForCheck();
    });

    // Init form defaults from server — whatever fields the server returns are applied
    // as-is, so adding a new default key in server.js needs no change here.
    // Falls back to the local hardcoded `model` values on error.
    ApiService.getDefaults()
      .then(d => {
        this.model = { ...this.model, ...d };
        this._push();
        this._cdr.markForCheck();
      })
      .catch(err => console.warn('Failed to load server defaults, using local fallback:', err));
  }

  ngOnDestroy() {
    this._destroy$.next();
    this._destroy$.complete();
    EventBus.reset();
  }

  // ── Push Angular model → Web Component attributes ─────────────────────────
  // charge-grid accepts: lc-amount, lc-currency, margin-rate, comm-rate, tolerance-pct,
  //                      applicant-id, beneficiary-country
  // balance-component accepts: lc-amount, lc-currency, tolerance-pct
  //
  // payCcy is handled INLINE inside charge-grid (no separate Formly fields needed).
  // ─────────────────────────────────────────────────────────────────────────────
  private _push() {
    const m = this.model;
    const setA = (id: string, attr: string, val: unknown) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val != null && val !== '' && val !== undefined) {
        el.setAttribute(attr, String(val));
      } else {
        el.removeAttribute(attr);
      }
    };

    const lcAmt  = m['lcAmount'];
    const lcCcy  = m['lcCurrency'] ?? 'USD';
    const tolPct = m['tolerancePct'] ?? 5;

    // balance-component
    setA('wc-balance', 'lc-currency',   lcCcy);
    if (lcAmt) {
      setA('wc-balance', 'lc-amount',     lcAmt);
      setA('wc-balance', 'tolerance-pct', tolPct);
    } else {
      document.getElementById('wc-balance')?.removeAttribute('lc-amount');
    }

    // charge-grid — set all driver attributes; charge-grid handles the rest internally
    setA('wc-cgrid', 'lc-currency', lcCcy);
    if (lcAmt) {
      setA('wc-cgrid', 'lc-amount',     lcAmt);
      setA('wc-cgrid', 'tolerance-pct', tolPct);
    } else {
      document.getElementById('wc-cgrid')?.removeAttribute('lc-amount');
    }
    setA('wc-cgrid', 'margin-rate',           m['marginPct'] ?? '0');
    setA('wc-cgrid', 'comm-rate',             m['commissionPct'] ?? 0.25);
    if (m['applicantId']) {
      setA('wc-cgrid', 'applicant-id',        m['applicantId']);
    } else {
      document.getElementById('wc-cgrid')?.removeAttribute('applicant-id');
    }
    if (m['beneficiaryCountry']) {
      setA('wc-cgrid', 'beneficiary-country', m['beneficiaryCountry']);
    } else {
      document.getElementById('wc-cgrid')?.removeAttribute('beneficiary-country');
    }
  }

  submit() {
    if (!this.form.valid || !this.isReady) return;
    this.isSubmitting = true;
    this._cdr.markForCheck();
    // Simulate API call
    setTimeout(() => {
      this.isSubmitting = false;
      this._showToast('✅ 開狀申請已送出！LC Issue Submitted.', true);
      this._cdr.markForCheck();
    }, 800);
  }

  reset() {
    this.form.reset();
    this.model = { tolerancePct: 5, commissionPct: 0.25 };
    this.isReady = false;
    EventBus.reset();
    // Force submit button back to disabled
    const btn = document.getElementById('lc-submit') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    this._showToast('重設完成', true);
    this._cdr.markForCheck();
  }

  private _showToast(msg: string, ok: boolean) {
    this.toastMsg = msg; this.toastOk = ok;
    this._cdr.markForCheck();
    setTimeout(() => { this.toastMsg = ''; this._cdr.markForCheck(); }, 3000);
  }

  // ── Formly field config ───────────────────────────────────────────────────
  // Simplified: no per-charge payCcy fields (those are inline in charge-grid).
  // ─────────────────────────────────────────────────────────────────────────
  private _buildFields(): FormlyFieldConfig[] {
    return [
      {
        // Section ① header (num badge + title) is rendered by the 'section' wrapper —
        // see shared/formly/section-wrapper.component.ts — instead of static HTML.
        wrappers: ['section'],
        props: { sectionNum: '1', sectionTitle: '基本資料 Basic Information' },
        fieldGroup: [
          {
            fieldGroupClassName: 'row g-2',
            fieldGroup: [
              {
                key: 'lcAmount', type: 'input', className: 'col-md-4',
                modelOptions: { updateOn: 'blur' },
                props: { label: 'LC Amount *', type: 'number', placeholder: '1,000,000', required: true, min: 1 },
              },
              {
                key: 'lcCurrency', type: 'select', className: 'col-md-4',
                props: {
                  label: 'LC Currency *', required: true,
                  options: [
                    { value: 'USD', label: 'USD — 美元' },
                    { value: 'EUR', label: 'EUR — 歐元' },
                    { value: 'JPY', label: 'JPY — 日圓' },
                    { value: 'GBP', label: 'GBP — 英鎊' },
                  ],
                },
              },
              {
                key: 'tolerancePct', type: 'input', className: 'col-md-4',
                defaultValue: 5,
                modelOptions: { updateOn: 'blur' },
                props: { label: 'Tolerance %', type: 'number', min: 0, max: 10, step: 0.5 },
              },
              {
                key: 'applicantId', type: 'select', className: 'col-md-4',
                props: {
                  label: 'Applicant ID *', required: true,
                  options: [
                    { value: 'C-001', label: 'C-001 · Acme Corp（A 級 Spread 0.05%）' },
                    { value: 'C-002', label: 'C-002 · Beta Ltd（B 級 Spread 0.10%）' },
                    { value: 'C-003', label: 'C-003 · Gamma Inc（C 級 Spread 0.15%）' },
                  ],
                },
              },
              {
                key: 'commissionPct', type: 'input', className: 'col-md-4',
                defaultValue: 0.25,
                modelOptions: { updateOn: 'blur' },
                props: { label: 'Commission Rate %', type: 'number', min: 0, step: 0.05 },
              },
              {
                key: 'beneficiaryCountry', type: 'select', className: 'col-md-4',
                props: {
                  label: 'Beneficiary Country *', required: true,
                  options: [
                    { value: 'US', label: 'US — 美國 (TWD 800)' },
                    { value: 'UK', label: 'UK — 英國 (TWD 900)' },
                    { value: 'DE', label: 'DE — 德國 (TWD 950)' },
                    { value: 'JP', label: 'JP — 日本 (TWD 850)' },
                    { value: 'CN', label: 'CN — 中國 (TWD 750)' },
                  ],
                },
              },
            ],
          },
          // ── Optional fields ──────────────────────────────────────────────
          {
            template: `<div class="text-muted small fw-semibold mt-2 mb-1"
                           style="letter-spacing:.06em;text-transform:uppercase;font-size:10px">
                         選填欄位 Optional Fields
                       </div>`,
          },
          {
            fieldGroupClassName: 'row g-2',
            fieldGroup: [
              {
                key: 'marginPct', type: 'input', className: 'col-md-4',
                modelOptions: { updateOn: 'blur' },
                props: {
                  label: 'Margin % (選填)',
                  type: 'number', min: 0, step: 1,
                  placeholder: '未設定 → 預設 0%',
                  attributes: { class: 'field-optional' },
                },
              },
            ],
          },
        ],
      },
    ];
  }
}
