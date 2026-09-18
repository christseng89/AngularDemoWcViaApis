export interface CounterpartyDirectoryItem {
  counterpartyId: string;
  bic?: string;
  name: string;
  country: string;
  dataClass?: string;
  partyType?: "BANK" | "CUSTOMER";
}

export interface CounterpartySsiSummarySource {
  counterpartyId: string;
  ssiCount: number;
  currencyCount: number;
  statuses: readonly string[];
  lastVerified: string;
}

export interface CounterpartyInboxItem extends CounterpartyDirectoryItem {
  ssiCount: number;
  currencyCount: number;
  statuses: readonly string[];
  lastVerified: string;
  evidenceSummary: string;
}

export type SortDirection = "ASC" | "DESC";
export type CounterpartyInboxSort =
  | "BIC_NAME"
  | "COUNTRY"
  | "SSI_COUNT"
  | "CURRENCY_COUNT"
  | "STATUS_EVIDENCE"
  | "LAST_VERIFIED";
export type SsiOwnershipSort =
  | "SSI_ID"
  | "BOOKING_ENTITY"
  | "ACCOUNT_SERVICER"
  | "ACCOUNT_REF"
  | "CURRENCY"
  | "USE_CASE"
  | "INSTRUCTED_ROUTE"
  | "ROUTE_PRIORITY"
  | "EFFECTIVE_PERIOD"
  | "STATUS"
  | "VERSION"
  | "REQUEST_TYPE"
  | "REVISION_STATUS"
  | "SUBMIT"
  | "EDIT_REVISE"
  | "SUPPRESS"
  | "REVOKE_DRAFT";

type Comparator<T> = (left: T, right: T) => number;

const stableText = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});
const compareText = (left: unknown, right: unknown): number =>
  stableText.compare(scalarText(left), scalarText(right));
const compareDate = (left: unknown, right: unknown): number => {
  const leftTime = Date.parse(scalarText(left));
  const rightTime = Date.parse(scalarText(right));
  return (
    (Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime) -
    (Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime)
  );
};

export function buildCounterpartyInbox(
  parties: readonly CounterpartyDirectoryItem[],
  ssis: readonly CounterpartySsiSummarySource[],
): readonly CounterpartyInboxItem[] {
  return parties.map((party) => {
    const coverage = ssis.find(
      (item) => item.counterpartyId === (party.bic || party.counterpartyId),
    );
    const ssiCount = coverage?.ssiCount ?? 0;
    const statuses = coverage?.statuses ?? [];
    let evidenceSummary = "NO SSI COVERAGE";
    if (ssiCount) {
      const recordLabel = ssiCount === 1 ? "record" : "records";
      evidenceSummary = `${statuses.join(" · ")} · ${ssiCount} governed ${recordLabel}`;
    }
    return {
      ...party,
      ssiCount,
      currencyCount: coverage?.currencyCount ?? 0,
      statuses,
      lastVerified: coverage?.lastVerified ?? "",
      evidenceSummary,
    };
  });
}

export function queryCounterpartyInbox(
  items: readonly CounterpartyInboxItem[],
  query: string,
  sort: CounterpartyInboxSort,
  direction: SortDirection = "ASC",
): readonly CounterpartyInboxItem[] {
  const term = query.trim().toLocaleUpperCase();
  const filtered = term
    ? items.filter((item) =>
        `${item.counterpartyId} ${item.bic ?? ""} ${item.name} ${item.country}`
          .toLocaleUpperCase()
          .includes(term),
      )
    : [...items];
  const factor = direction === "ASC" ? 1 : -1;
  const comparators: Readonly<
    Record<CounterpartyInboxSort, Comparator<CounterpartyInboxItem>>
  > = {
    BIC_NAME: (left, right) =>
      compareText(
        `${left.counterpartyId} ${left.name}`,
        `${right.counterpartyId} ${right.name}`,
      ),
    COUNTRY: (left, right) => compareText(left.country, right.country),
    SSI_COUNT: (left, right) => left.ssiCount - right.ssiCount,
    CURRENCY_COUNT: (left, right) => left.currencyCount - right.currencyCount,
    STATUS_EVIDENCE: (left, right) =>
      compareText(left.evidenceSummary, right.evidenceSummary),
    LAST_VERIFIED: (left, right) =>
      compareDate(left.lastVerified, right.lastVerified),
  };
  return filtered.sort((left, right) => {
    const compared = comparators[sort](left, right);
    return (
      compared * factor ||
      compareText(left.counterpartyId, right.counterpartyId)
    );
  });
}

export interface SortableSsiRow {
  id: string;
  counterpartyId?: string;
  scope: string;
  status: string;
  version: number;
  ownerParty?: string;
  amendmentOfId?: string;
  changeType?: "REVISION" | "SUPPRESSION";
  hasOpenRevision?: boolean;
  openRevisionStatus?: string;
  currentStatus?: "EMPTY" | "IN_PROGRESS" | "DRAFTED" | "SUPPRESSED";
  route: Readonly<Record<string, string>>;
}

export function sortSsiOwnershipRows<T extends SortableSsiRow>(
  rows: readonly T[],
  sort: SsiOwnershipSort,
  direction: SortDirection,
): readonly T[] {
  const factor = direction === "ASC" ? 1 : -1;
  const routeComparator =
    (
      compare: (
        left: T["route"],
        right: T["route"],
        leftRow: T,
        rightRow: T,
      ) => number,
    ): Comparator<T> =>
    (left, right) =>
      compare(left.route, right.route, left, right);
  const comparators: Readonly<Record<SsiOwnershipSort, Comparator<T>>> = {
    SSI_ID: (left, right) =>
      compareText(
        left.counterpartyId ?? left.id,
        right.counterpartyId ?? right.id,
      ),
    BOOKING_ENTITY: routeComparator((left, right, leftRow, rightRow) =>
      compareText(
        left["bookingEntity"] || leftRow.ownerParty,
        right["bookingEntity"] || rightRow.ownerParty,
      ),
    ),
    ACCOUNT_SERVICER: routeComparator((left, right, leftRow, rightRow) =>
      compareText(
        `${left["accountOwner"] || leftRow.ownerParty} ${left["accountWithBic"]}`,
        `${right["accountOwner"] || rightRow.ownerParty} ${right["accountWithBic"]}`,
      ),
    ),
    ACCOUNT_REF: routeComparator((left, right) =>
      compareText(left["accountId"], right["accountId"]),
    ),
    CURRENCY: routeComparator((left, right) =>
      compareText(left["currency"], right["currency"]),
    ),
    USE_CASE: routeComparator((left, right, leftRow, rightRow) =>
      compareText(
        `${left["businessFunction"] || leftRow.scope} ${left["instructionPurpose"]}`,
        `${right["businessFunction"] || rightRow.scope} ${right["instructionPurpose"]}`,
      ),
    ),
    INSTRUCTED_ROUTE: routeComparator((left, right) =>
      compareText(left["accountWithBic"], right["accountWithBic"]),
    ),
    ROUTE_PRIORITY: routeComparator(
      (left, right) =>
        compareText(
          left["routePreference"] || left["routeType"],
          right["routePreference"] || right["routeType"],
        ) ||
        Number(left["priority"] || Number.MAX_SAFE_INTEGER) -
          Number(right["priority"] || Number.MAX_SAFE_INTEGER),
    ),
    EFFECTIVE_PERIOD: routeComparator((left, right) =>
      compareDate(left["validTo"], right["validTo"]),
    ),
    STATUS: (left, right) => compareText(left.status, right.status),
    VERSION: (left, right) => left.version - right.version,
    REQUEST_TYPE: (left, right) =>
      compareText(
        left.changeType ?? (left.amendmentOfId ? "REVISION" : "NEW"),
        right.changeType ?? (right.amendmentOfId ? "REVISION" : "NEW"),
      ),
    REVISION_STATUS: (left, right) =>
      compareText(left.currentStatus, right.currentStatus),
    SUBMIT: (left, right) =>
      Number(left.status === "DRAFT") - Number(right.status === "DRAFT"),
    EDIT_REVISE: (left, right) =>
      Number(
        left.status === "DRAFT" ||
          (left.status === "ACTIVE" && left.currentStatus === "EMPTY"),
      ) -
      Number(
        right.status === "DRAFT" ||
          (right.status === "ACTIVE" && right.currentStatus === "EMPTY"),
      ),
    SUPPRESS: (left, right) =>
      Number(left.status === "ACTIVE" && left.currentStatus === "EMPTY") -
      Number(right.status === "ACTIVE" && right.currentStatus === "EMPTY"),
    REVOKE_DRAFT: (left, right) =>
      Number(left.status === "DRAFT") - Number(right.status === "DRAFT"),
  };
  return [...rows].sort((left, right) => {
    const compared = comparators[sort](left, right);
    return compared * factor || compareText(left.id, right.id);
  });
}

export function pageItems<T>(
  items: readonly T[],
  page: number,
  pageSize = 10,
): readonly T[] {
  const safePage = Math.max(
    1,
    Math.min(page, Math.max(1, Math.ceil(items.length / pageSize))),
  );
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}
import { scalarText } from "./scalar-text";
