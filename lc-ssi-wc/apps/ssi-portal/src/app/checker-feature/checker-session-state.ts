import { Injectable, signal } from "@angular/core";
import type { GovernanceTab } from "../app-view.models";
import type { AuditSortDirection } from "../audit-presentation";

/** Retains Checker view choices without retaining server queue data. */
@Injectable({ providedIn: "root" })
export class CheckerSessionState {
  readonly tab = signal<GovernanceTab>("rma");
  readonly sortPath = signal<string | null>(null);
  readonly sortDirection = signal<AuditSortDirection>("asc");
  readonly currentPage = signal(1);
}
