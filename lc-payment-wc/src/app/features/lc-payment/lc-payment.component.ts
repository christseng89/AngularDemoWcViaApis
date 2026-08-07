import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

// Register all LC Payment web components as a side-effect
import '../../web-components/index';
import { BusinessCaseRunnerComponent } from '../../payment-component/business-case-runner.component';

type ImportTab = 'issue' | 'settlement' | 'sight-payment' | 'sight-settlement';
type ExportTab = 'advise' | 'confirmed' | 'nego' | 'settlement' | 'collection';
type MainTab   = 'import' | 'export' | 'payment-component';

@Component({
  selector: 'app-lc-payment',
  standalone: true,
  imports: [CommonModule, BusinessCaseRunnerComponent],
  templateUrl: './lc-payment.component.html',
  styleUrls: ['./lc-payment.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class LcPaymentComponent implements OnInit {
  activeTab: MainTab   = 'import';
  importTab: ImportTab = 'issue';
  exportTab: ExportTab = 'advise';

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

  ngOnInit(): void {}

  setMainTab(tab: MainTab): void {
    this.activeTab = tab;
  }

  setImportTab(tab: ImportTab): void {
    this.importTab = tab;
  }

  setExportTab(tab: ExportTab): void {
    this.exportTab = tab;
  }
}
