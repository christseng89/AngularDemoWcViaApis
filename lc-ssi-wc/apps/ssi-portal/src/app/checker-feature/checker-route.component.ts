import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  type OnInit,
  viewChild,
} from "@angular/core";
import type { GovernanceTab } from "../app-view.models";
import { GovernanceIndexTableComponent } from "../governance-index-table.component";
import { LoadingStateComponent } from "../loading-state.component";
import type { SsiRow } from "../ssi-maintenance.types";
import { SwiftDataCrudComponent } from "../swift-data-crud.component";
import { CheckerApiService } from "./checker-api.service";
import { CheckerFacade } from "./checker.facade";

@Component({
  selector: "ssi-checker-route",
  standalone: true,
  imports: [
    GovernanceIndexTableComponent,
    LoadingStateComponent,
    SwiftDataCrudComponent,
  ],
  providers: [CheckerApiService, CheckerFacade],
  templateUrl: "./checker-route.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckerRouteComponent implements OnInit {
  readonly checker = inject(CheckerFacade);
  private readonly swiftDataCrud = viewChild(SwiftDataCrudComponent);
  readonly reviewRequested = output<SsiRow>();
  readonly countChanged = output<number>();
  readonly noticeRaised = output<{ kind: "warning"; text: string }>();
  readonly tabChanged = output<void>();

  ngOnInit(): void {
    void this.refresh();
  }

  async canDeactivate(): Promise<boolean> {
    return (await this.swiftDataCrud()?.canDeactivate()) ?? true;
  }

  async refresh(): Promise<void> {
    await this.checker.load();
    this.countChanged.emit(this.checker.count());
    if (this.checker.warning())
      this.noticeRaised.emit({ kind: "warning", text: this.checker.warning() });
  }

  selectTab(tab: GovernanceTab): void {
    this.checker.selectTab(tab);
    this.tabChanged.emit();
  }

  openReview(row: SsiRow): void {
    this.reviewRequested.emit(row);
  }

  async decide(
    row: SsiRow,
    decision: "approve" | "reject",
    reason: string,
  ): Promise<boolean> {
    const completed = await this.checker.decide(row, decision, reason);
    if (completed) this.countChanged.emit(this.checker.count());
    return completed;
  }
}
