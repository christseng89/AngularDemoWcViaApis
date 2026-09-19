import { Injectable, signal } from "@angular/core";
import type { GovernanceTab } from "../app-view.models";
import type { AuditSortDirection, AuditSortKey } from "../audit-presentation";

/** Keeps only the user's Audit view choices across lazy-route re-entry. */
@Injectable({ providedIn: "root" })
export class AuditSessionState {
  readonly tab = signal<GovernanceTab>("rma");
  readonly sortKey = signal<AuditSortKey>("title");
  readonly sortDirection = signal<AuditSortDirection>("asc");
  readonly indexSortPath = signal<string | null>(null);
}
