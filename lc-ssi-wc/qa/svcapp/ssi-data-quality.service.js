"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsiDataQualityService = exports.incorrectSsiConfigurationStatusPolicy = exports.SSI_CONFIG_HTTP_STATUS_POLICY_VERSION = exports.PURPOSE_REMEDIATION = exports.PURPOSE_APPLICABILITY_MISMATCH = exports.INCORRECT_SSI_CONFIGURATION = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const sqlite_ssi_repository_1 = require("./sqlite-ssi.repository");
const runtime_environment_policy_1 = require("./runtime-environment.policy");
exports.INCORRECT_SSI_CONFIGURATION = "INCORRECT_SSI_CONFIGURATION";
exports.PURPOSE_APPLICABILITY_MISMATCH = "PURPOSE_APPLICABILITY_MISMATCH";
exports.PURPOSE_REMEDIATION = "REMOVE_INVALID_APPLICABILITY_OR_CREATE_PURPOSE_BUILT_ROUTE";
exports.SSI_CONFIG_HTTP_STATUS_POLICY_VERSION = "SSI-CONFIG-HTTP-01";
const incorrectSsiConfigurationStatusPolicy = (environment = process.env) => {
    const resolved = (0, runtime_environment_policy_1.resolveRuntimeEnvironment)(environment);
    return {
        httpStatus: resolved.developmentEnabled ? 409 : 500,
        runtimeEnvironment: resolved.runtimeEnvironment,
        statusPolicyVersion: exports.SSI_CONFIG_HTTP_STATUS_POLICY_VERSION,
    };
};
exports.incorrectSsiConfigurationStatusPolicy = incorrectSsiConfigurationStatusPolicy;
const GENERIC_PURPOSE = {
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction: "INTERBANK_TRANSFER",
    paymentLeg: "INTERBANK_SETTLEMENT",
    direction: "OUTBOUND",
};
const tokens = (value) => (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const compatible = (actual, expected) => actual === "ANY" || actual === expected;
const activeAt = (status, validFrom, validTo, valueDate) => {
    const instant = Date.parse(valueDate);
    return (status === "ACTIVE" &&
        Number.isFinite(instant) &&
        (!validFrom || Date.parse(validFrom) <= instant) &&
        (!validTo || instant <= Date.parse(validTo)));
};
const isGenericApplicability = (applicability) => Object.entries(GENERIC_PURPOSE).every(([key, value]) => applicability[key] === value);
const isPurposeBuiltGenericRoute = (ssi) => ssi.route["routePurpose"] === "INTERBANK_TRANSFER" &&
    Object.entries(GENERIC_PURPOSE).every(([key, value]) => ssi.route[key] === value);
let SsiDataQualityService = class SsiDataQualityService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    globalIssues() {
        return this.scan().map(({ ssiCode, applicabilityId, violation, remediation }) => ({
            ssiCode,
            applicabilityId,
            violation,
            remediation,
        }));
    }
    issuesFor(request) {
        return this.scan()
            .filter(({ ssi, applicability }) => this.affectsRequest(ssi, applicability, request))
            .map(({ ssiCode, applicabilityId, violation, remediation }) => ({
            ssiCode,
            applicabilityId,
            violation,
            remediation,
        }));
    }
    scan() {
        const activeSsi = new Map(this.repository
            .list()
            .filter((ssi) => ssi.status === "ACTIVE")
            .map((ssi) => [ssi.id, ssi]));
        return this.repository
            .listApplicability()
            .filter((applicability) => applicability.status === "ACTIVE" &&
            isGenericApplicability(applicability) &&
            activeSsi.has(applicability.ssiId) &&
            !isPurposeBuiltGenericRoute(activeSsi.get(applicability.ssiId)))
            .map((applicability) => {
            const ssi = activeSsi.get(applicability.ssiId);
            return {
                ssi,
                applicability,
                ssiCode: ssi.route["ssiCode"] ?? "",
                applicabilityId: applicability.id,
                violation: exports.PURPOSE_APPLICABILITY_MISMATCH,
                remediation: exports.PURPOSE_REMEDIATION,
            };
        })
            .sort((left, right) => left.applicabilityId.localeCompare(right.applicabilityId));
    }
    affectsRequest(ssi, applicability, request) {
        const route = ssi.route;
        const requestedCounterparty = request.counterpartyBic ?? request.counterpartyId;
        return (Boolean(requestedCounterparty) &&
            (route["counterpartyBic"] ?? ssi.counterpartyId) === requestedCounterparty &&
            route["currency"] === request.currency &&
            compatible(route["bookingEntity"], request.bookingEntity) &&
            activeAt(ssi.status, route["validFrom"], route["validTo"], request.valueDate) &&
            activeAt(applicability.status, applicability.validFrom, applicability.validTo, request.valueDate) &&
            Object.entries(GENERIC_PURPOSE).every(([key, value]) => request[key] === value &&
                applicability[key] === value) &&
            tokens(route["messageTypes"]).includes(request.messageType) &&
            (!request.businessService ||
                tokens(route["businessService"]).includes(request.businessService)) &&
            (!request.sourceMessageType ||
                tokens(route["sourceMessageTypes"]).includes(request.sourceMessageType)));
    }
};
exports.SsiDataQualityService = SsiDataQualityService;
exports.SsiDataQualityService = SsiDataQualityService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [sqlite_ssi_repository_1.SqliteSsiRepository])
], SsiDataQualityService);
//# sourceMappingURL=ssi-data-quality.service.js.map