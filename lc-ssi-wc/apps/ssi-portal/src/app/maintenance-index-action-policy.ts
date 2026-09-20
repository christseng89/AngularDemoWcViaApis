export type MaintenanceIndexTab = "ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL";
export const showsRequestTypeColumn = (
  tab: MaintenanceIndexTab | "PENDING_APPROVAL",
): boolean => tab !== "DRAFT";
export type MaintenanceIndexResourceId = "rma" | "entity" | "nostro" | "ssi";
export type MaintenanceIndexActionId =
  "REVISE" | "SUPPRESS" | "SUBMIT" | "EDIT" | "REVOKE_DRAFT";
export interface MaintenanceIndexActionColumn {
  readonly id: MaintenanceIndexActionId;
  readonly label: string;
}
export interface BoundMaintenanceIndexActionColumn extends MaintenanceIndexActionColumn {
  readonly sortPath: string;
  readonly cellClass: string;
}
export interface MaintenanceIndexRowPresentation {
  readonly status: string;
  readonly changeType?: unknown;
  readonly currentStatus?: "EMPTY" | "IN_PROGRESS" | "DRAFTED" | "SUPPRESSED";
}
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}
class PredicateSpecification<T> implements Specification<T> {
  constructor(private readonly predicate: (candidate: T) => boolean) {}
  isSatisfiedBy(candidate: T) {
    return this.predicate(candidate);
  }
  and(other: Specification<T>): Specification<T> {
    return new PredicateSpecification(
      (candidate) =>
        this.isSatisfiedBy(candidate) && other.isSatisfiedBy(candidate),
    );
  }
}
const ACTIVE_COLUMNS = [
  { id: "REVISE", label: "Revise" },
  { id: "SUPPRESS", label: "Suppress" },
] as const;
const DRAFT_COLUMNS = [
  { id: "SUBMIT", label: "Submit" },
  { id: "EDIT", label: "Edit" },
  { id: "REVOKE_DRAFT", label: "Revoke" },
] as const;
export class MaintenanceIndexActionPolicy {
  private readonly active =
    new PredicateSpecification<MaintenanceIndexRowPresentation>(
      (row) => row.status === "ACTIVE",
    );
  private readonly draft =
    new PredicateSpecification<MaintenanceIndexRowPresentation>(
      (row) => row.status === "DRAFT",
    );
  private readonly unlocked =
    new PredicateSpecification<MaintenanceIndexRowPresentation>(
      (row) => row.currentStatus === "EMPTY",
    );
  private readonly ordinary =
    new PredicateSpecification<MaintenanceIndexRowPresentation>(
      (row) => row.changeType !== "SUPPRESSION",
    );
  private readonly specifications: Readonly<
    Record<
      MaintenanceIndexActionId,
      Specification<MaintenanceIndexRowPresentation>
    >
  > = {
    REVISE: this.active.and(this.unlocked),
    SUPPRESS: this.active.and(this.unlocked),
    SUBMIT: this.draft,
    EDIT: this.draft.and(this.ordinary),
    REVOKE_DRAFT: this.draft,
  };
  columnsFor(
    tab: MaintenanceIndexTab,
  ): readonly MaintenanceIndexActionColumn[] {
    return tab === "ACTIVE"
      ? ACTIVE_COLUMNS
      : tab === "DRAFT"
        ? DRAFT_COLUMNS
        : [];
  }
  isPresented(
    action: MaintenanceIndexActionId,
    row: MaintenanceIndexRowPresentation,
  ) {
    return this.specifications[action].isSatisfiedBy(row);
  }
  visibleActionIds(
    tab: MaintenanceIndexTab,
    row: MaintenanceIndexRowPresentation,
  ): MaintenanceIndexActionId[] {
    return this.columnsFor(tab)
      .filter(({ id }) => this.isPresented(id, row))
      .map(({ id }) => id);
  }
}
type Binding = { readonly sortPath: string; readonly cellClass: string };
export interface MaintenanceIndexActionAdapter {
  readonly resourceId: MaintenanceIndexResourceId;
  columnsFor(
    tab: MaintenanceIndexTab,
  ): readonly BoundMaintenanceIndexActionColumn[];
  isPresented(
    action: MaintenanceIndexActionId,
    row: MaintenanceIndexRowPresentation,
  ): boolean;
  isVisibleSort(tab: MaintenanceIndexTab, sortPath: string | null): boolean;
}
class PolicyBackedMaintenanceIndexActionAdapter implements MaintenanceIndexActionAdapter {
  private readonly policy = new MaintenanceIndexActionPolicy();
  constructor(
    readonly resourceId: MaintenanceIndexResourceId,
    private readonly bindings: Readonly<
      Record<MaintenanceIndexActionId, Binding>
    >,
  ) {}
  columnsFor(tab: MaintenanceIndexTab) {
    return this.policy
      .columnsFor(tab)
      .map((column) => ({ ...column, ...this.bindings[column.id] }));
  }
  isPresented(
    action: MaintenanceIndexActionId,
    row: MaintenanceIndexRowPresentation,
  ) {
    return this.policy.isPresented(action, row);
  }
  isVisibleSort(tab: MaintenanceIndexTab, sortPath: string | null) {
    if (
      !showsRequestTypeColumn(tab) &&
      (sortPath === "__requestType" || sortPath === "REQUEST_TYPE")
    )
      return false;
    if (
      !sortPath ||
      !Object.values(this.bindings).some(
        (binding) => binding.sortPath === sortPath,
      )
    )
      return true;
    return this.columnsFor(tab).some((column) => column.sortPath === sortPath);
  }
}
const SHARED_BINDINGS = {
  REVISE: { sortPath: "__editAction", cellClass: "edit-action-cell" },
  SUPPRESS: { sortPath: "__revokeAction", cellClass: "revoke-action-cell" },
  SUBMIT: { sortPath: "__workflowAction", cellClass: "workflow-action-cell" },
  EDIT: { sortPath: "__editAction", cellClass: "edit-action-cell" },
  REVOKE_DRAFT: {
    sortPath: "__revokeDraftAction",
    cellClass: "revoke-action-cell",
  },
} as const;
const SSI_BINDINGS = {
  REVISE: { sortPath: "EDIT_REVISE", cellClass: "edit-action-cell" },
  SUPPRESS: { sortPath: "SUPPRESS", cellClass: "revoke-action-cell" },
  SUBMIT: { sortPath: "SUBMIT", cellClass: "submit-action-cell" },
  EDIT: { sortPath: "EDIT_REVISE", cellClass: "edit-action-cell" },
  REVOKE_DRAFT: { sortPath: "REVOKE_DRAFT", cellClass: "revoke-action-cell" },
} as const;
type Factory = () => MaintenanceIndexActionAdapter;
export const MAINTENANCE_INDEX_ACTION_REGISTRY: Readonly<
  Record<MaintenanceIndexResourceId, Factory>
> = {
  rma: () =>
    new PolicyBackedMaintenanceIndexActionAdapter("rma", SHARED_BINDINGS),
  entity: () =>
    new PolicyBackedMaintenanceIndexActionAdapter("entity", SHARED_BINDINGS),
  nostro: () =>
    new PolicyBackedMaintenanceIndexActionAdapter("nostro", SHARED_BINDINGS),
  ssi: () => new PolicyBackedMaintenanceIndexActionAdapter("ssi", SSI_BINDINGS),
};
export const createMaintenanceIndexActionAdapter = (
  resourceId: string,
): MaintenanceIndexActionAdapter => {
  if (!Object.hasOwn(MAINTENANCE_INDEX_ACTION_REGISTRY, resourceId))
    throw new Error(`Unsupported maintenance index resource: ${resourceId}`);
  return MAINTENANCE_INDEX_ACTION_REGISTRY[
    resourceId as MaintenanceIndexResourceId
  ]();
};
