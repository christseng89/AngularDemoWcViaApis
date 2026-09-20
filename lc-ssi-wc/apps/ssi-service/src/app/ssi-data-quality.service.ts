import { Injectable } from "@nestjs/common";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import {
  SqliteSsiRepository,
  type SsiApplicabilityRecord,
  type SsiRecord,
} from "./sqlite-ssi.repository";
import {
  resolveRuntimeEnvironment,
  type RuntimeEnvironment,
} from "./runtime-environment.policy";

export const INCORRECT_SSI_CONFIGURATION = "INCORRECT_SSI_CONFIGURATION";
export const PURPOSE_APPLICABILITY_MISMATCH =
  "PURPOSE_APPLICABILITY_MISMATCH";
export const PURPOSE_REMEDIATION =
  "REMOVE_INVALID_APPLICABILITY_OR_CREATE_PURPOSE_BUILT_ROUTE";
export const SSI_CONFIG_HTTP_STATUS_POLICY_VERSION = "SSI-CONFIG-HTTP-01";

export const incorrectSsiConfigurationStatusPolicy = (
  environment: RuntimeEnvironment = process.env,
): {
  readonly httpStatus: 409 | 500;
  readonly runtimeEnvironment: string;
  readonly statusPolicyVersion: typeof SSI_CONFIG_HTTP_STATUS_POLICY_VERSION;
} => {
  const resolved = resolveRuntimeEnvironment(environment);
  return {
    httpStatus: resolved.developmentEnabled ? 409 : 500,
    runtimeEnvironment: resolved.runtimeEnvironment,
    statusPolicyVersion: SSI_CONFIG_HTTP_STATUS_POLICY_VERSION,
  };
};

export interface SsiDataIssue {
  readonly ssiCode: string;
  readonly applicabilityId: string;
  readonly violation: typeof PURPOSE_APPLICABILITY_MISMATCH;
  readonly remediation: typeof PURPOSE_REMEDIATION;
}

interface QuarantinedApplicability extends SsiDataIssue {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
}

const GENERIC_PURPOSE = {
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
} as const;

const tokens = (value: string | undefined): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const compatible = (actual: string | undefined, expected: string): boolean =>
  actual === "ANY" || actual === expected;

const activeAt = (
  status: string,
  validFrom: string | undefined,
  validTo: string | undefined,
  valueDate: string,
): boolean => {
  const instant = Date.parse(valueDate);
  return (
    status === "ACTIVE" &&
    Number.isFinite(instant) &&
    (!validFrom || Date.parse(validFrom) <= instant) &&
    (!validTo || instant <= Date.parse(validTo))
  );
};

const isGenericApplicability = (
  applicability: SsiApplicabilityRecord,
): boolean =>
  Object.entries(GENERIC_PURPOSE).every(
    ([key, value]) =>
      applicability[key as keyof typeof GENERIC_PURPOSE] === value,
  );

const isPurposeBuiltGenericRoute = (ssi: SsiRecord): boolean =>
  ssi.route["routePurpose"] === "INTERBANK_TRANSFER" &&
  Object.entries(GENERIC_PURPOSE).every(
    ([key, value]) => ssi.route[key] === value,
  );

@Injectable()
export class SsiDataQualityService {
  constructor(private readonly repository: SqliteSsiRepository) {}

  globalIssues(): readonly SsiDataIssue[] {
    return this.scan().map(
      ({ ssiCode, applicabilityId, violation, remediation }) => ({
        ssiCode,
        applicabilityId,
        violation,
        remediation,
      }),
    );
  }

  issuesFor(request: RouteResolutionRequest): readonly SsiDataIssue[] {
    const scoped = typeof this.repository.findRequestDataQualityBindings === "function"
      ? this.repository.findRequestDataQualityBindings(request)
          .filter(({ ssi, applicability }) =>
            isGenericApplicability(applicability) &&
            !isPurposeBuiltGenericRoute(ssi),
          )
          .map(({ ssi, applicability }): QuarantinedApplicability => ({
            ssi,
            applicability,
            ssiCode: ssi.route["ssiCode"] ?? "",
            applicabilityId: applicability.id,
            violation: PURPOSE_APPLICABILITY_MISMATCH,
            remediation: PURPOSE_REMEDIATION,
          }))
      : this.scan();
    return scoped
      .filter(({ ssi, applicability }) =>
        this.affectsRequest(ssi, applicability, request),
      )
      .sort((left, right) => left.applicabilityId.localeCompare(right.applicabilityId))
      .map(({ ssiCode, applicabilityId, violation, remediation }) => ({
        ssiCode,
        applicabilityId,
        violation,
        remediation,
      }));
  }

  private scan(): readonly QuarantinedApplicability[] {
    const activeSsi = new Map(
      this.repository
        .list()
        .filter((ssi) => ssi.status === "ACTIVE")
        .map((ssi) => [ssi.id, ssi] as const),
    );
    return this.repository
      .listApplicability()
      .filter(
        (applicability) =>
          applicability.status === "ACTIVE" &&
          isGenericApplicability(applicability) &&
          activeSsi.has(applicability.ssiId) &&
          !isPurposeBuiltGenericRoute(activeSsi.get(applicability.ssiId)!),
      )
      .map((applicability): QuarantinedApplicability => {
        const ssi = activeSsi.get(applicability.ssiId)!;
        return {
          ssi,
          applicability,
          ssiCode: ssi.route["ssiCode"] ?? "",
          applicabilityId: applicability.id,
          violation: PURPOSE_APPLICABILITY_MISMATCH,
          remediation: PURPOSE_REMEDIATION,
        };
      })
      .sort((left, right) =>
        left.applicabilityId.localeCompare(right.applicabilityId),
      );
  }

  private affectsRequest(
    ssi: SsiRecord,
    applicability: SsiApplicabilityRecord,
    request: RouteResolutionRequest,
  ): boolean {
    const route = ssi.route;
    const requestedCounterparty = request.counterpartyBic ?? request.counterpartyId;
    return (
      Boolean(requestedCounterparty) &&
      (route["counterpartyBic"] ?? ssi.counterpartyId) === requestedCounterparty &&
      route["currency"] === request.currency &&
      compatible(route["bookingEntity"], request.bookingEntity) &&
      activeAt(ssi.status, route["validFrom"], route["validTo"], request.valueDate) &&
      activeAt(
        applicability.status,
        applicability.validFrom,
        applicability.validTo,
        request.valueDate,
      ) &&
      Object.entries(GENERIC_PURPOSE).every(
        ([key, value]) =>
          request[key as keyof typeof GENERIC_PURPOSE] === value &&
          applicability[key as keyof typeof GENERIC_PURPOSE] === value,
      ) &&
      tokens(route["messageTypes"]).includes(request.messageType) &&
      (!request.businessService ||
        tokens(route["businessService"]).includes(request.businessService)) &&
      (!request.sourceMessageType ||
        tokens(route["sourceMessageTypes"]).includes(request.sourceMessageType))
    );
  }
}
