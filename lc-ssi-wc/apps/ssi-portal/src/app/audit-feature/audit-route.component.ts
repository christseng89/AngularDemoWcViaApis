import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  type OnInit,
} from "@angular/core";
import type { GovernanceTab } from "../app-view.models";
import type {
  AuditPresentation,
  AuditSsiSnapshot,
} from "../audit-presentation";
import { GovernanceIndexTableComponent } from "../governance-index-table.component";
import { GovernedRecordViewComponent } from "../governed-record-view.component";
import { OperationalIssueComponent } from "../operational-issue.component";
import { AuditApiService } from "./audit-api.service";
import { AuditFacade } from "./audit.facade";

@Component({
  selector: "ssi-audit-route",
  standalone: true,
  imports: [
    GovernanceIndexTableComponent,
    GovernedRecordViewComponent,
    OperationalIssueComponent,
  ],
  providers: [AuditApiService, AuditFacade],
  templateUrl: "./audit-route.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(document:keydown.escape)": "closeDetail()" },
})
export class AuditRouteComponent implements OnInit {
  readonly audit = inject(AuditFacade);
  readonly detailOpenChange = output<boolean>();
  readonly ssiDetailRequested = output<AuditSsiSnapshot>();
  readonly tabChanged = output<void>();

  ngOnInit(): void {
    void this.audit.load();
  }

  setCurrencyOptions(
    options: readonly { code: string; decimals: number }[],
  ): void {
    this.audit.currencyOptions.set(options);
  }

  selectTab(tab: GovernanceTab): void {
    this.closeDetail();
    this.tabChanged.emit();
    void this.audit.selectTab(tab);
  }

  openDetail(detail: AuditPresentation): void {
    const snapshot = this.audit.openDetail(detail);
    if (snapshot) this.ssiDetailRequested.emit(snapshot);
    else this.detailOpenChange.emit(true);
  }

  closeDetail(): void {
    if (!this.audit.detail()) return;
    this.audit.detail.set(null);
    this.detailOpenChange.emit(false);
  }
}
