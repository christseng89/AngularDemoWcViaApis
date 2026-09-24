import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import type { ResolutionPageExecutionResult } from "@ssi/contracts";
import {
  emptyResolutionMessage,
  resolutionResultRows,
  resolutionRouteProjectionRows,
  resolutionRouteSummary,
} from "./resolution-result.presenter";

@Component({
  selector: "ssi-resolution-result-table",
  standalone: true,
  templateUrl: "./resolution-result-table.component.html",
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolutionResultTableComponent {
  readonly result = input.required<ResolutionPageExecutionResult>();
  readonly rows = computed(() => {
    const fieldRows = resolutionResultRows(this.result().fields);
    if (fieldRows.length > 0) return fieldRows;
    return resolutionRouteProjectionRows(this.result().settlementRoute);
  });
  readonly route = computed(() =>
    resolutionRouteSummary(
      this.result().outputs,
      this.result().settlementRoute,
    ),
  );
  readonly emptyMessage = computed(() =>
    emptyResolutionMessage(this.result().outcome),
  );
}
