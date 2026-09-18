import type { GovernanceIndexColumn } from "./governance-index-table.component";
import type { SortDirection } from "./ssi-maintenance-index";
import type { GovernanceTab, ThemeMode } from "./app-view.models";

type AriaSortDirection = "ascending" | "descending" | "none";

const AUDIT_INDEX_COLUMNS: Record<
  GovernanceTab,
  readonly GovernanceIndexColumn[]
> = {
  rma: [
    { label: "Own BIC", path: "ownBic" },
    { label: "Counterparty BIC", path: "counterpartyBic" },
    { label: "Service", path: "service" },
    { label: "Direction", path: "direction" },
    { label: "Messages", path: "messageTypes" },
    { label: "Status", path: "status" },
    { label: "Version", path: "version" },
  ],
  entity: [
    { label: "Code", path: "branchCode" },
    { label: "Name", path: "branchName" },
    { label: "Legal Entity Code", path: "legalEntityCode" },
    { label: "Legal Entity Name", path: "legalEntityName" },
    { label: "Country", path: "countryCode" },
    { label: "Effective From", path: "validFrom" },
    { label: "Effective To", path: "validTo" },
    { label: "Status", path: "status" },
    { label: "Version", path: "version" },
  ],
  nostro: [
    { label: "Legal Entity", path: "ownLegalEntityId" },
    { label: "Servicer BIC", path: "accountServicerBic" },
    { label: "Currency", path: "currency" },
    { label: "Masked Account", path: "maskedAccountRef" },
    { label: "Purpose", path: "purpose" },
    { label: "Priority", path: "priority" },
    { label: "Status", path: "status" },
    { label: "Version", path: "version" },
  ],
  ssi: [
    { label: "Booking / Legal Entity", path: "route.bookingEntity|ownerParty" },
    {
      label: "Account Owner / Servicer",
      path: "route.accountOwner|route.accountWithBic",
    },
    { label: "Account Ref", path: "route.accountId" },
    { label: "Currency", path: "route.currency" },
    {
      label: "Route Class / Priority",
      path: "route.routePreference|route.priority",
    },
    { label: "Effective Period", path: "route.validFrom|route.validTo" },
    { label: "Status", path: "status" },
    { label: "Version", path: "version" },
    { label: "Request Type", path: "__requestType" },
  ],
};

export const auditIndexColumns = (
  tab: GovernanceTab,
): readonly GovernanceIndexColumn[] => AUDIT_INDEX_COLUMNS[tab];

export const localCalendarDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function paymentSourceLabel(consumer: string): string {
  if (consumer === "CENTRAL_PAYMENT") return "Payment";
  if (consumer === "TREASURY") return "Treasury";
  return "Trade Finance";
}

export function ariaSortDirection(
  active: boolean,
  direction: SortDirection,
): AriaSortDirection {
  if (!active) return "none";
  return direction === "ASC" ? "ascending" : "descending";
}

export function sortDirectionIndicator(
  active: boolean,
  direction: SortDirection,
): string {
  if (!active) return "";
  return direction === "ASC" ? "↑" : "↓";
}

export function activeTheme(
  mode: ThemeMode,
  prefersDark: boolean,
): "light" | "dark" {
  if (mode !== "system") return mode;
  return prefersDark ? "dark" : "light";
}
