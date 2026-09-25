import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  SqliteSsiRepository,
  type SsiPageRequest,
  type SsiApplicabilityInput,
  type SsiRecord,
} from "./sqlite-ssi.repository";
import {
  previewResolution,
  type BeneficiaryCustomerInput,
  type ResolutionPreview as RouteResolutionPreview,
  type RankedRoute,
  type RouteResolutionRequest,
} from "./route-resolution.policy";
import { RmaApplicationService } from "./rma/rma-application.service";
import { NostroApplicationService } from "./nostro/nostro-application.service";
import { CLEARING_SYSTEMS } from "./clearing-systems.reference";
import { hashCanonical } from "./canonical-json";
import { assertIsoValueDate } from "./value-date";
import {
  paymentFinMessageType,
  paymentSettlementProfile,
  type PaymentCounterpartyType,
} from "./payment-settlement-profile";
import { PaymentMessageIndexService } from "./payment-message-index.service";
import { revisionWipExpiresAt } from "./shared/sqlite-governed.repository";
import { ResolutionCurrencyCoverageCoordinator } from "./resolution-currency-coordinator";
import type { ResolutionCurrencyApplyResult } from "./resolution-currency-store";

export interface CreateSsiCommand {
  counterpartyId: string;
  scope: "STANDING" | "TRANSACTION_SPECIFIC";
  maker: string;
  ownershipType?: "OWN" | "COUNTERPARTY";
  ownerParty?: string;
  publisherParty?: string;
  route: Record<string, string>;
}
type SsiTransitionAction = "SUBMIT" | "APPROVE" | "REJECT" | "ACTIVATE";

const EXPECTED_TRANSITION_STATUS = {
  SUBMIT: "DRAFT",
  APPROVE: "PENDING_APPROVAL",
  REJECT: "PENDING_APPROVAL",
  ACTIVATE: "APPROVED",
} as const;

const NEXT_TRANSITION_STATUS = {
  SUBMIT: "PENDING_APPROVAL",
  REJECT: "DRAFT",
  ACTIVATE: "ACTIVE",
} as const;

const BIC_PATTERN = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PAYMENT_TRIGGER_LEGS = new Set([
  "BANK_REIMBURSEMENT",
  "PROCEEDS_SETTLEMENT",
  "COLLECTION_SETTLEMENT",
  "CLAIM_PAYMENT",
  "INTERBANK_SETTLEMENT",
  "CUSTOMER_TRANSFER",
]);
const COV_BUSINESS_SERVICE = "swift.cbprplus.cov.04";

const routeList = (
  route: Readonly<Record<string, string>>,
  field: string,
): readonly string[] =>
  String(route[field] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

interface NostroEvidence {
  readonly decision?: string;
  readonly nostroId?: string;
  readonly nostroVersion?: number;
  readonly accountReference?: string;
  readonly accountServicerBic?: string;
  readonly maskedAccountRef?: string;
}

function settlementParties(
  request: RouteResolutionRequest,
  selected: RankedRoute,
  nostroEvidence: NostroEvidence | undefined,
) {
  const counterpartyType = (request.counterpartyType ??
    "BANK") as PaymentCounterpartyType;
  const actualReceiverBic =
    selected.route["actualReceiverBic"] ??
    selected.route["accountWithBic"] ??
    selected.route["bic"] ??
    "";
  const accountWithBic = selected.route["accountWithBic"] || actualReceiverBic;
  const beneficiaryInstitutionBic =
    counterpartyType === "BANK"
      ? selected.route["beneficiaryBic"] ||
        request.counterpartyBic ||
        actualReceiverBic
      : "";
  const directBankRoute =
    counterpartyType === "BANK" &&
    selected.route["routeType"] === "DIRECT" &&
    (nostroEvidence?.accountServicerBic ?? accountWithBic) ===
      actualReceiverBic &&
    beneficiaryInstitutionBic === actualReceiverBic;
  return {
    counterpartyType,
    actualReceiverBic,
    accountWithBic,
    beneficiaryInstitutionBic,
    creditorAgentBic: directBankRoute ? "" : accountWithBic,
    deliveryAgentBic: directBankRoute
      ? ""
      : (nostroEvidence?.accountServicerBic ?? ""),
  };
}

function settlementFieldProvenance(
  request: RouteResolutionRequest,
  selected: RankedRoute,
  nostroEvidence: NostroEvidence | undefined,
  parties: ReturnType<typeof settlementParties>,
  finMessageType: string,
) {
  const mtSequencePrefix = finMessageType.endsWith("COV") ? "A." : "";
  const beneficiaryInstitutionTagSupported = ![
    "MT103",
    "MT200",
    "MT201",
  ].includes(finMessageType);
  const provenance: Record<string, { source: string; evidenceId: string }> = {};
  if (parties.deliveryAgentBic) {
    provenance[`${mtSequencePrefix}53A`] = {
      source: nostroEvidence ? "OWN_NOSTRO" : "SSI_ROUTE_PREVIEW",
      evidenceId: nostroEvidence?.nostroId ?? selected.ssiId,
    };
  }
  if (parties.creditorAgentBic) {
    provenance[`${mtSequencePrefix}57A`] = {
      source:
        parties.counterpartyType === "CUSTOMER"
          ? "CUSTOMER_SSI"
          : "COUNTERPARTY_SSI",
      evidenceId: selected.ssiId,
    };
  }
  if (parties.counterpartyType === "CUSTOMER") {
    provenance["59"] = {
      source: "TRANSACTION_INPUT",
      evidenceId: request.beneficiaryCustomer?.customerId ?? "",
    };
  } else if (beneficiaryInstitutionTagSupported) {
    provenance[`${mtSequencePrefix}58A`] = {
      source: "TRANSACTION_CONTEXT",
      evidenceId: request.counterpartyBic ?? "",
    };
  }
  return provenance;
}

function canonicalSettlementFor(
  request: RouteResolutionRequest,
  selected: RankedRoute,
  nostroEvidence: NostroEvidence | undefined,
  directAccountRelationshipCount: number,
) {
  const parties = settlementParties(request, selected, nostroEvidence);
  const finMessageType = paymentFinMessageType(
    parties.counterpartyType,
    request.sourceMessageType,
  );
  return {
    finMessageType,
    instructingAgentBic: selected.route["senderBic"] ?? "DEMOHKHH",
    instructedAgentBic: parties.actualReceiverBic,
    deliveryAgentBic: parties.deliveryAgentBic,
    intermediaryAgentBics: [selected.route["intermediaryBic"]].filter(
      (value): value is string => Boolean(value),
    ),
    creditorAgentBic: parties.creditorAgentBic,
    beneficiaryInstitutionBic: parties.beneficiaryInstitutionBic,
    ...(parties.counterpartyType === "CUSTOMER"
      ? { beneficiaryCustomer: request.beneficiaryCustomer! }
      : {}),
    reimbursementAgentBics: [parties.deliveryAgentBic].filter(
      (value): value is string => Boolean(value),
    ),
    settlementAccountReference: nostroEvidence?.accountReference?.trim() ?? "",
    directAccountRelationshipCount,
    settlementCountry: selected.route["settlementCountry"] ?? "",
    settlementMarket: selected.route["settlementMarket"] ?? "",
    clearingSystem: selected.route["clearingSystem"] ?? "",
    schemeType: selected.route["schemeType"] ?? "",
    fieldProvenance: settlementFieldProvenance(
      request,
      selected,
      nostroEvidence,
      parties,
      finMessageType,
    ),
  };
}

function validateRouteIdentity(route: Record<string, string>): void {
  if (!CURRENCY_PATTERN.test(route["currency"] ?? ""))
    throw new BadRequestException("INVALID_ISO_4217_CURRENCY");
  if (
    !["PRIMARY", "SECONDARY", "FALLBACK"].includes(
      route["routePreference"] ?? "",
    ) ||
    !/^\d+$/.test(route["priority"] ?? "")
  )
    throw new BadRequestException("INVALID_ROUTE_CLASS_OR_PRIORITY");
}

function validateRouteEffectiveDates(route: Record<string, string>): void {
  if (
    !route["validFrom"] ||
    !route["validTo"] ||
    Number.isNaN(Date.parse(route["validFrom"])) ||
    Number.isNaN(Date.parse(route["validTo"])) ||
    Date.parse(route["validFrom"]) > Date.parse(route["validTo"])
  )
    throw new BadRequestException("INVALID_SSI_EFFECTIVE_DATES");
}

function requireClearingSystem(route: Record<string, string>) {
  if (!route["settlementMarket"]?.trim())
    throw new BadRequestException("SETTLEMENT_MARKET_REQUIRED");
  const clearingSystem = CLEARING_SYSTEMS.find(
    (system) =>
      system.code === route["clearingSystem"] ||
      system.legacyAliases?.includes(route["clearingSystem"] ?? ""),
  );
  if (
    !route["clearingSystem"]?.trim() ||
    route["clearingSystem"] === "ANY" ||
    !clearingSystem
  )
    throw new BadRequestException("ACTIVE_CLEARING_SYSTEM_REQUIRED");
  return clearingSystem;
}

function validateClearingScope(
  route: Record<string, string>,
  clearingSystem: (typeof CLEARING_SYSTEMS)[number],
): void {
  if (clearingSystem.code === "CORRESPONDENT_CHAIN") {
    if (
      clearingSystem.status !== "ACTIVE" ||
      Date.parse(clearingSystem.validFrom) > Date.parse(route["validTo"]!) ||
      Date.parse(clearingSystem.validTo) < Date.parse(route["validFrom"]!)
    )
      throw new BadRequestException("CLEARING_SYSTEM_NOT_EFFECTIVE");
    return;
  }
  if (clearingSystem.supportedCurrency !== route["currency"])
    throw new BadRequestException("CLEARING_SYSTEM_CURRENCY_MISMATCH");
  if (!route["settlementCountry"]?.trim())
    throw new BadRequestException("SETTLEMENT_COUNTRY_REQUIRED");
  if (
    (route["settlementCountry"] === "ANY" &&
      clearingSystem.marketScope !== "PAN_REGIONAL") ||
    (route["settlementCountry"] !== "ANY" &&
      clearingSystem.settlementCountry !== route["settlementCountry"] &&
      !clearingSystem.eligibleCountries.includes(route["settlementCountry"]!))
  )
    throw new BadRequestException("CLEARING_SYSTEM_COUNTRY_SCOPE_MISMATCH");
  if (
    clearingSystem.status !== "ACTIVE" ||
    Date.parse(clearingSystem.validFrom) > Date.parse(route["validTo"]!) ||
    Date.parse(clearingSystem.validTo) < Date.parse(route["validFrom"]!)
  )
    throw new BadRequestException("CLEARING_SYSTEM_NOT_EFFECTIVE");
  if (route["schemeType"] && route["schemeType"] !== clearingSystem.schemeType)
    throw new BadRequestException("CLEARING_SCHEME_TYPE_MISMATCH");
}

function validateRouteBics(route: Record<string, string>): void {
  const beneficiarySource = route["beneficiarySource"];
  if (beneficiarySource === "SSI" && !route["beneficiaryBic"])
    throw new BadRequestException("BENEFICIARY_BIC_REQUIRED");
  if (beneficiarySource === "TRANSACTION" && route["beneficiaryBic"])
    throw new BadRequestException(
      "TRANSACTION_BENEFICIARY_MUST_NOT_BE_STORED_IN_SSI",
    );
  for (const field of [
    "bic",
    "beneficiaryBic",
    "accountWithBic",
    "actualReceiverBic",
    "intermediaryBic",
  ]) {
    const value = route[field];
    if (value && !BIC_PATTERN.test(value))
      throw new BadRequestException(`INVALID_ISO_9362_BIC:${field}`);
  }
}

function validateCounterpartyIdentity(route: Record<string, string>): void {
  const counterpartyType = route["counterpartyType"] ?? "BANK";
  const counterpartyBic = route["counterpartyBic"];
  if (counterpartyType === "ANY_BANK" && counterpartyBic !== "ANY")
    throw new BadRequestException("ANY_BANK_COUNTERPARTY_MUST_USE_ANY");
  if (
    counterpartyType === "BANK" &&
    (!counterpartyBic || !BIC_PATTERN.test(counterpartyBic))
  )
    throw new BadRequestException("BANK_COUNTERPARTY_BIC_REQUIRED");
  if (
    counterpartyType === "CUSTOMER" &&
    counterpartyBic &&
    !BIC_PATTERN.test(counterpartyBic)
  )
    throw new BadRequestException("INVALID_CUSTOMER_SWIFT_BIC");
}

@Injectable()
export class SsiApplicationService {
  private readonly resolutionAttempts = new Map<
    string,
    {
      request: RouteResolutionRequest;
      requestHash: string;
      preview: RouteResolutionPreview;
    }
  >();
  constructor(
    private readonly repository: SqliteSsiRepository,
    private readonly rma: RmaApplicationService,
    private readonly nostro: NostroApplicationService,
    private readonly paymentMessageIndex: PaymentMessageIndexService,
    @Optional()
    private readonly currencyCoordinator?: ResolutionCurrencyCoverageCoordinator,
  ) {}
  list(status?: string): Array<
    SsiRecord & {
      applicability: ReturnType<SqliteSsiRepository["listApplicability"]>;
    }
  > {
    return this.repository.list(status).map((record) => ({
      ...this.withExplicitOwnership(record),
      applicability: this.repository.listApplicability(record.id),
    }));
  }
  listPage(request: SsiPageRequest) {
    const page = this.repository.listPage(request);
    return {
      ...page,
      items: page.items.map((record) => ({
        ...this.withExplicitOwnership(record),
        applicability: this.repository.listApplicability(record.id),
      })),
    };
  }
  summary() {
    return this.repository.summary();
  }
  counterpartyCoverage(status?: string) {
    return this.repository.counterpartyCoverage(status);
  }
  listApplicability(ssiId?: string): unknown {
    return this.repository.listApplicability(ssiId);
  }
  replaceApplicability(
    ssiId: string,
    body: { actor: string; records: SsiApplicabilityInput[] },
  ): unknown {
    this.requireRecord(ssiId);
    if (!body.actor || !Array.isArray(body.records) || !body.records.length)
      throw new BadRequestException("SSI_APPLICABILITY_REQUIRED");
    for (const row of body.records) {
      if (
        [
          "consumer",
          "product",
          "businessFunction",
          "paymentLeg",
          "direction",
          "validFrom",
          "validTo",
        ].some(
          (field) =>
            !String(row[field as keyof SsiApplicabilityInput] ?? "").trim(),
        )
      )
        throw new BadRequestException("SSI_APPLICABILITY_FIELDS_REQUIRED");
      if (
        !["ACTIVE", "INACTIVE"].includes(row.status) ||
        Date.parse(row.validFrom) > Date.parse(row.validTo)
      )
        throw new BadRequestException("INVALID_SSI_APPLICABILITY");
    }
    return this.repository.replaceApplicability(
      ssiId,
      body.records,
      body.actor,
    );
  }
  validate(command: CreateSsiCommand): void {
    this.validateCommand(command);
  }

  create(command: CreateSsiCommand): SsiRecord {
    this.validateCommand(command);
    const now = new Date().toISOString();
    const record: SsiRecord = {
      id: randomUUID(),
      ...command,
      ...this.resolveOwnership(command),
      status: "DRAFT",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.repository.save(record, "CREATED", command.maker);
    return record;
  }

  update(id: string, command: CreateSsiCommand): SsiRecord {
    const current = this.requireRecord(id);
    if (current.changeType === "SUPPRESSION")
      throw new ConflictException("SUPPRESSION_DRAFT_CANNOT_BE_EDITED");
    if (!["DRAFT", "WIP"].includes(current.status))
      throw new ConflictException(
        "Only DRAFT SSI can be updated; create a revision instead",
      );
    if (command.maker !== current.maker)
      throw new ConflictException("Only the original maker can update");
    this.validateCommand(command);
    const next: SsiRecord = {
      ...current,
      counterpartyId: command.counterpartyId,
      scope: command.scope,
      route: command.route,
      ...this.resolveOwnership(command),
      status: "DRAFT",
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    delete next.revisionWipExpiresAt;
    this.repository.save(next, "UPDATED", command.maker);
    return next;
  }

  revise(id: string, maker: string): SsiRecord {
    const current = this.requireRecord(id);
    if (!maker) throw new BadRequestException("MAKER_REQUIRED");
    if (["REVOKED", "SUPERSEDED"].includes(current.status))
      throw new ConflictException(
        "Revoked or superseded SSI cannot be revised",
      );
    if (!["ACTIVE", "APPROVED"].includes(current.status))
      throw new ConflictException("INVALID_REVISION_STATUS");
    if (this.repository.hasOpenRevision?.(current.id))
      throw new ConflictException("OPEN_REVISION_EXISTS");
    const now = new Date().toISOString();
    const revision: SsiRecord = {
      id: randomUUID(),
      counterpartyId: current.counterpartyId,
      scope: current.scope,
      maker,
      ...this.resolveOwnership(current),
      route: { ...current.route },
      status: "WIP",
      revisionWipExpiresAt: revisionWipExpiresAt(),
      version: current.version + 1,
      amendmentOfId: current.id,
      createdAt: now,
      updatedAt: now,
    };
    const reserved =
      this.repository.saveRevisionWorkInProgress?.(revision, maker) ??
      (this.repository.save(revision, "WIP_RESERVED", maker), true);
    if (!reserved) throw new ConflictException("REVISION_NOT_AVAILABLE");
    this.copyApplicability(current.id, revision.id, maker);
    return revision;
  }

  cancelRevision(id: string, actor: string): SsiRecord {
    const current = this.requireRecord(id);
    if (!actor) throw new BadRequestException("ACTOR_REQUIRED");
    if (current.status !== "WIP")
      throw new ConflictException("CANCELLATION_REQUIRES_WIP");
    if (actor !== current.maker)
      throw new ConflictException("ONLY_REVISION_MAKER_CAN_CANCEL");
    const cancelled: SsiRecord = {
      ...current,
      status: "REVOKED",
      revokeReason: "Revision WIP cancelled by maker",
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    delete cancelled.revisionWipExpiresAt;
    this.repository.save(cancelled, "WIP_CANCELLED", actor);
    return cancelled;
  }

  suppress(id: string, maker: string, reason: string): SsiRecord {
    const current = this.requireRecord(id);
    if (!maker) throw new BadRequestException("MAKER_REQUIRED");
    if ((reason?.trim().length ?? 0) < 5)
      throw new BadRequestException("SUPPRESSION_REASON_REQUIRED");
    if (current.status !== "ACTIVE")
      throw new ConflictException("ONLY_ACTIVE_CAN_BE_SUPPRESSED");
    if (this.repository.hasOpenRevision?.(current.id))
      throw new ConflictException("OPEN_REVISION_EXISTS");
    const now = new Date().toISOString();
    const suppression: SsiRecord = {
      ...current,
      id: randomUUID(),
      maker,
      status: "DRAFT",
      changeType: "SUPPRESSION",
      suppressionReason: reason.trim(),
      version: current.version + 1,
      amendmentOfId: current.id,
      createdAt: now,
      updatedAt: now,
    };
    delete suppression.checker;
    const reserved =
      this.repository.saveRevisionWorkInProgress?.(
        suppression,
        maker,
        "SUPPRESSION_DRAFT_CREATED",
      ) ??
      (this.repository.save(suppression, "SUPPRESSION_DRAFT_CREATED", maker),
      true);
    if (!reserved) throw new ConflictException("SUPPRESSION_NOT_AVAILABLE");
    this.copyApplicability(current.id, suppression.id, maker);
    return suppression;
  }

  revoke(id: string, actor: string, reason: string): SsiRecord {
    const current = this.requireRecord(id);
    if (!actor) throw new BadRequestException("ACTOR_REQUIRED");
    if (!reason || reason.trim().length < 5)
      throw new BadRequestException("REVOCATION_REASON_REQUIRED");
    if (current.status === "REVOKED")
      throw new ConflictException("SSI already revoked");
    if (current.status === "ACTIVE")
      throw new ConflictException("ACTIVE_REQUIRES_SUPPRESSION");
    if (!["DRAFT", "WIP"].includes(current.status))
      throw new ConflictException("REVOCATION_REQUIRES_DRAFT");
    if (current.status !== "DRAFT" && actor === current.maker)
      throw new ConflictException("Maker cannot revoke an approved SSI");
    const next: SsiRecord = {
      ...current,
      status: "REVOKED",
      revokeReason: reason.trim(),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.repository.save(next, "REVOKED", actor);
    return next;
  }

  transition(
    id: string,
    action: SsiTransitionAction,
    actor: string,
    reason = "",
  ): SsiRecord {
    const current = this.requireRecord(id);
    this.validateTransition(current, action, actor, reason);

    if (action === "APPROVE" && current.changeType === "SUPPRESSION") {
      return this.approveSuppression(current, actor);
    }

    const activates = action === "APPROVE" || action === "ACTIVATE";
    this.validateActivationPreconditions(current, action, actor, activates);

    if (action === "APPROVE") {
      return this.approveWithApplicability(current.id, actor);
    }

    if (activates) this.supersedePreviousActive(current, actor);
    const next = this.buildTransitionRecord(current, action, actor, reason);
    this.repository.save(next, action, actor);
    return next;
  }

  private validateTransition(
    current: SsiRecord,
    action: SsiTransitionAction,
    actor: string,
    reason: string,
  ): void {
    const expected = EXPECTED_TRANSITION_STATUS[action];
    if (current.status !== expected)
      throw new ConflictException(
        `Expected ${expected}, found ${current.status}`,
      );
    if (action === "SUBMIT" && actor !== current.maker)
      throw new ConflictException("Only the maker can submit");
    if (
      (action === "APPROVE" || action === "REJECT") &&
      actor === current.maker
    )
      throw new ConflictException("Maker cannot check their own SSI");
    if (action === "REJECT" && reason.trim().length < 5)
      throw new BadRequestException("REJECTION_REASON_REQUIRED");
    if (
      action === "SUBMIT" &&
      current.changeType === "SUPPRESSION" &&
      (current.suppressionReason?.trim().length ?? 0) < 5
    )
      throw new BadRequestException("SUPPRESSION_REASON_REQUIRED");
  }

  private approveSuppression(current: SsiRecord, actor: string): SsiRecord {
    const suppressed = this.repository.approveSuppression(current.id, actor);
    if (!suppressed) throw new ConflictException("SUPPRESSION_STATE_CHANGED");
    return suppressed;
  }

  private validateActivationPreconditions(
    current: SsiRecord,
    action: SsiTransitionAction,
    actor: string,
    activates: boolean,
  ): void {
    if (
      activates &&
      current.scope === "TRANSACTION_SPECIFIC" &&
      !current.route["transactionBindingReference"]?.trim()
    )
      throw new ConflictException("TRANSACTION_BINDING_REQUIRED");
    const applicability = this.resolveActivationApplicability(
      current,
      action,
      actor,
      activates,
    );
    if (
      activates &&
      !applicability.some(
        (row) =>
          row.status === "ACTIVE" ||
          (action === "APPROVE" && row.status === "DRAFT"),
      )
    )
      throw new ConflictException("ACTIVE_SSI_APPLICABILITY_REQUIRED");
    if (activates) this.validateRoute(current.route);
  }

  private resolveActivationApplicability(
    current: SsiRecord,
    action: SsiTransitionAction,
    actor: string,
    activates: boolean,
  ): ReturnType<SqliteSsiRepository["listApplicability"]> {
    if (action === "APPROVE") return this.applicabilityForApproval(current);
    if (activates) return this.ensureRevisionApplicability(current, actor);
    return [];
  }

  private approveWithApplicability(id: string, actor: string): SsiRecord {
    let coverageUpdate: ResolutionCurrencyApplyResult | undefined;
    const approved = this.currencyCoordinator
      ? this.repository.approveWithApplicability(id, actor, () => {
          coverageUpdate = this.currencyCoordinator!.discoverApproved(id);
        })
      : this.repository.approveWithApplicability(id, actor);
    if (!approved) throw new ConflictException("APPROVAL_STATE_CHANGED");
    if (coverageUpdate)
      this.currencyCoordinator?.invalidateAfterCommit(coverageUpdate);
    return approved;
  }

  private buildTransitionRecord(
    current: SsiRecord,
    action: Exclude<SsiTransitionAction, "APPROVE">,
    actor: string,
    reason: string,
  ): SsiRecord {
    return {
      ...current,
      status: NEXT_TRANSITION_STATUS[action],
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      ...(action === "REJECT"
        ? { checker: actor, rejectionReason: reason.trim() }
        : {}),
    };
  }

  private ensureRevisionApplicability(
    record: SsiRecord,
    actor: string,
  ): ReturnType<SqliteSsiRepository["listApplicability"]> {
    const current = this.repository.listApplicability(record.id);
    if (current.length > 0 || !record.amendmentOfId) return current;
    return this.copyApplicability(record.amendmentOfId, record.id, actor);
  }

  private applicabilityForApproval(
    record: SsiRecord,
  ): ReturnType<SqliteSsiRepository["listApplicability"]> {
    const current = this.repository.listApplicability(record.id);
    if (current.length > 0 || !record.amendmentOfId) return current;
    return this.repository.listApplicability(record.amendmentOfId);
  }

  private copyApplicability(
    sourceId: string,
    targetId: string,
    actor: string,
  ): ReturnType<SqliteSsiRepository["listApplicability"]> {
    const source = this.repository.listApplicability(sourceId);
    if (source.length === 0) return [];
    return this.repository.replaceApplicability(
      targetId,
      source.map(
        ({
          consumer,
          product,
          businessFunction,
          paymentLeg,
          direction,
          status,
          validFrom,
          validTo,
          fixtureBindingIds,
        }) => ({
          consumer,
          product,
          businessFunction,
          paymentLeg,
          direction,
          status,
          validFrom,
          validTo,
          ...(fixtureBindingIds ? { fixtureBindingIds } : {}),
        }),
      ),
      actor,
    );
  }

  private validateResolutionRequest(request: RouteResolutionRequest): void {
    const required = [
      request.consumer,
      request.product,
      request.counterpartyId || request.counterpartyBic,
      request.counterpartyCountry,
      request.businessFunction,
      request.paymentLeg,
      request.transactionReference,
      request.valueDate,
      request.amount,
      request.direction,
      request.bookingEntity,
      request.messageType,
    ];
    if (required.some((value) => !String(value ?? "").trim()))
      throw new BadRequestException("RESOLUTION_FIELDS_REQUIRED");
    if (!PAYMENT_TRIGGER_LEGS.has(request.paymentLeg))
      throw new BadRequestException("PAYMENT_TRIGGER_REQUIRED");
    if (request.direction !== "OUTBOUND")
      throw new BadRequestException(
        "EXECUTABLE_SETTLEMENT_REQUIRES_OUTGOING_PAYMENT",
      );
    if (!CURRENCY_PATTERN.test(request.currency ?? ""))
      throw new BadRequestException("INVALID_ISO_4217_CURRENCY");
    this.validateCentralPaymentProfile(request);
    assertIsoValueDate(request.valueDate);
  }

  private resolveCandidateNostro(
    request: RouteResolutionRequest,
    candidate: RankedRoute,
  ): NostroEvidence & { readonly ssiId: string } {
    if (candidate.route["currency"] !== request.currency)
      throw new ConflictException("RESOLUTION_SNAPSHOT_CURRENCY_MISMATCH");
    const evidence = this.nostro.resolve({
      ownLegalEntityId: request.bookingEntity,
      accountReference: candidate.route["accountId"] ?? "",
      accountServicerBic: candidate.route["accountWithBic"] ?? "",
      currency: request.currency,
      purpose: "SETTLEMENT",
      at: request.valueDate,
    }) as NostroEvidence;
    if (evidence.decision !== "RESOLVED")
      throw new ServiceUnavailableException("PROFILE_INCOMPLETE");
    return { ...evidence, ssiId: candidate.ssiId };
  }

  resolve(request: RouteResolutionRequest): unknown {
    this.validateResolutionRequest(request);
    this.requireCoverProfile(request);
    const bindings =
      typeof this.repository.findRelatedRouteBindings === "function"
        ? this.repository.findRelatedRouteBindings(request)
        : {
            ssi: this.repository.list(),
            applicability: this.repository.listApplicability(),
          };
    const preview = previewResolution(
      request,
      bindings.ssi,
      bindings.applicability,
    );
    const attemptId = randomUUID();
    const requestHash = hashCanonical({
      canonicalSchemaVersion: "1",
      request,
    });
    this.resolutionAttempts.set(attemptId, { request, requestHash, preview });
    let canonicalSettlementPreview;
    let nostroEvidence: NostroEvidence | undefined;
    let alternativeNostroEvidence: readonly (NostroEvidence & {
      readonly ssiId: string;
    })[] = [];
    let lowerRankedNostroEvidence: readonly (NostroEvidence & {
      readonly ssiId: string;
    })[] = [];
    const resolveNostro = (candidate: RankedRoute) =>
      this.resolveCandidateNostro(request, candidate);
    if (preview.recommendedRoute) {
      const selected = preview.recommendedRoute;
      nostroEvidence = resolveNostro(selected);
      canonicalSettlementPreview = this.buildCanonicalSettlement(
        request,
        selected,
        nostroEvidence,
      );
    }
    alternativeNostroEvidence = preview.alternatives.map(resolveNostro);
    lowerRankedNostroEvidence = (
      preview.lowerRankedEligibleCandidates ?? []
    ).map(resolveNostro);
    return {
      useCase: "PAYMENT_SSI",
      usage: "EXECUTABLE_SETTLEMENT",
      paymentExecutable: false,
      preSettlement: true,
      attemptId,
      requestHash,
      ...preview,
      ...(nostroEvidence ? { nostroEvidence } : {}),
      ...(alternativeNostroEvidence.length
        ? { alternativeNostroEvidence }
        : {}),
      ...(lowerRankedNostroEvidence.length
        ? { lowerRankedNostroEvidence }
        : {}),
      ...(canonicalSettlementPreview ? { canonicalSettlementPreview } : {}),
    };
  }

  clearingOptions(request: RouteResolutionRequest): unknown {
    const required = [
      request.consumer,
      request.product,
      request.counterpartyId || request.counterpartyBic,
      request.counterpartyCountry,
      request.businessFunction,
      request.paymentLeg,
      request.currency,
      request.direction,
      request.bookingEntity,
      request.valueDate,
      request.amount,
      request.messageType,
    ];
    if (required.some((value) => !String(value ?? "").trim()))
      return { items: [], decision: "INCOMPLETE_CRITERIA" };
    assertIsoValueDate(request.valueDate);
    if (!PAYMENT_TRIGGER_LEGS.has(request.paymentLeg))
      return { items: [], decision: "PAYMENT_TRIGGER_REQUIRED" };
    this.requireCoverProfile(request);
    const unrestrictedRequest = { ...request };
    delete unrestrictedRequest.clearingSystem;
    const preview = previewResolution(
      unrestrictedRequest,
      this.repository.list(),
      this.repository.listApplicability(),
    );
    const codes = new Set(
      [preview.recommendedRoute, ...preview.alternatives]
        .filter((route) => route !== undefined)
        .map((route) => route.route["clearingSystem"]),
    );
    return {
      items: CLEARING_SYSTEMS.filter((system) => codes.has(system.code)),
      decision: preview.decision,
      source: "ELIGIBLE_SSI_ROUTES_INTERSECT_CLEARING_STANDING_DATA",
    };
  }

  confirm(command: {
    attemptId: string;
    selectedSsiId: string;
    actor: string;
    overrideReason?: string;
  }): unknown {
    const attempt = this.resolutionAttempts.get(command.attemptId);
    if (!attempt) throw new ConflictException("STALE_PREVIEW");
    if (!command.actor) throw new BadRequestException("ACTOR_REQUIRED");
    this.requireCoverProfile(attempt.request);
    const current = previewResolution(
      attempt.request,
      this.repository.list(),
      this.repository.listApplicability(),
    );
    const routes = [current.recommendedRoute, ...current.alternatives].filter(
      (route) => route !== undefined,
    );
    const selected = routes.find(
      (route) => route.ssiId === command.selectedSsiId,
    );
    if (!selected) throw new ConflictException("SELECTED_ROUTE_NOT_ELIGIBLE");
    const isOverride = current.recommendedRoute?.ssiId !== selected.ssiId;
    if (isOverride && !command.overrideReason?.trim())
      throw new BadRequestException("OVERRIDE_REASON_REQUIRED");
    const actualReceiverBic =
      selected.route["actualReceiverBic"] ??
      selected.route["accountWithBic"] ??
      selected.route["bic"] ??
      "";
    const messagingService =
      attempt.request.messagingService ||
      selected.route["messagingService"] ||
      "";
    const rmaEvidence = this.rma.check({
      ownBic: selected.route["senderBic"] ?? "DEMOHKHH",
      counterpartyBic: actualReceiverBic,
      service: messagingService,
      direction: "OUTBOUND",
      messageType: attempt.request.messageType,
      at: attempt.request.valueDate,
    }) as { authorised?: boolean };
    if (rmaEvidence.authorised !== true)
      throw new ConflictException("RMA_NOT_AUTHORISED_FOR_ACTUAL_RECEIVER");
    const nostroEvidence = this.nostro.resolve({
      ownLegalEntityId: attempt.request.bookingEntity,
      accountReference: selected.route["accountId"] ?? "",
      accountServicerBic: selected.route["accountWithBic"] ?? "",
      currency: attempt.request.currency,
      purpose: "SETTLEMENT",
      at: attempt.request.valueDate,
    }) as {
      decision?: string;
      nostroId?: string;
      accountServicerBic?: string;
      maskedAccountRef?: string;
    };
    if (nostroEvidence.decision === "ENTITY_NOT_AUTHORIZED")
      throw new ConflictException("ENTITY_NOT_AUTHORIZED");
    if (nostroEvidence.decision !== "RESOLVED")
      throw new ConflictException("NOSTRO_NOT_ELIGIBLE");
    const applicabilityEvidence = selected.evidence.filter(({ criterion }) =>
      [
        "APPLICABILITY",
        "CONSUMER",
        "PRODUCT",
        "BUSINESS_FUNCTION",
        "PAYMENT_LEG",
        "DIRECTION",
        "COUNTERPARTY_SCOPE",
      ].includes(criterion),
    );
    const effectivePeriod = {
      validFrom: selected.route["validFrom"],
      validTo: selected.route["validTo"],
      valueDate: attempt.request.valueDate,
    };
    const applicability = {
      ...selected.applicability,
      evidence: applicabilityEvidence,
    };
    const canonicalSettlement = this.buildCanonicalSettlement(
      attempt.request,
      selected,
      nostroEvidence,
    );
    const snapshot = {
      canonicalSchemaVersion: "1",
      attemptId: command.attemptId,
      requestHash: attempt.requestHash,
      request: attempt.request,
      ssiId: selected.ssiId,
      ssiVersion: selected.ssiVersion,
      effectivePeriod,
      applicability,
      route: selected.route,
      actualReceiverBic,
      rmaEvidence,
      nostroEvidence,
      actor: command.actor,
      overrideReason: command.overrideReason?.trim() ?? null,
      confirmedAt: new Date().toISOString(),
      canonicalSettlement,
    };
    return {
      useCase: "PAYMENT_SSI",
      usage: "EXECUTABLE_SETTLEMENT",
      paymentExecutable: true,
      preSettlement: true,
      reconciliationSupported: false,
      decision: "CONFIRMED",
      ...snapshot,
      resolutionToken: randomUUID(),
      snapshotHash: hashCanonical(snapshot),
    };
  }

  private buildCanonicalSettlement(
    request: RouteResolutionRequest,
    selected: RankedRoute,
    nostroEvidence?: NostroEvidence,
  ) {
    return canonicalSettlementFor(
      request,
      selected,
      nostroEvidence,
      this.directAccountRelationshipCount(request, selected),
    );
  }

  private directAccountRelationshipCount(
    request: RouteResolutionRequest,
    selected: RankedRoute,
  ): number {
    const actualReceiver =
      selected.route["actualReceiverBic"] ??
      selected.route["accountWithBic"] ??
      selected.route["bic"] ??
      "";
    if (!actualReceiver) return 0;
    const at = new Date(request.valueDate);
    const list = (
      this.nostro as NostroApplicationService & {
        list?: () => ReturnType<NostroApplicationService["list"]>;
      }
    ).list;
    const references = (
      typeof list === "function" ? list.call(this.nostro) : []
    )
      .filter((record) => {
        const allowed = record.allowedBookingEntities ?? [];
        return (
          record.status === "ACTIVE" &&
          record.accountServicerBic === actualReceiver &&
          record.currency === request.currency &&
          record.purpose === "SETTLEMENT" &&
          new Date(record.validFrom) <= at &&
          at <= new Date(record.validTo) &&
          record.ownLegalEntityId === request.bookingEntity &&
          (allowed.length === 0 ||
            allowed.includes("ANY") ||
            allowed.includes(request.bookingEntity)) &&
          Boolean(record.accountReference?.trim())
        );
      })
      .map((record) => record.accountReference!.trim().toUpperCase());
    return new Set(references).size;
  }

  private validateCentralPaymentProfile(request: RouteResolutionRequest): void {
    if (request.consumer !== "CENTRAL_PAYMENT") return;
    const counterpartyType = (request.counterpartyType ??
      "BANK") as PaymentCounterpartyType;
    const profile = paymentSettlementProfile(counterpartyType);
    if (
      request.product !== profile.product ||
      request.businessFunction !== profile.businessFunction ||
      request.paymentLeg !== profile.paymentLeg ||
      request.messageType !== profile.mxMessageType
    )
      throw new BadRequestException("COUNTERPARTY_PAYMENT_PROFILE_MISMATCH");
    if (counterpartyType === "BANK") {
      if (!request.sourceMessageType)
        throw new BadRequestException("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED");
      const messageProfile = this.paymentMessageIndex.findSelectable(
        request.sourceMessageType,
      );
      if (!messageProfile)
        throw new BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED");
      if (messageProfile.targetMessage !== request.messageType)
        throw new BadRequestException("PAYMENT_SOURCE_TARGET_MISMATCH");
    }
    if (
      counterpartyType === "CUSTOMER" &&
      !this.completeBeneficiaryCustomer(request.beneficiaryCustomer)
    )
      throw new BadRequestException("BENEFICIARY_CUSTOMER_REQUIRED");
  }

  private requireCoverProfile(request: RouteResolutionRequest): void {
    const sourceMessageType = request.sourceMessageType;
    if (!sourceMessageType?.endsWith("COV")) return;
    const exactCounterparty = request.counterpartyBic || request.counterpartyId;
    const profileAvailable =
      request.businessService === COV_BUSINESS_SERVICE &&
      (typeof this.repository.hasCoverProfile === "function"
        ? this.repository.hasCoverProfile(request)
        : this.repository
            .list()
            .some(
              (candidate) =>
                candidate.status === "ACTIVE" &&
                candidate.route["currency"] === request.currency &&
                candidate.route["bookingEntity"] === request.bookingEntity &&
                (candidate.route["counterpartyBic"] ||
                  candidate.counterpartyId) === exactCounterparty &&
                routeList(candidate.route, "messageTypes").includes(
                  request.messageType,
                ) &&
                routeList(candidate.route, "businessService").includes(
                  COV_BUSINESS_SERVICE,
                ) &&
                routeList(candidate.route, "sourceMessageTypes").includes(
                  sourceMessageType,
                ),
            ));
    if (!profileAvailable)
      throw new ServiceUnavailableException("PROFILE_INCOMPLETE");
  }

  private completeBeneficiaryCustomer(
    beneficiary: BeneficiaryCustomerInput | undefined,
  ): beneficiary is BeneficiaryCustomerInput {
    return Boolean(
      beneficiary?.customerId.trim() &&
      beneficiary.name.trim() &&
      beneficiary.accountReference.trim(),
    );
  }

  audit(): unknown[] {
    return this.repository.audit();
  }

  private requireRecord(id: string): SsiRecord {
    const current = this.repository.find(id);
    if (!current) throw new NotFoundException("SSI not found");
    return current;
  }

  private validateCommand(command: CreateSsiCommand): void {
    if (
      !command.counterpartyId ||
      !command.maker ||
      !["STANDING", "TRANSACTION_SPECIFIC"].includes(command.scope)
    )
      throw new BadRequestException("SSI_REQUIRED_FIELDS_MISSING");
    if (
      command.ownershipType !== undefined &&
      (!["OWN", "COUNTERPARTY"].includes(command.ownershipType) ||
        !command.ownerParty?.trim() ||
        !command.publisherParty?.trim())
    )
      throw new BadRequestException("SSI_OWNERSHIP_FIELDS_REQUIRED");
    this.validateRoute(command.route);
  }

  private resolveOwnership(
    command: Pick<
      CreateSsiCommand,
      | "counterpartyId"
      | "route"
      | "ownershipType"
      | "ownerParty"
      | "publisherParty"
    >,
  ): {
    ownershipType: "OWN" | "COUNTERPARTY";
    ownerParty: string;
    publisherParty: string;
  } {
    const ownershipType =
      command.ownershipType ??
      (command.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
    const ownerParty =
      command.ownerParty?.trim() ||
      (ownershipType === "OWN"
        ? command.route["bookingEntity"] || "HK01"
        : command.route["counterpartyBic"] || command.counterpartyId);
    return {
      ownershipType,
      ownerParty,
      publisherParty: command.publisherParty?.trim() || ownerParty,
    };
  }

  private withExplicitOwnership(record: SsiRecord): SsiRecord & {
    ownershipType: "OWN" | "COUNTERPARTY";
    ownerParty: string;
    publisherParty: string;
  } {
    return { ...record, ...this.resolveOwnership(record) };
  }

  private supersedePreviousActive(current: SsiRecord, actor: string): void {
    const logicalSsiCode = current.route["ssiCode"];
    for (const previous of this.repository
      .list()
      .filter(
        (candidate) =>
          candidate.id !== current.id &&
          candidate.status === "ACTIVE" &&
          (candidate.id === current.amendmentOfId ||
            (logicalSsiCode && candidate.route["ssiCode"] === logicalSsiCode)),
      )) {
      this.repository.save(
        {
          ...previous,
          status: "SUPERSEDED",
          version: previous.version + 1,
          updatedAt: new Date().toISOString(),
        },
        "SUPERSEDED",
        actor,
      );
    }
  }

  private validateRoute(route: Record<string, string>): void {
    validateRouteIdentity(route);
    validateRouteEffectiveDates(route);
    const clearingSystem = requireClearingSystem(route);
    validateClearingScope(route, clearingSystem);
    validateRouteBics(route);
    validateCounterpartyIdentity(route);
  }
}
