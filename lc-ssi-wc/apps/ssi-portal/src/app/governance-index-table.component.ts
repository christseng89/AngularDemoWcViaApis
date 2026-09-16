import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";

export interface GovernanceIndexColumn {
  label: string;
  path: string;
}

export interface GovernanceIndexRow<T = unknown> {
  id: string;
  cells: readonly string[];
  trailing: readonly string[];
  source: T;
}

@Component({
  selector: "ssi-governance-index-table",
  standalone: true,
  templateUrl: "./governance-index-table.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GovernanceIndexTableComponent {
  readonly ariaLabel = input.required<string>();
  readonly kicker = input.required<string>();
  readonly instruction = input.required<string>();
  readonly emptyText = input.required<string>();
  readonly recordLabel = input("records");
  readonly columns = input.required<readonly GovernanceIndexColumn[]>();
  readonly trailingColumns = input.required<readonly string[]>();
  readonly rows = input.required<readonly GovernanceIndexRow[]>();
  readonly sortPath = input<string | null>(null);
  readonly sortDirection = input<"asc" | "desc">("asc");
  readonly currentPage = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly totalRecords = input.required<number>();
  readonly pageSize = input.required<number>();

  readonly sortRequested = output<string>();
  readonly rowOpened = output<unknown>();
  readonly pageRequested = output<number>();
}
