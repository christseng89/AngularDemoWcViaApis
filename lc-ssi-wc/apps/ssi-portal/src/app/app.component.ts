import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
  viewChild,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { scalarText } from "./scalar-text";
import { DOCUMENT } from "@angular/common";
import { ReactiveFormsModule, FormGroup } from "@angular/forms";
import { FormlyForm, type FormlyFieldConfig } from "@ngx-formly/core";
import { readonlyFormFields, ssiFormModel } from "./ssi-form-presentation";
import { firstValueFrom } from "rxjs";
import { SwiftDataCrudComponent } from "./swift-data-crud.component";
import {
  createMaintenanceIndexActionAdapter,
  type MaintenanceIndexActionId,
} from "./maintenance-index-action-policy";
import { assertMaintenanceServerPage } from "./maintenance-index-server-page";
import {
  currentStatusLabel,
  type CurrentStatus,
} from "./current-status-contract";
import { GovernedRecordViewComponent } from "./governed-record-view.component";
import { presentOfficialFieldName } from "./official-field-name";
import { hasManualRouteOverride } from "./resolution-route-selection";
import {
  DEMO_CURRENCY_AGENTS,
  DEMO_SUGGESTION_CURRENCIES,
  type DemoFinSuggestionCandidate,
} from "./demo-suggestion-candidates";
import {
  analyzeFin5xSupport,
  isVisibleSsiResolutionRow,
} from "./fin-5x-route-analysis";
import {
  buildCounterpartyInbox,
  pageItems,
  queryCounterpartyInbox,
  sortSsiOwnershipRows,
  type CounterpartyInboxSort,
  type CounterpartySsiSummarySource,
  type SortDirection,
  type SsiOwnershipSort,
} from "./ssi-maintenance-index";
import {
  paymentSettlementProfile,
  renderPaymentSettlement,
  type CanonicalPaymentSettlement,
} from "@ssi/payment-settlement-profile";
import {
  executableCounterpartySsiProfiles,
  filterPaymentMessageIndex,
  paymentMessageStatusLabel,
  sortPaymentMessageIndex,
  type PaymentMessageIndexItem,
  type PaymentMessageIndexResponse,
  type PaymentMessageIndexSortKey,
} from "./payment-message-index";
import {
  PAYMENT_MESSAGE_SCENARIOS,
  bankIdentityByServiceId,
  counterpartySsiPaymentScenarios,
  paymentMessageForScenario,
  sortPaymentMessageScenarios,
  type PaymentMessageScenario,
} from "./payment-message-scenarios";
import { ssiAccountReferenceCopy } from "./ssi-account-reference-copy";
import {
  contractAlternatives,
  contractCandidates,
  contractChosenRoute,
  contractDecision,
  contractEvidence,
  contractOutput,
  isMt2ResolutionContract,
  mt2ResolutionContractFromError,
  presentResolutionError,
  type Mt2ResolutionContract,
} from "./mt2-resolution-presentation";
import {
  presentOperationalIssue,
  presentResolutionIssue,
} from "./operational-issue";
import { OperationalIssueComponent } from "./operational-issue.component";
import { SettingsPageComponent } from "./settings-page.component";
import { AlertComponent } from "./alert.component";
import { PageDefinitionIndexWorkspaceComponent } from "./resolution-workbench/page-definition-index-workspace.component";
import {
  BankServicePickerDialogComponent,
  type BankServicePickerItem,
} from "./bank-service-picker-dialog.component";
import {
  auditGovernedSnapshot,
  auditPage,
  presentAuditEvent,
  auditSsiSnapshot,
  sortAuditRows,
  type AuditPresentation,
  type AuditRow,
  type AuditSortDirection,
  type AuditSortKey,
} from "./audit-presentation";
import {
  GovernanceIndexTableComponent,
  type GovernanceIndexColumn,
} from "./governance-index-table.component";
import { LoadingStateComponent } from "./loading-state.component";
import { DeferredFeatureShellComponent } from "./deferred-feature-shell.component";

type View =
  | "dashboard"
  | "maker"
  | "checker"
  | "resolver"
  | "treasury"
  | "tradefinance"
  | "swiftdata"
  | "audit"
  | "settings";
type BicTarget =
  "counterpartyId" | "beneficiaryBic" | "accountWithBic" | "intermediaryBic";
type MessageFormat = "FIN_LIKE" | "MX_JSON";
type ThemeMode = "system" | "light" | "dark";
type GovernanceTab = "rma" | "entity" | "nostro" | "ssi";
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

const localCalendarDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface SsiRow {
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
interface SsiPage {
  items: readonly SsiRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  distinctCurrencyCount: number;
}
interface SsiIndexSummary {
  currentOwn: number;
  pendingApproval: number;
  active: number;
  archived: number;
}
interface CheckerResourceContract {
  id: string;
  label: string;
  endpoint: string;
  fields?: readonly AuditParameterField[];
  "x-lifecycle": readonly string[];
}
interface AuditParameterField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  inputType?: string;
  description?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: readonly string[];
  optionsSource?: string;
}
interface AuditMessageTypeChanges {
  readonly unchanged: readonly string[];
  readonly added: readonly string[];
  readonly suppressed: readonly string[];
}
interface CheckerOpenApiContract {
  "x-ui-resources": readonly CheckerResourceContract[];
}
interface GovernedPendingRow {
  resourceId: string;
  resourceLabel: string;
  endpoint: string;
  id: string;
  status: string;
  maker: string;
  version: number;
}
interface CurrencyReference {
  code: string;
  decimals: number;
  standard: string;
}
interface CountryReference {
  code: string;
  name: string;
  standard: string;
  status: string;
}
interface BookingBranchReference {
  branchCode: string;
  branchName: string;
  legalEntityCode: string;
  legalEntityName: string;
  countryCode: string;
  status: string;
  validFrom: string;
  validTo: string;
}
interface ClearingSystemReference {
  code: string;
  name: string;
  supportedCurrency: string;
  settlementCountry: string;
  marketScope: "DOMESTIC" | "MARKET_SPECIFIC" | "PAN_REGIONAL";
  eligibleCountries: readonly string[];
  settlementMarket: string;
  paymentServiceLevel: "HIGH_VALUE" | "RETAIL" | "INSTANT";
  schemeType: "RTGS" | "LVPS" | "ACH" | "IPS";
  status: string;
  validFrom: string;
  validTo: string;
  legacyAliases?: readonly string[];
}
interface BankReference {
  bankServiceId: string;
  bic: string;
  name: string;
  country: string;
  city?: string;
  addressRef: string;
  standard: string;
  dataClass?: string;
  partyType?: "BANK" | "CUSTOMER";
}
interface OwnNostroReference {
  id: string;
  version: number;
  status: string;
  ownLegalEntityId: string;
  allowedBookingEntities?: readonly string[];
  accountServicerBic: string;
  currency: string;
  accountReference?: string;
  maskedAccountRef: string;
  purpose: string;
  validFrom: string;
  validTo: string;
}
interface BankPage {
  items: readonly BankReference[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disclaimer?: string;
}
interface CustomerReference {
  customerId: string;
  name: string;
  country: string;
  swiftBic?: string;
}
interface CustomerPage {
  items: readonly CustomerReference[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disclaimer?: string;
}
interface AuditLifecycleHealth {
  status: "UP" | "DOWN";
  onlineQueryDays: number;
  archiveAfterDays: number;
  archiveRetentionDays: number;
  scheduleIntervalHours: number;
}
interface CounterpartyReference {
  counterpartyId: string;
  bic?: string;
  name: string;
  country: string;
  partyType: "BANK" | "CUSTOMER";
  beneficiaryAccountReference?: string;
  address?: string;
}
interface ResolutionEvidence {
  criterion: string;
  outcome: "PASS" | "FAIL" | "NOT_EVALUATED";
  expected: string;
  actual: string;
  reasonCode: string;
}
interface SsiApplicability {
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
interface RankedResolutionRoute {
  ssiId: string;
  ssiVersion: number;
  counterpartyId: string;
  route: Record<string, string>;
  applicability: SsiApplicability;
  fallbackTier: number;
  rank: readonly number[];
  evidence: readonly ResolutionEvidence[];
}
interface ExcludedResolutionRoute {
  ssiId: string;
  counterpartyId: string;
  route: Record<string, string>;
  evidence: readonly ResolutionEvidence[];
}
interface ResolutionResponse {
  useCase: "PAYMENT_SSI";
  usage: "EXECUTABLE_SETTLEMENT";
  paymentExecutable: false;
  preSettlement: true;
  attemptId: string;
  requestHash: string;
  decision:
    "RESOLVED" | "MULTIPLE_CANDIDATES" | "NO_SSI_FOUND" | "NO_ELIGIBLE_ROUTE";
  recommendedRoute?: RankedResolutionRoute;
  alternatives: readonly RankedResolutionRoute[];
  excludedRoutes: readonly ExcludedResolutionRoute[];
  explanation: string;
  canonicalSettlementPreview?: CanonicalPaymentSettlement;
}
interface ResolutionConfirmation {
  useCase: "PAYMENT_SSI";
  usage: "EXECUTABLE_SETTLEMENT";
  paymentExecutable: true;
  preSettlement: true;
  reconciliationSupported: false;
  decision: "CONFIRMED";
  ssiId: string;
  ssiVersion: number;
  effectivePeriod: Record<string, string>;
  applicability: SsiApplicability & { evidence: readonly ResolutionEvidence[] };
  route: Record<string, string>;
  actualReceiverBic: string;
  rmaEvidence: Record<string, unknown>;
  nostroEvidence: Record<string, unknown>;
  resolutionToken: string;
  snapshotHash: string;
  canonicalSettlement: CanonicalPaymentSettlement;
}
interface ExtractedRole {
  role: string;
  sourcePath: string;
  value: string;
  reusableCandidate: boolean;
}
interface Diagnostic {
  code: string;
  severity: string;
  path: string;
}
interface ExtractionResponse {
  message: {
    standardsRelease: string;
    messageType: string;
    direction: string;
    businessFunction: string;
  };
  roles: readonly ExtractedRole[];
  diagnostics: readonly Diagnostic[];
}
interface GenerationResponse {
  usage: "REFERENCE_ONLY";
  paymentExecutable: false;
  preSettlement: true;
  reconciliationSupported: false;
  watermark: string;
  fields: Record<string, string>;
  suggestions: readonly {
    tag: string;
    sequence?: string;
    option?: string;
    canonicalRole: string;
    officialFieldName?: string;
    value: string;
    reusableCandidate: boolean;
    provenance: {
      source: string;
      standardsRelease: string;
      messageType: string;
      businessFunction: string;
      transactionReference: string;
      sourceSsiId?: string;
      sourceRecordId?: string;
      ownerSide?: string;
    };
    confidence: string;
  }[];
  diagnostics: readonly string[];
  profileEvidence?: {
    status: "FIELD_PROFILE_PROVEN" | "PENDING_EVIDENCE";
    sourceArtifactIds: readonly string[];
    evidencePages: readonly number[];
    reason: string;
  };
  routeDecision?: {
    status: "EVIDENCED";
    accountRelationship: "DIRECT_ACCOUNT";
    evidenceId: string;
    reason: "DIRECT_ACCOUNT";
  };
  fieldDispositions?: readonly {
    tag: string;
    canonicalRole: string;
    disposition:
      "OMIT" | "OPTIONAL_TRANSACTION_INPUT" | "VALUE_FROM_TRANSACTION_INPUT";
    reason: string;
    value?: string;
  }[];
  contextualValues?: Record<string, string>;
  supportAnalysis?: readonly {
    messageType: string;
    sequence: string;
    tag: string;
    option: "A";
    standardsRelease: "SR2026";
    canonicalRole: string;
    officialFieldName?: string;
    scopeStatus: "SSI_SUPPORTED" | "OUT_OF_SSI_SCOPE";
    resolutionStatus: "RESOLVED" | "NOT_REQUIRED" | "NO_ELIGIBLE_SSI" | "N_A";
    reasonCode: string;
    suggestedValue?: string;
    source?: string;
    ownerSide?: string;
    evidence?: string;
  }[];
  resolvedFields?: readonly {
    messageType: string;
    sequence: string;
    settlementLeg: string;
    tag: string;
    option: string;
    canonicalRole?: string;
    officialRole: string;
    officialFieldName: string;
    scopeStatus: "SSI_SUPPORTED" | "OUT_OF_SSI_SCOPE";
    resolutionStatus: "RESOLVED" | "NOT_REQUIRED" | "NO_ELIGIBLE_SSI" | "N_A";
    reasonCode: string;
    resolvedValue: string | null;
    provenance: Record<string, unknown>;
  }[];
}
interface ControlledFixtureResponse {
  fixtureFamily: "MT347-SR2026-SSI";
  source: "CANONICAL_DATABASE";
  count: number;
  candidates: readonly DemoFinSuggestionCandidate[];
}
interface TagScenario {
  id: string;
  module: string;
  label: string;
  purpose: string;
  format: MessageFormat;
  content: string;
  descriptor: {
    standardsRelease: string;
    messageType: string;
    direction: "INCOMING" | "OUTGOING";
    businessFunction: string;
    sequence?: string;
    settlementLeg?: string;
  };
}
const TREASURY_DEFAULT_PROFILE: Readonly<
  Record<
    string,
    { businessFunction: string; sequence: string; settlementLeg: string }
  >
> = {
  MT300: {
    businessFunction: "FX_CONFIRMATION",
    sequence: "B1",
    settlementLeg: "Amount Bought",
  },
  MT304: {
    businessFunction: "THIRD_PARTY_DEAL_INSTRUCTION",
    sequence: "B1",
    settlementLeg: "Amount Bought",
  },
  MT305: {
    businessFunction: "FX_OPTION_CONFIRMATION",
    sequence: "A",
    settlementLeg: "General Information",
  },
  MT306: {
    businessFunction: "FX_OPTION_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for Payment of Premium",
  },
  MT320: {
    businessFunction: "LOAN_DEPOSIT_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for Amounts Payable by Party A",
  },
  MT330: {
    businessFunction: "CALL_NOTICE_LOAN_DEPOSIT_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for Amounts Payable by Party A",
  },
  MT340: {
    businessFunction: "FRA_CONFIRMATION",
    sequence: "C",
    settlementLeg:
      "Settlement Instructions for Settlement Amount Payable by Party B",
  },
  MT341: {
    businessFunction: "FRA_SETTLEMENT_CONFIRMATION",
    sequence: "C",
    settlementLeg: "Settlement Instructions for the Settlement Amount",
  },
  MT350: {
    businessFunction: "LOAN_DEPOSIT_INTEREST_PAYMENT",
    sequence: "C",
    settlementLeg: "Settlement Instructions",
  },
  MT360: {
    businessFunction: "SINGLE_CURRENCY_IRD_CONFIRMATION",
    sequence: "D",
    settlementLeg: "Payment Instructions for Interest Payable by Party B",
  },
  MT361: {
    businessFunction: "CROSS_CURRENCY_IRS_CONFIRMATION",
    sequence: "D",
    settlementLeg: "Payment Instructions for Interest Payable by Party B",
  },
  MT362: {
    businessFunction: "IRD_PAYMENT_ADVICE",
    sequence: "C",
    settlementLeg: "(Net) Amount(s) Payable by Party B",
  },
  MT364: {
    businessFunction: "SINGLE_CURRENCY_IRD_TERMINATION",
    sequence: "L",
    settlementLeg: "Fee Payable by Party B",
  },
  MT365: {
    businessFunction: "CROSS_CURRENCY_IRS_TERMINATION",
    sequence: "J",
    settlementLeg: "Re-exchange of Principal Payable by Party B",
  },
};
const TRADE_FINANCE_DEFAULT_PROFILE: Readonly<
  Record<
    string,
    { businessFunction: string; sequence: string; settlementLeg?: string }
  >
> = {
  MT400: {
    businessFunction: "COLLECTION_PAYMENT_DIRECT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT700: {
    businessFunction: "MT700_ISSUANCE",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT705: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT707: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT710: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT720: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT730: {
    businessFunction: "CHARGES_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT734: {
    businessFunction: "REFUND_CLAIM_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT740: {
    businessFunction: "REFERENCE_ONLY",
    sequence: "MESSAGE",
    settlementLeg: "MESSAGE",
  },
  MT742: {
    businessFunction: "REIMBURSEMENT_CLAIM",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT750: {
    businessFunction: "AMOUNT_CLAIMED_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT752: {
    businessFunction: "PAYMENT_AUTHORIZATION_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT754: {
    businessFunction: "PAYMENT_ACCEPTANCE_NEGOTIATION",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT756: {
    businessFunction: "REIMBURSEMENT_PAYMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT760: {
    businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
    sequence: "B",
    settlementLeg: "B",
  },
  MT765: {
    businessFunction: "GUARANTEE_CLAIM",
    sequence: "MESSAGE",
  },
  MT768: {
    businessFunction: "CHARGES_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
  MT769: {
    businessFunction: "CHARGES_SETTLEMENT",
    sequence: "MESSAGE",
    settlementLeg: "Message",
  },
};
const TAG_CATALOG_COLUMNS: readonly {
  key: keyof TagMessageCatalogItem;
  label: string;
}[] = [
  { key: "messageType", label: "MT Type" },
  { key: "description", label: "SWIFT Description" },
  { key: "applicableTags", label: "SR2026 5x Profile Slots" },
  { key: "verified", label: "Mapping Status" },
];
interface TagMessageCatalogItem {
  messageType: string;
  description: string;
  applicableTags: string;
  verified: boolean;
}
interface FinResolutionCatalogueItem {
  messageType: string;
  resolutionMode: "TREASURY" | "TRADE_FINANCE";
  profileSlots: readonly string[];
  ssiResolvableTags: readonly string[];
}
interface FinResolutionCatalogueResponse {
  standardsRelease: string;
  catalogueVersion: string;
  items: readonly FinResolutionCatalogueItem[];
}
type TagCatalogSortKey = keyof TagMessageCatalogItem;
interface TagFieldExpectation {
  tag: string;
  semanticRole: string;
  expectedSource: string;
  officialFieldName?: string;
}
const tagField = (
  tag: string,
  semanticRole: string,
  expectedSource: string,
): TagFieldExpectation => ({ tag, semanticRole, expectedSource });

type AriaSortDirection = "ascending" | "descending" | "none";

function paymentSourceLabel(consumer: string): string {
  if (consumer === "CENTRAL_PAYMENT") return "Payment";
  if (consumer === "TREASURY") return "Treasury";
  return "Trade Finance";
}

function ariaSortDirection(
  active: boolean,
  direction: SortDirection,
): AriaSortDirection {
  if (!active) return "none";
  return direction === "ASC" ? "ascending" : "descending";
}

function sortDirectionIndicator(
  active: boolean,
  direction: SortDirection,
): string {
  if (!active) return "";
  return direction === "ASC" ? "↑" : "↓";
}

function activeTheme(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  if (mode !== "system") return mode;
  return prefersDark ? "dark" : "light";
}

const MT_MESSAGE_NAMES: Readonly<Record<string, string>> = {
  MT300: "Foreign Exchange Confirmation",
  MT304: "Advice / Instruction of a Third Party Deal",
  MT305: "Foreign Currency Option Confirmation",
  MT306: "Foreign Currency Option Confirmation",
  MT320: "Fixed Loan / Deposit Confirmation",
  MT330: "Call / Notice Loan / Deposit Confirmation",
  MT340: "Forward Rate Agreement Confirmation",
  MT341: "Forward Rate Agreement Settlement Confirmation",
  MT350: "Advice of Loan / Deposit Interest Payment",
  MT360: "Single Currency Interest Rate Derivative Confirmation",
  MT361: "Cross Currency Interest Rate Swap Confirmation",
  MT362: "Interest Rate Derivative Payment Advice",
  MT364: "Single Currency Interest Rate Derivative Termination / Recouponing",
  MT365: "Cross Currency Interest Rate Swap Termination / Recouponing",
  MT101: "Request for Transfer",
  MT103: "Single Customer Credit Transfer",
  MT200: "Financial Institution Transfer for its Own Account",
  MT202: "General Financial Institution Transfer",
  MT202COV: "General Financial Institution Transfer — Cover",
  MT203: "Multiple General Financial Institution Transfer",
  MT205: "Financial Institution Transfer Execution",
  MT205COV: "Financial Institution Transfer Execution — Cover",
  MT400: "Advice of Payment",
  MT410: "Acknowledgement",
  MT412: "Advice of Acceptance",
  MT416: "Advice of Non-Payment / Non-Acceptance",
  MT420: "Tracer",
  MT422: "Advice of Fate and Request for Instructions",
  MT430: "Amendment of Instructions",
  MT450: "Cash Letter Credit Advice",
  MT455: "Cash Letter Credit Adjustment Advice",
  MT456: "Advice of Dishonour",
  MT700: "Issue of a Documentary Credit",
  MT705: "Pre-Advice of a Documentary Credit",
  MT707: "Amendment to a Documentary Credit",
  MT710: "Advice of a Third Bank's Documentary Credit",
  MT720: "Transfer of a Documentary Credit",
  MT730: "Acknowledgement",
  MT734: "Advice of Refusal",
  MT740: "Authorisation to Reimburse",
  MT742: "Reimbursement Claim",
  MT750: "Advice of Discrepancy",
  MT752: "Authorisation to Pay, Accept or Negotiate",
  MT754: "Advice of Payment / Acceptance / Negotiation",
  MT756: "Advice of Reimbursement or Payment",
  MT760: "Issue of a Demand Guarantee / Standby Letter of Credit",
  MT765: "Guarantee / Standby Letter of Credit Demand",
  MT767: "Amendment to a Demand Guarantee / Standby Letter of Credit",
  MT768: "Acknowledgement of a Guarantee / Standby Message",
  MT769: "Advice of Reduction or Release",
};
const TAG_FIELD_EXPECTATIONS: Readonly<
  Record<string, readonly TagFieldExpectation[]>
> = {
  MT400: [
    tagField("53A", "SENDERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("54A", "RECEIVERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE"),
    tagField("58A", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT700: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT705: [
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT707: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT710: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT720: [
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT730: [tagField("57A", "ACCOUNT_WITH_BANK", "CHARGE_ACCOUNT_INSTRUCTION")],
  MT734: [
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE / TRANSACTION_CONTEXT"),
  ],
  MT740: [
    tagField("58A", "NEGOTIATING_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT742: [
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE"),
    tagField("58A", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT750: [
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE / TRANSACTION_CONTEXT"),
  ],
  MT752: [
    tagField("53A", "SENDERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("54A", "RECEIVERS_CORRESPONDENT", "SSI_ROUTE"),
  ],
  MT754: [
    tagField("53A", "REIMBURSING_BANK", "SSI_ROUTE"),
    tagField("57A", "ACCOUNT_WITH_BANK", "SSI_ROUTE"),
    tagField("58A", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
  ],
  MT756: [
    tagField("53A", "SENDERS_CORRESPONDENT", "SSI_ROUTE"),
    tagField("54A", "RECEIVERS_CORRESPONDENT", "SSI_ROUTE"),
  ],
  MT760: [
    tagField("56A", "ADVISING_BANK", "TRANSACTION_CONTEXT / PARTY_MASTER"),
    tagField(
      "57A",
      "ADVISE_THROUGH_BANK",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
    tagField(
      "58A",
      "REQUESTED_CONFIRMATION_PARTY",
      "TRANSACTION_CONTEXT / PARTY_MASTER",
    ),
  ],
  MT765: [
    tagField("56A", "INTERMEDIARY", "SSI_ROUTE / TRANSACTION_CONTEXT"),
    tagField(
      "57A",
      "ACCOUNT_WITH_INSTITUTION",
      "SSI_ROUTE / TRANSACTION_CONTEXT",
    ),
  ],
  MT768: [tagField("57A", "ACCOUNT_WITH_BANK", "CHARGE_ACCOUNT_INSTRUCTION")],
  MT769: [tagField("57A", "ACCOUNT_WITH_BANK", "CHARGE_ACCOUNT_INSTRUCTION")],
};

const BIC_PATTERN = "^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$";
const COUNTERPARTY_ID_PATTERN = "^[A-Z0-9][A-Z0-9._-]{2,34}$";
const TAG_SCENARIOS: readonly TagScenario[] = [
  {
    id: "MT742_OUT",
    module: "REIMBURSEMENT",
    label: "MT742 · Outgoing reimbursement claim",
    purpose: "由 57A／58A 擷取付款銀行角色，只建立候選與證據。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT742",
      direction: "OUTGOING",
      businessFunction: "REIMBURSEMENT_CLAIM",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT742\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=REIMBURSEMENT_CLAIM\n:57A:CITIUS33\n:58A:BOFAUS3N",
  },
  {
    id: "MT700_OUT",
    module: "DOCUMENTARY_CREDIT",
    label: "MT700 · Outgoing LC issuance",
    purpose:
      "依交易輸入與已核准 standing reference 建議 53a Reimbursing Bank、57a Advise Through Bank、58a Requested Confirmation Party。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT700",
      direction: "OUTGOING",
      businessFunction: "MT700_ISSUANCE",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT700\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=MT700_ISSUANCE\n:53A:CHASUS33\n:57A:BARCGB22\n:58A:CITIUS33",
  },
  {
    id: "MT765_OUT",
    module: "STANDBY_GUARANTEE",
    label: "MT765 · Outgoing guarantee claim",
    purpose:
      "索賠帶入的 57A 只可作 Transaction-only 候選，不能自動覆寫 Active SSI。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT765",
      direction: "OUTGOING",
      businessFunction: "GUARANTEE_CLAIM",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT765\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=GUARANTEE_CLAIM\n:57A:HSBCHKHH",
  },
  {
    id: "MT760_OUT",
    module: "STANDBY_GUARANTEE",
    label: "MT760 · Outgoing guarantee / standby issuance",
    purpose:
      "依核准 standing reference 與交易輸入建議 56a Advising Bank、57a Advise Through Bank、58a Requested Confirmation Party。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT760",
      direction: "OUTGOING",
      businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT760\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=GUARANTEE_STANDBY_ISSUANCE\n:56A:BARCGB22\n:57A:DEUTDEFF\n:58A:CITIUS33",
  },
  {
    id: "MT400_OUT",
    module: "COLLECTION",
    label: "MT400 · Outgoing collection payment",
    purpose: "使用 Active SSI 生成 53A／54A 的託收直接結算欄位子集。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT400",
      direction: "OUTGOING",
      businessFunction: "COLLECTION_PAYMENT_DIRECT",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT400\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=COLLECTION_PAYMENT_DIRECT\n:53A:CITIUS33\n:54A:DEUTDEFF",
  },
  {
    id: "MT300_OUT",
    module: "TREASURY_FX",
    label: "MT300 · Outgoing FX confirmation",
    purpose:
      "由 Active SSI 生成 sequence-qualified 53A／56A／57A／58A settlement roles。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT300\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=FX_CONFIRMATION\n:B1.53A:CITIUS33\n:B1.56A:CHASUS33\n:B1.57A:DEUTDEFF\n:B1.58A:BNPAFRPP",
  },
  {
    id: "MT320_OUT",
    module: "TREASURY_MONEY_MARKET",
    label: "MT320 · Outgoing loan/deposit confirmation",
    purpose:
      "由 Active SSI 生成 53A／56A／57A／58A settlement roles；只處理 SSI 欄位子集。",
    format: "FIN_LIKE",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "MT320",
      direction: "OUTGOING",
      businessFunction: "LOAN_DEPOSIT_CONFIRMATION",
    },
    content:
      "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=MT320\nDIRECTION=OUTGOING\nBUSINESS_FUNCTION=LOAN_DEPOSIT_CONFIRMATION\n:53A:SCBLGB2L\n:56A:DEUTDEFF\n:57A:CITIUS33\n:58A:BNPAFRPP",
  },
  {
    id: "PACS008_OUT",
    module: "CENTRAL_PAYMENT",
    label: "pacs.008.001.12 · Customer transfer",
    purpose: "由 Active SSI 生成 CdtrAgt/FinInstnId/BICFI 付款代理元素。",
    format: "MX_JSON",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "pacs.008.001.12",
      direction: "OUTGOING",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
    },
    content:
      '{\n  "standardsRelease": "SR2026",\n  "messageType": "pacs.008.001.12",\n  "direction": "OUTGOING",\n  "businessFunction": "CUSTOMER_CREDIT_TRANSFER",\n  "fields": { "CdtrAgt.FinInstnId.BICFI": "BOFAUS3N" }\n}',
  },
  {
    id: "PACS009_OUT",
    module: "CENTRAL_PAYMENT",
    label: "pacs.009.001.08 · FI transfer",
    purpose:
      "由 Active SSI 生成 CdtrAgt/FinInstnId/BICFI 金融機構付款代理元素。",
    format: "MX_JSON",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "pacs.009.001.08",
      direction: "OUTGOING",
      businessFunction: "FINANCIAL_INSTITUTION_TRANSFER",
    },
    content:
      '{\n  "standardsRelease": "SR2026",\n  "messageType": "pacs.009.001.08",\n  "direction": "OUTGOING",\n  "businessFunction": "FINANCIAL_INSTITUTION_TRANSFER",\n  "fields": { "CdtrAgt.FinInstnId.BICFI": "CITIUS33" }\n}',
  },
  {
    id: "PACS009_COV_OUT",
    module: "CENTRAL_PAYMENT",
    label: "pacs.009.001.08 COV · Cover transfer",
    purpose:
      "由 Active SSI 生成 IntrmyAgt1/FinInstnId/BICFI cover intermediary。",
    format: "MX_JSON",
    descriptor: {
      standardsRelease: "SR2026",
      messageType: "pacs.009.001.08",
      direction: "OUTGOING",
      businessFunction: "COVER_TRANSFER",
    },
    content:
      '{\n  "standardsRelease": "SR2026",\n  "messageType": "pacs.009.001.08",\n  "businessService": "swift.cbprplus.cov.04",\n  "direction": "OUTGOING",\n  "businessFunction": "COVER_TRANSFER",\n  "fields": { "IntrmyAgt1.FinInstnId.BICFI": "CHASUS33" }\n}',
  },
];

interface ModuleDefinition {
  id: string;
  label: string;
  messages: readonly string[];
}

const COLLECTION_MESSAGES = [
  "MT400",
  "MT410",
  "MT412",
  "MT416",
  "MT420",
  "MT422",
  "MT430",
  "MT450",
  "MT455",
  "MT456",
  "MT490",
  "MT491",
  "MT492",
  "MT495",
  "MT496",
  "MT498",
  "MT499",
] as const;

const GUARANTEE_MESSAGES = [
  "MT760",
  "MT761",
  "MT765",
  "MT767",
  "MT768",
  "MT769",
  "MT775",
  "MT785",
  "MT786",
  "MT787",
  "MT790",
  "MT791",
  "MT792",
  "MT795",
  "MT796",
  "MT798",
  "MT799",
] as const;

const PAYMENT_MESSAGES = [
  "MT101",
  "MT103",
  "MT200",
  "MT202",
  "MT202COV",
  "MT203",
  "MT205",
  "MT205COV",
  "pacs.008.001.12",
  "pacs.009.001.08",
] as const;

const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  {
    id: "IMPORT_LC",
    label: "Import Documentary Credit",
    messages: [
      "MT700",
      "MT701",
      "MT705",
      "MT707",
      "MT708",
      "MT730",
      "MT732",
      "MT734",
      "MT740",
      "MT742",
      "MT744",
      "MT747",
      "MT750",
      "MT752",
      "MT754",
      "MT756",
      "MT759",
      "MT790",
      "MT791",
      "MT792",
      "MT795",
      "MT796",
      "MT798",
      "MT799",
    ],
  },
  {
    id: "EXPORT_LC",
    label: "Export Documentary Credit",
    messages: [
      "MT700",
      "MT701",
      "MT705",
      "MT707",
      "MT708",
      "MT710",
      "MT711",
      "MT720",
      "MT721",
      "MT730",
      "MT732",
      "MT734",
      "MT740",
      "MT742",
      "MT744",
      "MT747",
      "MT750",
      "MT752",
      "MT754",
      "MT756",
      "MT759",
      "MT790",
      "MT791",
      "MT792",
      "MT795",
      "MT796",
      "MT798",
      "MT799",
    ],
  },
  {
    id: "LC_REIMBURSEMENT",
    label: "LC Reimbursement",
    messages: ["MT740", "MT742", "MT744", "MT747", "MT756"],
  },
  {
    id: "IMPORT_COLLECTION",
    label: "Import Collection",
    messages: COLLECTION_MESSAGES,
  },
  {
    id: "EXPORT_COLLECTION",
    label: "Export Collection",
    messages: COLLECTION_MESSAGES,
  },
  {
    id: "STANDBY_LC",
    label: "Standby Letter of Credit",
    messages: GUARANTEE_MESSAGES,
  },
  {
    id: "DEMAND_GUARANTEE",
    label: "Demand Guarantee／LG",
    messages: GUARANTEE_MESSAGES,
  },
  {
    id: "SHIPPING_GUARANTEE",
    label: "Shipping Guarantee（no automatic MT760 assumption）",
    messages: ["MT759", "MT799"],
  },
  {
    id: "TREASURY_FX",
    label: "Treasury FX／Options",
    messages: ["MT300", "MT304", "MT305", "MT306", "MT380", "MT381"],
  },
  {
    id: "TREASURY_MONEY_MARKET",
    label: "Treasury Money Market／Loan／Deposit",
    messages: [
      "MT320",
      "MT321",
      "MT330",
      "MT350",
      "MT390",
      "MT391",
      "MT392",
      "MT395",
      "MT396",
      "MT398",
      "MT399",
    ],
  },
  {
    id: "TREASURY_DERIVATIVES",
    label: "Treasury FRA／Derivatives／Netting",
    messages: [
      "MT340",
      "MT341",
      "MT360",
      "MT361",
      "MT362",
      "MT364",
      "MT365",
      "MT370",
    ],
  },
  {
    id: "INWARD_PAYMENT",
    label: "Inward Payment",
    messages: PAYMENT_MESSAGES,
  },
  {
    id: "OUTWARD_PAYMENT",
    label: "Outward Payment",
    messages: PAYMENT_MESSAGES,
  },
  {
    id: "CENTRAL_PAYMENT",
    label: "Central Payment／CBPR+",
    messages: [
      "MT103",
      "MT202",
      "MT202COV",
      "MT205",
      "MT205COV",
      "pacs.008.001.12",
      "pacs.009.001.08",
    ],
  },
];
interface BusinessFunctionDefinition {
  code: string;
  consumer: "TRADE_FINANCE" | "TREASURY" | "CENTRAL_PAYMENT";
  nameZh: string;
  nameEn: string;
  categoryId: string;
  moduleId: string;
  messageType: string;
  paymentLeg: string;
}

type BusinessFunctionFields = [
  string,
  BusinessFunctionDefinition["consumer"],
  string,
  string,
  string,
  string,
  string,
  string,
];

const parseBusinessFunction = (row: string): BusinessFunctionDefinition => {
  const [
    code,
    consumer,
    nameZh,
    nameEn,
    categoryId,
    moduleId,
    messageType,
    paymentLeg,
  ] = row.split("|") as BusinessFunctionFields;
  return {
    code,
    consumer: consumer as BusinessFunctionDefinition["consumer"],
    nameZh,
    nameEn,
    categoryId,
    moduleId,
    messageType,
    paymentLeg,
  };
};

const BUSINESS_FUNCTION_DEFINITIONS: readonly BusinessFunctionDefinition[] = `
IMPORT_LC_BANK_REIMBURSEMENT|TRADE_FINANCE|進口信用狀銀行償付|Import LC Bank Reimbursement|IMPORT|IMPORT_LC|pacs.009.001.08|BANK_REIMBURSEMENT
EXPORT_LC_PROCEEDS_SETTLEMENT|TRADE_FINANCE|出口信用狀款項交割|Export LC Proceeds Settlement|EXPORT|EXPORT_LC|pacs.008.001.12|PROCEEDS_SETTLEMENT
IMPORT_COLLECTION_PAYMENT|TRADE_FINANCE|進口託收付款|Import Collection Payment|IMPORT|IMPORT_COLLECTION|pacs.009.001.12|COLLECTION_SETTLEMENT
EXPORT_COLLECTION_PROCEEDS_SETTLEMENT|TRADE_FINANCE|出口託收款項交割|Export Collection Proceeds Settlement|EXPORT|EXPORT_COLLECTION|pacs.008.001.12|PROCEEDS_SETTLEMENT
LC_REIMBURSEMENT_SETTLEMENT|TRADE_FINANCE|信用狀償付交割|LC Reimbursement Settlement|REIMBURSEMENT|LC_REIMBURSEMENT|pacs.009.001.12|BANK_REIMBURSEMENT
STANDBY_LC_CLAIM_PAYMENT|TRADE_FINANCE|備用信用狀索賠付款|Standby LC Claim Payment|GUARANTEE|STANDBY_LC|pacs.009.001.12|CLAIM_PAYMENT
DEMAND_GUARANTEE_CLAIM_PAYMENT|TRADE_FINANCE|保函索賠付款|Demand Guarantee Claim Payment|GUARANTEE|DEMAND_GUARANTEE|pacs.009.001.12|CLAIM_PAYMENT
FX_SETTLEMENT|TREASURY|外匯交易交割|FX Settlement|TREASURY|TREASURY_FX|pacs.009.001.12|INTERBANK_SETTLEMENT
MONEY_MARKET_SETTLEMENT|TREASURY|貨幣市場交割|Money Market Settlement|TREASURY|TREASURY_MONEY_MARKET|pacs.009.001.12|INTERBANK_SETTLEMENT
INTERBANK_TRANSFER|CENTRAL_PAYMENT|銀行間匯款|Interbank Transfer|PAYMENT|CENTRAL_PAYMENT|pacs.009.001.12|INTERBANK_SETTLEMENT
CUSTOMER_CREDIT_TRANSFER|CENTRAL_PAYMENT|客戶匯款|Customer Credit Transfer|PAYMENT|CENTRAL_PAYMENT|pacs.008.001.12|CUSTOMER_TRANSFER
`
  .trim()
  .split("\n")
  .map(parseBusinessFunction);
const CURATED_SCENARIO_BY_KEY = new Map(
  TAG_SCENARIOS.map((scenario) => [
    scenario.descriptor.messageType + "|" + scenario.descriptor.direction,
    scenario,
  ]),
);
const FULL_TAG_SCENARIOS: readonly (TagScenario & { executable: boolean })[] = [
  ...new Set(MODULE_DEFINITIONS.flatMap((module) => module.messages)),
].map((messageType) => {
  const direction = "OUTGOING" as const;
  const resolutionProfile =
    TREASURY_DEFAULT_PROFILE[messageType] ??
    TRADE_FINANCE_DEFAULT_PROFILE[messageType];
  const curated = CURATED_SCENARIO_BY_KEY.get(messageType + "|" + direction);
  if (curated)
    return {
      ...curated,
      descriptor: {
        ...curated.descriptor,
        ...resolutionProfile,
      },
      executable: true,
      purpose: curated.purpose,
    };

  const format: MessageFormat = messageType.startsWith("pacs.")
    ? "MX_JSON"
    : "FIN_LIKE";
  const businessFunction =
    resolutionProfile?.businessFunction ?? "REFERENCE_ONLY";
  const content =
    format === "MX_JSON"
      ? JSON.stringify(
          {
            standardsRelease: "SR2026",
            messageType,
            direction,
            businessFunction,
            fields: {},
          },
          null,
          2,
        )
      : "STANDARDS_RELEASE=SR2026\nMESSAGE_TYPE=" +
        messageType +
        "\nDIRECTION=" +
        direction +
        "\nBUSINESS_FUNCTION=" +
        businessFunction;
  return {
    id: messageType.replaceAll(".", "_") + "_OUTGOING",
    module: "SWIFT_FIN",
    label: messageType,
    purpose:
      "目標 Standards Release 的欄位 profile 已驗證；只以明確標示的 Synthetic Demo SSI／transaction evidence 產生 reference-only 5x 建議。",
    format,
    content,
    executable: true,
    descriptor: {
      standardsRelease: "SR2026",
      messageType,
      direction,
      businessFunction,
      ...(resolutionProfile
        ? {
            sequence: resolutionProfile.sequence,
            settlementLeg: resolutionProfile.settlementLeg,
          }
        : {}),
    },
  };
});

@Component({
  selector: "ssi-root",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormlyForm,
    SwiftDataCrudComponent,
    OperationalIssueComponent,
    SettingsPageComponent,
    AlertComponent,
    PageDefinitionIndexWorkspaceComponent,
    BankServicePickerDialogComponent,
    GovernanceIndexTableComponent,
    LoadingStateComponent,
    DeferredFeatureShellComponent,
    GovernedRecordViewComponent,
  ],
  templateUrl: "./app.component.html",
  host: {
    "(document:keydown.escape)": "closeOverlayOnEscape()",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  readonly presentOfficialFieldName = presentOfficialFieldName;
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly swiftDataCrud = viewChild(SwiftDataCrudComponent);
  private readonly api = "http://localhost:3100/api";
  readonly finResolutionCatalogue = signal<
    readonly FinResolutionCatalogueItem[]
  >([]);
  readonly finResolutionCatalogueLoading = signal(true);
  readonly finResolutionCatalogueError = signal("");
  private clearingOptionsRequestSequence = 0;
  private resolutionRequestSequence = 0;
  private resolutionConfirmationRequestSequence = 0;
  private tagGenerationRequestSequence = 0;
  private refreshRequestSequence = 0;
  readonly ssiIndexLoading = signal(false);
  readonly view = signal<View>(this.savedView());
  readonly theme = signal<ThemeMode>("system");
  readonly rows = signal<readonly SsiRow[]>([]);
  // Checker is an independent transactional projection. It must never replace
  // the SSI Maintenance collection while its PENDING queue is loading.
  readonly checkerRows = signal<readonly SsiRow[]>([]);
  readonly ssiIndexTotalItems = signal(0);
  readonly ssiIndexTotalPages = signal(1);
  readonly ssiIndexDistinctCurrencyCount = signal(0);
  readonly ssiSummary = signal<SsiIndexSummary>({
    currentOwn: 0,
    pendingApproval: 0,
    active: 0,
    archived: 0,
  });
  readonly ownershipTab = signal<"OWN" | "COUNTERPARTY">("OWN");
  readonly ownershipSearch = signal("");
  readonly ownershipStatus = signal<"ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL">(
    "ACTIVE",
  );
  readonly ownershipActionAdapter = createMaintenanceIndexActionAdapter("ssi");
  readonly ownershipActionColumns = computed(() =>
    this.ownershipActionAdapter.columnsFor(this.ownershipStatus()),
  );
  readonly ownershipSort = signal<SsiOwnershipSort>("BOOKING_ENTITY");
  readonly ownershipSortDirection = signal<SortDirection>("ASC");
  readonly counterpartyDirectoryLoading = signal(false);
  readonly counterpartyDirectory = signal<readonly CounterpartyReference[]>([]);
  readonly counterpartyCoverage = signal<
    readonly CounterpartySsiSummarySource[]
  >([]);
  readonly selectedCounterpartyId = signal("");
  readonly counterpartyInboxSearch = signal("");
  readonly counterpartyPartyType = signal<
    "BANK_SSI" | "BANK_NO_SSI" | "CUSTOMER"
  >("BANK_SSI");
  readonly counterpartyInboxSort = signal<CounterpartyInboxSort>("BIC_NAME");
  readonly counterpartyInboxSortDirection = signal<SortDirection>("ASC");
  readonly counterpartyInboxPage = signal(1);
  readonly counterpartyInboxPageSize = 10;
  readonly ownershipOf = (row: SsiRow): "OWN" | "COUNTERPARTY" =>
    row.ownershipType ??
    (row.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
  readonly visibleRows = computed(() =>
    sortSsiOwnershipRows(
      this.rows(),
      this.ownershipSort(),
      this.ownershipSortDirection(),
    ),
  );
  readonly counterpartyInbox = computed(() => {
    const selectedType = this.counterpartyPartyType();
    const partyType = selectedType === "CUSTOMER" ? "CUSTOMER" : "BANK";
    const inbox = buildCounterpartyInbox(
      this.counterpartyDirectory().filter(
        (party) => (party.partyType ?? "BANK") === partyType,
      ),
      this.counterpartyCoverage(),
    );
    if (selectedType === "BANK_SSI") {
      return inbox.filter((party) => party.ssiCount > 0);
    }
    if (selectedType === "BANK_NO_SSI") {
      return inbox.filter((party) => party.ssiCount === 0);
    }
    return inbox;
  });
  readonly filteredCounterpartyInbox = computed(() =>
    queryCounterpartyInbox(
      this.counterpartyInbox(),
      this.counterpartyInboxSearch(),
      this.counterpartyInboxSort(),
      this.counterpartyInboxSortDirection(),
    ),
  );
  readonly counterpartyInboxTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(
        this.filteredCounterpartyInbox().length /
          this.counterpartyInboxPageSize,
      ),
    ),
  );
  readonly pagedCounterpartyInbox = computed(() =>
    pageItems(
      this.filteredCounterpartyInbox(),
      this.counterpartyInboxPage(),
      this.counterpartyInboxPageSize,
    ),
  );
  readonly selectedCounterparty = computed(
    () =>
      this.counterpartyInbox().find(
        (party) => party.counterpartyId === this.selectedCounterpartyId(),
      ) ?? null,
  );
  readonly indexPage = signal(1);
  readonly indexPageSize = 10;
  readonly indexTotalPages = computed(() => this.ssiIndexTotalPages());
  readonly pagedVisibleRows = computed(() => this.visibleRows());
  readonly activeRows = computed(() =>
    this.rows().filter((row) => row.status === "ACTIVE"),
  );
  readonly archivedCount = computed(() => this.ssiSummary().archived);
  readonly notice = signal<{
    kind: "info" | "warning" | "error";
    text: string;
  } | null>(null);
  readonly noticeAlert = computed(() => {
    const notice = this.notice();
    return notice
      ? {
          severity: notice.kind,
          title: this.noticeTitle(notice.kind),
          message: notice.text,
        }
      : null;
  });

  private noticeTitle(kind: "info" | "warning" | "error"): string {
    if (kind === "error") return "操作未完成";
    if (kind === "warning") return "請注意";
    return "操作完成";
  }
  readonly pending = computed(() =>
    this.checkerRows().filter((row) => row.status === "PENDING_APPROVAL"),
  );
  readonly checkerTab = signal<GovernanceTab>("rma");
  readonly checkerIndexSortPath = signal<string | null>(null);
  readonly checkerSortDirection = signal<AuditSortDirection>("asc");
  readonly checkerCurrentPage = signal(1);
  readonly checkerPageSize = 10;
  readonly auditTab = signal<GovernanceTab>("rma");
  readonly governedPending = signal<readonly GovernedPendingRow[]>([]);
  readonly checkerCount = computed(
    () => this.ssiSummary().pendingApproval + this.governedPending().length,
  );
  readonly checkerIndexColumns = computed(
    () => AUDIT_INDEX_COLUMNS[this.checkerTab()],
  );
  readonly sortedCheckerSsiRows = computed(() => {
    const path = this.checkerIndexSortPath();
    if (!path) return this.pending();
    const direction = this.checkerSortDirection() === "asc" ? 1 : -1;
    return [...this.pending()].sort(
      (left, right) =>
        this.auditRecordValue(left, path).localeCompare(
          this.auditRecordValue(right, path),
          undefined,
          { numeric: true, sensitivity: "base" },
        ) * direction,
    );
  });
  readonly checkerTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(this.sortedCheckerSsiRows().length / this.checkerPageSize),
    ),
  );
  readonly checkerIndexRows = computed(() => {
    const start = (this.checkerCurrentPage() - 1) * this.checkerPageSize;
    return this.sortedCheckerSsiRows()
      .slice(start, start + this.checkerPageSize)
      .map((record) => ({
        id: record.id,
        record,
        cells: this.checkerIndexColumns().map((column) =>
          this.auditRecordValue(record, column.path),
        ),
        trailing: [record.maker, record.updatedAt || record.createdAt || "—"],
        source: record,
      }));
  });
  readonly activeCount = computed(() => this.ssiSummary().active);
  readonly form: FormGroup = new FormGroup({});
  model: Record<string, unknown> = {
    maker: "maker.demo",
    scope: "STANDING",
    ownershipType: "OWN",
    ownerParty: "HK01",
    publisherParty: "HK01",
    counterpartyId: "ANY",
    route: {
      currency: "USD",
      counterpartyType: "ANY_BANK",
      counterpartyBic: "ANY",
    },
  };
  readonly currenciesLoading = signal(false);
  readonly currencies = signal<readonly CurrencyReference[]>([]);
  readonly countries = signal<readonly CountryReference[]>([]);
  readonly fields = signal<FormlyFieldConfig[]>(this.buildFields([]));
  readonly readonlyFields = computed(() => readonlyFormFields(this.fields()));
  readonly editingId = signal<string | null>(null);
  readonly revisionSource = signal<SsiRow | null>(null);
  readonly revisionSourceIdentity = computed(() => {
    const source = this.revisionSource();
    return source ? `${source.counterpartyId} · v${source.version}` : null;
  });
  readonly makerEditing = computed(
    () => this.editingId() !== null || this.revisionSource() !== null,
  );
  readonly detailTarget = signal<SsiRow | null>(null);
  readonly detailForm = new FormGroup({});
  readonly detailModel = computed<Record<string, unknown>>(() => {
    const row = this.detailTarget();
    return row ? this.modelForRow(row) : {};
  });
  readonly checkerRejectReason = signal("");
  readonly governedReviewResourceId = signal<string | null>(null);
  readonly governedReviewRecordId = signal<string | null>(null);
  readonly deleteTarget = signal<SsiRow | null>(null);
  readonly deleteReason = signal("");
  readonly canConfirmDelete = computed(
    () => this.deleteReason().trim().length >= 5,
  );
  readonly bicPickerTarget = signal<BicTarget | null>(null);
  readonly bicPickerTitle = signal("");
  readonly bankPage = signal<BankPage>({
    items: [],
    page: 1,
    pageSize: this.indexPageSize,
    total: 0,
    totalPages: 0,
  });
  readonly banksLoading = signal(false);
  readonly bankPickerError = signal<string | null>(null);
  readonly bankQuery = signal("");
  readonly hasPreviousBankPage = computed(() => this.bankPage().page > 1);
  readonly hasNextBankPage = computed(
    () => this.bankPage().page < this.bankPage().totalPages,
  );
  readonly bankPickerItems = computed<readonly BankServicePickerItem[]>(() =>
    this.bankPage().items.map((bank) => ({
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      displayValue: bank.name,
      location: [bank.city, bank.country].filter(Boolean).join(" · "),
      standard: bank.standard,
    })),
  );
  readonly identityPickerSource = signal<"BANK" | "CUSTOMER">("BANK");
  readonly customerPage = signal<CustomerPage>({
    items: [],
    page: 1,
    pageSize: 5,
    total: 0,
    totalPages: 0,
  });
  readonly customersLoading = signal(false);
  readonly customerQuery = signal("");
  readonly hasPreviousCustomerPage = computed(
    () => this.customerPage().page > 1,
  );
  readonly hasNextCustomerPage = computed(
    () => this.customerPage().page < this.customerPage().totalPages,
  );
  readonly resolutionConsumer = signal("TRADE_FINANCE");
  readonly paymentMessageStatusLabel = paymentMessageStatusLabel;
  readonly paymentMessageIndex = signal<readonly PaymentMessageIndexItem[]>([]);
  readonly paymentMessageIndexLoading = signal(false);
  readonly paymentMessageIndexError = signal("");
  readonly paymentMessageIndexIssue = computed(() =>
    this.paymentMessageIndexError()
      ? presentOperationalIssue(this.paymentMessageIndexError())
      : null,
  );
  readonly paymentMessageIndexSearch = signal("");
  readonly paymentMessageIndexSortKey =
    signal<PaymentMessageIndexSortKey>("messageType");
  readonly paymentMessageIndexSortDirection = signal<"asc" | "desc">("asc");
  readonly paymentScenarioSortDirection = signal<"asc" | "desc">("asc");
  readonly paymentMessageScenarios = computed(() =>
    sortPaymentMessageScenarios(
      counterpartySsiPaymentScenarios(
        PAYMENT_MESSAGE_SCENARIOS,
        this.paymentMessageIndex(),
      ),
      this.paymentScenarioSortDirection(),
    ),
  );
  readonly paymentTransactionOpen = signal(false);
  readonly selectedPaymentMessage = signal<PaymentMessageIndexItem | null>(
    null,
  );
  readonly selectedPaymentScenario = signal<PaymentMessageScenario | null>(
    null,
  );
  readonly paymentResolutionDomain = computed(() =>
    ["BOOK_TRANSFER_SAME_RECEIVER", "CREDIT_ONE_OF_SEVERAL_AT_57A"].includes(
      this.selectedPaymentScenario()?.code ?? "",
    )
      ? "OWN_SSI_NOSTRO"
      : "COUNTERPARTY_SSI",
  );
  readonly ownNostroAccounts = signal<readonly OwnNostroReference[]>([]);
  readonly paymentScenarioValues = signal<Readonly<Record<string, string>>>({});
  readonly filteredPaymentMessageIndex = computed(() =>
    sortPaymentMessageIndex(
      filterPaymentMessageIndex(
        executableCounterpartySsiProfiles(this.paymentMessageIndex()),
        this.paymentMessageIndexSearch(),
      ),
      this.paymentMessageIndexSortKey(),
      this.paymentMessageIndexSortDirection(),
    ),
  );
  readonly resolutionCounterpartyType = signal<"BANK" | "CUSTOMER">("BANK");
  readonly resolutionBanks = signal<readonly BankReference[]>([]);
  readonly resolutionBanksLoading = signal(true);
  readonly resolutionBanksError = signal("");
  readonly resolutionBanksIssue = computed(() =>
    this.resolutionBanksError()
      ? presentOperationalIssue(this.resolutionBanksError())
      : null,
  );
  readonly resolutionCounterpartyBankServiceId = signal("");
  readonly resolutionCounterpartyBic = signal("BARCGB22");
  readonly selectedResolutionBank = computed(() =>
    bankIdentityByServiceId(
      this.resolutionBanks(),
      this.resolutionCounterpartyBankServiceId(),
    ),
  );
  readonly resolutionCustomerId = signal("CUST-00001");
  readonly resolutionCustomers = computed(() =>
    this.counterpartyDirectory().filter(
      (party) => party.partyType === "CUSTOMER",
    ),
  );
  readonly resolutionSourceLabel = computed(() =>
    paymentSourceLabel(this.resolutionConsumer()),
  );
  readonly resolutionCounterpartyId = computed(() =>
    this.resolutionCounterpartyType() === "BANK"
      ? this.resolutionCounterpartyBic()
      : this.resolutionCustomerId(),
  );
  readonly resolutionCounterpartyCountry = computed(() => {
    if (this.resolutionCounterpartyType() === "BANK")
      return this.resolutionCounterpartyBic().slice(4, 6);
    return (
      this.resolutionCustomers().find(
        (party) => party.counterpartyId === this.resolutionCustomerId(),
      )?.country ?? ""
    );
  });
  readonly resolutionCoveredCurrencies = computed(
    () =>
      new Set(
        this.rows()
          .filter(
            (row) =>
              row.status === "ACTIVE" &&
              (row.route["counterpartyBic"] || row.counterpartyId) ===
                this.resolutionCounterpartyId() &&
              (row.route["counterpartyType"] ?? "BANK") ===
                this.resolutionCounterpartyType() &&
              scalarText(row.route["messageTypes"])
                .split(",")
                .map((value) => value.trim())
                .includes(this.resolutionMessageType()) &&
              (row.applicability ?? []).some(
                (applicability) =>
                  applicability.status === "ACTIVE" &&
                  ["ANY", this.resolutionConsumer()].includes(
                    applicability.consumer,
                  ) &&
                  ["ANY", this.resolutionProduct()].includes(
                    applicability.product,
                  ) &&
                  ["ANY", this.resolutionFunction()].includes(
                    applicability.businessFunction,
                  ) &&
                  ["ANY", this.resolutionPaymentLeg()].includes(
                    applicability.paymentLeg,
                  ) &&
                  ["ANY", this.resolutionDirection()].includes(
                    applicability.direction,
                  ),
              ),
          )
          .map((row) => row.route["currency"])
          .filter(Boolean),
      ),
  );
  readonly resolutionSelectedCurrencyCovered = computed(() =>
    this.resolutionCoveredCurrencies().has(this.resolutionCurrency()),
  );
  readonly resolutionCurrency = signal("USD");
  readonly resolutionFunction = signal("IMPORT_LC_BANK_REIMBURSEMENT");
  readonly resolutionProduct = computed(
    () =>
      BUSINESS_FUNCTION_DEFINITIONS.find(
        (item) => item.code === this.resolutionFunction(),
      )?.moduleId ?? "",
  );
  readonly resolutionPaymentLeg = computed(
    () =>
      BUSINESS_FUNCTION_DEFINITIONS.find(
        (item) => item.code === this.resolutionFunction(),
      )?.paymentLeg ?? "",
  );
  readonly resolutionSettlementCountry = signal("");
  readonly resolutionSettlementMarket = signal("");
  readonly resolutionClearingSystem = signal("");
  readonly clearingSystems = signal<readonly ClearingSystemReference[]>([]);
  readonly eligibleClearingSystemCodes = signal<readonly string[]>([]);
  readonly resolutionClearingSystems = computed(() =>
    this.clearingSystems().filter(
      (system) =>
        system.status === "ACTIVE" &&
        this.eligibleClearingSystemCodes().includes(system.code),
    ),
  );
  readonly resolutionDirection = signal("OUTBOUND");
  readonly resolutionBookingEntity = signal("HK01");
  readonly bookingBranches = signal<readonly BookingBranchReference[]>([]);
  readonly resolutionValueDate = signal(localCalendarDate());
  readonly resolutionAmount = signal("1000000");
  readonly resolutionMessageType = signal("pacs.009.001.08");
  readonly resolutionOutputFormat = signal<"MT" | "MX">("MX");
  readonly resolutionBusinessService = computed(
    () => this.selectedPaymentMessage()?.businessService ?? "",
  );
  readonly resolutionPaymentProfile = computed(() =>
    paymentSettlementProfile(this.resolutionCounterpartyType()),
  );
  readonly resolutionMtMessageType = computed(
    () =>
      this.selectedPaymentMessage()?.messageType ??
      this.resolutionPaymentProfile().mtMessageType,
  );
  readonly resolutionBeneficiaryCustomer = computed(() => {
    if (this.resolutionCounterpartyType() !== "CUSTOMER") return undefined;
    const customer = this.resolutionCustomers().find(
      (party) => party.counterpartyId === this.resolutionCustomerId(),
    );
    if (!customer) return undefined;
    return {
      customerId: customer.counterpartyId,
      name: customer.name,
      accountReference: customer.beneficiaryAccountReference ?? "",
      ...(customer.address ? { address: customer.address } : {}),
    };
  });
  readonly resolutionReference = signal("TF-2026-000001");
  readonly resolutionLoading = signal(false);
  readonly resolutionConfirming = signal(false);
  readonly resolutionResult = signal<ResolutionResponse | null>(null);
  readonly resolutionContractResult = signal<Mt2ResolutionContract | null>(
    null,
  );
  readonly resolutionRequestError = signal("");
  readonly resolutionRequestIssue = computed(() =>
    this.resolutionRequestError()
      ? presentResolutionIssue(this.resolutionRequestError())
      : null,
  );
  readonly resolutionSelectedSsiId = signal("");
  readonly resolutionConfirmation = signal<ResolutionConfirmation | null>(null);
  readonly resolvedCanonicalSettlement = computed(
    () =>
      this.resolutionConfirmation()?.canonicalSettlement ??
      this.resolutionResult()?.canonicalSettlementPreview ??
      null,
  );
  readonly renderedSettlementOutput = computed(() => {
    const contract = this.resolutionContractResult();
    if (contract)
      return contractOutput(contract, this.resolutionOutputFormat());
    const settlement = this.resolvedCanonicalSettlement();
    if (!settlement) return null;
    return renderPaymentSettlement(this.resolutionOutputFormat(), settlement);
  });
  readonly resolutionContractDecision = computed(() => {
    const contract = this.resolutionContractResult();
    return contract ? contractDecision(contract) : "";
  });
  readonly resolutionContractChosenRoute = computed(() => {
    const contract = this.resolutionContractResult();
    return contract ? contractChosenRoute(contract) : null;
  });
  readonly resolutionContractAlternatives = computed(() => {
    const contract = this.resolutionContractResult();
    return contract ? contractAlternatives(contract) : [];
  });
  readonly resolutionContractCandidates = computed(() => {
    const contract = this.resolutionContractResult();
    return contract ? contractCandidates(contract) : [];
  });
  readonly resolutionContractEvidence = computed(() => {
    const contract = this.resolutionContractResult();
    return contract ? contractEvidence(contract) : null;
  });
  readonly resolutionOutputTitle = computed(() => {
    if (this.resolutionOutputFormat() === "MX") {
      return "SSI-owned canonical roles";
    }
    const finMessageType = this.resolvedCanonicalSettlement()?.finMessageType;
    return `${finMessageType ?? this.resolutionMtMessageType()} 5x Tag response`;
  });
  readonly resolutionSelectableRoutes = computed(() => {
    const result = this.resolutionResult();
    return result?.recommendedRoute
      ? [result.recommendedRoute, ...result.alternatives]
      : [];
  });
  readonly selectedResolutionRoute = computed(
    () =>
      this.resolutionSelectableRoutes().find(
        (route) => route.ssiId === this.resolutionSelectedSsiId(),
      ) ??
      this.resolutionResult()?.recommendedRoute ??
      null,
  );
  readonly resolutionHasManualRouteOverride = computed(() =>
    hasManualRouteOverride(
      this.resolutionResult(),
      this.resolutionSelectedSsiId(),
    ),
  );
  readonly tagScenarios = FULL_TAG_SCENARIOS.filter((item) =>
    item.descriptor.messageType.startsWith("MT"),
  );
  readonly verifiedTagScenarios = this.tagScenarios.filter(
    (item) => item.executable,
  );
  readonly tagCatalogColumns = TAG_CATALOG_COLUMNS;
  readonly tagCatalogSearch = signal("");
  readonly tagCatalogSortKey = signal<TagCatalogSortKey>("messageType");
  readonly tagCatalogSortDirection = signal<"asc" | "desc">("asc");
  readonly availableTagMessages = computed<readonly TagMessageCatalogItem[]>(
    () => {
      const query = this.tagCatalogSearch().trim().toUpperCase();
      const activeMode =
        this.view() === "treasury" ? "TREASURY" : "TRADE_FINANCE";
      const messageTypes = this.finResolutionCatalogue()
        .filter((item) => item.resolutionMode === activeMode)
        .map((item) => item.messageType);
      return messageTypes
        .map((messageType) => {
          const scenarios = this.tagScenarios.filter(
            (item) => item.descriptor.messageType === messageType,
          );
          const resolutionProfile = this.finResolutionCatalogue().find(
            (item) => item.messageType === messageType,
          )!;
          return {
            messageType,
            description:
              MT_MESSAGE_NAMES[messageType] ??
              `SWIFT FIN Category ${messageType.charAt(2)} message`,
            applicableTags: [
              ...new Set(
                resolutionProfile.profileSlots.map(
                  (tagOption) => `${tagOption.slice(0, 2)}a`,
                ),
              ),
            ].join(" · "),
            verified: scenarios.some((item) => item.executable),
          };
        })
        .filter(
          (item) =>
            !query ||
            item.messageType.includes(query) ||
            item.description.toUpperCase().includes(query),
        )
        .sort((left, right) => {
          const key = this.tagCatalogSortKey();
          const direction = this.tagCatalogSortDirection() === "asc" ? 1 : -1;
          const leftValue = left[key];
          const rightValue = right[key];
          return (
            String(leftValue).localeCompare(String(rightValue), undefined, {
              numeric: true,
            }) * direction
          );
        });
    },
  );
  readonly tagScenarioId = signal(
    (this.verifiedTagScenarios[0] ?? this.tagScenarios[0])!.id,
  );
  readonly selectedTagScenario = computed(
    () =>
      this.tagScenarios.find((item) => item.id === this.tagScenarioId()) ??
      this.tagScenarios[0]!,
  );
  readonly selectedTagFieldExpectations = computed(
    () =>
      TAG_FIELD_EXPECTATIONS[
        this.selectedTagScenario().descriptor.messageType
      ] ?? [],
  );
  readonly tagTransactionOpen = signal(false);
  readonly tagCatalogPage = signal(1);
  readonly tagCatalogPageSize = 10;
  readonly tagCatalogTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(this.availableTagMessages().length / this.tagCatalogPageSize),
    ),
  );
  readonly pagedTagScenarios = computed(() => {
    const start = (this.tagCatalogPage() - 1) * this.tagCatalogPageSize;
    return this.availableTagMessages().slice(
      start,
      start + this.tagCatalogPageSize,
    );
  });
  readonly tagSsiId = signal("");
  readonly controlledTagCandidates = signal<
    readonly DemoFinSuggestionCandidate[]
  >([]);
  private controlledTagCandidateRequestSequence = 0;
  readonly tagTransactionReference = signal("REFERENCE-MT-2026-000001");
  readonly tagReimbursementArrangement = signal<
    "DIRECT_ACCOUNT" | "REIMBURSING_BANK"
  >("REIMBURSING_BANK");
  readonly tagConfirmationInstructions = signal("MAY_ADD");
  readonly mt760ConfirmationInstructions = signal<
    "WITHOUT" | "MAY_ADD" | "CONFIRM"
  >("WITHOUT");
  readonly isMt760Suggestion = computed(
    () => this.selectedTagScenario().descriptor.messageType === "MT760",
  );
  readonly isMt400Suggestion = computed(
    () => this.selectedTagScenario().descriptor.messageType === "MT400",
  );
  readonly tagScenarioUsesSettlementSsi = computed(() =>
    this.finResolutionCatalogue().some(
      (item) =>
        item.messageType === this.selectedTagScenario().descriptor.messageType,
    ),
  );
  readonly suggestionCurrencies = computed(() =>
    this.currencies().filter((currency) =>
      DEMO_SUGGESTION_CURRENCIES.includes(
        currency.code as (typeof DEMO_SUGGESTION_CURRENCIES)[number],
      ),
    ),
  );
  readonly tagCoveredCurrencies = computed(
    () =>
      new Set(
        this.controlledTagCandidates().length
          ? [this.resolutionCurrency()]
          : [],
      ),
  );
  readonly tagSelectedCurrencyCovered = computed(() =>
    this.tagCoveredCurrencies().has(this.resolutionCurrency()),
  );
  readonly eligibleSuggestionBanks = computed(() => {
    const financialInstitutions = this.resolutionBanks().filter(
      (party) => (party.partyType ?? "BANK") === "BANK",
    );
    if (this.isMt760Suggestion()) return financialInstitutions;
    const currency = this.resolutionCurrency();
    if (!DEMO_CURRENCY_AGENTS[currency]) return [];
    return financialInstitutions;
  });
  readonly mt760ValidationIssue = computed(() => {
    if (!this.isMt760Suggestion()) return "";
    if (this.mt760ConfirmationInstructions() !== "WITHOUT")
      return "MT760_PARTY_FIELDS_REQUIRE_UPSTREAM_TRANSACTION_CONTEXT";
    return "";
  });
  readonly mt400ValidationIssue = computed(() => {
    if (!this.isMt400Suggestion()) return "";
    const selected = this.selectedTagSsi();
    if (
      selected?.accountRelationship === "DIRECT_ACCOUNT" &&
      !selected.directRelationshipEvidenceId
    )
      return "DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED";
    return "";
  });
  readonly tagSuggestionValidationIssue = computed(
    () => this.mt760ValidationIssue() || this.mt400ValidationIssue(),
  );
  readonly relatedTagSsis = computed<readonly DemoFinSuggestionCandidate[]>(
    () => this.controlledTagCandidates(),
  );
  readonly selectedTagSsi = computed(
    () =>
      this.relatedTagSsis().find((row) => row.id === this.tagSsiId()) ??
      this.relatedTagSsis()[0] ??
      null,
  );
  readonly mt400SettlementMode = computed(() =>
    this.isMt400Suggestion()
      ? (this.selectedTagSsi()?.accountRelationship ?? "UNVERIFIED")
      : "UNVERIFIED",
  );
  readonly tagSsiDerivationReason = computed(() => {
    const selected = this.selectedTagSsi();
    if (!selected) return "NO_SSI_FOUND";
    return `EXACT_CONTEXT · priority ${selected.priority} · ${selected.routeClass}`;
  });
  readonly tagUpstreamContext = computed(() => {
    const scenario = this.selectedTagScenario();
    return {
      messageType: scenario.descriptor.messageType,
      direction: scenario.descriptor.direction,
      currency: this.resolutionCurrency(),
      counterpartyBic: this.resolutionCounterpartyBic(),
      counterpartyCountry: this.resolutionCounterpartyCountry(),
      bookingEntity: this.resolutionBookingEntity(),
      valueDate: this.resolutionValueDate(),
      transactionReference: this.tagTransactionReference(),
    };
  });
  readonly tagLoading = signal(false);
  readonly extractionResult = signal<ExtractionResponse | null>(null);
  readonly generationResult = signal<GenerationResponse | null>(null);
  readonly tagSupportRows = computed(
    () =>
      this.generationResult()?.resolvedFields?.map((row) => ({
        ...row,
        semanticRole: row.canonicalRole ?? row.officialRole,
        canonicalRole: row.canonicalRole ?? row.officialRole,
        suggestedValue: row.resolvedValue ?? undefined,
        source: scalarText(row.provenance["source"]),
        ownerSide: scalarText(row.provenance["ownerSide"]),
        evidence: scalarText(
          row.provenance["sourceRecordId"] ??
            row.provenance["fieldProfileArtifactId"],
        ),
      })) ??
      this.generationResult()?.supportAnalysis?.map((row) => ({
        ...row,
        semanticRole: row.canonicalRole,
        officialFieldName:
          row.officialFieldName ?? "Official field name pending verification",
      })) ??
      analyzeFin5xSupport({
        messageType: this.selectedTagScenario().descriptor.messageType,
        fields: this.selectedTagFieldExpectations(),
        candidate: this.selectedTagSsi(),
        suggestions: this.generationResult()?.suggestions ?? [],
      }),
  );
  readonly visibleTagSupportRows = computed(() =>
    this.tagSupportRows().filter(isVisibleSsiResolutionRow),
  );
  readonly auditRows = signal<readonly AuditRow[]>([]);
  readonly auditDetail = signal<AuditPresentation | null>(null);
  readonly auditParameterFields = signal<readonly AuditParameterField[]>([]);
  readonly auditDetailRecord = computed<Readonly<Record<string, unknown>>>(
    () => {
      const detail = this.auditDetail();
      return detail
        ? (this.auditObject(auditGovernedSnapshot(detail)) ?? {})
        : {};
    },
  );
  readonly auditDetailStatus = computed(() =>
    scalarText(this.auditDetailRecord()["status"]),
  );
  readonly auditDetailVersion = computed(() =>
    Number(this.auditDetailRecord()["version"] ?? 0),
  );
  readonly auditDetailModel = computed<Record<string, unknown>>(() => {
    const record = this.auditDetailRecord();
    return {
      ...record,
      ...(Array.isArray(record["messageTypes"])
        ? { messageTypes: record["messageTypes"].join(", ") }
        : {}),
    };
  });
  readonly auditDetailFields = computed<FormlyFieldConfig[]>(() =>
    this.auditParameterFields().map((field) => ({
      key: field.key,
      type: field.type,
      props: this.auditFieldProps(field),
    })),
  );
  readonly auditResourceLabel = computed(() => {
    const labels: Record<GovernanceTab, string> = {
      rma: "RMA",
      entity: "Entities",
      nostro: "Nostro",
      ssi: "SSI",
    };
    return labels[this.auditTab()];
  });
  readonly auditOnlineQueryDays = signal(7);
  readonly auditArchiveAfterDays = signal(14);
  readonly auditArchiveRetentionDays = signal(365);
  readonly auditScheduleIntervalHours = signal(12);
  readonly auditLoading = signal(false);
  readonly auditError = signal("");
  readonly auditIssue = computed(() =>
    this.auditError() ? presentOperationalIssue(this.auditError()) : null,
  );
  readonly auditSortKey = signal<AuditSortKey>("title");
  readonly auditSortDirection = signal<AuditSortDirection>("asc");
  readonly auditIndexSortPath = signal<string | null>(null);
  readonly auditCurrentPage = signal(1);
  readonly auditPageSize = 10;
  readonly sortedAuditRows = computed(() => {
    const rows = sortAuditRows(
      this.auditRows(),
      this.auditSortKey(),
      this.auditSortDirection(),
    ).map(presentAuditEvent);
    const path = this.auditIndexSortPath();
    if (!path) return rows;
    const direction = this.auditSortDirection() === "asc" ? 1 : -1;
    return [...rows].sort(
      (left, right) =>
        this.auditRecordValue(this.auditRecord(left), path).localeCompare(
          this.auditRecordValue(this.auditRecord(right), path),
          undefined,
          { numeric: true, sensitivity: "base" },
        ) * direction,
    );
  });
  readonly auditTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedAuditRows().length / this.auditPageSize)),
  );
  readonly pagedAuditRows = computed(() =>
    auditPage(
      this.sortedAuditRows(),
      this.auditCurrentPage(),
      this.auditPageSize,
    ),
  );
  readonly auditIndexColumns = computed(
    () => AUDIT_INDEX_COLUMNS[this.auditTab()],
  );
  readonly auditIndexRows = computed(() =>
    this.pagedAuditRows().map((event) => {
      const record = this.auditRecord(event);
      return {
        id: event.eventId,
        cells: this.auditIndexColumns().map((column) =>
          this.auditRecordValue(record, column.path),
        ),
        trailing: [
          scalarText(record["maker"]),
          scalarText(record["createdAt"] ?? record["updatedAt"]),
          scalarText(record["checker"]),
          record["checker"] ? event.occurredAt : "",
        ],
        source: event,
      };
    }),
  );
  pseudoContent = FULL_TAG_SCENARIOS[0]!.content;
  private readonly loadedFeatureData = new Set<string>();
  private readonly featureDataLoads = new Map<string, Promise<void>>();
  private pendingDeactivation: Promise<boolean> | null = null;

  constructor() {
    const saved = this.document.defaultView?.localStorage.getItem("ssi-theme");
    const mode: ThemeMode =
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
    this.setTheme(mode);
    this.document.defaultView
      ?.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (this.theme() === "system") this.applyTheme("system");
      });
  }

  ngOnInit(): void {
    // SWIFT Data owns its own resource loading. A persisted SSI view loads only
    // SSI data, so browser refresh does not create or query the RMA component.
    if (this.view() !== "swiftdata") void this.ensureFeatureData(this.view());
  }

  private async loadWorkspaceData(): Promise<void> {
    await Promise.all([
      this.refresh(),
      this.loadCurrencies(),
      this.loadCountries(),
      this.loadResolutionBanks(),
      this.loadOwnNostroAccounts(),
      this.loadCounterpartyDirectory(),
      this.loadBookingBranches(),
      this.loadClearingSystems(),
      this.loadFinResolutionCatalogue(),
      this.loadPaymentMessageIndex(),
    ]);
    await this.loadControlledTagCandidates();
  }

  async refreshAfterDevelopmentReload(): Promise<void> {
    await this.loadWorkspaceData();
    this.notice.set({
      kind: "info",
      text: "Development Test Data 已重新載入；所有工作區資料已更新。",
    });
  }

  refresh(): Promise<void> {
    return this.performRefresh(++this.refreshRequestSequence);
  }

  private async performRefresh(requestSequence: number): Promise<void> {
    this.ssiIndexLoading.set(true);
    if (this.selectedCounterpartyId()) {
      this.rows.set([]);
      this.ssiIndexTotalItems.set(0);
      this.ssiIndexTotalPages.set(1);
      this.ssiIndexDistinctCurrencyCount.set(0);
    }
    try {
      const checkerView = this.view() === "checker";
      const query = new URLSearchParams({
        status: checkerView ? "PENDING_APPROVAL" : this.ownershipStatus(),
        page: checkerView ? "1" : String(this.indexPage()),
        pageSize: checkerView ? "100" : String(this.indexPageSize),
        sortBy: checkerView ? "STATUS" : this.ownershipSort(),
        sortDirection: checkerView ? "ASC" : this.ownershipSortDirection(),
      });
      if (!checkerView) {
        query.set("ownershipType", this.ownershipTab());
        const search = this.ownershipSearch().trim();
        if (search) query.set("search", search);
        if (this.selectedCounterpartyId())
          query.set("counterpartyId", this.selectedCounterpartyId());
      }
      const [response, summary] = await Promise.all([
        firstValueFrom(
          this.http.get<SsiPage | SsiRow[]>(
            `${this.api}/ssis?${query.toString()}`,
          ),
        ),
        firstValueFrom(
          this.http.get<SsiIndexSummary>(`${this.api}/ssis/summary`),
        ),
      ]);
      const page: SsiPage = Array.isArray(response)
        ? {
            items: response,
            page: 1,
            pageSize: response.length || this.indexPageSize,
            totalItems: response.length,
            totalPages: 1,
            hasPrevious: false,
            hasNext: false,
            distinctCurrencyCount: new Set(
              response.map((row) => row.route["currency"]).filter(Boolean),
            ).size,
          }
        : response;
      assertMaintenanceServerPage(
        page.items,
        checkerView ? "PENDING_APPROVAL" : this.ownershipStatus(),
      );
      if (requestSequence !== this.refreshRequestSequence) return;
      if (checkerView) {
        this.checkerRows.set(page.items);
      } else {
        this.rows.set(page.items);
        this.ssiIndexTotalItems.set(page.totalItems);
        this.ssiIndexTotalPages.set(Math.max(1, page.totalPages));
        this.ssiIndexDistinctCurrencyCount.set(page.distinctCurrencyCount);
      }
      this.ssiSummary.set(summary);
      this.indexPage.set(
        Math.min(this.indexPage(), Math.max(1, page.totalPages)),
      );
      this.ensureTagSsiSelection();
    } catch {
      this.notice.set({
        kind: "warning",
        text: "BFF 尚未啟動；啟動後重新整理即可。",
      });
    } finally {
      if (requestSequence === this.refreshRequestSequence)
        this.ssiIndexLoading.set(false);
    }
  }

  navigate(view: View): void {
    this.notice.set(null);
    this.view.set(view);
    this.document.defaultView?.localStorage.setItem("ssi-active-view", view);
    if (view === "treasury" || view === "tradefinance")
      this.enterFinResolution(view);
    void this.ensureFeatureData(view);
  }

  private savedView(): View {
    const saved =
      this.document.defaultView?.localStorage.getItem("ssi-active-view");
    return [
      "swiftdata",
      "dashboard",
      "maker",
      "checker",
      "resolver",
      "treasury",
      "tradefinance",
      "audit",
      "settings",
    ].includes(saved ?? "")
      ? (saved as View)
      : "swiftdata";
  }

  private ensureFeatureData(view: View): Promise<void> {
    const key =
      view === "treasury" || view === "tradefinance" ? "fin-resolution" : view;
    // Checker is a transactional queue: a Maker submit can change it at any
    // time, so returning to the view must re-query its authoritative APIs.
    // Keep the in-flight map below to deduplicate concurrent navigation loads,
    // but never retain Checker in the one-time feature cache.
    const cacheAfterLoad = key !== "checker" && key !== "dashboard";
    if (cacheAfterLoad && this.loadedFeatureData.has(key))
      return Promise.resolve();
    const existing = this.featureDataLoads.get(key);
    if (existing) return existing;
    const load = this.loadFeatureData(view)
      .then(() => {
        if (cacheAfterLoad) this.loadedFeatureData.add(key);
      })
      .finally(() => this.featureDataLoads.delete(key));
    this.featureDataLoads.set(key, load);
    return load;
  }

  private async loadFeatureData(view: View): Promise<void> {
    if (view === "swiftdata" || view === "settings") return;
    if (view === "audit") {
      await this.loadAudit();
      return;
    }
    if (view === "checker") {
      await Promise.all([this.refresh(), this.loadGovernedPending()]);
      return;
    }
    if (view === "dashboard") {
      await Promise.all([this.refresh(), this.loadCounterpartyDirectory()]);
      return;
    }
    if (view === "maker") {
      await Promise.all([
        this.refresh(),
        this.loadCurrencies(),
        this.loadCountries(),
        this.loadCounterpartyDirectory(),
        this.loadBookingBranches(),
      ]);
      return;
    }
    // The parameter-driven Resolution workspace loads only the selected page
    // definition and its own dependent lookups. The legacy parent workspace
    // must not preload unrelated reference services or emit duplicate alerts.
  }

  private async loadGovernedPending(): Promise<void> {
    try {
      const contract = await firstValueFrom(
        this.http.get<CheckerOpenApiContract>(
          "/openapi/swift-data-service.v1.json",
        ),
      );
      const resources = contract["x-ui-resources"].filter(
        (resource) =>
          resource.id !== "ssi" && resource["x-lifecycle"].includes("approve"),
      );
      const rows = await Promise.all(
        resources.map(async (resource) => ({
          resource,
          rows: await firstValueFrom(
            this.http.get<
              Array<{
                id: string;
                status: string;
                maker: string;
                version: number;
              }>
            >(`${this.api}/${resource.endpoint}?status=PENDING_APPROVAL`),
          ),
        })),
      );
      this.governedPending.set(
        rows.flatMap(({ resource, rows: resourceRows }) =>
          resourceRows
            .filter(({ status }) => status === "PENDING_APPROVAL")
            .map((row) => ({
              ...row,
              resourceId: resource.id,
              resourceLabel: resource.label,
              endpoint: resource.endpoint,
            })),
        ),
      );
    } catch {
      this.governedPending.set([]);
      this.notice.set({
        kind: "warning",
        text: "Checker Queue 暫時無法載入全部受控資料資源。",
      });
    }
  }

  async approveGoverned(row: GovernedPendingRow): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/${row.endpoint}/${row.id}/approve`, {
          actor: "checker.demo",
        }),
      );
      this.notice.set({
        kind: "info",
        text: `${row.resourceLabel} 已由獨立 Checker 核准並生效。`,
      });
      await Promise.all([this.loadGovernedPending(), this.refresh()]);
    } catch {
      this.notice.set({
        kind: "error",
        text: `${row.resourceLabel} Checker Approve 被生命週期／四眼控制拒絕。`,
      });
    }
  }

  reviewGoverned(row: GovernedPendingRow): void {
    this.governedReviewResourceId.set(row.resourceId);
    this.governedReviewRecordId.set(row.id);
    this.navigate("swiftdata");
  }

  async reviewForChecker(row: SsiRow): Promise<void> {
    if (this.currencies().length === 0 && !this.currenciesLoading())
      await this.loadCurrencies();
    this.detailForm.reset(this.modelForRow(row));
    this.checkerRejectReason.set("");
    this.detailTarget.set(row);
  }

  async decideSsi(row: SsiRow, decision: "approve" | "reject"): Promise<void> {
    const reason = this.checkerRejectReason().trim();
    if (decision === "reject" && reason.length < 5) {
      this.notice.set({
        kind: "warning",
        text: "Reject 必須輸入至少 5 個字元的退回原因。",
      });
      return;
    }
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/ssis/${row.id}/${decision}`, {
          actor: "checker.demo",
          ...(decision === "reject" ? { reason } : {}),
        }),
      );
      this.detailTarget.set(null);
      this.checkerRejectReason.set("");
      await Promise.all([this.refresh(), this.loadGovernedPending()]);
      this.notice.set({
        kind: "info",
        text:
          decision === "approve"
            ? "SSI 已由獨立 Checker 核准並啟用。"
            : "SSI 已退回 Maker 的 DRAFT 工作清單。",
      });
    } catch {
      this.notice.set({
        kind: "error",
        text: `Checker ${decision === "approve" ? "Approve" : "Reject"} 被生命週期／四眼控制拒絕。`,
      });
    }
  }

  private enterFinResolution(view: "treasury" | "tradefinance"): void {
    const activeMode = view === "treasury" ? "TREASURY" : "TRADE_FINANCE";
    const allowed = new Set(
      this.finResolutionCatalogue()
        .filter((item) => item.resolutionMode === activeMode)
        .map((item) => item.messageType),
    );
    const currentType = this.selectedTagScenario().descriptor.messageType;
    if (allowed.size && !allowed.has(currentType)) {
      const scenario = this.tagScenarios.find((item) =>
        allowed.has(item.descriptor.messageType),
      );
      if (scenario) this.chooseTagScenario(scenario.id);
    }
    this.tagTransactionOpen.set(false);
    this.tagCatalogPage.set(1);
    this.tagCatalogSearch.set("");
  }

  async loadPaymentMessageIndex(): Promise<void> {
    this.paymentMessageIndexLoading.set(true);
    this.paymentMessageIndexError.set("");
    try {
      const response = await firstValueFrom(
        this.http.get<PaymentMessageIndexResponse>(
          `${this.api}/settlements/message-index`,
        ),
      );
      this.paymentMessageIndex.set(response.items);
    } catch {
      this.paymentMessageIndex.set([]);
      this.paymentMessageIndexError.set("PAYMENT_MESSAGE_INDEX_UNAVAILABLE");
    } finally {
      this.paymentMessageIndexLoading.set(false);
    }
  }

  searchPaymentMessageIndex(query: string): void {
    this.paymentMessageIndexSearch.set(query);
  }

  sortPaymentMessageIndexBy(key: PaymentMessageIndexSortKey): void {
    if (this.paymentMessageIndexSortKey() === key) {
      this.paymentMessageIndexSortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
      return;
    }
    this.paymentMessageIndexSortKey.set(key);
    this.paymentMessageIndexSortDirection.set("asc");
  }

  openPaymentMessage(item: PaymentMessageIndexItem): void {
    if (!item.selectable) return;
    void this.refresh();
    this.selectedPaymentScenario.set(null);
    this.selectedPaymentMessage.set(item);
    this.paymentTransactionOpen.set(true);
    this.resolutionCounterpartyType.set("BANK");
    this.resolutionFunction.set("INTERBANK_TRANSFER");
    this.resolutionMessageType.set(item.targetMessage);
    this.resolutionOutputFormat.set("MT");
    this.resolutionReference.set(`${item.messageType}-2026-000001`);
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }

  openPaymentScenario(scenario: PaymentMessageScenario): void {
    this.openPaymentMessage(paymentMessageForScenario(scenario));
    this.selectedPaymentScenario.set(scenario);
    const accounts = this.eligibleOwnNostroAccounts();
    const debit = accounts[0];
    const creditOneOfSeveral = scenario.code === "CREDIT_ONE_OF_SEVERAL_AT_57A";
    const credit =
      accounts.find(
        (item) =>
          item.id !== debit?.id &&
          item.currency === debit?.currency &&
          (creditOneOfSeveral
            ? item.accountServicerBic !== debit?.accountServicerBic
            : item.accountServicerBic === debit?.accountServicerBic),
      ) ??
      accounts[1] ??
      debit;
    const receiver = this.resolutionBanks().find(
      (bank) => bank.bic === debit?.accountServicerBic,
    );
    this.paymentScenarioValues.set({
      ...(debit ? { ownDebitAccountId: debit.id } : {}),
      ...(credit ? { ownCreditAccountId: credit.id } : {}),
      ...(receiver ? { receiverBankServiceId: receiver.bankServiceId } : {}),
    });
  }

  eligibleOwnNostroAccounts(): readonly OwnNostroReference[] {
    const entity = this.resolutionBookingEntity();
    const at = new Date(this.resolutionValueDate());
    return this.ownNostroAccounts().filter((account) => {
      const allowed = account.allowedBookingEntities ?? [];
      return (
        account.status === "ACTIVE" &&
        account.purpose === "SETTLEMENT" &&
        account.ownLegalEntityId === entity &&
        (!allowed.length ||
          allowed.includes("ANY") ||
          allowed.includes(entity)) &&
        new Date(account.validFrom) <= at &&
        at <= new Date(account.validTo)
      );
    });
  }

  scenarioControlValue(field: string): string {
    return this.paymentScenarioValues()[field] ?? "";
  }

  selectPaymentScenarioControl(field: string, value: string): void {
    this.paymentScenarioValues.update((current) => ({
      ...current,
      [field]: value,
    }));
    this.clearResolution();
  }

  togglePaymentScenarioSort(): void {
    this.paymentScenarioSortDirection.update((direction) =>
      direction === "asc" ? "desc" : "asc",
    );
  }

  sortAuditBy(key: AuditSortKey): void {
    if (this.auditSortKey() === key) {
      this.auditSortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    } else {
      this.auditSortKey.set(key);
      this.auditSortDirection.set("asc");
    }
    this.auditCurrentPage.set(1);
  }

  auditAriaSort(key: AuditSortKey): "ascending" | "descending" | "none" {
    if (this.auditSortKey() !== key) return "none";
    return this.auditSortDirection() === "asc" ? "ascending" : "descending";
  }

  moveAuditPage(delta: number): void {
    this.auditCurrentPage.set(
      Math.min(
        this.auditTotalPages(),
        Math.max(1, this.auditCurrentPage() + delta),
      ),
    );
  }

  openAuditDetail(detail: AuditPresentation): void {
    if (this.auditTab() === "ssi") {
      const snapshot = auditSsiSnapshot(detail);
      if (snapshot) {
        this.detailTarget.set(snapshot as SsiRow);
        return;
      }
    }
    this.auditDetail.set(detail);
  }

  auditSnapshot(detail: AuditPresentation): unknown {
    return auditGovernedSnapshot(detail);
  }

  auditMessageTypeChanges(
    detail: AuditPresentation,
  ): AuditMessageTypeChanges | null {
    const changedFields = this.auditObject(detail.changedFields);
    const messageTypes = this.auditObject(changedFields?.["messageTypes"]);
    if (!messageTypes) return null;
    const values = (key: string): readonly string[] =>
      Array.isArray(messageTypes[key])
        ? messageTypes[key].filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    return {
      unchanged: values("unchanged"),
      added: values("added"),
      suppressed: values("suppressed"),
    };
  }

  async closeOverlayOnEscape(): Promise<void> {
    if (this.bicPickerTarget()) {
      this.closeBicPicker();
      return;
    }
    if (this.tagTransactionOpen()) {
      this.cancelTagTransaction();
      return;
    }
    if (this.paymentTransactionOpen()) {
      this.closePaymentTransaction();
      return;
    }
    if (this.auditDetail()) {
      this.auditDetail.set(null);
      return;
    }
    if (this.deleteTarget()) {
      this.closeDeleteDialog();
      return;
    }
    if (this.view() === "maker") {
      await this.closeMaker();
      return;
    }
    if (this.detailTarget()) this.detailTarget.set(null);
  }

  closePaymentTransaction(): void {
    this.paymentTransactionOpen.set(false);
    this.selectedPaymentMessage.set(null);
    this.selectedPaymentScenario.set(null);
    this.clearResolution();
    this.changeDetector.detectChanges();
  }
  moveIndexPage(delta: number): void {
    this.indexPage.set(
      Math.min(this.indexTotalPages(), Math.max(1, this.indexPage() + delta)),
    );
    void this.refresh();
  }
  selectOwnershipTab(tab: "OWN" | "COUNTERPARTY"): void {
    this.ownershipTab.set(tab);
    this.ownershipSort.set(tab === "OWN" ? "BOOKING_ENTITY" : "CURRENCY");
    this.ownershipSortDirection.set("ASC");
    this.indexPage.set(1);
    if (tab === "OWN") this.selectedCounterpartyId.set("");
    if (tab === "COUNTERPARTY") {
      void Promise.all([this.refresh(), this.loadCounterpartyDirectory()]);
      return;
    }
    void this.refresh();
  }
  searchCounterpartyInbox(query: string): void {
    this.counterpartyInboxSearch.set(query);
    this.counterpartyInboxPage.set(1);
  }
  selectCounterpartyPartyType(
    partyType: "BANK_SSI" | "BANK_NO_SSI" | "CUSTOMER",
  ): void {
    this.counterpartyPartyType.set(partyType);
    this.selectedCounterpartyId.set("");
    this.counterpartyInboxPage.set(1);
  }
  sortCounterpartyInbox(sort: CounterpartyInboxSort): void {
    if (this.counterpartyInboxSort() === sort) {
      this.counterpartyInboxSortDirection.update((direction) =>
        direction === "ASC" ? "DESC" : "ASC",
      );
    } else {
      this.counterpartyInboxSort.set(sort);
      this.counterpartyInboxSortDirection.set("ASC");
    }
    this.counterpartyInboxPage.set(1);
  }
  sortOwnershipIndex(sort: SsiOwnershipSort): void {
    if (this.ownershipSort() === sort) {
      this.ownershipSortDirection.update((direction) =>
        direction === "ASC" ? "DESC" : "ASC",
      );
    } else {
      this.ownershipSort.set(sort);
      this.ownershipSortDirection.set("ASC");
    }
    this.indexPage.set(1);
    void this.refresh();
  }
  selectOwnershipStatus(
    status: "ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL",
  ): void {
    if (
      !this.ownershipActionAdapter.isVisibleSort(status, this.ownershipSort())
    ) {
      this.ownershipSort.set(
        this.ownershipTab() === "OWN" ? "BOOKING_ENTITY" : "CURRENCY",
      );
      this.ownershipSortDirection.set("ASC");
    }
    this.ownershipStatus.set(status);
    this.indexPage.set(1);
    void this.refresh();
  }
  searchOwnershipIndex(value: string): void {
    this.ownershipSearch.set(value);
    this.indexPage.set(1);
    void this.refresh();
  }
  counterpartyAriaSort(
    sort: CounterpartyInboxSort,
  ): "ascending" | "descending" | "none" {
    return ariaSortDirection(
      this.counterpartyInboxSort() === sort,
      this.counterpartyInboxSortDirection(),
    );
  }
  ownershipAriaSort(
    sort: SsiOwnershipSort,
  ): "ascending" | "descending" | "none" {
    return ariaSortDirection(
      this.ownershipSort() === sort,
      this.ownershipSortDirection(),
    );
  }
  counterpartySortIndicator(sort: CounterpartyInboxSort): string {
    return sortDirectionIndicator(
      this.counterpartyInboxSort() === sort,
      this.counterpartyInboxSortDirection(),
    );
  }
  ownershipSortIndicator(sort: SsiOwnershipSort): string {
    return sortDirectionIndicator(
      this.ownershipSort() === sort,
      this.ownershipSortDirection(),
    );
  }
  moveCounterpartyInboxPage(delta: number): void {
    this.counterpartyInboxPage.set(
      Math.min(
        this.counterpartyInboxTotalPages(),
        Math.max(1, this.counterpartyInboxPage() + delta),
      ),
    );
  }
  openCounterpartySsi(counterpartyId: string): void {
    const party = this.counterpartyInbox().find(
      (item) => item.counterpartyId === counterpartyId,
    );
    if (party?.ssiCount === 0) return;
    this.selectedCounterpartyId.set(counterpartyId);
    this.ownershipSearch.set("");
    this.ownershipStatus.set("ACTIVE");
    this.ownershipSort.set("CURRENCY");
    this.ownershipSortDirection.set("ASC");
    this.indexPage.set(1);
    this.detailTarget.set(null);
    void this.refresh();
  }
  closeCounterpartySsi(): void {
    this.selectedCounterpartyId.set("");
    this.ownershipSearch.set("");
    this.indexPage.set(1);
    this.detailTarget.set(null);
    void this.refresh();
  }
  setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
    this.document.defaultView?.localStorage.setItem("ssi-theme", mode);
    this.applyTheme(mode);
  }
  private applyTheme(mode: ThemeMode): void {
    const prefersDark =
      this.document.defaultView?.matchMedia("(prefers-color-scheme: dark)")
        .matches ?? false;
    this.document.documentElement.dataset["theme"] = activeTheme(
      mode,
      prefersDark,
    );
  }
  startNew(): void {
    this.editingId.set(null);
    this.revisionSource.set(null);
    this.resetMaker();
    this.view.set("maker");
    this.ensureMakerCurrencies();
  }

  async closeMaker(): Promise<void> {
    const revisionId = this.revisionSource() ? this.editingId() : null;
    if (revisionId) {
      try {
        await firstValueFrom(
          this.http.post(`${this.api}/ssis/${revisionId}/cancel-revision`, {
            actor: String(this.model["maker"] ?? "maker.revision"),
          }),
        );
      } catch {
        this.notice.set({
          kind: "error",
          text: "無法取消修訂；In Progress 鎖定仍保留，請重試。",
        });
        return;
      }
    }
    this.editingId.set(null);
    this.revisionSource.set(null);
    this.form.reset();
    if (revisionId) await this.refresh();
    this.view.set("dashboard");
  }

  async canDeactivate(): Promise<boolean> {
    if (this.pendingDeactivation) return this.pendingDeactivation;
    const attempt = this.performCanDeactivate().finally(() => {
      if (this.pendingDeactivation === attempt) this.pendingDeactivation = null;
    });
    this.pendingDeactivation = attempt;
    return attempt;
  }

  private async performCanDeactivate(): Promise<boolean> {
    const swiftData = this.swiftDataCrud();
    if (swiftData && !(await swiftData.canDeactivate())) return false;
    const revisionId =
      this.view() === "maker" && this.revisionSource()
        ? this.editingId()
        : null;
    if (!revisionId) return true;
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/ssis/${revisionId}/cancel-revision`, {
          actor: String(this.model["maker"] ?? "maker.revision"),
        }),
      );
      this.editingId.set(null);
      this.revisionSource.set(null);
      return true;
    } catch {
      this.notice.set({
        kind: "error",
        text: "無法取消修訂；In Progress 鎖定仍保留，請重試。",
      });
      return false;
    }
  }

  async create(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notice.set({ kind: "warning", text: "請修正必填欄位及 BIC 格式。" });
      return;
    }
    try {
      this.applyCounterpartyIdentityPolicy();
      const id = this.editingId();
      if (id)
        await firstValueFrom(
          this.http.put(`${this.api}/ssis/${id}`, this.model),
        );
      else await firstValueFrom(this.http.post(`${this.api}/ssis`, this.model));
      this.notice.set({
        kind: "info",
        text:
          id || this.revisionSource()
            ? "SSI 草稿已更新；請提交審批。"
            : "SSI 草稿已建立；請提交審批。",
      });
      this.editingId.set(null);
      this.revisionSource.set(null);
      this.ownershipStatus.set("DRAFT");
      this.indexPage.set(1);
      await this.refresh();
      this.view.set("dashboard");
    } catch {
      this.notice.set({
        kind: "error",
        text: "儲存失敗；請確認資料格式及 Maker 權限。",
      });
    }
  }

  async act(row: SsiRow, action: "submit" | "approve"): Promise<void> {
    const actor = action === "submit" ? row.maker : "checker.demo";
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/ssis/${row.id}/${action}`, { actor }),
      );
      await this.refresh();
    } catch {
      this.notice.set({ kind: "error", text: `動作 ${action} 被拒絕。` });
    }
  }

  edit(row: SsiRow): void {
    if (row.changeType === "SUPPRESSION") return;
    if (!["DRAFT", "WIP"].includes(row.status)) {
      void this.revise(row);
      return;
    }
    this.editingId.set(row.id);
    this.revisionSource.set(null);
    this.model = this.modelForRow(row);
    this.view.set("maker");
    this.ensureMakerCurrencies();
  }

  isOwnershipActionPresented(
    action: MaintenanceIndexActionId,
    row: SsiRow,
  ): boolean {
    return this.ownershipActionAdapter.isPresented(action, row);
  }

  ownershipCurrentStatusLabel(row: SsiRow): string {
    return currentStatusLabel(row.currentStatus ?? "EMPTY");
  }

  private ensureMakerCurrencies(): void {
    if (this.currencies().length === 0 && !this.currenciesLoading())
      void this.loadCurrencies();
  }

  requestTypeLabel(row: SsiRow): "ADD" | "EDIT" | "SUPPRESSED" {
    if (row.changeType === "SUPPRESSION") return "SUPPRESSED";
    if (row.changeType === "REVISION" || row.amendmentOfId) return "EDIT";
    return "ADD";
  }

  private modelForRow(row: SsiRow): Record<string, unknown> {
    return ssiFormModel(row, this.ownershipOf(row));
  }

  async revise(row: SsiRow): Promise<void> {
    try {
      const maker = "maker.revision";
      const revision = await firstValueFrom(
        this.http.post<SsiRow>(`${this.api}/ssis/${row.id}/revise`, { maker }),
      );
      this.notice.set(null);
      this.editingId.set(revision.id);
      this.revisionSource.set(row);
      this.model = { ...this.modelForRow(revision), maker };
      this.view.set("maker");
      this.ensureMakerCurrencies();
      await this.refresh();
    } catch {
      this.notice.set({
        kind: "error",
        text: "無法建立修訂；此 SSI 可能正由其他使用者修改。",
      });
    }
  }

  requestDelete(row: SsiRow): void {
    this.deleteTarget.set(row);
    this.deleteReason.set("");
  }
  requestDraftRevoke(row: SsiRow): void {
    if (row.status !== "DRAFT") return;
    this.deleteTarget.set(row);
    this.deleteReason.set("");
  }
  closeDeleteDialog(): void {
    this.deleteTarget.set(null);
    this.deleteReason.set("");
  }
  async confirmDelete(): Promise<void> {
    const row = this.deleteTarget();
    const reason = this.deleteReason().trim();
    if (!row || reason.length < 5) return;
    try {
      if (row.status === "DRAFT") {
        await firstValueFrom(
          this.http.delete(`${this.api}/ssis/${row.id}`, {
            body: { actor: row.maker, reason },
          }),
        );
      } else {
        await firstValueFrom(
          this.http.post(`${this.api}/ssis/${row.id}/suppress`, {
            maker: "maker.suppression",
            reason,
          }),
        );
      }
      this.closeDeleteDialog();
      this.ownershipStatus.set(row.status === "DRAFT" ? "ACTIVE" : "DRAFT");
      this.indexPage.set(1);
      this.notice.set({
        kind: "info",
        text:
          row.status === "DRAFT"
            ? "Draft 已撤銷；原 Active SSI 已恢復可 Revise／Suppress。"
            : "SUPPRESSION DRAFT 已建立；原 Active SSI 在 Checker 核准前繼續有效。",
      });
      await this.refresh();
    } catch {
      await this.refresh();
      this.notice.set({
        kind: "error",
        text: "Suppression 建立失敗；狀態已重新檢查，可能已有進行中的工作。",
      });
    }
  }

  selectResolutionCounterpartyBankService(bankServiceId: string): void {
    const bank = bankIdentityByServiceId(this.resolutionBanks(), bankServiceId);
    if (!bank || this.resolutionBanksError()) return;
    if (
      this.resolutionCounterpartyBankServiceId() === bank.bankServiceId &&
      this.resolutionCounterpartyBic() === bank.bic
    )
      return;
    this.resolutionCounterpartyBankServiceId.set(bank.bankServiceId);
    this.resolutionCounterpartyBic.set(bank.bic);
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionCustomerId(customerId: string): void {
    this.resolutionCustomerId.set(customerId);
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionCurrency(currency: string): void {
    this.resolutionCurrency.set(currency);
    this.resolutionClearingSystem.set("");
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionSettlementCountry(country: string): void {
    this.resolutionSettlementCountry.set(country);
    this.resolutionClearingSystem.set("");
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionBookingEntity(entity: string): void {
    this.resolutionBookingEntity.set(entity);
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionValueDate(valueDate: string): void {
    this.resolutionValueDate.set(valueDate);
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionSettlementMarket(market: string): void {
    this.resolutionSettlementMarket.set(market);
    this.resolutionClearingSystem.set("");
    this.clearResolution();
    void this.refreshResolutionClearingOptions();
  }
  selectResolutionClearingSystem(clearingSystem: string): void {
    this.resolutionClearingSystem.set(clearingSystem);
    this.clearResolution();
  }
  selectResolutionAmount(amount: string): void {
    this.resolutionAmount.set(amount);
    this.clearResolution();
  }
  selectResolutionReference(reference: string): void {
    this.resolutionReference.set(reference);
    this.clearResolution();
  }
  async refreshResolutionClearingOptions(): Promise<void> {
    const requestSequence = ++this.clearingOptionsRequestSequence;
    try {
      const response = await firstValueFrom(
        this.http.post<{ items: ClearingSystemReference[] }>(
          `${this.api}/settlements/clearing-options`,
          {
            consumer: this.resolutionConsumer(),
            product: this.resolutionProduct(),
            counterpartyBankServiceId:
              this.resolutionCounterpartyBankServiceId(),
            ...(this.resolutionSettlementCountry()
              ? { settlementCountry: this.resolutionSettlementCountry() }
              : {}),
            ...(this.resolutionSettlementMarket()
              ? { settlementMarket: this.resolutionSettlementMarket() }
              : {}),
            currency: this.resolutionCurrency(),
            businessFunction: this.resolutionFunction(),
            paymentLeg: this.resolutionPaymentLeg(),
            direction: this.resolutionDirection(),
            bookingEntity: this.resolutionBookingEntity(),
            valueDate: this.resolutionValueDate(),
            amount: this.resolutionAmount(),
            messageType: this.resolutionMessageType(),
            sourceMessageType: this.selectedPaymentMessage()?.messageType,
            transactionReference: this.resolutionReference(),
          },
        ),
      );
      if (requestSequence !== this.clearingOptionsRequestSequence) return;
      this.eligibleClearingSystemCodes.set(
        response.items.map((system) => system.code),
      );
      this.clearIncompatibleClearingOverride();
    } catch {
      if (requestSequence !== this.clearingOptionsRequestSequence) return;
      this.eligibleClearingSystemCodes.set([]);
      if (this.resolutionClearingSystem())
        this.selectResolutionClearingSystem("");
    }
  }

  private resolutionRequestPayload(): Record<string, unknown> {
    const request: Record<string, unknown> = {
      consumer: this.resolutionConsumer(),
      correlationId: globalThis.crypto.randomUUID(),
      currency: this.resolutionCurrency(),
      product: this.resolutionProduct(),
      businessFunction: this.resolutionFunction(),
      paymentLeg: this.resolutionPaymentLeg(),
      direction: this.resolutionDirection(),
      bookingEntity: this.resolutionBookingEntity(),
      valueDate: this.resolutionValueDate(),
      amount: this.resolutionAmount(),
      messagingService: "FINPLUS",
      messageType: this.resolutionMessageType(),
      transactionReference: this.resolutionReference(),
    };
    const optionalValues = {
      settlementCountry: this.resolutionSettlementCountry(),
      settlementMarket: this.resolutionSettlementMarket(),
      clearingSystem: this.resolutionClearingSystem(),
      sourceMessageType: this.selectedPaymentMessage()?.messageType,
    };
    Object.entries(optionalValues).forEach(([key, value]) => {
      if (value) request[key] = value;
    });
    const scenario = this.selectedPaymentScenario();
    if (scenario) {
      const values = this.paymentScenarioValues();
      request["scenarioCode"] = scenario.code;
      for (const field of [
        "ownDebitAccountId",
        "ownCreditAccountId",
        "receiverBankServiceId",
      ]) {
        const value = values[field];
        if (value) request[field] = value;
      }
      for (const [idField, versionField] of [
        ["ownDebitAccountId", "ownDebitAccountVersion"],
        ["ownCreditAccountId", "ownCreditAccountVersion"],
      ] as const) {
        const selected = this.ownNostroAccounts().find(
          (account) => account.id === values[idField],
        );
        if (selected) request[versionField] = selected.version;
      }
    } else {
      request["counterpartyBankServiceId"] =
        this.resolutionCounterpartyBankServiceId();
      request["paymentBeneficiaryInstitutionInput"] =
        this.resolutionCounterpartyBic();
    }
    return request;
  }

  private async acceptResolutionResponse(
    result: unknown,
    requestSequence: number,
  ): Promise<void> {
    if (requestSequence !== this.resolutionRequestSequence) return;
    if (isMt2ResolutionContract(result)) {
      this.resolutionContractResult.set(result);
      const chosenRoute = contractChosenRoute(result);
      this.resolutionSelectedSsiId.set(scalarText(chosenRoute?.["ssiId"]));
      return;
    }
    const legacyResult = result as ResolutionResponse;
    this.resolutionResult.set(legacyResult);
    this.resolutionSelectedSsiId.set(
      legacyResult.recommendedRoute?.ssiId ?? "",
    );
    if (legacyResult.recommendedRoute)
      await this.confirmResolution(requestSequence);
  }

  private acceptResolutionError(error: unknown, requestSequence: number): void {
    if (requestSequence !== this.resolutionRequestSequence) return;
    const contract = mt2ResolutionContractFromError(error);
    if (contract && contractCandidates(contract).length)
      this.resolutionContractResult.set(contract);
    this.resolutionRequestError.set(presentResolutionError(error));
  }

  async resolve(): Promise<void> {
    const ownScenario = Boolean(
      this.selectedPaymentScenario()?.code === "BOOK_TRANSFER_SAME_RECEIVER" ||
      this.selectedPaymentScenario()?.code === "CREDIT_ONE_OF_SEVERAL_AT_57A",
    );
    if (
      this.resolutionBanksError() ||
      (!ownScenario && !this.resolutionCounterpartyBankServiceId())
    )
      return;
    this.clearResolution();
    const requestSequence = this.resolutionRequestSequence;
    this.resolutionLoading.set(true);
    try {
      const result: unknown = await firstValueFrom(
        this.http.post<unknown>(
          `${this.api}/settlements/resolve`,
          this.resolutionRequestPayload(),
        ),
      );
      await this.acceptResolutionResponse(result, requestSequence);
    } catch (error: unknown) {
      this.acceptResolutionError(error, requestSequence);
    } finally {
      if (requestSequence === this.resolutionRequestSequence)
        this.resolutionLoading.set(false);
    }
  }
  async confirmResolution(
    resolutionRequestSequence = this.resolutionRequestSequence,
  ): Promise<void> {
    if (resolutionRequestSequence !== this.resolutionRequestSequence) return;
    if (this.resolutionConfirming()) return;
    const result = this.resolutionResult();
    const selected = this.selectedResolutionRoute();
    const contractRoute = this.resolutionContractChosenRoute();
    const contractEvidence = this.resolutionContractEvidence();
    const attemptId = contractEvidence?.resolutionToken ?? result?.attemptId;
    const selectedSsiId = scalarText(
      contractRoute?.["ssiId"] ?? selected?.ssiId,
    );
    if (!attemptId || !selectedSsiId) return;
    const confirmationRequestSequence = ++this
      .resolutionConfirmationRequestSequence;
    this.resolutionConfirming.set(true);
    try {
      const confirmation = await firstValueFrom(
        this.http.post<ResolutionConfirmation>(
          `${this.api}/settlements/${attemptId}/confirm`,
          {
            selectedSsiId,
            actor: "maker.demo",
            ...(this.resolutionHasManualRouteOverride()
              ? { overrideReason: "USER_SELECTED_ALTERNATIVE_ROUTE" }
              : {}),
          },
        ),
      );
      if (
        resolutionRequestSequence === this.resolutionRequestSequence &&
        confirmationRequestSequence ===
          this.resolutionConfirmationRequestSequence
      )
        this.resolutionConfirmation.set(confirmation);
    } catch {
      if (
        resolutionRequestSequence === this.resolutionRequestSequence &&
        confirmationRequestSequence ===
          this.resolutionConfirmationRequestSequence
      )
        this.notice.set({
          kind: "error",
          text: "Confirm 被拒絕：Preview 已過期、路徑已失效，或替代路徑需要 override reason。",
        });
    } finally {
      if (
        resolutionRequestSequence === this.resolutionRequestSequence &&
        confirmationRequestSequence ===
          this.resolutionConfirmationRequestSequence
      )
        this.resolutionConfirming.set(false);
    }
  }
  selectResolutionRoute(ssiId: string): void {
    this.resolutionConfirmationRequestSequence += 1;
    this.resolutionConfirming.set(false);
    this.resolutionSelectedSsiId.set(ssiId);
    this.resolutionConfirmation.set(null);
    if (!this.resolutionHasManualRouteOverride()) void this.confirmResolution();
  }
  clearResolution(): void {
    this.resolutionRequestSequence += 1;
    this.resolutionConfirmationRequestSequence += 1;
    this.resolutionLoading.set(false);
    this.resolutionConfirming.set(false);
    this.resolutionResult.set(null);
    this.resolutionContractResult.set(null);
    this.resolutionConfirmation.set(null);
    this.resolutionSelectedSsiId.set("");
    this.resolutionRequestError.set("");
  }

  chooseTagSsi(id: string): void {
    this.tagSsiId.set(id);
    const selected = this.controlledTagCandidates().find(
      (candidate) => candidate.id === id,
    );
    if (selected) this.resolutionCounterpartyBic.set(selected.counterpartyBic);
    this.clearTagGeneration();
  }
  selectTagCurrency(currency: string): void {
    this.resolutionCurrency.set(currency);
    const eligible = this.eligibleSuggestionBanks();
    if (!eligible.some((bank) => bank.bic === this.resolutionCounterpartyBic()))
      this.resolutionCounterpartyBic.set(eligible[0]?.bic ?? "");
    this.updateTagTransactionContext();
  }
  selectTagCounterparty(bic: string): void {
    if (!this.eligibleSuggestionBanks().some((bank) => bank.bic === bic))
      return;
    this.resolutionCounterpartyBic.set(bic);
    this.updateTagTransactionContext();
  }
  updateTagTransactionContext(): void {
    this.clearTagGeneration();
    void this.loadControlledTagCandidates();
  }
  clearTagGeneration(): void {
    this.tagGenerationRequestSequence += 1;
    this.generationResult.set(null);
    this.tagLoading.set(false);
  }
  chooseTagScenario(id: string): void {
    this.tagScenarioId.set(id);
    this.pseudoContent = this.selectedTagScenario().content;
    this.extractionResult.set(null);
    this.clearTagGeneration();
    void this.loadControlledTagCandidates();
  }
  searchTagCatalog(query: string): void {
    this.tagCatalogSearch.set(query);
    this.tagCatalogPage.set(1);
  }
  sortTagCatalog(key: TagCatalogSortKey): void {
    if (this.tagCatalogSortKey() === key) {
      this.tagCatalogSortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    } else {
      this.tagCatalogSortKey.set(key);
      this.tagCatalogSortDirection.set("asc");
    }
    this.tagCatalogPage.set(1);
  }
  async openTagMessage(messageType: string): Promise<void> {
    const candidates = this.tagScenarios.filter(
      (item) => item.descriptor.messageType === messageType,
    );
    const scenario =
      candidates.find(
        (item) => item.executable && item.descriptor.direction === "OUTGOING",
      ) ??
      candidates.find((item) => item.executable) ??
      candidates.find((item) => item.descriptor.direction === "OUTGOING") ??
      candidates[0];
    if (scenario) {
      this.openTagTransaction(scenario.id);
      await this.loadControlledTagCandidates();
      if (scenario.executable && !this.tagSuggestionValidationIssue())
        await this.generateTags();
    }
  }
  openTagTransaction(id: string): void {
    this.chooseTagScenario(id);
    this.tagTransactionOpen.set(true);
  }
  cancelTagTransaction(): void {
    this.tagTransactionOpen.set(false);
    this.extractionResult.set(null);
    this.clearTagGeneration();
  }
  moveTagCatalogPage(delta: number): void {
    this.tagCatalogPage.set(
      Math.min(
        this.tagCatalogTotalPages(),
        Math.max(1, this.tagCatalogPage() + delta),
      ),
    );
  }
  async extract(): Promise<void> {
    this.clearTagGeneration();
    this.tagLoading.set(true);
    try {
      this.extractionResult.set(
        await firstValueFrom(
          this.http.post<ExtractionResponse>(`${this.api}/messages/extract`, {
            format: this.selectedTagScenario().format,
            content: this.pseudoContent,
          }),
        ),
      );
    } catch {
      this.notice.set({
        kind: "error",
        text: "Pseudo message 解析失敗；請檢查標頭、JSON 或 Tag 格式。",
      });
    } finally {
      this.tagLoading.set(false);
    }
  }
  async generateTags(): Promise<void> {
    const ssi = this.selectedTagSsi();
    const validationIssue = this.tagSuggestionValidationIssue();
    if (validationIssue) {
      this.notice.set({ kind: "error", text: validationIssue });
      return;
    }
    const requestSequence = ++this.tagGenerationRequestSequence;
    this.tagLoading.set(true);
    this.extractionResult.set(null);
    try {
      const result = await firstValueFrom(
        this.http.post<GenerationResponse>(
          `${this.api}/reference/fin-controlled-resolutions`,
          this.controlledTagResolutionPayload(ssi),
        ),
      );
      if (requestSequence === this.tagGenerationRequestSequence)
        this.generationResult.set(result);
      if (requestSequence === this.tagGenerationRequestSequence)
        this.notice.set(null);
    } catch {
      if (requestSequence === this.tagGenerationRequestSequence)
        this.notice.set({
          kind: "error",
          text: "Resolution 失敗；此 exact MT／sequence／settlement leg 沒有已驗證 profile。",
        });
    } finally {
      if (requestSequence === this.tagGenerationRequestSequence)
        this.tagLoading.set(false);
    }
  }

  private async loadControlledTagCandidates(): Promise<void> {
    const requestSequence = ++this.controlledTagCandidateRequestSequence;
    const descriptor = this.selectedTagScenario().descriptor;
    const parameters = new URLSearchParams({
      messageType: descriptor.messageType,
      currency: this.resolutionCurrency(),
      bookingEntity: this.resolutionBookingEntity(),
      valueDate: this.resolutionValueDate(),
    });
    if (descriptor.sequence) parameters.set("sequence", descriptor.sequence);
    try {
      const response = await firstValueFrom(
        this.http.get<ControlledFixtureResponse>(
          `${this.api}/reference/fin-controlled-fixtures?${parameters.toString()}`,
        ),
      );
      if (requestSequence !== this.controlledTagCandidateRequestSequence)
        return;
      const candidates = response.candidates.map((candidate) => ({
        ...candidate,
        routeGraph: candidate.routeGraph ?? {
          accountRelationship: candidate.accountRelationship,
          additionalAccountWithRequired: false,
          routeComplete: true,
          evidenceValid: true,
          evidenceIds: [
            candidate.identity?.ssi.id ?? candidate.id,
            candidate.identity?.applicability.id ??
              candidate.bindingId ??
              candidate.id,
          ],
        },
      }));
      this.controlledTagCandidates.set(candidates);
      this.ensureTagSsiSelection();
    } catch {
      if (requestSequence !== this.controlledTagCandidateRequestSequence)
        return;
      this.controlledTagCandidates.set([]);
      this.tagSsiId.set("");
    }
  }

  private controlledTagResolutionPayload(
    ssi: DemoFinSuggestionCandidate | null,
  ) {
    const descriptor = this.selectedTagScenario().descriptor;
    return {
      messageType: descriptor.messageType,
      ...(descriptor.sequence ? { sequence: descriptor.sequence } : {}),
      currency: this.resolutionCurrency(),
      bookingEntity: this.resolutionBookingEntity(),
      valueDate: this.resolutionValueDate(),
      transactionReference: this.tagTransactionReference(),
      ...(ssi?.bindingId ? { bindingId: ssi.bindingId } : {}),
    };
  }

  async openBicPicker(target: BicTarget, title: string): Promise<void> {
    this.bicPickerTarget.set(target);
    this.bicPickerTitle.set(title);
    const source =
      target === "counterpartyId" &&
      this.form.get("route.counterpartyType")?.value === "CUSTOMER"
        ? "CUSTOMER"
        : "BANK";
    this.identityPickerSource.set(source);
    if (source === "CUSTOMER") {
      this.customerQuery.set("");
      await this.loadCustomers(1);
      return;
    }
    this.bankQuery.set("");
    this.bankPickerError.set(null);
    await this.loadBanks(1);
  }
  closeBicPicker(): void {
    this.bicPickerTarget.set(null);
  }
  async searchBanks(query: string): Promise<void> {
    this.bankQuery.set(query.trim());
    await this.loadBanks(1);
  }
  async moveBankPage(delta: number): Promise<void> {
    await this.loadBanks(this.bankPage().page + delta);
  }
  async moveBankToPage(page: number): Promise<void> {
    await this.loadBanks(page);
  }
  async searchCustomers(query: string): Promise<void> {
    this.customerQuery.set(query.trim());
    await this.loadCustomers(1);
  }
  async moveCustomerPage(delta: number): Promise<void> {
    await this.loadCustomers(this.customerPage().page + delta);
  }
  selectBank(bank: BankReference): void {
    const target = this.bicPickerTarget();
    if (!target) return;
    if (target === "counterpartyId") {
      const counterpartyId = `CP-${bank.bic}`;
      this.form.get("counterpartyId")?.setValue(counterpartyId);
      this.model = {
        ...this.model,
        counterpartyId,
        route: {
          ...(this.model["route"] as Record<string, string> | undefined),
          counterpartyBic: bank.bic,
        },
      };
      this.closeBicPicker();
      return;
    }
    this.form.get(`route.${target}`)?.setValue(bank.bic);
    this.closeBicPicker();
  }
  selectBankPickerItem(item: BankServicePickerItem): void {
    const bank = this.bankPage().items.find(
      (candidate) => candidate.bankServiceId === item.bankServiceId,
    );
    if (bank) this.selectBank(bank);
  }
  selectCustomer(customer: CustomerReference): void {
    this.form.get("counterpartyId")?.setValue(customer.customerId);
    this.closeBicPicker();
  }
  selectedBic(target: BicTarget): string {
    return String(
      this.form.get(target === "counterpartyId" ? target : `route.${target}`)
        ?.value ?? "尚未選擇",
    );
  }

  private ensureTagSsiSelection(): void {
    const options = this.relatedTagSsis();
    if (!options.some((row) => row.id === this.tagSsiId()))
      this.tagSsiId.set(options[0]?.id ?? "");
  }

  private async loadCurrencies(): Promise<void> {
    this.currenciesLoading.set(true);
    try {
      const currencies = await firstValueFrom(
        this.http.get<CurrencyReference[]>(`${this.api}/reference/currencies`),
      );
      this.currencies.set(currencies);
      this.fields.set(this.buildFields(currencies));
    } catch {
      this.notice.set({
        kind: "warning",
        text: "Currency 參考服務暫時不可用。",
      });
    } finally {
      this.currenciesLoading.set(false);
    }
  }
  async loadFinResolutionCatalogue(): Promise<void> {
    this.finResolutionCatalogueLoading.set(true);
    this.finResolutionCatalogueError.set("");
    try {
      const response = await firstValueFrom(
        this.http.get<FinResolutionCatalogueResponse>(
          `${this.api}/reference/fin-resolution-catalogue?standardsRelease=SR2026`,
        ),
      );
      this.finResolutionCatalogue.set(response.items);
    } catch {
      this.finResolutionCatalogueError.set(
        "FIN SSI Resolution Catalogue 暫時無法載入。",
      );
      this.notice.set({
        kind: "warning",
        text: "FIN SSI Resolution Catalogue 暫時不可用；Scope 標記採 fail-closed。",
      });
    } finally {
      this.finResolutionCatalogueLoading.set(false);
    }
  }
  private async loadCountries(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ items: CountryReference[] }>(
          `${this.api}/reference/countries`,
        ),
      );
      this.countries.set(
        response.items.filter((item) => item.status === "ACTIVE"),
      );
    } catch {
      this.notice.set({
        kind: "warning",
        text: "Country Standing Data 暫時不可用。",
      });
    }
  }
  private async loadBookingBranches(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ items: BookingBranchReference[] }>(
          `${this.api}/reference/booking-branches`,
        ),
      );
      this.bookingBranches.set(
        response.items.filter((item) => item.status === "ACTIVE"),
      );
    } catch {
      this.notice.set({
        kind: "warning",
        text: "Booking Branch/Entity Standing Data 暫時不可用。",
      });
    }
  }
  private async loadClearingSystems(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ items: ClearingSystemReference[] }>(
          `${this.api}/reference/clearing-systems`,
        ),
      );
      this.clearingSystems.set(
        response.items.filter((item) => item.status === "ACTIVE"),
      );
    } catch {
      this.notice.set({
        kind: "warning",
        text: "Clearing System Standing Data 暫時不可用；Resolution 採 fail-closed。",
      });
    }
  }
  private clearIncompatibleClearingOverride(): void {
    const selected = this.resolutionClearingSystem();
    if (
      selected &&
      !this.resolutionClearingSystems().some(
        (system) => system.code === selected,
      )
    )
      this.selectResolutionClearingSystem("");
  }
  async loadResolutionBanks(): Promise<void> {
    this.resolutionBanksLoading.set(true);
    this.resolutionBanksError.set("");
    try {
      const firstPage = await firstValueFrom(
        this.http.get<BankPage>(
          `${this.api}/reference/banks?page=1&pageSize=${this.indexPageSize}&query=`,
        ),
      );
      const remaining = await Promise.all(
        Array.from(
          { length: Math.max(0, firstPage.totalPages - 1) },
          (_, index) =>
            firstValueFrom(
              this.http.get<BankPage>(
                `${this.api}/reference/banks?page=${index + 2}&pageSize=${this.indexPageSize}&query=`,
              ),
            ),
        ),
      );
      const banks = [firstPage, ...remaining].flatMap((page) => page.items);
      this.resolutionBanks.set(banks);
      const selected =
        banks.find((bank) => bank.bic === this.resolutionCounterpartyBic()) ??
        banks[0];
      if (!selected) throw new Error("Bank Service returned no identities");
      this.resolutionCounterpartyBankServiceId.set(selected.bankServiceId);
      this.resolutionCounterpartyBic.set(selected.bic);
      this.clearResolution();
    } catch {
      this.resolutionBanks.set([]);
      this.resolutionCounterpartyBankServiceId.set("");
      this.resolutionCounterpartyBic.set("");
      this.clearResolution();
      this.resolutionBanksError.set("BANK_SERVICE_UNAVAILABLE");
    } finally {
      this.resolutionBanksLoading.set(false);
    }
  }
  async loadOwnNostroAccounts(): Promise<void> {
    try {
      this.ownNostroAccounts.set(
        await firstValueFrom(
          this.http.get<OwnNostroReference[]>(`${this.api}/nostro-accounts`),
        ),
      );
    } catch {
      this.ownNostroAccounts.set([]);
    }
  }
  private async loadCounterpartyDirectory(): Promise<void> {
    this.counterpartyDirectoryLoading.set(true);
    try {
      const [response, coverage] = await Promise.all([
        firstValueFrom(
          this.http.get<{ items: readonly CounterpartyReference[] }>(
            `${this.api}/reference/counterparties`,
          ),
        ),
        firstValueFrom(
          this.http.get<readonly CounterpartySsiSummarySource[]>(
            `${this.api}/ssis/counterparty-coverage?status=ACTIVE`,
          ),
        ),
      ]);
      this.counterpartyDirectory.set(response.items);
      this.counterpartyCoverage.set(coverage);
    } catch {
      this.counterpartyDirectory.set([]);
      this.counterpartyCoverage.set([]);
      this.notice.set({
        kind: "warning",
        text: "Counterparty Master 暫時不可用。",
      });
    } finally {
      this.counterpartyDirectoryLoading.set(false);
    }
  }
  private async loadBanks(page: number): Promise<void> {
    this.banksLoading.set(true);
    this.bankPickerError.set(null);
    try {
      const query = encodeURIComponent(this.bankQuery());
      this.bankPage.set(
        await firstValueFrom(
          this.http.get<BankPage>(
            `${this.api}/reference/banks?page=${page}&pageSize=${this.indexPageSize}&query=${query}`,
          ),
        ),
      );
    } catch {
      this.bankPickerError.set("Bank Service lookup is unavailable.");
      this.notice.set({ kind: "error", text: "BIC 參考服務暫時不可用。" });
    } finally {
      this.banksLoading.set(false);
    }
  }
  private async loadCustomers(page: number): Promise<void> {
    this.customersLoading.set(true);
    try {
      const query = encodeURIComponent(this.customerQuery());
      this.customerPage.set(
        await firstValueFrom(
          this.http.get<CustomerPage>(
            `${this.api}/reference/customers?page=${page}&pageSize=5&query=${query}`,
          ),
        ),
      );
    } catch {
      this.notice.set({
        kind: "error",
        text: "Customer 參考服務暫時不可用。",
      });
      this.closeBicPicker();
    } finally {
      this.customersLoading.set(false);
    }
  }
  async loadAudit(): Promise<void> {
    this.auditLoading.set(true);
    this.auditError.set("");
    try {
      const auditPath: Record<GovernanceTab, string> = {
        rma: "rma-authorisations/audit/events",
        entity: "booking-branch-entities/audit/events",
        nostro: "nostro-accounts/audit/events",
        ssi: "audit",
      };
      const [rows, lifecycle, contract] = await Promise.all([
        firstValueFrom(
          this.http.get<AuditRow[]>(
            `${this.api}/${auditPath[this.auditTab()]}`,
          ),
        ),
        firstValueFrom(
          this.http.get<AuditLifecycleHealth>(
            `${this.api}/health/audit-retention`,
          ),
        ),
        firstValueFrom(
          this.http.get<CheckerOpenApiContract>(
            "/openapi/swift-data-service.v1.json",
          ),
        ),
      ]);
      this.auditRows.set(rows);
      this.auditParameterFields.set(
        contract["x-ui-resources"].find(
          (resource) => resource.id === this.auditTab(),
        )?.fields ?? [],
      );
      this.auditOnlineQueryDays.set(lifecycle.onlineQueryDays);
      this.auditArchiveAfterDays.set(lifecycle.archiveAfterDays);
      this.auditArchiveRetentionDays.set(lifecycle.archiveRetentionDays);
      this.auditScheduleIntervalHours.set(lifecycle.scheduleIntervalHours);
      this.auditCurrentPage.set(1);
    } catch {
      this.auditError.set("AUDIT_SERVICE_UNAVAILABLE");
    } finally {
      this.auditLoading.set(false);
    }
  }
  selectAuditTab(tab: GovernanceTab): void {
    this.auditDetail.set(null);
    this.detailTarget.set(null);
    this.auditTab.set(tab);
    this.auditIndexSortPath.set(null);
    void this.loadAudit();
  }
  selectCheckerTab(tab: GovernanceTab): void {
    this.checkerTab.set(tab);
    this.checkerIndexSortPath.set(null);
    this.checkerCurrentPage.set(1);
  }
  sortCheckerIndex(path: string): void {
    if (this.checkerIndexSortPath() === path)
      this.checkerSortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.checkerIndexSortPath.set(path);
      this.checkerSortDirection.set("asc");
    }
    this.checkerCurrentPage.set(1);
  }
  moveCheckerPage(delta: number): void {
    this.checkerCurrentPage.update((page) =>
      Math.min(this.checkerTotalPages(), Math.max(1, page + delta)),
    );
  }
  sortAuditIndex(path: string): void {
    if (this.auditIndexSortPath() === path)
      this.auditSortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.auditIndexSortPath.set(path);
      this.auditSortDirection.set("asc");
    }
    this.auditCurrentPage.set(1);
  }
  private auditRecord(
    event: AuditPresentation,
  ): Readonly<Record<string, unknown>> {
    const value = auditGovernedSnapshot(event);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : {};
  }
  private auditRecordValue(record: object, path: string): string {
    if (path === "__requestType")
      return this.requestTypeLabel(record as SsiRow);
    if (path.includes("|"))
      return (
        path
          .split("|")
          .map((part) => this.auditRecordValue(record, part))
          .filter((part) => part !== "—")
          .join(" / ") || "—"
      );
    let value: unknown = record;
    for (const key of path.split(".")) {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        return "—";
      value = (value as Readonly<Record<string, unknown>>)[key];
    }
    if (path === "status" && value === "PENDING_APPROVAL") return "SUBMITTED";
    return Array.isArray(value) ? value.join(", ") : scalarText(value) || "—";
  }
  private auditObject(
    value: unknown,
  ): Readonly<Record<string, unknown>> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : null;
  }
  private auditFieldProps(
    field: AuditParameterField,
  ): NonNullable<FormlyFieldConfig["props"]> {
    const props: NonNullable<FormlyFieldConfig["props"]> = {
      label: field.label,
      required: Boolean(field.required),
      showPicker: false,
      options:
        field.optionsSource === "reference/currencies"
          ? this.currencies().map(({ code, decimals }) => ({
              label: `${code} · ${decimals} decimals`,
              value: code,
            }))
          : (field.options ?? []).map((value) => ({ label: value, value })),
    };
    const description =
      field.type === "multicheckbox"
        ? "受控 Message Types；按 View Message Types 查看完整選擇。"
        : field.description;
    const optionalProps: Array<
      [keyof NonNullable<FormlyFieldConfig["props"]>, unknown]
    > = [
      ["type", field.inputType],
      ["description", description],
      ["pattern", field.pattern],
      ["minLength", field.minLength],
      ["maxLength", field.maxLength],
      ["min", field.minimum],
      ["max", field.maximum],
    ];
    for (const [key, value] of optionalProps)
      if (value !== undefined) props[key] = value as never;
    return props;
  }
  displayStatus(status: string): string {
    return status === "PENDING_APPROVAL" ? "SUBMITTED" : status;
  }
  private resetMaker(): void {
    this.model = {
      maker: "maker.demo",
      scope: "STANDING",
      ownershipType: this.ownershipTab(),
      ownerParty: this.ownershipTab() === "OWN" ? "HK01" : "COUNTERPARTY",
      publisherParty: this.ownershipTab() === "OWN" ? "HK01" : "COUNTERPARTY",
      counterpartyId: "ANY",
      route: {
        currency: "USD",
        counterpartyType: "ANY_BANK",
        counterpartyBic: "ANY",
        beneficiarySource: "SSI",
      },
    };
    this.form.reset(this.model);
  }

  private applyCounterpartyIdentityPolicy(): void {
    const route = {
      ...(this.model["route"] as Record<string, string> | undefined),
    };
    const counterpartyId = scalarText(this.model["counterpartyId"]).trim();
    route["counterpartyType"] = route["counterpartyType"] ?? "BANK";
    if (route["counterpartyType"] === "BANK") {
      const currentBic = scalarText(route["counterpartyBic"])
        .trim()
        .toUpperCase();
      const derivedBic = counterpartyId.replace(/^CP-/i, "").toUpperCase();
      if (new RegExp(BIC_PATTERN).test(currentBic))
        route["counterpartyBic"] = currentBic;
      else if (new RegExp(BIC_PATTERN).test(derivedBic))
        route["counterpartyBic"] = derivedBic;
      else delete route["counterpartyBic"];
    } else if (route["counterpartyType"] === "ANY_BANK") {
      route["counterpartyBic"] = "ANY";
      this.model = { ...this.model, counterpartyId: "ANY", route };
      return;
    } else delete route["counterpartyBic"];
    this.model = { ...this.model, counterpartyId, route };
  }

  private buildFields(
    currencies: readonly CurrencyReference[],
  ): FormlyFieldConfig[] {
    const bicValidation = {
      required: true,
      pattern: BIC_PATTERN,
      maxLength: 11,
      minLength: 8,
    };
    return [
      {
        key: "maker",
        type: "input",
        props: {
          label: "Maker 使用者",
          required: true,
          description: "建立或修改草稿的操作人；Checker 必須為不同使用者。",
        },
      },
      {
        key: "ownershipType",
        type: "select",
        props: {
          label: "Ownership Type",
          required: true,
          options: [
            { label: "Own SSI／本行 SSI", value: "OWN" },
            { label: "Counterparty SSI／對手行 SSI", value: "COUNTERPARTY" },
          ],
        },
      },
      {
        key: "ownerParty",
        type: "input",
        props: { label: "Owner Party", required: true },
      },
      {
        key: "publisherParty",
        type: "input",
        props: { label: "Publisher Party", required: true },
      },
      {
        key: "route.counterpartyType",
        type: "select",
        props: {
          label: "Counterparty Type／交易對手類型",
          required: true,
          description:
            "SSI Maintenance 僅管理銀行間 settlement SSI；一般 Bank 使用 SWIFT BIC，通用 fallback 使用 ANY。",
          options: [
            { label: "Bank／銀行", value: "BANK" },
            {
              label: "Any approved bank／任何已核准銀行",
              value: "ANY_BANK",
            },
          ],
        },
      },
      {
        key: "counterpartyId",
        type: "bic-input",
        props: {
          label: "Counterparty ID／交易對手識別碼",
          required: true,
          placeholder: "Bank: CP-CITIUS33；通用 fallback: ANY",
          description:
            "內部穩定識別碼；Bank Service 選擇會同步保存對應的 SWIFT BIC。",
          pickerAction: () =>
            void this.openBicPicker("counterpartyId", "選擇交易對手識別碼"),
        },
        expressions: {
          "props.pattern": (field) =>
            (
              field.model as {
                route?: { counterpartyType?: "BANK" | "CUSTOMER" };
              }
            )?.route?.counterpartyType === "CUSTOMER"
              ? /^[A-Z0-9][A-Z0-9._-]{2,34}$/i
              : (
                    field.model as {
                      route?: { counterpartyType?: string };
                    }
                  )?.route?.counterpartyType === "ANY_BANK"
                ? /^ANY$/
                : COUNTERPARTY_ID_PATTERN,
          "props.minLength": (field) =>
            (
              field.model as {
                route?: { counterpartyType?: "BANK" | "CUSTOMER" };
              }
            )?.route?.counterpartyType === "CUSTOMER"
              ? 3
              : (
                    field.model as {
                      route?: { counterpartyType?: string };
                    }
                  )?.route?.counterpartyType === "ANY_BANK"
                ? 3
                : 3,
          "props.maxLength": (field) =>
            (
              field.model as {
                route?: { counterpartyType?: "BANK" | "CUSTOMER" };
              }
            )?.route?.counterpartyType === "CUSTOMER"
              ? 35
              : (
                    field.model as {
                      route?: { counterpartyType?: string };
                    }
                  )?.route?.counterpartyType === "ANY_BANK"
                ? 3
                : 35,
          "props.validationMessage": (field) =>
            (
              field.model as {
                route?: { counterpartyType?: "BANK" | "CUSTOMER" };
              }
            )?.route?.counterpartyType === "CUSTOMER"
              ? "請輸入 3–35 字元的 Customer ID，或從 Customer Service 選擇"
              : (
                    field.model as {
                      route?: { counterpartyType?: string };
                    }
                  )?.route?.counterpartyType === "ANY_BANK"
                ? "通用 fallback 固定使用 ANY；實際受款銀行由交易資料提供"
                : "請輸入 3–35 字元的內部 Counterparty ID，或從 Bank Service 選擇",
          "props.description": (field) =>
            (field.model as { route?: { counterpartyType?: string } })?.route
              ?.counterpartyType === "ANY_BANK"
              ? "通用 fallback 適用任何已核准銀行；實際交易對手由交易資料提供。"
              : "內部穩定識別碼；SWIFT BIC 另存於受控 route 資料。",
          "props.showPicker": (field) =>
            (field.model as { route?: { counterpartyType?: string } })?.route
              ?.counterpartyType !== "ANY_BANK",
          "props.readonly": (field) =>
            (field.model as { route?: { counterpartyType?: string } })?.route
              ?.counterpartyType === "ANY_BANK",
          "props.pickerLabel": (field) =>
            (
              field.model as {
                route?: { counterpartyType?: "BANK" | "CUSTOMER" };
              }
            )?.route?.counterpartyType === "CUSTOMER"
              ? "從 Customer Service 選擇"
              : "從 Bank Service 選擇",
        },
      },
      {
        key: "scope",
        type: "select",
        props: {
          label: "SSI Scope",
          required: true,
          options: [
            { label: "Standing（可重複使用）", value: "STANDING" },
            {
              label: "Transaction specific（須綁定交易）",
              value: "TRANSACTION_SPECIFIC",
            },
          ],
        },
      },
      {
        key: "route.currency",
        type: "select",
        props: {
          label: "Currency（ISO 4217）",
          description: "由 Currency 微服務提供，不接受自由輸入。",
          required: true,
          placeholder: "請選擇幣別",
          options: currencies.map(({ code, decimals }) => ({
            label: `${code} · ${decimals} decimals`,
            value: code,
          })),
        },
      },
      {
        key: "route.beneficiarySource",
        type: "select",
        props: {
          label: "Beneficiary Source",
          required: true,
          description:
            "SSI 表示 Beneficiary BIC 儲存在本 SSI；Transaction 表示由交易資料提供，SSI 不得儲存或推導。",
          options: [
            { label: "SSI／由 SSI 提供", value: "SSI" },
            { label: "Transaction／由交易提供", value: "TRANSACTION" },
          ],
        },
      },
      {
        key: "route.beneficiaryBic",
        type: "bic-input",
        props: {
          label: "Beneficiary BIC（ISO 9362）",
          pickerAction: () =>
            void this.openBicPicker("beneficiaryBic", "選擇 Beneficiary BIC"),
          pattern: BIC_PATTERN,
          maxLength: 11,
          minLength: 8,
        },
        expressions: {
          "props.required": (field) =>
            (field.model as { route?: { beneficiarySource?: string } })?.route
              ?.beneficiarySource !== "TRANSACTION",
          "props.disabled": (field) =>
            (field.model as { route?: { beneficiarySource?: string } })?.route
              ?.beneficiarySource === "TRANSACTION",
          "props.description": (field) =>
            (field.model as { route?: { beneficiarySource?: string } })?.route
              ?.beneficiarySource === "TRANSACTION"
              ? "不儲存在 SSI；由交易資料提供。"
              : "可手動輸入 BIC8/BIC11，或從 Bank Service 選擇銀行身分並回填唯讀 BIC。",
        },
      },
      {
        key: "route.accountWithBic",
        type: "bic-input",
        props: {
          label: "Account With Institution（ISO 9362）",
          description:
            "SSI 的 Account With Institution BIC；Bank Service 只提供銀行身分與 BIC，不提供帳號。",
          pickerAction: () =>
            void this.openBicPicker(
              "accountWithBic",
              "選擇 Account With Institution",
            ),
          ...bicValidation,
        },
      },
      {
        key: "route.intermediaryBic",
        type: "bic-input",
        props: {
          label: "Intermediary Institution（ISO 9362）",
          description: "選填；沒有 intermediary 時保持空白。",
          pickerAction: () =>
            void this.openBicPicker(
              "intermediaryBic",
              "選擇 Intermediary Institution",
            ),
          pattern: BIC_PATTERN,
          maxLength: 11,
        },
      },
      {
        key: "route.accountId",
        type: "input",
        expressions: {
          "props.label": (field) => {
            const model = field.model as {
              ownershipType?: "OWN" | "COUNTERPARTY";
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            };
            return ssiAccountReferenceCopy(
              model?.ownershipType,
              model?.route?.counterpartyType,
            ).label;
          },
          "props.description": (field) => {
            const model = field.model as {
              ownershipType?: "OWN" | "COUNTERPARTY";
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            };
            return ssiAccountReferenceCopy(
              model?.ownershipType,
              model?.route?.counterpartyType,
            ).description;
          },
          "props.placeholder": (field) => {
            const model = field.model as {
              ownershipType?: "OWN" | "COUNTERPARTY";
              route?: { counterpartyType?: "BANK" | "CUSTOMER" };
            };
            return ssiAccountReferenceCopy(
              model?.ownershipType,
              model?.route?.counterpartyType,
            ).placeholder;
          },
        },
      },
    ];
  }
}
