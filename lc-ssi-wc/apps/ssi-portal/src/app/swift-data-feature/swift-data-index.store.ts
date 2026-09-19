import { computed, inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { assertMaintenanceServerPage } from "../maintenance-index-server-page";
import { scalarText } from "../scalar-text";
import { SwiftDataApiService } from "./swift-data-api.service";
import { SwiftDataRmaSelection } from "./swift-data-rma-selection";
import type { PagedRows, Row, StatusFilter, UiResource } from "./swift-data.models";

@Injectable()
export class SwiftDataIndexStore {
  private readonly api = inject(SwiftDataApiService);
  private readonly rmaSelection = inject(SwiftDataRmaSelection);
  readonly rows = signal<readonly Row[]>([]);
  readonly statusFilter = signal<StatusFilter>("ACTIVE");
  readonly indexSearch = signal("");
  readonly page = signal(1);
  readonly pageSize = 8;
  readonly totalItems = signal(0);
  readonly serverTotalPages = signal(1);
  readonly sortPath = signal<string | null>(null);
  readonly sortDirection = signal<"asc" | "desc">("asc");
  readonly totalPages = computed(() => this.serverTotalPages());
  readonly sortedRows = computed(() => {
    const path = this.sortPath();
    if (!path) return this.rows();
    const direction = this.sortDirection() === "asc" ? 1 : -1;
    return [...this.rows()].sort(
      (left, right) =>
        this.compare(this.sortValue(left, path), this.sortValue(right, path)) *
        direction,
    );
  });
  readonly pagedRows = computed(() => this.sortedRows());
  sortValue: (row: Row, path: string) => unknown = (row, path) => row[path];

  async refresh(resource: UiResource, resourceId: string): Promise<void> {
    const query = new URLSearchParams({
      page: String(this.page()),
      pageSize: String(this.pageSize),
    });
    if (this.statusFilter() !== "ALL")
      query.set("status", this.statusFilter());
    const search = this.indexSearch().trim();
    if (search) query.set("search", search);
    const response = await firstValueFrom(this.api.rows(resource.endpoint, query));
    const result: PagedRows = Array.isArray(response)
      ? {
          items: response,
          page: 1,
          pageSize: response.length || this.pageSize,
          totalItems: response.length,
          totalPages: 1,
          hasPrevious: false,
          hasNext: false,
        }
      : response;
    assertMaintenanceServerPage(result.items, this.statusFilter());
    this.rows.set(result.items);
    this.rmaSelection.cache(result.items, resourceId);
    this.totalItems.set(result.totalItems);
    this.serverTotalPages.set(result.totalPages);
    this.page.set(result.page);
  }

  reset(checkerMode: boolean): void {
    this.sortPath.set(null);
    this.sortDirection.set("asc");
    this.statusFilter.set(checkerMode ? "PENDING_APPROVAL" : "ACTIVE");
    this.indexSearch.set("");
    this.page.set(1);
  }

  search(value: string): void {
    this.indexSearch.set(value);
    this.page.set(1);
  }

  movePage(delta: number): void {
    this.page.set(
      Math.min(this.totalPages(), Math.max(1, this.page() + delta)),
    );
  }

  toggleSort(path: string): void {
    if (this.sortPath() === path)
      this.sortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.sortPath.set(path);
      this.sortDirection.set("asc");
    }
  }

  sortIndicator(path: string): string {
    if (this.sortPath() !== path) return "";
    return this.sortDirection() === "asc" ? "▲" : "▼";
  }

  private compare(left: unknown, right: unknown): number {
    if (typeof left === "number" && typeof right === "number")
      return left - right;
    return scalarText(left).localeCompare(scalarText(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
}
