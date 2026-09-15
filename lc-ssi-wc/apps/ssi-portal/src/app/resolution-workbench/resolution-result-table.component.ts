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
  readonly rows = computed(() => resolutionResultRows(this.result().fields));
  readonly emptyMessage = computed(() =>
    emptyResolutionMessage(this.result().outcome),
  );
}
