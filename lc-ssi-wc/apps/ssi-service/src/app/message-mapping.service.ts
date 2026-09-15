import { BadRequestException, Injectable } from "@nestjs/common";
import {
  MappingCatalogueService,
  type MappingDirection as Direction,
  type Mapping,
  type LoadedCatalogue,
} from "./mapping-catalogue.service";
import { assertIsoValueDate } from "./value-date";
import { assertFin5xSupportContract } from "./fin-5x-support-contract";
interface Message {
  standardsRelease: string;
  messageType: string;
  direction: Direction;
  businessFunction: string;
  fields: Record<string, string>;
}
type OwnerSide = "SENDER_SIDE" | "RECEIVER_SIDE" | "TRANSACTION_PARTY";
type EvidenceSource =
  | "SENDER_SETTLEMENT_SSI"
  | "APPROVED_REIMBURSEMENT_PROFILE"
  | "APPROVED_CLAIM_RECEIVING_ROUTE"
  | "SENDER_ACCOUNT_RELATIONSHIP"
  | "NOSTRO_MASTER"
  | "TRANSACTION_APPROVED_ROUTE"
  | "COUNTERPARTY_AUTHENTICATED_SSI"
  | "VERIFIED_COUNTERPARTY_ACCOUNT_RELATIONSHIP"
  | "AUTHENTICATED_TRANSACTION_INSTRUCTION"
  | "TRANSACTION_ADVISING_CHAIN"
  | "APPROVED_ADVISORY_ROUTING_PROFILE"
  | "PARTY_MASTER_ROLE"
  | "CONFIRMATION_MANDATE"
  | "MANUAL_APPROVED_OVERRIDE"
  | "SYNTHETIC_DEMO";
interface RoleEvidence {
  ownerSide: OwnerSide;
  sourceType: EvidenceSource;
  sourceRecordId?: string;
  authenticated?: boolean;
  status?: "ACTIVE";
  approvalStatus?: "APPROVED";
  effectiveFrom?: string;
  effectiveTo?: string;
  version?: string;
  authorizedChannel?: boolean;
  transactionId?: string;
  messageVersion?: string;
  roleAssignment?: string;
  demoData?: boolean;
}

const incompleteDemoEvidence = (evidence: RoleEvidence): boolean =>
  evidence.demoData !== true ||
  !evidence.sourceRecordId ||
  evidence.status !== "ACTIVE" ||
  evidence.approvalStatus !== "APPROVED" ||
  !evidence.effectiveFrom ||
  !evidence.version;

const evidenceOutsideEffectiveRange = (
  evidence: RoleEvidence,
  valueDate: string,
): boolean =>
  Boolean(
    evidence.effectiveFrom &&
    (evidence.effectiveFrom > valueDate ||
      (evidence.effectiveTo && evidence.effectiveTo < valueDate)),
  );

const transactionEvidence = (evidence: RoleEvidence): boolean =>
  [
    "TRANSACTION_APPROVED_ROUTE",
    "AUTHENTICATED_TRANSACTION_INSTRUCTION",
    "TRANSACTION_ADVISING_CHAIN",
  ].includes(evidence.sourceType);

const incompleteTransactionEvidence = (evidence: RoleEvidence): boolean =>
  !evidence.authorizedChannel ||
  !evidence.transactionId ||
  !evidence.messageVersion ||
  !evidence.roleAssignment;

const incompleteMasterEvidence = (evidence: RoleEvidence): boolean =>
  !evidence.sourceRecordId ||
  evidence.status !== "ACTIVE" ||
  evidence.approvalStatus !== "APPROVED" ||
  !evidence.effectiveFrom ||
  !evidence.version;
export interface FinTagSuggestionRequest {
  service: "FIN";
  standardsRelease: string;
  messageType: string;
  direction: Direction;
  businessFunction: string;
  transactionReference: string;
  currency: string;
  receiverBic: string;
  valueDate: string;
  sourceSsiId?: string;
  roles: Record<string, string>;
  roleSources?: Record<string, string>;
  roleEvidence?: Record<string, RoleEvidence>;
  controls?: {
    accountRelationship?:
      "UNVERIFIED" | "DIRECT_ACCOUNT" | "AUTHENTICATED_RECEIVING_ROUTE";
    directRelationshipEvidenceId?: string;
    sequence?: string;
    purpose?: string;
    formOfUndertaking?: "STBY" | "DGAR";
    confirmationInstructions?: "WITHOUT" | "MAY_ADD" | "CONFIRM";
    field50Present?: boolean;
    routeGraph?: {
      routeComplete: boolean;
      evidenceValid: boolean;
      additionalAccountWithRequired: boolean;
    };
  };
}

interface FinTagSuggestion {
  tag: string;
  value: string | undefined;
  provenance: {
    source: string;
    sourceRecordId: string;
    ownerSide?: OwnerSide;
  };
}
@Injectable()
export class MessageMappingService {
  constructor(private readonly catalogues: MappingCatalogueService) {}
  parse(content: string, format: "FIN_LIKE" | "MX_JSON"): Message {
    if (format === "MX_JSON") {
      try {
        return JSON.parse(content) as Message;
      } catch {
        throw new BadRequestException("INVALID_JSON");
      }
    }
    const h: Record<string, string> = {},
      fields: Record<string, string> = {};
    for (const line of content
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      const f = /^:([^:]+):(.+)$/.exec(line);
      if (f?.[1] && f[2]) {
        fields[f[1]] = f[2];
        continue;
      }
      const p = line.indexOf("=");
      if (p > 0) {
        h[line.slice(0, p)] = line.slice(p + 1);
        continue;
      }
      throw new BadRequestException("INVALID_PSEUDO_LINE");
    }
    if (
      !h["STANDARDS_RELEASE"] ||
      !h["MESSAGE_TYPE"] ||
      (h["DIRECTION"] !== "INCOMING" && h["DIRECTION"] !== "OUTGOING") ||
      !h["BUSINESS_FUNCTION"]
    )
      throw new BadRequestException("MISSING_OR_INVALID_HEADER");
    return {
      standardsRelease: h["STANDARDS_RELEASE"],
      messageType: h["MESSAGE_TYPE"],
      direction: h["DIRECTION"],
      businessFunction: h["BUSINESS_FUNCTION"],
      fields,
    };
  }
  extract(message: Message): unknown {
    const roles: unknown[] = [],
      diagnostics: unknown[] = [];
    for (const [path, value] of Object.entries(message.fields)) {
      const hits = this.catalogues
        .get(message.standardsRelease)
        .mappings.filter(
          (m) =>
            m.standardsRelease === message.standardsRelease &&
            m.messageType === message.messageType &&
            m.direction === message.direction &&
            m.businessFunction === message.businessFunction &&
            m.path === path,
        );
      if (hits.length === 1) {
        const m = hits[0]!;
        roles.push({
          role: m.canonicalRole,
          sourcePath: path,
          value,
          reusableCandidate: m.reusableCandidate,
        });
      } else
        diagnostics.push({
          code: hits.length ? "AMBIGUOUS_SSI_MAPPING" : "UNMAPPED_SSI_FIELD",
          severity: hits.length ? "ERROR" : "WARNING",
          path,
        });
    }
    return { message, roles, diagnostics };
  }
  generate(
    message: Omit<Message, "fields">,
    roles: Record<string, string>,
  ): unknown {
    const fields: Record<string, string> = {};
    for (const m of this.catalogues
      .get(message.standardsRelease)
      .mappings.filter(
        (x) =>
          x.standardsRelease === message.standardsRelease &&
          x.messageType === message.messageType &&
          x.direction === message.direction &&
          x.businessFunction === message.businessFunction,
      )) {
      if (roles[m.canonicalRole]) fields[m.path] = roles[m.canonicalRole]!;
    }
    return {
      fields,
      disclaimer: "SSI-field subset only; not a complete SWIFT message.",
    };
  }
  suggestFinTags(request: FinTagSuggestionRequest): unknown {
    this.validateReferenceFinContext(request);
    const loadedCatalogue = this.catalogues.get(request.standardsRelease);
    const profileMappings = loadedCatalogue.mappings.filter(
      (mapping) =>
        mapping.standardsRelease === request.standardsRelease &&
        mapping.messageType === request.messageType &&
        mapping.direction === request.direction &&
        mapping.businessFunction === request.businessFunction,
    );
    return this.suggestFromProfile(request, loadedCatalogue, profileMappings);
  }

  private validateReferenceFinContext(request: FinTagSuggestionRequest): void {
    if (
      request.service !== "FIN" ||
      !request.messageType?.startsWith("MT") ||
      !request.standardsRelease ||
      !request.businessFunction ||
      !request.transactionReference ||
      !request.currency ||
      !request.receiverBic ||
      !request.valueDate
    )
      throw new BadRequestException("REFERENCE_FIN_CONTEXT_REQUIRED");
    if (!/^[A-Z]{3}$/.test(request.currency))
      this.reject("INPUT_INVALID_CURRENCY", "SWIFT_FIELD_VALIDATION");
    if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(request.receiverBic))
      this.reject("INVALID_RECEIVER_FI_BIC_FORMAT", "SWIFT_FIELD_VALIDATION");
    if (request.direction !== "OUTGOING")
      this.reject("DIRECTION_NOT_SUPPORTED", "LOCAL_POLICY");
    assertIsoValueDate(request.valueDate);
  }

  private assertMappingEvidenceReady(
    request: FinTagSuggestionRequest,
    profileMappings: readonly Readonly<Mapping>[],
  ): void {
    if (
      profileMappings.length > 0 &&
      profileMappings.every(
        (mapping) =>
          mapping.evidenceStatus === "PENDING_EVIDENCE" ||
          mapping.suggestionEnabled === false,
      )
    )
      throw new BadRequestException({
        code: "MAPPING_PENDING",
        validationLayer: "MAPPING_STATUS",
        fields: {},
        paymentExecutable: false,
        candidateFields: profileMappings.map((mapping) => ({
          tag: mapping.path,
          semanticRole: mapping.canonicalRole,
          evidenceStatus: mapping.evidenceStatus ?? "PENDING_EVIDENCE",
          evidenceArtifactId: mapping.evidenceArtifactId,
          evidencePages: mapping.evidencePages,
        })),
      });
    const pendingFields = this.pendingCandidateFields(request.messageType);
    const hasEnabledProfile = profileMappings.some(
      (mapping) =>
        mapping.evidenceStatus === "FIELD_PROFILE_PROVEN" &&
        mapping.suggestionEnabled !== false,
    );
    if (pendingFields && !hasEnabledProfile)
      throw new BadRequestException({
        code: "MAPPING_PENDING",
        validationLayer: "MAPPING_STATUS",
        fields: {},
        paymentExecutable: false,
        candidateFields: pendingFields,
      });
  }

  private eligibleFin5xMappings(
    request: FinTagSuggestionRequest,
    catalogue: LoadedCatalogue,
  ): readonly Readonly<Mapping>[] {
    return catalogue.mappings.filter(
      (mapping) =>
        mapping.standardsRelease === request.standardsRelease &&
        mapping.messageType === request.messageType &&
        mapping.direction === request.direction &&
        mapping.businessFunction === request.businessFunction &&
        mapping.evidenceStatus !== "PENDING_EVIDENCE" &&
        mapping.suggestionEnabled !== false &&
        /(^|\.)5[3-8][A-Z]?$/.test(mapping.path),
    );
  }

  private finSuggestions(
    request: FinTagSuggestionRequest,
    mappings: readonly Readonly<Mapping>[],
    loadedCatalogue: LoadedCatalogue,
  ): FinTagSuggestion[] {
    return mappings
      .filter(
        (mapping) =>
          mapping.scopeStatus !== "OUT_OF_SSI_SCOPE" &&
          !(
            mapping.scopeStatus === undefined &&
            mapping.reusableCandidate === false
          ),
      )
      .filter((mapping) => request.roles[mapping.canonicalRole])
      .map((mapping) => ({
        tag: mapping.path,
        sequence: mapping.sequence,
        option: mapping.option,
        canonicalRole: mapping.canonicalRole,
        officialFieldName: mapping.officialFieldName,
        value: request.roles[mapping.canonicalRole],
        reusableCandidate: mapping.reusableCandidate,
        provenance: {
          source:
            request.roleSources?.[mapping.canonicalRole] ??
            "APPROVED_STANDING_REFERENCE",
          standardsRelease: request.standardsRelease,
          messageType: request.messageType,
          businessFunction: request.businessFunction,
          transactionReference: request.transactionReference,
          ...request.roleEvidence?.[mapping.canonicalRole],
          sourceRecordId:
            request.roleEvidence?.[mapping.canonicalRole]?.sourceRecordId ??
            request.roleEvidence?.[mapping.canonicalRole]?.transactionId ??
            request.sourceSsiId ??
            "",
          catalogueVersion: loadedCatalogue.catalogueVersion,
          sourceArtifactId: loadedCatalogue.sourceArtifactId,
          sourceArtifactHash: loadedCatalogue.sourceArtifactHash,
          fieldProfileEvidenceStatus: mapping.evidenceStatus,
          fieldProfileArtifactId: mapping.evidenceArtifactId,
          fieldProfileEvidencePages: mapping.evidencePages,
        },
        confidence: "EXACT_VERIFIED_CATALOGUE",
      }));
  }

  private finSupportAnalysis(
    request: FinTagSuggestionRequest,
    mappings: readonly Readonly<Mapping>[],
    suggestions: readonly FinTagSuggestion[],
  ): unknown[] {
    return mappings.map((mapping) =>
      this.finMappingSupportAnalysis(request, mapping, suggestions),
    );
  }

  private finMappingSupportAnalysis(
    request: FinTagSuggestionRequest,
    mapping: Readonly<Mapping>,
    suggestions: readonly FinTagSuggestion[],
  ): unknown {
    const fieldIdentity = {
      standardsRelease: request.standardsRelease,
      messageType: request.messageType,
      sequence: mapping.sequence,
      tag: mapping.path,
      option: mapping.option,
      canonicalRole: mapping.canonicalRole,
      officialFieldName: mapping.officialFieldName,
    };
    if (this.isOutOfSsiScope(mapping))
      return assertFin5xSupportContract({
        ...fieldIdentity,
        scopeStatus: "OUT_OF_SSI_SCOPE" as const,
        resolutionStatus: "N_A" as const,
        reasonCode: this.outOfScopeReason(
          request.messageType,
          mapping.canonicalRole,
        ),
      });
    if (this.isCompleteMt400Route(request, mapping))
      return assertFin5xSupportContract({
        ...fieldIdentity,
        scopeStatus: "SSI_SUPPORTED" as const,
        resolutionStatus: "NOT_REQUIRED" as const,
        reasonCode: "ROUTE_COMPLETE" as const,
      });
    const suggestion = suggestions.find((item) => item.tag === mapping.path);
    const suggestedValue = suggestion?.value?.trim();
    if (
      !suggestion ||
      !suggestedValue ||
      request.controls?.routeGraph?.evidenceValid === false
    )
      return assertFin5xSupportContract({
        ...fieldIdentity,
        scopeStatus: "SSI_SUPPORTED" as const,
        resolutionStatus: "NO_ELIGIBLE_SSI" as const,
        reasonCode:
          request.controls?.routeGraph?.evidenceValid === false
            ? ("CONFLICTING_SSI" as const)
            : ("MISSING_SSI" as const),
      });
    return assertFin5xSupportContract({
      ...fieldIdentity,
      scopeStatus: "SSI_SUPPORTED" as const,
      resolutionStatus: "RESOLVED" as const,
      reasonCode: this.resolvedReasonCode(suggestion.provenance.ownerSide),
      suggestedValue,
      source: suggestion.provenance.source,
      ...(suggestion.provenance.ownerSide
        ? { ownerSide: suggestion.provenance.ownerSide }
        : {}),
      ...(suggestion.provenance.sourceRecordId
        ? { evidence: suggestion.provenance.sourceRecordId }
        : {}),
    });
  }

  private resolvedReasonCode(ownerSide: OwnerSide | undefined) {
    if (ownerSide === "RECEIVER_SIDE") {
      return "RESOLVED_FROM_COUNTERPARTY_SSI" as const;
    }
    if (ownerSide === "SENDER_SIDE") return "RESOLVED_FROM_OWN_SSI" as const;
    return "EXACT_ELIGIBLE_SSI" as const;
  }

  private isOutOfSsiScope(mapping: Readonly<Mapping>): boolean {
    return (
      mapping.scopeStatus === "OUT_OF_SSI_SCOPE" ||
      (mapping.scopeStatus === undefined && mapping.reusableCandidate === false)
    );
  }

  private outOfScopeReason(messageType: string, canonicalRole: string) {
    if (canonicalRole === "REQUESTED_CONFIRMATION_PARTY")
      return "CONFIRMATION_PARTY" as const;
    if (
      ["ADVISING_BANK", "ADVISE_THROUGH_BANK", "NEGOTIATING_BANK"].includes(
        canonicalRole,
      )
    )
      return "TRADE_ROUTING_ROLE" as const;
    if (["MT730", "MT768", "MT769"].includes(messageType))
      return "MESSAGE_PROFILE_EXCLUDED" as const;
    return "TRANSACTION_CONTEXT_PROVIDED" as const;
  }

  private isCompleteMt400Route(
    request: FinTagSuggestionRequest,
    mapping: Readonly<Mapping>,
  ): boolean {
    return (
      request.messageType === "MT400" &&
      mapping.path === "57A" &&
      Boolean(request.controls?.routeGraph?.routeComplete) &&
      !request.controls?.routeGraph?.additionalAccountWithRequired
    );
  }

  private suggestFromProfile(
    request: FinTagSuggestionRequest,
    loadedCatalogue: LoadedCatalogue,
    profileMappings: readonly Readonly<Mapping>[],
  ): unknown {
    if (
      request.messageType === "MT400" &&
      request.businessFunction === "COLLECTION_PAYMENT_DIRECT" &&
      request.controls?.accountRelationship === "DIRECT_ACCOUNT"
    )
      return this.resolveMt400DirectAccountContext(
        request,
        profileMappings,
        loadedCatalogue,
      );
    this.assertMappingEvidenceReady(request, profileMappings);
    this.validateFinSuggestionRequest(request);
    const mappings = this.eligibleFin5xMappings(request, loadedCatalogue);
    if (!mappings.length)
      throw new BadRequestException("NO_VERIFIED_FIN_5X_MAPPING");
    const suggestions = this.finSuggestions(request, mappings, loadedCatalogue);
    const supportAnalysis = this.finSupportAnalysis(
      request,
      mappings,
      suggestions,
    );
    return {
      useCase: "OUTWARD_REFERENCE_SUGGESTION",
      usage: "REFERENCE_ONLY",
      paymentExecutable: false,
      preSettlement: true,
      reconciliationSupported: false,
      watermark: "NOT FOR PAYMENT RELEASE",
      messageContext: {
        service: request.service,
        standardsRelease: request.standardsRelease,
        messageType: request.messageType,
        direction: request.direction,
        businessFunction: request.businessFunction,
      },
      catalogue: {
        catalogueVersion: loadedCatalogue.catalogueVersion,
        sourceArtifactId: loadedCatalogue.sourceArtifactId,
        sourceArtifactHash: loadedCatalogue.sourceArtifactHash,
      },
      suggestions,
      supportAnalysis,
      fields: Object.fromEntries(
        suggestions.map((suggestion) => [suggestion.tag, suggestion.value]),
      ),
      diagnostics: suggestions.length ? [] : ["NO_ROLE_VALUE_FOR_VERIFIED_TAG"],
    };
  }

  private reject(
    code: string,
    validationLayer:
      | "SWIFT_NVR"
      | "SWIFT_FIELD_VALIDATION"
      | "SWIFT_USAGE_SEMANTIC"
      | "LOCAL_POLICY"
      | "EVIDENCE_MISSING",
  ): never {
    throw new BadRequestException({ code, validationLayer });
  }

  private resolveMt400DirectAccountContext(
    request: FinTagSuggestionRequest,
    profileMappings: readonly {
      path: string;
      canonicalRole: string;
      evidenceStatus?: string;
      evidenceArtifactId?: string;
      evidencePages?: number[];
      sequence?: string;
      option?: string;
      officialFieldName?: string;
    }[],
    loadedCatalogue: {
      catalogueVersion: string;
      sourceArtifactId: string;
      sourceArtifactHash: string;
    },
  ): unknown {
    const directEvidenceId =
      request.controls?.directRelationshipEvidenceId?.trim();
    if (!directEvidenceId)
      this.reject("DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED", "EVIDENCE_MISSING");

    this.validateFinSuggestionRequest(request);
    const beneficiaryValue = (request.roles["BENEFICIARY_BANK"] ?? "")
      .trim()
      .toUpperCase();
    const evidenceArtifacts = [
      ...new Set(
        profileMappings
          .map((mapping) => mapping.evidenceArtifactId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const evidencePages = [
      ...new Set(
        profileMappings.flatMap((mapping) => mapping.evidencePages ?? []),
      ),
    ].sort((left, right) => left - right);
    const fieldProfileProven =
      profileMappings.length > 0 &&
      profileMappings.every(
        (mapping) => mapping.evidenceStatus === "FIELD_PROFILE_PROVEN",
      );
    const omitted = [
      ["53A", "SENDERS_CORRESPONDENT"],
      ["54A", "RECEIVERS_CORRESPONDENT"],
      ["57A", "ACCOUNT_WITH_INSTITUTION"],
    ].map(([tag, canonicalRole]) => ({
      tag,
      canonicalRole,
      disposition: "OMIT",
      reason: "DIRECT_ACCOUNT",
    }));
    const beneficiaryDisposition = beneficiaryValue
      ? {
          tag: "58A",
          canonicalRole: "BENEFICIARY_BANK",
          disposition: "VALUE_FROM_TRANSACTION_INPUT",
          reason: "QUALIFIED_TRANSACTION_INPUT",
          value: beneficiaryValue,
          provenance: request.roleEvidence?.["BENEFICIARY_BANK"],
        }
      : {
          tag: "58A",
          canonicalRole: "BENEFICIARY_BANK",
          disposition: "OPTIONAL_TRANSACTION_INPUT",
          reason: "TRANSACTION_INPUT_NOT_PROVIDED",
        };

    return {
      useCase: "OUTWARD_REFERENCE_SUGGESTION",
      usage: "REFERENCE_ONLY",
      paymentExecutable: false,
      preSettlement: true,
      reconciliationSupported: false,
      watermark: "NOT FOR PAYMENT RELEASE",
      messageContext: {
        service: request.service,
        standardsRelease: request.standardsRelease,
        messageType: request.messageType,
        direction: request.direction,
        businessFunction: request.businessFunction,
      },
      catalogue: loadedCatalogue,
      profileEvidence: {
        status: fieldProfileProven
          ? "FIELD_PROFILE_PROVEN"
          : "PENDING_EVIDENCE",
        sourceArtifactIds: evidenceArtifacts,
        evidencePages,
        reason: fieldProfileProven
          ? "FULL_MESSAGE_PROFILE_VERIFIED"
          : "CURRENT_FULL_MESSAGE_PROFILE_REQUIRED",
      },
      routeDecision: {
        status: "EVIDENCED",
        accountRelationship: "DIRECT_ACCOUNT",
        evidenceId: directEvidenceId,
        reason: "DIRECT_ACCOUNT",
      },
      fieldDispositions: [...omitted, beneficiaryDisposition],
      supportAnalysis: profileMappings.map((mapping) =>
        mapping.path === "58A"
          ? assertFin5xSupportContract({
              standardsRelease: request.standardsRelease,
              messageType: request.messageType,
              sequence: "MESSAGE",
              tag: mapping.path,
              option: "A",
              canonicalRole: mapping.canonicalRole,
              officialFieldName: mapping.officialFieldName,
              scopeStatus: "OUT_OF_SSI_SCOPE" as const,
              resolutionStatus: "N_A" as const,
              reasonCode: "TRANSACTION_CONTEXT_PROVIDED" as const,
            })
          : assertFin5xSupportContract({
              standardsRelease: request.standardsRelease,
              messageType: request.messageType,
              sequence: "MESSAGE",
              tag: mapping.path,
              option: "A",
              canonicalRole: mapping.canonicalRole,
              officialFieldName: mapping.officialFieldName,
              scopeStatus: "SSI_SUPPORTED" as const,
              resolutionStatus: "NOT_REQUIRED" as const,
              reasonCode: "DIRECT_ACCOUNT_RELATIONSHIP" as const,
            }),
      ),
      contextualValues: beneficiaryValue ? { "58A": beneficiaryValue } : {},
      fields: {},
      suggestions: [],
      diagnostics: fieldProfileProven ? [] : ["FIELD_PROFILE_PENDING"],
    };
  }

  private validateFinSuggestionRequest(request: FinTagSuggestionRequest): void {
    const populatedRoles = Object.entries(request.roles).filter(([, value]) =>
      Boolean(value?.trim()),
    );
    const bicPattern = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/;
    if (
      populatedRoles.some(([, value]) => !bicPattern.test(value.toUpperCase()))
    )
      this.reject("INVALID_REGISTERED_FI_BIC_FORMAT", "SWIFT_FIELD_VALIDATION");

    if (request.messageType === "MT400") this.validateMt400Roles(request);
    if (request.messageType === "MT700") this.validateMt700Roles(request);
    if (["MT742", "MT765"].includes(request.messageType))
      this.validateClaimRoles(request);
    if (request.messageType === "MT760") this.validateMt760Roles(request);
    this.validateSyntheticDemoRoles(request);
  }

  private role(request: FinTagSuggestionRequest, name: string): string {
    return (request.roles[name] ?? "").trim().toUpperCase();
  }

  private validateMt400Roles(request: FinTagSuggestionRequest): void {
    const senderCorrespondent = this.role(request, "SENDERS_CORRESPONDENT");
    const receiverCorrespondent = this.role(request, "RECEIVERS_CORRESPONDENT");
    const accountWith = this.role(request, "ACCOUNT_WITH_INSTITUTION");
    const beneficiaryBank = this.role(request, "BENEFICIARY_BANK");
    this.validateMt400RouteContext(
      request,
      senderCorrespondent,
      receiverCorrespondent,
      accountWith,
    );
    if (senderCorrespondent)
      this.requireRoleEvidence(request, "SENDERS_CORRESPONDENT", {
        ownerSide: "SENDER_SIDE",
        sourceTypes: [
          "SENDER_SETTLEMENT_SSI",
          "SENDER_ACCOUNT_RELATIONSHIP",
          "NOSTRO_MASTER",
          "TRANSACTION_APPROVED_ROUTE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
    if (receiverCorrespondent)
      this.requireRoleEvidence(request, "RECEIVERS_CORRESPONDENT", {
        ownerSide: "RECEIVER_SIDE",
        sourceTypes: [
          "COUNTERPARTY_AUTHENTICATED_SSI",
          "VERIFIED_COUNTERPARTY_ACCOUNT_RELATIONSHIP",
          "AUTHENTICATED_TRANSACTION_INSTRUCTION",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
    if (accountWith)
      this.requireRoleEvidence(request, "ACCOUNT_WITH_INSTITUTION", {
        ownerSide: "RECEIVER_SIDE",
        sourceTypes: [
          "COUNTERPARTY_AUTHENTICATED_SSI",
          "VERIFIED_COUNTERPARTY_ACCOUNT_RELATIONSHIP",
          "AUTHENTICATED_TRANSACTION_INSTRUCTION",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
    if (receiverCorrespondent && receiverCorrespondent === accountWith)
      this.reject(
        "ACCOUNT_WITH_EQUALS_RECEIVERS_CORRESPONDENT",
        "SWIFT_USAGE_SEMANTIC",
      );
    if (beneficiaryBank)
      this.requireRoleEvidence(request, "BENEFICIARY_BANK", {
        ownerSide: "TRANSACTION_PARTY",
        sourceTypes: [
          "AUTHENTICATED_TRANSACTION_INSTRUCTION",
          "PARTY_MASTER_ROLE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
  }

  private validateMt400RouteContext(
    request: FinTagSuggestionRequest,
    senderCorrespondent: string,
    receiverCorrespondent: string,
    accountWith: string,
  ): void {
    const relationship = request.controls?.accountRelationship;
    if (accountWith && (!senderCorrespondent || !receiverCorrespondent))
      this.reject("MT400_C11_57A_REQUIRES_53A_AND_54A", "SWIFT_NVR");
    if (
      (!relationship || relationship === "UNVERIFIED") &&
      Boolean(senderCorrespondent || receiverCorrespondent || accountWith)
    )
      this.reject("NO_VERIFIED_RECEIVING_ROUTE", "EVIDENCE_MISSING");
    if (relationship !== "DIRECT_ACCOUNT") return;
    if (!request.controls?.directRelationshipEvidenceId)
      this.reject(
        "MT400_DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED",
        "EVIDENCE_MISSING",
      );
    if (senderCorrespondent || receiverCorrespondent || accountWith)
      this.reject(
        "MT400_DIRECT_ACCOUNT_REQUIRES_53A_54A_57A_OMITTED",
        "LOCAL_POLICY",
      );
  }

  private validateMt700Roles(request: FinTagSuggestionRequest): void {
    if (this.role(request, "REIMBURSING_BANK"))
      this.requireRoleEvidence(request, "REIMBURSING_BANK", {
        ownerSide: "SENDER_SIDE",
        sourceTypes: [
          "APPROVED_REIMBURSEMENT_PROFILE",
          "TRANSACTION_APPROVED_ROUTE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
    if (this.role(request, "ADVISE_THROUGH_BANK"))
      this.requireRoleEvidence(request, "ADVISE_THROUGH_BANK", {
        ownerSide: "TRANSACTION_PARTY",
        sourceTypes: [
          "TRANSACTION_ADVISING_CHAIN",
          "PARTY_MASTER_ROLE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
    if (this.role(request, "REQUESTED_CONFIRMATION_PARTY"))
      this.requireRoleEvidence(request, "REQUESTED_CONFIRMATION_PARTY", {
        ownerSide: "TRANSACTION_PARTY",
        sourceTypes: [
          "CONFIRMATION_MANDATE",
          "AUTHENTICATED_TRANSACTION_INSTRUCTION",
          "PARTY_MASTER_ROLE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
  }

  private validateClaimRoles(request: FinTagSuggestionRequest): void {
    if (this.role(request, "ACCOUNT_WITH_INSTITUTION"))
      this.requireRoleEvidence(request, "ACCOUNT_WITH_INSTITUTION", {
        ownerSide: "SENDER_SIDE",
        sourceTypes: [
          "APPROVED_CLAIM_RECEIVING_ROUTE",
          "TRANSACTION_APPROVED_ROUTE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
    if (this.role(request, "BENEFICIARY_BANK"))
      this.requireRoleEvidence(request, "BENEFICIARY_BANK", {
        ownerSide: "TRANSACTION_PARTY",
        sourceTypes: [
          "AUTHENTICATED_TRANSACTION_INSTRUCTION",
          "PARTY_MASTER_ROLE",
          "MANUAL_APPROVED_OVERRIDE",
        ],
      });
  }

  private validateMt760Roles(request: FinTagSuggestionRequest): void {
    const controls = request.controls;
    if (controls?.sequence !== "B")
      this.reject("MT760_SEQUENCE_B_CONTEXT_REQUIRED", "EVIDENCE_MISSING");
    const advisingBank = this.role(request, "ADVISING_BANK");
    const adviseThroughBank = this.role(request, "ADVISE_THROUGH_BANK");
    const confirmationParty = this.role(
      request,
      "REQUESTED_CONFIRMATION_PARTY",
    );
    this.validateMt760ControlFields(controls);
    this.validateMt760RoleRelationships(
      controls,
      advisingBank,
      adviseThroughBank,
      confirmationParty,
    );
    this.requireMt760RoleEvidence(request);
  }

  private validateMt760ControlFields(
    controls: NonNullable<FinTagSuggestionRequest["controls"]>,
  ): void {
    if (!controls.purpose || !controls.formOfUndertaking)
      this.reject("MT760_22A_22D_CONTEXT_REQUIRED", "EVIDENCE_MISSING");
    if (
      controls.purpose === "ISSU" &&
      controls.formOfUndertaking === "STBY" &&
      !controls.confirmationInstructions
    )
      this.reject("MT760_C5_STBY_ISSU_REQUIRES_49", "SWIFT_NVR");
    if (controls.purpose === "ISSU" && controls.field50Present !== true)
      this.reject("MT760_C17_FIELD_50_REQUIRED", "SWIFT_NVR");
    if (
      controls.formOfUndertaking === "DGAR" &&
      controls.confirmationInstructions
    )
      this.reject("MT760_C5_DGAR_PROHIBITS_49", "SWIFT_NVR");
  }

  private validateMt760RoleRelationships(
    controls: NonNullable<FinTagSuggestionRequest["controls"]>,
    advisingBank: string,
    adviseThroughBank: string,
    confirmationParty: string,
  ): void {
    if (adviseThroughBank && !advisingBank)
      this.reject("MT760_C81_57A_REQUIRES_56A", "SWIFT_NVR");
    if (controls.confirmationInstructions === "WITHOUT" && confirmationParty)
      this.reject("MT760_C20_WITHOUT_PROHIBITS_58A", "SWIFT_NVR");
    if (
      ["MAY_ADD", "CONFIRM"].includes(
        controls.confirmationInstructions ?? "",
      ) &&
      !confirmationParty
    )
      this.reject("MT760_C20_CONFIRMATION_REQUIRES_58A", "SWIFT_NVR");
    if (!controls.confirmationInstructions && confirmationParty)
      this.reject("MT760_C20_58A_REQUIRES_49", "SWIFT_NVR");
    if (advisingBank && advisingBank === adviseThroughBank)
      this.reject("ADVISE_THROUGH_EQUALS_ADVISING_BANK", "LOCAL_POLICY");
  }

  private requireMt760RoleEvidence(request: FinTagSuggestionRequest): void {
    for (const name of [
      "ADVISING_BANK",
      "ADVISE_THROUGH_BANK",
      "REQUESTED_CONFIRMATION_PARTY",
    ].filter((name) => Boolean(this.role(request, name))))
      this.requireRoleEvidence(request, name, {
        ownerSide: "TRANSACTION_PARTY",
        sourceTypes:
          name === "REQUESTED_CONFIRMATION_PARTY"
            ? [
                "CONFIRMATION_MANDATE",
                "AUTHENTICATED_TRANSACTION_INSTRUCTION",
                "PARTY_MASTER_ROLE",
                "MANUAL_APPROVED_OVERRIDE",
              ]
            : [
                "TRANSACTION_ADVISING_CHAIN",
                "APPROVED_ADVISORY_ROUTING_PROFILE",
                "PARTY_MASTER_ROLE",
                "MANUAL_APPROVED_OVERRIDE",
              ],
      });
  }

  private validateSyntheticDemoRoles(request: FinTagSuggestionRequest): void {
    const expectedOwnerByRole: Readonly<Record<string, OwnerSide>> = {
      SENDERS_CORRESPONDENT: "SENDER_SIDE",
      RECEIVERS_CORRESPONDENT: "RECEIVER_SIDE",
      REIMBURSING_BANK: "SENDER_SIDE",
      ACCOUNT_WITH_INSTITUTION:
        request.messageType === "MT400" ? "RECEIVER_SIDE" : "SENDER_SIDE",
      BENEFICIARY_BANK: "TRANSACTION_PARTY",
      ADVISING_BANK: "TRANSACTION_PARTY",
      ADVISE_THROUGH_BANK: "TRANSACTION_PARTY",
      REQUESTED_CONFIRMATION_PARTY: "TRANSACTION_PARTY",
      NEGOTIATING_BANK: "TRANSACTION_PARTY",
      INTERMEDIARY_INSTITUTION: "TRANSACTION_PARTY",
    };
    for (const [role, rawValue] of Object.entries(request.roles)) {
      if (!rawValue?.trim()) continue;
      const evidence = request.roleEvidence?.[role];
      if (evidence?.sourceType !== "SYNTHETIC_DEMO") continue;
      const expectedOwner = expectedOwnerByRole[role];
      if (!expectedOwner || evidence.ownerSide !== expectedOwner)
        this.reject(`${role}_DEMO_OWNER_INVALID`, "EVIDENCE_MISSING");
      this.requireCompleteSyntheticDemoEvidence(
        role,
        evidence,
        request.valueDate,
      );
    }
  }

  private requireCompleteSyntheticDemoEvidence(
    role: string,
    evidence: RoleEvidence,
    valueDate: string,
  ): void {
    if (incompleteDemoEvidence(evidence))
      this.reject(`${role}_DEMO_EVIDENCE_INVALID`, "EVIDENCE_MISSING");
    if (evidenceOutsideEffectiveRange(evidence, valueDate))
      this.reject(`${role}_DEMO_EVIDENCE_NOT_EFFECTIVE`, "EVIDENCE_MISSING");
  }

  private requireRoleEvidence(
    request: FinTagSuggestionRequest,
    role: string,
    contract: { ownerSide: OwnerSide; sourceTypes: EvidenceSource[] },
  ): void {
    const evidence = request.roleEvidence?.[role];
    if (!this.evidenceMatchesContract(evidence, contract))
      this.reject(`${role}_OWNER_OR_SOURCE_INVALID`, "EVIDENCE_MISSING");

    if (evidence.sourceType === "SYNTHETIC_DEMO") {
      this.requireCompleteSyntheticDemoEvidence(
        role,
        evidence,
        request.valueDate,
      );
      return;
    }

    if (transactionEvidence(evidence)) {
      if (incompleteTransactionEvidence(evidence))
        this.reject(`${role}_TRANSACTION_EVIDENCE_INVALID`, "EVIDENCE_MISSING");
      return;
    }

    if (incompleteMasterEvidence(evidence))
      this.reject(`${role}_MASTER_EVIDENCE_INVALID`, "EVIDENCE_MISSING");
    if (evidenceOutsideEffectiveRange(evidence, request.valueDate))
      this.reject(`${role}_EVIDENCE_NOT_EFFECTIVE`, "EVIDENCE_MISSING");
  }

  private evidenceMatchesContract(
    evidence: RoleEvidence | undefined,
    contract: { ownerSide: OwnerSide; sourceTypes: EvidenceSource[] },
  ): evidence is RoleEvidence {
    return Boolean(
      evidence &&
      evidence.ownerSide === contract.ownerSide &&
      (contract.sourceTypes.includes(evidence.sourceType) ||
        evidence.sourceType === "SYNTHETIC_DEMO"),
    );
  }

  private pendingCandidateFields(
    messageType: string,
  ): Array<{ tag: string; semanticRole: string }> | null {
    const catalogue: Record<
      string,
      Array<{ tag: string; semanticRole: string }>
    > = {
      MT705: [{ tag: "57A", semanticRole: "ADVISE_THROUGH_BANK" }],
      MT707: [
        { tag: "53A", semanticRole: "REIMBURSING_BANK" },
        { tag: "57A", semanticRole: "ADVISE_THROUGH_BANK" },
        { tag: "58A", semanticRole: "REQUESTED_CONFIRMATION_PARTY" },
      ],
      MT710: [
        { tag: "53A", semanticRole: "REIMBURSING_BANK" },
        { tag: "57A", semanticRole: "ADVISE_THROUGH_BANK" },
        { tag: "58A", semanticRole: "REQUESTED_CONFIRMATION_PARTY" },
      ],
      MT720: [
        { tag: "57A", semanticRole: "ADVISE_THROUGH_BANK" },
        { tag: "58A", semanticRole: "REQUESTED_CONFIRMATION_PARTY" },
      ],
      MT730: [{ tag: "57A", semanticRole: "ACCOUNT_WITH_BANK" }],
      MT734: [{ tag: "57A", semanticRole: "ACCOUNT_WITH_BANK" }],
      MT740: [{ tag: "58A", semanticRole: "NEGOTIATING_BANK" }],
      MT750: [{ tag: "57A", semanticRole: "ACCOUNT_WITH_BANK" }],
      MT752: [
        { tag: "53A", semanticRole: "SENDERS_CORRESPONDENT" },
        { tag: "54A", semanticRole: "RECEIVERS_CORRESPONDENT" },
      ],
      MT754: [
        { tag: "53A", semanticRole: "REIMBURSING_BANK" },
        { tag: "57A", semanticRole: "ACCOUNT_WITH_BANK" },
        { tag: "58A", semanticRole: "BENEFICIARY_BANK" },
      ],
      MT756: [
        { tag: "53A", semanticRole: "SENDERS_CORRESPONDENT" },
        { tag: "54A", semanticRole: "RECEIVERS_CORRESPONDENT" },
      ],
      MT768: [{ tag: "57A", semanticRole: "ACCOUNT_WITH_BANK" }],
      MT769: [{ tag: "57A", semanticRole: "ACCOUNT_WITH_BANK" }],
    };
    return catalogue[messageType] ?? null;
  }
}
