import {
  BadRequestException,
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  MappingCatalogueService,
  type Mapping,
} from "./mapping-catalogue.service";
import { assertIsoValueDate } from "./value-date";
import { FinFieldResolutionPolicy } from "./fin-field-resolution.policy";

export type FinResolutionMode = "TREASURY" | "TRADE_FINANCE";
export interface FinFieldResolutionRequest {
  service: "FIN";
  resolutionMode: FinResolutionMode;
  standardsRelease: string;
  messageType: string;
  direction: "OUTGOING";
  businessFunction: string;
  sequence?: string;
  settlementLeg?: string;
  fieldOptions?: Record<string, string>;
  transactionReference: string;
  currency: string;
  receiverBic: string;
  bookingEntity?: string;
  valueDate: string;
  sourceSsiId?: string;
  roles: Record<string, string>;
  roleSources?: Record<string, string>;
  roleEvidence?: Record<
    string,
    {
      ownerSide?: "SENDER_SIDE" | "RECEIVER_SIDE" | "TRANSACTION_PARTY";
      sourceType?: string;
      sourceRecordId?: string;
      version?: string;
      status?: string;
      approvalStatus?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
      /**
       * Identity of the fully-qualified node in the canonical settlement route.
       * Callers must include branch/account/servicer/currency/clearing context in
       * this identity. A BIC by itself is not a sufficient node identity.
       */
      canonicalRouteNodeId?: string;
    }
  >;
  controls?: {
    accountRelationship?:
      "UNVERIFIED" | "DIRECT_ACCOUNT" | "AUTHENTICATED_RECEIVING_ROUTE";
    directRelationshipEvidenceId?: string;
    routeGraph?: {
      routeComplete: boolean;
      evidenceValid: boolean;
      additionalAccountWithRequired: boolean;
    };
  };
}

export interface ResolvedFinField {
  standardsRelease: string;
  messageType: string;
  sequence: string;
  settlementLeg: string;
  tag: string;
  option: string;
  officialFieldName: string;
  officialRole: string;
  businessFunction: string;
  scopeStatus: "SSI_SUPPORTED" | "OUT_OF_SSI_SCOPE";
  resolutionStatus: "RESOLVED" | "NOT_REQUIRED" | "NO_ELIGIBLE_SSI" | "N_A";
  reasonCode: string;
  resolvedValue: string | null;
  nvrRefs: readonly string[];
  provenance: Record<string, unknown>;
}

type ResolvedFinFieldBase = Omit<
  ResolvedFinField,
  "scopeStatus" | "resolutionStatus" | "reasonCode" | "resolvedValue"
>;

export interface FinResolutionCatalogueItem {
  messageType: string;
  resolutionMode: FinResolutionMode;
  profileSlots: readonly string[];
  ssiResolvableTags: readonly string[];
}
type FieldRoleEvidence = NonNullable<
  NonNullable<FinFieldResolutionRequest["roleEvidence"]>[string]
>;

@Injectable()
export class FinFieldResolutionService {
  constructor(
    private readonly catalogues: MappingCatalogueService,
    private readonly policy: FinFieldResolutionPolicy,
  ) {}

  catalogueIndex(standardsRelease: string): Record<string, unknown> {
    const catalogue = this.catalogues.get(standardsRelease);
    const grouped = new Map<
      string,
      { profileSlots: Set<string>; ssiResolvableTags: Set<string> }
    >();
    for (const mapping of catalogue.mappings) {
      if (
        mapping.direction !== "OUTGOING" ||
        mapping.evidenceStatus !== "FIELD_PROFILE_PROVEN" ||
        !/^MT[347]/.test(mapping.messageType) ||
        !this.isFin5x(mapping)
      )
        continue;
      const item = grouped.get(mapping.messageType) ?? {
        profileSlots: new Set<string>(),
        ssiResolvableTags: new Set<string>(),
      };
      const tagOption = `${mapping.tag ?? this.tagOf(mapping)}${mapping.option ?? ""}`;
      item.profileSlots.add(tagOption);
      if (mapping.scopeStatus === "SSI_SUPPORTED" && mapping.reusableCandidate)
        item.ssiResolvableTags.add(tagOption);
      grouped.set(mapping.messageType, item);
    }
    const items = [...grouped.entries()]
      .filter(([, item]) => item.ssiResolvableTags.size > 0)
      .map<FinResolutionCatalogueItem>(([messageType, item]) => ({
        messageType,
        resolutionMode: messageType.startsWith("MT3")
          ? "TREASURY"
          : "TRADE_FINANCE",
        profileSlots: [...item.profileSlots].sort((left, right) =>
          left.localeCompare(right),
        ),
        ssiResolvableTags: [...item.ssiResolvableTags].sort((left, right) =>
          left.localeCompare(right),
        ),
      }))
      .sort((left, right) => left.messageType.localeCompare(right.messageType));
    return {
      standardsRelease,
      catalogueVersion: catalogue.catalogueVersion,
      sourceArtifactId: catalogue.sourceArtifactId,
      sourceArtifactHash: catalogue.sourceArtifactHash,
      items,
    };
  }

  resolve(request: FinFieldResolutionRequest): Record<string, unknown> {
    this.validateContext(request);
    const catalogue = this.catalogues.get(request.standardsRelease);
    const { messageProfile, selected } = this.selectProfile(
      request,
      catalogue.mappings,
    );
    const resolvedFields = this.resolveProfileFields(
      request,
      messageProfile,
      selected,
      catalogue,
    );
    this.assertRequestedFields(request, resolvedFields);
    this.assertMandatoryFields(selected, resolvedFields);
    return this.response(request, selected, resolvedFields, catalogue);
  }

  private selectProfile(
    request: FinFieldResolutionRequest,
    mappings: readonly Readonly<Mapping>[],
  ): {
    messageProfile: Readonly<Mapping>[];
    selected: Readonly<Mapping>[];
  } {
    if (!this.isSsiResolutionSupported(mappings, request.messageType))
      throw new BadRequestException({
        code: "NOT_SUPPORTED",
        messageType: request.messageType,
      });
    const messageProfile = mappings.filter(
      (mapping) =>
        mapping.standardsRelease === request.standardsRelease &&
        mapping.messageType === request.messageType &&
        mapping.direction === request.direction &&
        mapping.businessFunction === request.businessFunction &&
        mapping.evidenceStatus === "FIELD_PROFILE_PROVEN" &&
        this.isFin5x(mapping),
    );
    let profile = messageProfile;
    if (request.sequence)
      profile = profile.filter(
        (mapping) => mapping.sequence === request.sequence,
      );
    if (request.settlementLeg)
      profile = profile.filter(
        (mapping) =>
          (mapping.settlementLeg ?? mapping.sequence) === request.settlementLeg,
      );
    const legs = new Set(
      profile.map((mapping) => `${mapping.sequence}|${mapping.settlementLeg}`),
    );
    if (!request.sequence && !request.settlementLeg && legs.size > 1)
      throw new BadRequestException({
        code: "EXACT_FIN_PROFILE_CONTEXT_REQUIRED",
        availableProfiles: [...legs],
      });
    if (!profile.length)
      throw new BadRequestException({ code: "NO_EXACT_FIN_FIELD_PROFILE" });

    const unavailableRequestedOption = Object.entries(
      request.fieldOptions ?? {},
    ).find(
      ([tag, option]) =>
        !profile.some(
          (mapping) =>
            (mapping.tag ?? this.tagOf(mapping)) === tag &&
            mapping.option === option,
        ),
    );
    if (unavailableRequestedOption)
      throw new UnprocessableEntityException({
        code: "OPTION_CONSTRAINT_VIOLATION",
        reasonCode: "NO_EXACT_FIN_FIELD_OPTION_PROFILE",
        tag: unavailableRequestedOption[0],
        option: unavailableRequestedOption[1],
        payloadGenerated: false,
      });

    const selected = profile.filter(
      (mapping) =>
        mapping.option ===
        (request.fieldOptions?.[mapping.tag ?? this.tagOf(mapping)] ?? "A"),
    );
    if (!selected.length)
      throw new UnprocessableEntityException({
        code: "OPTION_CONSTRAINT_VIOLATION",
        reasonCode: "NO_EXACT_FIN_FIELD_OPTION_PROFILE",
        payloadGenerated: false,
      });
    return { messageProfile, selected };
  }

  private resolveProfileFields(
    request: FinFieldResolutionRequest,
    messageProfile: readonly Readonly<Mapping>[],
    selected: readonly Readonly<Mapping>[],
    catalogue: {
      catalogueVersion: string;
      sourceArtifactId: string;
      sourceArtifactHash: string;
    },
  ): ResolvedFinField[] {
    return this.policy
      .normalizeCanonicalRoute(
        request,
        selected,
        selected.map((mapping) =>
          this.resolveField(request, mapping, catalogue),
        ),
      )
      .concat(
        this.policy.profileExcludedFields(
          request,
          messageProfile,
          selected,
          catalogue,
        ),
      )
      .sort((left, right) => Number(left.tag) - Number(right.tag));
  }

  private assertMandatoryFields(
    selected: readonly Readonly<Mapping>[],
    resolvedFields: readonly ResolvedFinField[],
  ): void {
    const unresolvedMandatory = resolvedFields.filter((field) => {
      const mapping = selected.find(
        (candidate) =>
          (candidate.tag ?? this.tagOf(candidate)) === field.tag &&
          candidate.option === field.option,
      );
      return (
        mapping?.presence === "MANDATORY" &&
        field.resolutionStatus !== "RESOLVED"
      );
    });
    if (unresolvedMandatory.length)
      this.profileIncomplete(
        unresolvedMandatory,
        "MANDATORY_FIN_ROLE_UNAVAILABLE",
      );
  }

  private assertRequestedFields(
    request: FinFieldResolutionRequest,
    resolvedFields: readonly ResolvedFinField[],
  ): void {
    const unresolvedRequested = resolvedFields.filter(
      (field) =>
        request.fieldOptions?.[field.tag] === field.option &&
        field.resolutionStatus !== "RESOLVED",
    );
    if (unresolvedRequested.length)
      this.profileIncomplete(
        unresolvedRequested,
        "REQUESTED_FIN_OPTION_SOURCE_UNAVAILABLE",
      );
  }

  private profileIncomplete(
    fields: readonly ResolvedFinField[],
    reasonCode: string,
  ): never {
    const development = ["development", "demo"].includes(
      (process.env["SSI_RUNTIME_ENV"] ?? "development").toLowerCase(),
    );
    throw new HttpException(
      {
        code: "PROFILE_INCOMPLETE",
        reasonCode,
        payloadGenerated: false,
        fields: fields.map((field) => ({
          sequence: field.sequence,
          tag: field.tag,
          option: field.option,
          reasonCode: field.reasonCode,
        })),
      },
      development ? 409 : 500,
    );
  }

  private response(
    request: FinFieldResolutionRequest,
    selected: readonly Readonly<Mapping>[],
    resolvedFields: readonly ResolvedFinField[],
    catalogue: {
      catalogueVersion: string;
      sourceArtifactId: string;
      sourceArtifactHash: string;
    },
  ): Record<string, unknown> {
    return {
      useCase:
        request.resolutionMode === "TREASURY"
          ? "TREASURY_SSI_RESOLUTION"
          : "TRADE_FINANCE_SSI_RESOLUTION",
      usage: "REFERENCE_ONLY",
      paymentExecutable: false,
      confirmationSupported: false,
      messageContext: {
        standardsRelease: request.standardsRelease,
        messageType: request.messageType,
        direction: request.direction,
        businessFunction: request.businessFunction,
        sequence: request.sequence ?? selected[0]?.sequence,
        settlementLeg: request.settlementLeg ?? selected[0]?.settlementLeg,
      },
      catalogue: {
        catalogueVersion: catalogue.catalogueVersion,
        sourceArtifactId: catalogue.sourceArtifactId,
        sourceArtifactHash: catalogue.sourceArtifactHash,
      },
      resolvedFields,
      boundary:
        "SSI only resolves settlement-related fields that can be determined from eligible SSI data. It does not own Trade Finance rules, full SWIFT message validation, or payment processing.",
    };
  }

  private resolveField(
    request: FinFieldResolutionRequest,
    mapping: Readonly<Mapping>,
    catalogue: {
      catalogueVersion: string;
      sourceArtifactId: string;
      sourceArtifactHash: string;
    },
  ): ResolvedFinField {
    const tag = mapping.tag ?? this.tagOf(mapping);
    const base = this.fieldBase(request, mapping, catalogue, tag);
    const transactionContext = this.transactionContextField(
      request,
      mapping,
      base,
    );
    if (transactionContext) return transactionContext;
    const outOfScope = this.outOfScopeField(mapping, base);
    if (outOfScope) return outOfScope;
    const directAccount = this.directAccountField(request, tag, base);
    if (directAccount) return directAccount;
    const routeComplete = this.routeCompleteField(request, tag, base);
    if (routeComplete) return routeComplete;
    const value = request.roles[mapping.canonicalRole]?.trim();
    const evidence = request.roleEvidence?.[mapping.canonicalRole];
    if (!value && mapping.presence === "OPTIONAL")
      return this.notRequiredField(base, "OPTIONAL_FIELD_OMITTED");
    if (!value) return this.noEligibleField(base, true);
    const evidenceValid = this.evidenceIsValid(
      request,
      evidence,
      Boolean(
        request.sourceSsiId && request.roleSources?.[mapping.canonicalRole],
      ),
    );
    if (!evidenceValid) return this.noEligibleField(base, evidenceValid);
    return this.resolvedField(base, request, mapping, value, evidence);
  }

  private fieldBase(
    request: FinFieldResolutionRequest,
    mapping: Readonly<Mapping>,
    catalogue: {
      catalogueVersion: string;
      sourceArtifactId: string;
      sourceArtifactHash: string;
    },
    tag: string,
  ): ResolvedFinFieldBase {
    return {
      standardsRelease: request.standardsRelease,
      messageType: request.messageType,
      sequence: mapping.sequence!,
      settlementLeg: mapping.settlementLeg ?? mapping.sequence ?? "MESSAGE",
      tag,
      option: mapping.option!,
      officialFieldName: mapping.officialFieldName!,
      officialRole: mapping.officialRole ?? mapping.canonicalRole,
      businessFunction: mapping.businessFunction,
      nvrRefs: mapping.nvrRefs ?? [],
      provenance: {
        catalogueVersion: catalogue.catalogueVersion,
        sourceArtifactId: catalogue.sourceArtifactId,
        sourceArtifactHash: catalogue.sourceArtifactHash,
        fieldProfileArtifactId: mapping.evidenceArtifactId,
        fieldProfileEvidencePages: mapping.evidencePages,
      },
    };
  }

  private directAccountField(
    request: FinFieldResolutionRequest,
    tag: string,
    base: ResolvedFinFieldBase,
  ): ResolvedFinField | undefined {
    if (
      request.controls?.accountRelationship !== "DIRECT_ACCOUNT" ||
      !["53", "54", "57"].includes(tag)
    )
      return undefined;
    const evidenceId = request.controls.directRelationshipEvidenceId?.trim();
    if (!evidenceId)
      throw new BadRequestException({
        code: "DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED",
      });
    return this.notRequiredField(base, "DIRECT_ACCOUNT_RELATIONSHIP", {
      sourceRecordId: request.controls.directRelationshipEvidenceId,
      directRelationshipEvidenceId:
        request.controls.directRelationshipEvidenceId,
    });
  }

  private routeCompleteField(
    request: FinFieldResolutionRequest,
    tag: string,
    base: ResolvedFinFieldBase,
  ): ResolvedFinField | undefined {
    if (
      tag !== "57" ||
      !request.controls?.routeGraph?.routeComplete ||
      request.controls.routeGraph.additionalAccountWithRequired
    )
      return undefined;
    return this.notRequiredField(base, "ROUTE_COMPLETE");
  }

  private evidenceIsValid(
    request: FinFieldResolutionRequest,
    evidence: FieldRoleEvidence | undefined,
    legacyIdentity = false,
  ): boolean {
    return (
      (evidence !== undefined || legacyIdentity) &&
      request.controls?.routeGraph?.evidenceValid !== false &&
      evidence?.status !== "INACTIVE" &&
      evidence?.approvalStatus !== "REJECTED" &&
      (!evidence?.effectiveFrom ||
        evidence.effectiveFrom <= request.valueDate) &&
      (!evidence?.effectiveTo || evidence.effectiveTo >= request.valueDate)
    );
  }

  private noEligibleField(
    base: ResolvedFinFieldBase,
    evidenceValid: boolean,
  ): ResolvedFinField {
    return {
      ...base,
      scopeStatus: "SSI_SUPPORTED",
      resolutionStatus: "NO_ELIGIBLE_SSI",
      reasonCode: evidenceValid ? "MISSING_SSI" : "CONFLICTING_SSI",
      resolvedValue: null,
    };
  }

  private resolvedField(
    base: ResolvedFinFieldBase,
    request: FinFieldResolutionRequest,
    mapping: Readonly<Mapping>,
    value: string,
    evidence: FieldRoleEvidence | undefined,
  ): ResolvedFinField {
    const ownerSide = evidence?.ownerSide;
    const source =
      request.roleSources?.[mapping.canonicalRole] ?? evidence?.sourceType;
    const sourceRecordId = evidence?.sourceRecordId ?? request.sourceSsiId;
    const version = evidence?.version;
    const canonicalRouteNodeId = evidence?.canonicalRouteNodeId;
    return {
      ...base,
      scopeStatus: "SSI_SUPPORTED",
      resolutionStatus: "RESOLVED",
      reasonCode: this.resolvedReasonCode(ownerSide),
      resolvedValue: value,
      provenance: {
        ...base.provenance,
        ...(source ? { source } : {}),
        ...(sourceRecordId ? { sourceRecordId } : {}),
        ...(ownerSide ? { ownerSide } : {}),
        ...(version ? { version } : {}),
        ...(canonicalRouteNodeId ? { canonicalRouteNodeId } : {}),
      },
    };
  }

  private resolvedReasonCode(
    ownerSide: FieldRoleEvidence["ownerSide"] | undefined,
  ): string {
    if (ownerSide === "SENDER_SIDE") return "RESOLVED_FROM_OWN_SSI";
    if (ownerSide === "RECEIVER_SIDE") {
      return "RESOLVED_FROM_COUNTERPARTY_SSI";
    }
    return "EXACT_ELIGIBLE_SSI";
  }

  private outOfScopeField(
    mapping: Readonly<Mapping>,
    base: ResolvedFinFieldBase,
  ): ResolvedFinField | undefined {
    return mapping.scopeStatus === "OUT_OF_SSI_SCOPE"
      ? {
          ...base,
          scopeStatus: "OUT_OF_SSI_SCOPE",
          resolutionStatus: "N_A",
          reasonCode: this.outOfScopeReason(mapping),
          resolvedValue: null,
        }
      : undefined;
  }

  private transactionContextField(
    request: FinFieldResolutionRequest,
    mapping: Readonly<Mapping>,
    base: ResolvedFinFieldBase,
  ): ResolvedFinField | undefined {
    if (mapping.scopeStatus !== "OUT_OF_SSI_SCOPE") return undefined;
    const value = request.roles[mapping.canonicalRole]?.trim();
    const evidence = request.roleEvidence?.[mapping.canonicalRole];
    if (
      !value ||
      evidence?.ownerSide !== "TRANSACTION_PARTY" ||
      evidence.sourceType !== "IMMUTABLE_UPSTREAM_INSTRUCTION" ||
      !this.evidenceIsValid(request, evidence)
    )
      return undefined;
    return {
      ...base,
      scopeStatus: "OUT_OF_SSI_SCOPE",
      resolutionStatus: "RESOLVED",
      reasonCode: "PRESERVED_FROM_TRANSACTION_CONTEXT",
      resolvedValue: value,
      provenance: {
        ...base.provenance,
        source: evidence.sourceType,
        sourceRecordId: evidence.sourceRecordId,
        ownerSide: evidence.ownerSide,
        ...(evidence.version ? { version: evidence.version } : {}),
        ...(evidence.canonicalRouteNodeId
          ? { canonicalRouteNodeId: evidence.canonicalRouteNodeId }
          : {}),
      },
    };
  }

  private notRequiredField(
    base: ResolvedFinFieldBase,
    reasonCode: string,
    provenance: Record<string, unknown> = {},
  ): ResolvedFinField {
    return {
      ...base,
      scopeStatus: "SSI_SUPPORTED",
      resolutionStatus: "NOT_REQUIRED",
      reasonCode,
      resolvedValue: null,
      provenance: {
        ...base.provenance,
        source: "ROUTE_RESOLVER",
        ownerSide: "CANONICAL_ROUTE",
        ...provenance,
      },
    };
  }

  private validateContext(request: FinFieldResolutionRequest): void {
    if (
      request.service !== "FIN" ||
      request.direction !== "OUTGOING" ||
      request.standardsRelease !== "SR2026" ||
      !request.businessFunction ||
      !request.transactionReference ||
      !request.currency ||
      !request.receiverBic ||
      !request.valueDate
    )
      throw new BadRequestException({ code: "REFERENCE_FIN_CONTEXT_REQUIRED" });
    assertIsoValueDate(request.valueDate);
    if (
      request.messageType.startsWith("MT2") ||
      request.messageType.startsWith("pacs.")
    )
      throw new BadRequestException({
        code: "NOT_SUPPORTED",
        messageType: request.messageType,
      });
    const expectedMode = this.expectedResolutionMode(request.messageType);
    if (!expectedMode)
      throw new BadRequestException({
        code: "NOT_SUPPORTED",
        messageType: request.messageType,
      });
    if (request.resolutionMode !== expectedMode)
      throw new BadRequestException({ code: "MESSAGE_MODE_MISMATCH" });
  }

  private expectedResolutionMode(
    messageType: string,
  ): "TREASURY" | "TRADE_FINANCE" | null {
    if (messageType.startsWith("MT3")) return "TREASURY";
    if (/^MT[47]/.test(messageType)) return "TRADE_FINANCE";
    return null;
  }

  private isFin5x(mapping: Readonly<Mapping>): boolean {
    return /^5[3-8]$/.test(mapping.tag ?? this.tagOf(mapping));
  }
  private isSsiResolutionSupported(
    mappings: readonly Mapping[],
    messageType: string,
  ): boolean {
    return mappings.some(
      (mapping) =>
        mapping.messageType === messageType &&
        mapping.direction === "OUTGOING" &&
        mapping.evidenceStatus === "FIELD_PROFILE_PROVEN" &&
        mapping.scopeStatus === "SSI_SUPPORTED" &&
        mapping.reusableCandidate === true &&
        this.isFin5x(mapping),
    );
  }
  private tagOf(mapping: Readonly<Mapping>): string {
    return /(5[3-8])[A-Z]?$/.exec(mapping.path)?.[1] ?? "";
  }
  private outOfScopeReason(mapping: Readonly<Mapping>): string {
    if (mapping.canonicalRole.includes("CONFIRMATION"))
      return "CONFIRMATION_PARTY";
    if (
      mapping.canonicalRole.includes("ADVISING") ||
      mapping.canonicalRole.includes("ADVISE_THROUGH")
    )
      return "TRADE_ROUTING_ROLE";
    return "TRANSACTION_CONTEXT_PROVIDED";
  }
}
