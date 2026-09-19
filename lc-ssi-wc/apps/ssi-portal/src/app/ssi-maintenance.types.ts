import type { CurrentStatus } from "./current-status-contract";

export interface SsiApplicability {
  id: string;
  ssiId: string;
  consumer: string;
  product: string;
  businessFunction: string;
  paymentLeg: string;
  direction: string;
  status: string;
  validFrom: string;
  validTo: string;
  version: number;
}

export interface SsiRow {
  id: string;
  counterpartyId: string;
  scope: string;
  status: string;
  maker: string;
  checker?: string;
  route: Record<string, string>;
  version: number;
  amendmentOfId?: string;
  hasOpenRevision?: boolean;
  openRevisionId?: string;
  openRevisionStatus?: "WIP" | "DRAFT" | "PENDING_APPROVAL" | "APPROVED";
  openRevisionChangeType?: "REVISION" | "SUPPRESSION";
  currentStatus?: CurrentStatus;
  changeType?: "REVISION" | "SUPPRESSION";
  suppressionReason?: string;
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
  ownershipType?: "OWN" | "COUNTERPARTY";
  ownerParty?: string;
  publisherParty?: string;
  applicability?: readonly SsiApplicability[];
}

export interface SsiPage {
  items: readonly SsiRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  distinctCurrencyCount: number;
}

export interface SsiIndexSummary {
  currentOwn: number;
  pendingApproval: number;
  active: number;
  archived: number;
}
