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
import { scalarText } from "./scalar-text";
import { DOCUMENT } from "@angular/common";
import { ReactiveFormsModule, FormGroup } from "@angular/forms";
import { FormlyForm } from "@ngx-formly/core";
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
import type { SsiApplicability, SsiRow } from "./ssi-maintenance.types";
import { PaymentSettlementApiService } from "./payment-settlement-api.service";
import { FinResolutionApiService } from "./fin-resolution-api.service";
import { ReferenceLookupApiService } from "./reference-lookup-api.service";
import { buildSsiMakerFields } from "./ssi-maintenance-feature/ssi-maker-fields";
import { SSI_RESOLUTION_READ_PORT } from "./ssi-resolution-read-port";
import {
  SsiMaintenanceShellBridge,
  type SsiMaintenanceShellPort,
} from "./ssi-maintenance-shell-port";
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
import { requestTypeLabel as presentRequestTypeLabel } from "./governance-record-value";
import { LoadingStateComponent } from "./loading-state.component";
import { localCalendarDate, paymentSourceLabel } from "./app-presentation";
import type { AppView as View, ThemeMode } from "./app-view.models";
import {
  BUSINESS_FUNCTION_DEFINITIONS,
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
  | "settings"
  | "resolver"
  | "treasury"
  | "tradefinance"
  | "audit"
  | "checker"
  | "dashboard"
  | "maker";
type LegacyView = Exclude<View, RoutedView>;
type WorkbenchView = "swiftdata" | "dashboard" | "maker";

const routePathForView = (view: View): string | null => {
  switch (view) {
    case "dashboard":
      return "/dashboard";
    case "maker":
      return "/maker";
    case "settings":
      return "/settings";
    case "audit":
      return "/audit";
    case "checker":
      return "/checker";
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
const isWorkbenchView = (view: View): view is WorkbenchView =>
  view === "swiftdata" || view === "dashboard" || view === "maker";

const routeViewFromUrl = (url: string): View | null => {
  const path = url.split(/[?#]/, 1)[0];
  return (
    (
      [
        "settings",
        "resolver",
        "treasury",
        "tradefinance",
        "audit",
        "checker",
        "dashboard",
        "maker",
      ] as const
    ).find((view) => routePathForView(view) === path) ?? null
  );
};

interface CurrencyReference {
  code: string;
  decimals: number;
  standard: string;
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
interface ResolutionEvidence {
  criterion: string;
  outcome: "PASS" | "FAIL" | "NOT_EVALUATED";
  expected: string;
  actual: string;
  reasonCode: string;
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
    LoadingStateComponent,
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
  private readonly paymentApi = inject(PaymentSettlementApiService);
  private readonly finApi = inject(FinResolutionApiService);
  private readonly referenceApi = inject(ReferenceLookupApiService);
  private readonly ssiResolutionRead = inject(SSI_RESOLUTION_READ_PORT);
  private readonly ssiShellBridge = inject(SsiMaintenanceShellBridge);
  private readonly shellPort = this.maintenanceShellPort();
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
  private activeCheckerRoute: {
    canDeactivate(): Promise<boolean>;
    refresh(): Promise<void>;
    decide(
      row: SsiRow,
      decision: "approve" | "reject",
      reason: string,
    ): Promise<boolean>;
  } | null = null;
  private activeRoutedRefresh: (() => Promise<void>) | null = null;
  private activeMaintenanceWipPort: {
    canDeactivate(targetUrl?: string): Promise<boolean>;
    hasActiveMakerRevision(): boolean;
    onLateMakerWipRelease(): void;
    clearReleasedMakerForm(): void;
    closeOverlayOnEscape(): Promise<boolean>;
  } | null = null;
  readonly finResolutionCatalogue = signal<
    readonly FinResolutionCatalogueItem[]
  >([]);
  readonly finResolutionCatalogueLoading = signal(true);
  readonly finResolutionCatalogueError = signal("");
  private clearingOptionsRequestSequence = 0;
  private resolutionRequestSequence = 0;
  private resolutionConfirmationRequestSequence = 0;
  private tagGenerationRequestSequence = 0;
  readonly view = signal<View>(this.savedView());
  readonly routeLoading = signal(false);
  private lastWorkbenchView: WorkbenchView = this.savedWorkbenchView();
  private pendingRouteTarget: View | null = null;
  private latestNavigationId = 0;
  private releasedMakerWipDuringNavigation = false;
  private readonly routerEventsSubscription: Subscription;
  private settingsReloadSubscription: { unsubscribe(): void } | null = null;
  readonly theme = this.themeService.theme;
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
  maintenanceShellPort(): SsiMaintenanceShellPort {
    return {
      checkerCount: () => this.checkerCount(),
      navigate: (view) => this.navigate(view),
      notify: (notice) => this.notice.set(notice),
      openDetail: (row) => this.reviewForChecker(row),
      closeDetail: () => this.detailTarget.set(null),
      acceptCurrencies: (items) => {
        this.currencies.set(items);
        this.activeAuditCurrencyOptionsConsumer?.(items);
      },
      onIndexRefreshed: () => this.ensureTagSsiSelection(),
      acceptPendingApprovalCount: () => undefined,
      restoreDashboardAfterReleasedWip: (notice) => {
        this.lastWorkbenchView = "dashboard";
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          "dashboard",
        );
        if (this.view() === "maker") this.commitRouteView("dashboard");
        this.restoreDashboardRouteAfterReleasedWip(notice);
      },
    };
  }
  private readonly routedCheckerCount = signal<number | null>(null);
  readonly checkerCount = computed(
    () => this.routedCheckerCount() ?? this.ssiShellBridge.pendingApprovalCount(),
  );
  readonly currenciesLoading = signal(false);
  readonly currencies = signal<readonly CurrencyReference[]>([]);
  readonly readonlyFields = computed(() =>
    readonlyFormFields(buildSsiMakerFields(this.currencies(), () => undefined)),
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
  private readonly resolutionCounterpartyRead = this.ssiResolutionRead.counterparties;
  private readonly settlementSsiRead = this.ssiResolutionRead.settlementSsis;
  readonly resolutionCustomers = computed(() =>
    this.resolutionCounterpartyRead().filter(
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
        this.settlementSsiRead()
          .filter(
            (row) =>
              row.status === "ACTIVE" &&
              (row.counterpartyBic || row.counterpartyId) ===
                this.resolutionCounterpartyId() &&
              row.counterpartyType ===
                this.resolutionCounterpartyType() &&
              scalarText(row.messageTypes)
                .split(",")
                .map((value) => value.trim())
                .includes(this.resolutionMessageType()) &&
              row.applicability.some(
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
          .map((row) => row.currency)
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
  private featureDataGeneration = 0;
  private readonly routeGuardHost = {
    canDeactivate: (targetUrl?: string) => this.canDeactivate(targetUrl),
    hasActiveMakerRevision: () =>
      this.activeMaintenanceWipPort?.hasActiveMakerRevision() ?? false,
    onLateMakerWipRelease: (navigationId: number) => {
      this.routeGuardBridge.consumeReleasedMakerWip(navigationId);
      this.activeMaintenanceWipPort?.onLateMakerWipRelease();
    },
  };

  constructor() {
    this.ssiShellBridge.attach(this.shellPort);
    this.routeGuardBridge.register(this.routeGuardHost);
    this.routerEventsSubscription = this.router.events.subscribe((event) =>
      this.onRouterEvent(event),
    );
  }

  ngOnDestroy(): void {
    this.ssiShellBridge.detach(this.shellPort);
    this.settingsReloadSubscription?.unsubscribe();
    this.routerEventsSubscription.unsubscribe();
    this.routeGuardBridge.unregister(this.routeGuardHost);
  }

  ngOnInit(): void {
    // Canonicalize a persisted Maintenance view; routed features own loading.
    const savedRoute = routePathForView(this.view());
    if (
      (this.view() === "dashboard" || this.view() === "maker") &&
      this.document.defaultView?.location?.pathname === "/" &&
      savedRoute
    ) {
      this.pendingRouteTarget = this.view();
      void this.router.navigateByUrl(savedRoute).catch(() => undefined);
      return;
    }
  }

  async refreshAfterDevelopmentReload(): Promise<void> {
    this.featureDataGeneration += 1;
    this.loadedFeatureData.clear();
    this.featureDataLoads.clear();
    if (this.view() !== "settings") await this.ensureFeatureData(this.view());
    this.notice.set({
      kind: "info",
      text: "Development Test Data 已重新載入；所有工作區資料已更新。",
    });
  }

  async refresh(): Promise<void> {
    if (this.view() === "checker") {
      await this.activeCheckerRoute?.refresh();
      return;
    }
    if (
      this.view() === "resolver" ||
      this.view() === "treasury" ||
      this.view() === "tradefinance" ||
      this.view() === "settings" ||
      this.view() === "audit"
    ) {
      await this.activeRoutedRefresh?.();
      return;
    }
    await this.activeRoutedRefresh?.();
  }

  navigate(view: View): Promise<boolean> {
    if (this.pendingRouteTarget !== null) return Promise.resolve(false);
    const targetPath = routePathForView(view);
    if (targetPath || routePathForView(this.view())) {
      if (view === this.view()) {
        if (view === "treasury" || view === "tradefinance")
          this.enterFinResolution(view);
        return Promise.resolve(true);
      }
      this.pendingRouteTarget = view;
      return this.router.navigateByUrl(targetPath ?? "/").catch(() => false);
    }
    if (!isLegacyView(view)) return Promise.resolve(false);
    this.notice.set(null);
    this.view.set(view);
    this.document.defaultView?.localStorage.setItem("ssi-active-view", view);
    this.lastWorkbenchView = view;
    this.document.defaultView?.localStorage.setItem(
      "ssi-last-workbench-view",
      view,
    );
    void this.ensureFeatureData(view);
    return Promise.resolve(true);
  }

  private savedView(): View {
    const routed = routeViewFromUrl(
      this.document.defaultView?.location?.pathname ?? "/",
    );
    if (routed) return routed;
    return this.savedWorkbenchView();
  }

  private savedWorkbenchView(): WorkbenchView {
    const saved =
      this.document.defaultView?.localStorage.getItem("ssi-active-view");
    const previous = this.document.defaultView?.localStorage.getItem(
      "ssi-last-workbench-view",
    );
    const candidate = isWorkbenchView(saved as View) ? saved : previous;
    return ["swiftdata", "dashboard", "maker"].includes(candidate ?? "")
      ? (candidate as WorkbenchView)
      : "swiftdata";
  }

  private restoreDashboardRouteAfterReleasedWip(notice: {
    kind: "error";
    text: string;
  }): void {
    this.notice.set(notice);
    // The cancelled route still points at Maker while the editor is closed.
    // Replace it so the visible Dashboard and Angular outlet agree.
    void this.router
      .navigateByUrl("/dashboard", { replaceUrl: true })
      .then(() => this.notice.set(notice))
      .catch(() => this.notice.set(notice));
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
      canDeactivate?: () => Promise<boolean>;
      refresh?: () => Promise<void>;
      maintenanceWipPort?: NonNullable<AppComponent["activeMaintenanceWipPort"]>;
      decide?: (
        row: SsiRow,
        decision: "approve" | "reject",
        reason: string,
      ) => Promise<boolean>;
      reviewRequested?: {
        subscribe(callback: (row: SsiRow) => void): { unsubscribe(): void };
      };
      countChanged?: {
        subscribe(callback: (count: number) => void): { unsubscribe(): void };
      };
      noticeRaised?: {
        subscribe(
          callback: (notice: { kind: "warning"; text: string }) => void,
        ): {
          unsubscribe(): void;
        };
      };
    };
    this.activeCheckerRoute =
      route.canDeactivate && route.refresh && route.decide
        ? {
            canDeactivate: route.canDeactivate.bind(route),
            refresh: route.refresh.bind(route),
            decide: route.decide.bind(route),
          }
        : null;
    this.activeRoutedRefresh = route.refresh?.bind(route) ?? null;
    this.activeMaintenanceWipPort = route.maintenanceWipPort ?? null;
    if (route.reviewRequested)
      this.auditRouteSubscriptions.push(
        route.reviewRequested.subscribe(
          (row) => void this.reviewForChecker(row),
        ),
      );
    if (route.countChanged)
      this.auditRouteSubscriptions.push(
        route.countChanged.subscribe((count) =>
          this.routedCheckerCount.set(count),
        ),
      );
    if (route.noticeRaised)
      this.auditRouteSubscriptions.push(
        route.noticeRaised.subscribe((notice) => this.notice.set(notice)),
      );
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
    this.activeCheckerRoute = null;
    this.activeRoutedRefresh = null;
    this.activeMaintenanceWipPort = null;
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
        this.activeMaintenanceWipPort?.clearReleasedMakerForm();
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
      if (routed && isWorkbenchView(previousView) && !released) {
        this.lastWorkbenchView = previousView;
        this.document.defaultView?.localStorage.setItem(
          "ssi-last-workbench-view",
          this.lastWorkbenchView,
        );
      }
      this.pendingRouteTarget = null;
      this.commitRouteView(target);
      this.routeLoading.set(false);
      if (
        event.urlAfterRedirects === "/" &&
        (target === "dashboard" || target === "maker")
      ) {
        // Legacy history entries have no routed Maintenance UI after the
        // extraction. Replace that entry with the equivalent lazy route.
        this.pendingRouteTarget = target;
        void this.router
          .navigateByUrl(routePathForView(target)!, { replaceUrl: true })
          .catch(() => {
            this.pendingRouteTarget = null;
            this.notice.set({
              kind: "error",
              text: "無法返回 SSI 工作區；請重新選擇工作區。",
            });
          });
      }
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
        this.activeMaintenanceWipPort?.clearReleasedMakerForm();
        this.commitRouteView("dashboard");
        this.restoreDashboardRouteAfterReleasedWip({
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
    if (isWorkbenchView(view)) {
      this.lastWorkbenchView = view;
      this.document.defaultView?.localStorage.setItem(
        "ssi-last-workbench-view",
        view,
      );
    }
    if (view === "treasury" || view === "tradefinance")
      this.enterFinResolution(view);
    if (view !== "dashboard" && view !== "maker")
      void this.ensureFeatureData(view);
  }

  private ensureFeatureData(view: View): Promise<void> {
    const key =
      view === "treasury" || view === "tradefinance" ? "fin-resolution" : view;
    const cacheAfterLoad = true;
    if (cacheAfterLoad && this.loadedFeatureData.has(key))
      return Promise.resolve();
    const existing = this.featureDataLoads.get(key);
    if (existing) return existing;
    const generation = this.featureDataGeneration;
    const load = this.loadFeatureData(view)
      .then(() => {
        if (cacheAfterLoad && generation === this.featureDataGeneration)
          this.loadedFeatureData.add(key);
      })
      .finally(() => {
        if (this.featureDataLoads.get(key) === load)
          this.featureDataLoads.delete(key);
      });
    this.featureDataLoads.set(key, load);
    return load;
  }

  private async loadFeatureData(view: View): Promise<void> {
    if (view === "swiftdata" || view === "settings" || view === "checker")
      return;
    // The parameter-driven Resolution workspace loads only the selected page
    // definition and its own dependent lookups. The legacy parent workspace
    // must not preload unrelated reference services or emit duplicate alerts.
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
      if (!this.activeCheckerRoute)
        throw new Error("Checker route is not active");
      if (!(await this.activeCheckerRoute.decide(row, decision, reason)))
        return;
      this.detailTarget.set(null);
      this.checkerRejectReason.set("");
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
      const response = await firstValueFrom(this.paymentApi.messageIndex());
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
    if (await this.activeMaintenanceWipPort?.closeOverlayOnEscape()) return;
    if (this.tagTransactionOpen()) {
      this.cancelTagTransaction();
      return;
    }
    if (this.paymentTransactionOpen()) {
      this.closePaymentTransaction();
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
  setTheme(mode: ThemeMode): void {
    this.themeService.setTheme(mode);
  }

  async canDeactivate(targetUrl?: string): Promise<boolean> {
    if (
      this.activeCheckerRoute &&
      !(await this.activeCheckerRoute.canDeactivate())
    )
      return false;
    const swiftData = this.swiftDataCrud();
    if (swiftData && !(await swiftData.canDeactivate())) return false;
    return (await this.activeMaintenanceWipPort?.canDeactivate(targetUrl)) ?? true;
  }

  requestTypeLabel(row: SsiRow): "ADD" | "EDIT" | "SUPPRESSED" {
    return presentRequestTypeLabel(row);
  }

  private modelForRow(row: SsiRow): Record<string, unknown> {
    const ownership = row.ownershipType ??
      (row.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
    return ssiFormModel(row, ownership);
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
        this.paymentApi.clearingOptions<{ items: ClearingSystemReference[] }>({
          consumer: this.resolutionConsumer(),
          product: this.resolutionProduct(),
          counterpartyBankServiceId: this.resolutionCounterpartyBankServiceId(),
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
        }),
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
        this.paymentApi.resolve(this.resolutionRequestPayload()),
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
        this.paymentApi.confirm<ResolutionConfirmation>(attemptId, {
          selectedSsiId,
          actor: "maker.demo",
          ...(this.resolutionHasManualRouteOverride()
            ? { overrideReason: "USER_SELECTED_ALTERNATIVE_ROUTE" }
            : {}),
        }),
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
          this.finApi.extract<ExtractionResponse>({
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
        this.finApi.controlledResolution<GenerationResponse>(
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
        this.finApi.controlledFixtures<ControlledFixtureResponse>(parameters),
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

  private ensureTagSsiSelection(): void {
    const options = this.relatedTagSsis();
    if (!options.some((row) => row.id === this.tagSsiId()))
      this.tagSsiId.set(options[0]?.id ?? "");
  }

  private async loadCurrencies(): Promise<void> {
    this.currenciesLoading.set(true);
    try {
      const currencies = await firstValueFrom(
        this.referenceApi.currencies<CurrencyReference[]>(),
      );
      this.currencies.set(currencies);
      this.activeAuditCurrencyOptionsConsumer?.(currencies);
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
        this.finApi.catalogue<FinResolutionCatalogueResponse>("SR2026"),
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
  private async loadClearingSystems(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.referenceApi.clearingSystems<{
          items: ClearingSystemReference[];
        }>(),
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
        this.referenceApi.banks<BankPage>(1, 10),
      );
      const remaining = await Promise.all(
        Array.from(
          { length: Math.max(0, firstPage.totalPages - 1) },
          (_, index) =>
            firstValueFrom(
              this.referenceApi.banks<BankPage>(index + 2, 10),
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
          this.referenceApi.ownNostroAccounts<OwnNostroReference[]>(),
        ),
      );
    } catch {
      this.ownNostroAccounts.set([]);
    }
  }
  displayStatus(status: string): string {
    return status === "PENDING_APPROVAL" ? "SUBMITTED" : status;
  }
}
