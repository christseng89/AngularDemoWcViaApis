import { Component } from '@angular/core';
import { FieldWrapper, FormlyFieldConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-wrapper-section',
  template: `
    <section class="lc-section">
      <div class="section-header" [style.--num-bg]="props['sectionColor']">
        <span class="num" [style.background]="props['sectionColor']">{{ props['sectionNum'] }}</span>
        {{ props['sectionTitle'] }}
      </div>
      <ng-container #fieldComponent></ng-container>
    </section>
  `,
  styles: [`
    .lc-section { margin-bottom: 18px; }
    .section-header {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .07em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1.5px solid #f1f5f9;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #0f172a;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      flex-shrink: 0;
    }
  `],
})
export class FormlySectionWrapperComponent extends FieldWrapper<FormlyFieldConfig> {}
