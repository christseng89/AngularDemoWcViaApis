import {
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  type OnDestroy,
  signal,
  viewChild,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { scalarText } from "./scalar-text";
import { DOCUMENT } from "@angular/common";
import { ReactiveFormsModule, FormGroup } from "@angular/forms";
import { FormlyForm, type FormlyFieldConfig } from "@ngx-formly/core";
import { readonlyFormFields, ssiFormModel } from "./ssi-form-presentation";
import { firstValueFrom, type Subscription } from "rxjs";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet,
} from "@angular/router";
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
import { APP_ROUTE_GUARD_BRIDGE } from "./app-route-guard";
import { AlertComponent } from "./alert.component";
import {
  BankServicePickerDialogComponent,
  type BankServicePickerItem,
} from "./bank-service-picker-dialog.component";
import { GovernanceIndexTableComponent } from "./governance-index-table.component";
import {
  governanceRecordValue,
  requestTypeLabel as presentRequestTypeLabel,
} from "./governance-record-value";
import type { AuditSortDirection } from "./audit-presentation";
import { LoadingStateComponent } from "./loading-state.component";
import { DeferredFeatureShellComponent } from "./deferred-feature-shell.component";
import {
  ariaSortDirection,
  auditIndexColumns,
  localCalendarDate,
  paymentSourceLabel,
  sortDirectionIndicator,
} from "./app-presentation";
import type {
  AppView as View,
  BicTarget,
  GovernanceTab,
  ThemeMode,
} from "./app-view.models";
import {
  BIC_PATTERN,
  BUSINESS_FUNCTION_DEFINITIONS,
  COUNTERPARTY_ID_PATTERN,
  FULL_TAG_SCENARIOS,
  MT_MESSAGE_NAMES,
  TAG_CATALOG_COLUMNS,
  TAG_FIELD_EXPECTATIONS,
  type FinResolutionCatalogueItem,
  type FinResolutionCatalogueResponse,
  type TagCatalogSortKey,
  type TagMessageCatalogItem,
} from "./fin-5x-catalog";
import { ThemeService } from "./theme.service";
import { AppShellComponent } from "./app-shell.component";

type RoutedView =
  "settings" | "resolver" | "treasury" | "tradefinance" | "audit";
type LegacyView = Exclude<View, RoutedView>;

const routePathForView = (view: View): string | null => {
  switch (view) {
    case "settings":
      return "/settings";
    case "audit":
      return "/audit";
    case "resolver":
      return "/resolution/payment";
    case "treasury":
      return "/resolution/treasury";
    case "tradefinance":
      return "/resolution/trade-finance";
    default:
      return null;
  }
};

const isLegacyView = (view: View): view is LegacyView =>
  routePathForView(view) === null;

const routeViewFromUrl = (url: string): View | null => {
  const path = url.split(/[?#]/, 1)[0];
  return (
    (
      ["settings", "resolver", "treasury", "tradefinance", "audit"] as const
    ).find((view) => routePathForView(view) === path) ?? null
  );
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
  "x-lifecycle": readonly string[];
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
@Component({
  selector: "ssi-root",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormlyForm,
    SwiftDataCrudComponent,
    RouterOutlet,
    AlertComponent,
    BankServicePickerDialogComponent,
    GovernanceIndexTableComponent,
    LoadingStateComponent,
    DeferredFeatureShellComponent,
    AppShellComponent,
  ],
  templateUrl: "./app.component.html",
  host: {
    "(document:keydown.escape)": "closeOverlayOnEscape()",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly presentOfficialFieldName = presentOfficialFieldName;
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly routeGuardBridge = inject(APP_ROUTE_GUARD_BRIDGE);
  readonly routedAuditDetailOpen = signal(false);
  private auditRouteSubscriptions: Array<{ unsubscribe(): void }> = [];
  private activeAuditCurrencyOptionsConsumer:
    ((options: readonly { code: string; decimals: number }[]) => void) | null =
    null;
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
  readonly routeLoading = signal(false);
  private lastWorkbenchView: LegacyView = this.savedWorkbenchView();
  private pendingRouteTarget: View | null = null;
  private latestNavigationId = 0;
  private releasedMakerWipDuringNavigation = false;
  private readonly routerEventsSubscription: Subscription;
  private settingsReloadSubscription: { unsubscribe(): void } | null = null;
  readonly theme = this.themeService.theme;
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
  readonly governedPending = signal<readonly GovernedPendingRow[]>([]);
  readonly checkerCount = computed(
    () => this.ssiSummary().pendingApproval + this.governedPending().length,
  );
  readonly checkerIndexColumns = computed(() =>
    auditIndexColumns(this.checkerTab()),
  );
  readonly sortedCheckerSsiRows = computed(() => {
    const path = this.checkerIndexSortPath();
    if (!path) return this.pending();
    const direction = this.checkerSortDirection() === "asc" ? 1 : -1;
    return [...this.pending()].sort(
      (left, right) =>
        governanceRecordValue(left, path).localeCompare(
          governanceRecordValue(right, path),
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
          governanceRecordValue(record, column.path),
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
  pseudoContent = FULL_TAG_SCENARIOS[0]!.content;
  private readonly loadedFeatureData = new Set<string>();
  private readonly featureDataLoads = new Map<string, Promise<void>>();
  private pendingDeactivation: Promise<boolean> | null = null;

  constructor() {
    this.routeGuardBridge.register(this);
    this.routerEventsSubscription = this.router.events.subscribe((event) =>
      this.onRouterEvent(event),
    );
  }

  ngOnDestroy(): void {
    this.settingsReloadSubscription?.unsubscribe();
    this.routerEventsSubscription.unsubscribe();
    this.routeGuardBridge.unregister(this);
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
    if (this.pendingRouteTarget !== null) return;
    const targetPath = routePathForView(view);
    if (targetPath || routePathForView(this.view())) {
      if (view === this.view()) {
        if (view === "treasury" || view === "tradefinance")
          this.enterFinResolution(view);
        return;
      }
      this.pendingRouteTarget = view;
      void this.router.navigateByUrl(targetPath ?? "/").catch(() => undefined);
      return;
    }
    if (!isLegacyView(view)) return;
    this.notice.set(null);
    this.view.set(view);
    this.document.defaultView?.localStorage.setItem("ssi-active-view", view);
    this.lastWorkbenchView = view;
    this.document.defaultView?.localStorage.setItem(
      "ssi-last-workbench-view",
      view,
    );
    void this.ensureFeatureData(view);
  }

  private savedView(): View {
    const routed = routeViewFromUrl(
      this.document.defaultView?.location?.pathname ?? "/",
    );
    if (routed) return routed;
    return this.savedWorkbenchView();
  }

  private savedWorkbenchView(): LegacyView {
    const saved =
      this.document.defaultView?.localStorage.getItem("ssi-active-view");
    const previous = this.document.defaultView?.localStorage.getItem(
      "ssi-last-workbench-view",
    );
    const candidate = routePathForView(saved as View) ? previous : saved;
    return ["swiftdata", "dashboard", "maker", "checker"].includes(
      candidate ?? "",
    )
      ? (candidate as LegacyView)
      : "swiftdata";
  }

  hasActiveMakerRevision(): boolean {
    return (
      this.view() === "maker" && !!this.revisionSource() && !!this.editingId()
    );
  }

  onLateMakerWipRelease(navigationId: number): void {
    this.routeGuardBridge.consumeReleasedMakerWip(navigationId);
    this.form.reset();
    this.lastWorkbenchView = "dashboard";
    this.document.defaultView?.localStorage.setItem(
      "ssi-last-workbench-view",
      "dashboard",
    );
    if (this.view() === "maker") this.commitRouteView("dashboard");
    this.notice.set({
      kind: "error",
      text: "頁面切換已取消，但修訂 WIP 隨後釋放；編輯內容已關閉，請重新進入。",
    });
  }

  onSettingsActivated(component: unknown): void {
    this.settingsReloadSubscription?.unsubscribe();
    for (const subscription of this.auditRouteSubscriptions)
      subscription.unsubscribe();
    this.auditRouteSubscriptions = [];
    this.routedAuditDetailOpen.set(false);
    const route = component as {
      dataReloaded?: {
        subscribe(callback: () => void): { unsubscribe(): void };
      };
      setCurrencyOptions?: (
        options: readonly { code: string; decimals: number }[],
      ) => void;
      detailOpenChange?: {
        subscribe(callback: (open: boolean) => void): { unsubscribe(): void };
      };
      ssiDetailRequested?: {
        subscribe(callback: (snapshot: unknown) => void): {
          unsubscribe(): void;
        };
      };
      tabChanged?: {
        subscribe(callback: () => void): { unsubscribe(): void };
      };
    };
    this.activeAuditCurrencyOptionsConsumer =
      route.setCurrencyOptions?.bind(route) ?? null;
    this.activeAuditCurrencyOptionsConsumer?.(this.currencies());
    if (route.detailOpenChange)
      this.auditRouteSubscriptions.push(
        route.detailOpenChange.subscribe((open) =>
          this.routedAuditDetailOpen.set(open),
        ),
      );
    if (route.ssiDetailRequested)
      this.auditRouteSubscriptions.push(
        route.ssiDetailRequested.subscribe((snapshot) =>
          this.detailTarget.set(snapshot as SsiRow),
        ),
      );
    if (route.tabChanged)
      this.auditRouteSubscriptions.push(
        route.tabChanged.subscribe(() => this.detailTarget.set(null)),
      );
    this.settingsReloadSubscription =
      route.dataReloaded?.subscribe(() => {
        void this.refreshAfterDevelopmentReload();
      }) ?? null;
  }

  onSettingsDeactivated(): void {
    this.activeAuditCurrencyOptionsConsumer = null;
    this.settingsReloadSubscription?.unsubscribe();
    this.settingsReloadSubscription = null;
    for (const subscription of this.auditRouteSubscriptions)
      subscription.unsubscribe();
    this.auditRouteSubscriptions = [];
    this.routedAuditDetailOpen.set(false);
  }

  private onRouterEvent(event: unknown): void {
    if (event instanceof NavigationStart) {
      this.latestNavigationId = event.id;
      this.routeLoading.set(true);
      return;
    }
    if (event instanceof NavigationEnd) {
      const released =
        this.routeGuardBridge.consumeReleasedMakerWip(event.id) ||
        this.releasedMakerWipDuringNavigation;
      this.releasedMakerWipDuringNavigation = false;
      this.routeGuardBridge.consumeDenied(event.id);
      if (released) {
        this.form.reset();
        this.lastWorkbenchView = "dashboard";
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          "dashboard",
        );
      }
      const routed = routeViewFromUrl(event.urlAfterRedirects);
      const target: View = routed
        ? routed
        : released
          ? "dashboard"
          : this.pendingRouteTarget && isLegacyView(this.pendingRouteTarget)
            ? this.pendingRouteTarget
            : this.lastWorkbenchView;
      const previousView = this.view();
      if (routed && isLegacyView(previousView) && !released) {
        this.lastWorkbenchView = previousView;
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          this.lastWorkbenchView,
        );
      }
      this.pendingRouteTarget = null;
      this.commitRouteView(target);
      this.routeLoading.set(false);
      return;
    }
    if (event instanceof NavigationSkipped) {
      if (event.id === this.latestNavigationId) {
        this.pendingRouteTarget = null;
        this.routeLoading.set(false);
      }
      return;
    }
    if (event instanceof NavigationCancel || event instanceof NavigationError) {
      const guardPending = this.routeGuardBridge.isGuardPending(event.id);
      this.routeGuardBridge.markNavigationTerminated(event.id);
      const released = this.routeGuardBridge.consumeReleasedMakerWip(event.id);
      const denied = this.routeGuardBridge.consumeDenied(event.id);
      if (event.id !== this.latestNavigationId) {
        this.releasedMakerWipDuringNavigation ||= released;
        return;
      }
      this.pendingRouteTarget = null;
      this.routeLoading.set(false);
      if (released || this.releasedMakerWipDuringNavigation) {
        this.releasedMakerWipDuringNavigation = false;
        this.form.reset();
        this.commitRouteView("dashboard");
        this.notice.set({
          kind: "error",
          text: "頁面切換失敗；修訂 WIP 已釋放，編輯內容已關閉，請重新進入。",
        });
      } else if (!denied && !guardPending) {
        this.notice.set({
          kind: "error",
          text: "頁面切換失敗；目前畫面與未儲存內容保持不變，請重試。",
        });
      }
    }
  }

  private commitRouteView(view: View): void {
    this.notice.set(null);
    this.view.set(view);
    this.document.defaultView?.localStorage.setItem("ssi-active-view", view);
    if (isLegacyView(view)) {
      this.lastWorkbenchView = view;
      this.document.defaultView?.localStorage.setItem(
        "ssi-last-workbench-view",
        view,
      );
    }
    if (view === "treasury" || view === "tradefinance")
      this.enterFinResolution(view);
    void this.ensureFeatureData(view);
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
    this.themeService.setTheme(mode);
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
    return presentRequestTypeLabel(row);
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
      this.activeAuditCurrencyOptionsConsumer?.(currencies);
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
