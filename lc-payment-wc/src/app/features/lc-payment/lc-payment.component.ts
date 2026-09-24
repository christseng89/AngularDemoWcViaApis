import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

// Register all LC Payment web components as a side-effect
import '../../web-components/index';
import { BusinessCaseRunnerComponent } from '../../payment-component/business-case-runner.component';
import { ThemePreference, ThemeService } from '../../core/theme/theme.service';

type ImportTab = 'issue' | 'settlement' | 'sight-payment' | 'sight-settlement';
type ExportTab = 'advise' | 'confirmed' | 'nego' | 'settlement' | 'collection';
type MainTab   = 'import' | 'export' | 'payment-component';

@Component({
    selector: 'app-lc-payment',
    imports: [CommonModule, BusinessCaseRunnerComponent],
    templateUrl: './lc-payment.component.html',
    styleUrls: ['./lc-payment.component.scss'],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LcPaymentComponent {
  readonly theme = inject(ThemeService);

  activeTab: MainTab   = 'payment-component';
  importTab: ImportTab = 'issue';
  exportTab: ExportTab = 'advise';

  readonly themeOptions: { id: ThemePreference; label: string; icon: string }[] = [
    { id: 'system', label: 'System', icon: '◐' },
    { id: 'light', label: 'Light', icon: '☀' },
    { id: 'dark', label: 'Dark', icon: '☾' },
  ];

  readonly importTabs: { id: ImportTab; label: string }[] = [
    { id: 'issue',            label: 'LC Issue'           },
    { id: 'settlement',       label: 'Settlement'         },
    { id: 'sight-payment',    label: 'Sight Payment'      },
    { id: 'sight-settlement', label: 'Sight Settlement'   },
  ];

  readonly exportTabs: { id: ExportTab; label: string }[] = [
    { id: 'advise',     label: 'LC Advise'    },
    { id: 'confirmed',  label: 'Confirmed'    },
    { id: 'nego',       label: 'Negotiation'  },
    { id: 'settlement', label: 'Settlement'   },
    { id: 'collection', label: 'On Collection' },
  ];

  setMainTab(tab: MainTab): void {
    this.activeTab = tab;
  }

  setTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference);
  }

  setImportTab(tab: ImportTab): void {
    this.importTab = tab;
  }

  setExportTab(tab: ExportTab): void {
    this.exportTab = tab;
  }
}
