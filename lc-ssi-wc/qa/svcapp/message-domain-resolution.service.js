"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageDomainResolutionService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const bank_service_directory_1 = require("./bank-service-directory");
const nostro_application_service_1 = require("./nostro/nostro-application.service");
const node_crypto_1 = require("node:crypto");
const database_snapshot_identity_service_1 = require("./database-snapshot-identity.service");
const result = (status, values, mt = {}) => ({
    mx: { httpStatus: status, redirectDomain: null, ...values },
    mt: { redirectDomain: null, ...mt },
});
const code = (status, value, redirectDomain, detail = "", mt = {}) => result(status, { code: value, redirectDomain, payloadGenerated: false, detail }, mt);
const string = (context, key) => typeof context[key] === "string" ? context[key].trim() : "";
const number = (context, key) => Number(context[key]);
let MessageDomainResolutionService = class MessageDomainResolutionService {
    banks;
    nostro;
    snapshotIdentity;
    constructor(banks = new bank_service_directory_1.BankServiceDirectory(), nostro, snapshotIdentity = new database_snapshot_identity_service_1.DatabaseSnapshotIdentityService()) {
        this.banks = banks;
        this.nostro = nostro;
        this.snapshotIdentity = snapshotIdentity;
    }
    resolve(domain, context) {
        switch (domain) {
            case "OWN_SSI_NOSTRO":
                return this.resolveOwnAccount(context);
            case "FI_DIRECT_DEBIT":
                return this.resolveDirectDebit(context);
            case "NOTIFICATION":
                return this.resolveNotification(context);
        }
    }
    bic(context, serviceField) {
        const serviceId = string(context, serviceField);
        return serviceId ? this.banks.resolve(serviceId).bic : "";
    }
    has(context, key) {
        return Object.prototype.hasOwnProperty.call(context, key);
    }
    resolveOwnAccount(context) {
        if (string(context, "scenarioCode"))
            return this.resolveOwnAccountScenario(context);
        const validationError = this.ownAccountValidationError(context);
        if (validationError)
            return validationError;
        return this.ownAccountResolution(context);
    }
    ownAccountFailure(context, reasonCode) {
        const snapshotIdentity = this.snapshotIdentity.current();
        return result(422, {
            decision: "REJECTED",
            code: "OPTION_CONSTRAINT_VIOLATION",
            reasonCode,
            resolutionDomain: "OWN_SSI_NOSTRO",
            counterpartySsiResolution: "SKIPPED",
            chosenRoute: null,
            candidates: [],
            canonicalRoute: null,
            roleProvenance: null,
            messageComposerContext: null,
            payloadGenerated: false,
            correlationId: string(context, "correlationId"),
            snapshotHash: snapshotIdentity.sha256,
            snapshotIdentityMethod: snapshotIdentity.method,
            resolutionTrace: { counterpartySsiQueried: false },
        }, {
            validation: "FAIL",
            code: "OPTION_CONSTRAINT_VIOLATION",
            reasonCode,
            payloadGenerated: false,
        });
    }
    pinnedAccount(context, idField, versionField) {
        if (!this.nostro)
            return {
                decision: "REJECTED",
                reasonCode: "OWN_NOSTRO_SERVICE_UNAVAILABLE",
            };
        const version = number(context, versionField);
        if (!string(context, idField) || !Number.isInteger(version))
            return { decision: "REJECTED", reasonCode: "OWN_ACCOUNT_PIN_REQUIRED" };
        const at = string(context, "valueDate");
        return this.nostro.resolvePinned({
            nostroId: string(context, idField),
            version,
            bookingEntity: string(context, "bookingEntity"),
            ...(at ? { at } : {}),
        });
    }
    resolveOwnAccountScenario(context) {
        const scenario = string(context, "scenarioCode");
        if (!["BOOK_TRANSFER_SAME_RECEIVER", "CREDIT_ONE_OF_SEVERAL_AT_57A"].includes(scenario))
            return this.ownAccountFailure(context, "OWN_ACCOUNT_SCENARIO_NOT_SUPPORTED");
        const credit = this.pinnedAccount(context, "ownCreditAccountId", "ownCreditAccountVersion");
        if (credit.decision === "REJECTED")
            return this.ownAccountFailure(context, credit.reasonCode);
        const debit = this.pinnedAccount(context, "ownDebitAccountId", "ownDebitAccountVersion");
        if (debit.decision === "REJECTED")
            return this.ownAccountFailure(context, debit.reasonCode);
        return this.resolvePinnedOwnAccountScenario(context, scenario, debit.record, credit.record);
    }
    resolvePinnedOwnAccountScenario(context, scenario, debit, credit) {
        // Fixed order is part of the contract: currency is checked before servicer.
        if (this.ownAccountCurrencyMismatch(context, debit, credit))
            return this.ownAccountFailure(context, "OWN_ACCOUNT_CURRENCY_MISMATCH");
        const receiver = this.bic(context, "receiverBankServiceId");
        if (!receiver)
            return this.ownAccountFailure(context, "RECEIVER_BANK_SERVICE_REQUIRED");
        if (this.ownAccountReceiverMismatch(scenario, debit, credit, receiver))
            return this.ownAccountFailure(context, "OWN_ACCOUNT_RECEIVER_MISMATCH");
        const sender = this.banks.resolve("BANK-SVC-DEMOHKHH").bic;
        const isCover = string(context, "sourceMessageType") === "MT202COV";
        const tag = (field) => (isCover ? `A.${field}` : field);
        const debitReference = debit.accountReference || debit.maskedAccountRef;
        const creditReference = credit.accountReference || credit.maskedAccountRef;
        if (this.ownAccountReferencesCollide(debit, credit))
            return this.ownAccountFailure(context, "OWN_ACCOUNT_DEBIT_CREDIT_COLLISION");
        const tags = {
            [tag("58A")]: `/${creditReference}\n${sender}`,
        };
        const omitted = [];
        const renderingDecisions = {};
        tags[tag("53B")] = `/${debitReference}`;
        renderingDecisions[tag("53B")] = {
            outcome: "INCLUDE",
            option: "B",
            rule: "MRG_MT202_DEBIT_ACCOUNT",
        };
        if (scenario === "BOOK_TRANSFER_SAME_RECEIVER") {
            omitted.push(tag("57A"));
            renderingDecisions[tag("57A")] = {
                outcome: "OMITTED_BY_RULE",
                rule: "MRG_MT202_BOOK_TRANSFER_RECEIVER_IS_AWI",
            };
        }
        else {
            tags[tag("57A")] = credit.accountServicerBic;
            renderingDecisions[tag("57A")] = {
                outcome: "INCLUDE",
                rule: "MRG_MT202_CREDIT_ONE_OF_SEVERAL_AT_57A",
            };
        }
        const accountProvenance = (record) => ({
            source: "OWN_SSI_NOSTRO",
            nostroId: record.id,
            nostroVersion: record.version,
        });
        const snapshotIdentity = this.snapshotIdentity.current();
        const resolutionToken = (0, node_crypto_1.randomUUID)();
        return result(200, {
            decision: "RESOLVED",
            code: "RESOLVED",
            resolutionDomain: "OWN_SSI_NOSTRO",
            counterpartySsiResolution: "SKIPPED",
            chosenRoute: null,
            candidates: [],
            messageDefinitionId: "pacs.009.001.08",
            businessService: string(context, "businessService") || "swift.cbprplus.04",
            canonicalScenario: scenario,
            canonicalRoles: {
                sender,
                debtor: sender,
                receiver,
                beneficiary: sender,
            },
            roleProvenance: {
                sender: { source: "OWN_ENTITY", bankServiceId: "BANK-SVC-DEMOHKHH" },
                debtor: {
                    value: sender,
                    source: "OWN_ENTITY",
                    bankServiceId: "BANK-SVC-DEMOHKHH",
                },
                beneficiary: {
                    value: sender,
                    source: "OWN_ENTITY",
                    bankServiceId: "BANK-SVC-DEMOHKHH",
                },
                receiver: {
                    source: "RECEIVER_BANK_SERVICE",
                    bankServiceId: string(context, "receiverBankServiceId"),
                },
                debitAccount: accountProvenance(debit),
                creditAccount: accountProvenance(credit),
            },
            messageComposerContext: {
                SttlmMtd: { value: "INDA", source: "SETTLEMENT_POLICY" },
                Dbtr: { value: sender, source: "OWN_ENTITY" },
                DbtrAcct: { value: debitReference, ...accountProvenance(debit) },
                SttlmAcct: {
                    value: debitReference,
                    ...accountProvenance(debit),
                    semanticRole: "SETTLEMENT_DEBIT_ACCOUNT",
                },
                CdtrAcct: { value: creditReference, ...accountProvenance(credit) },
                Cdtr: { value: sender, source: "OWN_ENTITY" },
            },
            payloadGenerated: true,
            snapshotHash: snapshotIdentity.sha256,
            snapshotIdentityMethod: snapshotIdentity.method,
            resolutionToken,
            correlationId: string(context, "correlationId"),
            resolutionTrace: { counterpartySsiQueried: false },
        }, {
            renderer: "MT compatibility view from the same confirmed own-account snapshot",
            tags,
            omitted,
            renderingDecisions,
            assertions: [
                "Counterparty SSI resolution is skipped",
                "53B option B identifies the debit account",
                "58A identifies the Sender",
            ],
        });
    }
    ownAccountCurrencyMismatch(context, debit, credit) {
        return (debit.currency !== credit.currency ||
            credit.currency !== string(context, "currency"));
    }
    ownAccountReceiverMismatch(scenario, debit, credit, receiver) {
        if (debit.accountServicerBic !== receiver)
            return true;
        return scenario === "BOOK_TRANSFER_SAME_RECEIVER"
            ? credit.accountServicerBic !== receiver
            : credit.accountServicerBic === receiver;
    }
    ownAccountReferencesCollide(debit, credit) {
        const sameRecord = debit.id === credit.id && debit.version === credit.version;
        const debitReference = debit.accountReference || debit.maskedAccountRef;
        const creditReference = credit.accountReference || credit.maskedAccountRef;
        return sameRecord || debitReference === creditReference;
    }
    ownAccountValidationError(context) {
        return (this.ownAccountIdentityError(context) ??
            this.ownAccountFieldError(context) ??
            this.ownAccountProfileError(context) ??
            this.ownAccountMessageError(context) ??
            this.ownAccountBankServiceProfileError(context));
    }
    ownAccountIdentityError(context) {
        if (this.has(context, "accountWithBic") ||
            this.has(context, "receiver") ||
            this.has(context, "intermediaryBic"))
            return code(400, "BANK_SERVICE_ID_REQUIRED", null);
        return undefined;
    }
    ownAccountFieldError(context) {
        if (context["field53"] &&
            context["field53"].option !== "B")
            return code(422, "OPTION_CONSTRAINT_VIOLATION", null, "", {
                validation: "FAIL",
                reason: "MT200 permits 53B only",
            });
        if (string(context, "currency") === "XAU" ||
            string(context, "field32A").includes("XAU"))
            return code(422, "CURRENCY_NOT_SUPPORTED", null, "T26/T52/C08 checks precede route lookup", {
                validation: "FAIL",
                errors: ["T26", "CURRENCY_NOT_SUPPORTED"],
            });
        return undefined;
    }
    ownAccountMessageError(context) {
        if (context["58A"])
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "OWN_SSI_NOSTRO", "MT200 has no 58a", {
                validation: "FAIL",
                reason: "58a not applicable",
            });
        if (string(context, "requestedUse"))
            return code(400, "MESSAGE_TYPE_NOT_SUPPORTED", "OWN_SSI_NOSTRO", "Scenario must be routed to MT202 profile");
        return undefined;
    }
    ownAccountProfileError(context) {
        if (context["ownNostro"] === null)
            return code(503, "PROFILE_INCOMPLETE", "OWN_SSI_NOSTRO", "Own Nostro is required; Counterparty SSI cannot substitute", {
                validation: "FAIL",
                mustNotUse: [String(context["availableCounterpartySsi"] ?? "")],
                payloadGenerated: false,
            });
        return undefined;
    }
    ownAccountBankServiceProfileError(context) {
        if (this.has(context, "accountWithBankServiceId") &&
            !string(context, "accountWithBankServiceId"))
            return code(503, "PROFILE_INCOMPLETE", null, "Own-account profile cannot derive mandatory AWI", {
                validation: "FAIL",
                missing: ["57a"],
                payloadGenerated: false,
            });
        return undefined;
    }
    ownAccountResolution(context) {
        const accountWith = this.bic(context, "accountWithBankServiceId") ||
            this.bic(context, "receiverBankServiceId") ||
            (string(context, "qaSeedId")
                ? this.banks.resolve("BANK-SVC-CITIUS33").bic
                : "");
        if (!accountWith)
            return code(400, "BANK_SERVICE_ID_REQUIRED", null);
        const intermediary = this.bic(context, "intermediaryBankServiceId");
        const account = string(context, "selectedDebitAccount");
        const tags = { "57A": accountWith };
        if (account)
            tags["53B"] = account;
        if (intermediary)
            tags["56A"] = intermediary;
        const roles = {
            accountWithInstitution: accountWith,
        };
        const omitted = [];
        const assertions = [];
        if (number(context, "directAccountCount") === 1) {
            roles["beneficiary"] = "Sender";
            roles["ownNostro"] = "one eligible USD account";
            omitted.push("53B", "56a", "58a");
            assertions.push("beneficiary is always Sender");
        }
        if (number(context, "directAccountCount") === 2) {
            roles["settlementAccount"] = account;
            omitted.push("53B location", "58a");
            assertions.push("53B option B, Party Identifier only");
        }
        if (string(context, "qaSeedId")) {
            roles["ownNostro"] = "/QA-HK01-USD-001";
            roles["accountServicer"] = accountWith;
            roles["beneficiary"] = "Sender";
            omitted.push("53B", "58a");
            assertions.push("source ownership=OWN_NOSTRO");
        }
        if (intermediary) {
            roles["intermediaryAgent"] = intermediary;
            roles["beneficiary"] = "Sender";
            omitted.push("58a");
        }
        return result(200, {
            decision: "RESOLVED",
            messageDefinitionId: "pacs.009.001.08",
            businessService: "swift.cbprplus.04",
            canonicalScenario: "OWN_ACCOUNT_TRANSFER",
            canonicalRoles: roles,
            validationScope: "canonical route + MRG; full serialized XML requires controlled Translation Portal golden fixture",
        }, {
            renderer: "MT compatibility view from the same confirmed canonical snapshot",
            tags,
            omitted,
            assertions,
        });
    }
    resolveDirectDebit(context) {
        const validationError = this.directDebitValidationError(context);
        if (validationError)
            return validationError;
        return this.directDebitResolution(context);
    }
    directDebitValidationError(context) {
        return (this.directDebitMessageTypeError(context) ??
            this.directDebitIdentityError(context) ??
            this.directDebitContentError(context));
    }
    directDebitMessageTypeError(context) {
        if (string(context, "sourceMessageType") === "MT204") {
            const targetMatches = string(context, "messageType") === "pacs.010.001.03";
            return code(400, targetMatches
                ? "MESSAGE_TYPE_NOT_SUPPORTED"
                : "PAYMENT_SOURCE_TARGET_MISMATCH", "FI_DIRECT_DEBIT", "", targetMatches
                ? {
                    httpStatus: 400,
                    code: "MESSAGE_TYPE_NOT_SUPPORTED",
                    redirectDomain: "FI_DIRECT_DEBIT",
                    payloadGenerated: false,
                    detail: "",
                }
                : { validation: "FAIL", requiredTarget: "pacs.010.001.03" });
        }
        return undefined;
    }
    directDebitIdentityError(context) {
        if (!Object.keys(context).length)
            return code(400, "BANK_SERVICE_ID_REQUIRED", "FI_DIRECT_DEBIT");
        if (this.has(context, "debitInstitution"))
            return code(400, "BANK_SERVICE_ID_REQUIRED", "FI_DIRECT_DEBIT");
        if (this.has(context, "debitInstitutionBankServiceId")) {
            if (!string(context, "debitInstitutionBankServiceId"))
                return code(400, "BANK_SERVICE_ID_REQUIRED", "FI_DIRECT_DEBIT");
            this.banks.resolve(string(context, "debitInstitutionBankServiceId"));
        }
        return undefined;
    }
    directDebitContentError(context) {
        if (context["mugActive"] === false ||
            string(context, "mandateStatus") === "INACTIVE")
            return code(503, "PROFILE_INCOMPLETE", "FI_DIRECT_DEBIT", string(context, "mandateStatus") === "INACTIVE"
                ? "No effective bilateral mandate"
                : "", { validation: "FAIL", payloadGenerated: false });
        if (number(context, "sequenceBCount") > 10)
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "FI_DIRECT_DEBIT", "", {
                validation: "FAIL",
                error: "T10",
            });
        if (context["19EqualsSum32B"] === false || this.has(context, "19"))
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "FI_DIRECT_DEBIT", "", {
                validation: "FAIL",
                error: "C01",
            });
        if (string(context, "B.53A.source").includes("generic"))
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "FI_DIRECT_DEBIT", "", {
                validation: "FAIL",
                assertions: [
                    "B.53a=mandate Debit Institution",
                    "A.58a=Sender identity",
                ],
            });
        const sequence = context["sequenceB"];
        if (Array.isArray(sequence) &&
            new Set(sequence.map((entry) => String(entry).slice(0, 3))).size > 1)
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "FI_DIRECT_DEBIT", "", {
                validation: "FAIL",
                error: "C02",
            });
        return undefined;
    }
    directDebitResolution(context) {
        const roles = {};
        const tags = {};
        const assertions = [];
        if (context["mugActive"] === true) {
            roles["creditor"] = "Sender";
            roles["debtorAgent"] = "mandate debit institution";
            tags["A.58A"] = string(context, "senderBic") || "DEMOHKHH";
            tags["B.53A"] = string(context, "debitInstitution") || "CITIUS33";
            assertions.push("58a always Sender");
        }
        for (const field of ["A.57A", "A.58A", "B.53A"])
            if (string(context, field))
                tags[field] = string(context, field);
        if (string(context, "A.57A")) {
            roles["accountWithInstitution"] = string(context, "A.57A");
            roles["beneficiaryInstitution"] = "Sender";
            roles["debitInstitution"] = string(context, "B.53A");
            assertions.splice(0);
        }
        if (number(context, "sequenceBCount")) {
            roles["directDebitTransactions"] = number(context, "sequenceBCount");
            tags["19"] = "sum(32B)";
            tags["B.sequenceCount"] = number(context, "sequenceBCount");
            assertions.splice(0);
        }
        if (Array.isArray(context["qaSeedIds"])) {
            roles["creditor"] = "DEMOHKHH";
            roles["debtorAgent"] = "CITIUS33";
            tags["A.58A"] = "DEMOHKHH";
            tags["B.53A"] = "CITIUS33";
            assertions.splice(0, assertions.length, "mandate source; 58a always Sender");
        }
        if (this.has(context, "A.58a")) {
            roles["creditor"] = string(context, "senderBic") || "DEMOHKHH";
            roles["creditorSource"] = "SENDER_IDENTITY";
            roles["mt58aOutcome"] = "OMITTED_BY_RULE";
            return result(200, {
                decision: "RESOLVED",
                messageDefinitionId: "pacs.010.001.03",
                businessService: "swift.cbprplus.04",
                canonicalScenario: "FI_DIRECT_DEBIT_COLLECTION",
                canonicalRoles: roles,
                validationScope: "canonical route + MRG; full serialized XML requires controlled Translation Portal golden fixture",
            }, {
                renderer: "MT compatibility view from the same confirmed canonical snapshot",
                tags: {},
                omitted: ["A.58a"],
                assertions: [
                    "58a is optional; when present it is always Sender",
                    "clearing code first applicable field is 57a then 58a",
                ],
            });
        }
        return result(200, {
            decision: "RESOLVED",
            messageDefinitionId: "pacs.010.001.03",
            businessService: "swift.cbprplus.04",
            canonicalScenario: "FI_DIRECT_DEBIT_COLLECTION",
            canonicalRoles: roles,
            validationScope: "canonical route + MRG; full serialized XML requires controlled Translation Portal golden fixture",
        }, {
            renderer: "MT compatibility view from the same confirmed canonical snapshot",
            tags,
            omitted: [],
            assertions,
        });
    }
    resolveNotification(context) {
        const validationError = this.notificationValidationError(context);
        if (validationError)
            return validationError;
        return this.notificationResolution(context);
    }
    notificationValidationError(context) {
        return (this.notificationMessageTypeError(context) ??
            this.notificationContextError(context) ??
            this.notificationPartyError(context) ??
            this.notificationCountError(context) ??
            this.notificationFieldError(context) ??
            this.notificationOccurrenceError(context));
    }
    notificationMessageTypeError(context) {
        if (string(context, "sourceMessageType") === "MT210")
            return code(400, "MESSAGE_TYPE_NOT_SUPPORTED", "NOTIFICATION", "", {
                httpStatus: 400,
                code: "MESSAGE_TYPE_NOT_SUPPORTED",
                redirectDomain: "NOTIFICATION",
                payloadGenerated: false,
                detail: "",
            });
        return undefined;
    }
    notificationContextError(context) {
        if (!Object.keys(context).length)
            return code(422, "MESSAGE_CONTEXT_MISSING", "NOTIFICATION");
        if (string(context, "currency") === "XAU")
            return code(422, "CURRENCY_NOT_SUPPORTED", "NOTIFICATION", "", {
                validation: "FAIL",
                error: "C08",
            });
        return undefined;
    }
    notificationPartyError(context) {
        if (Object.prototype.hasOwnProperty.call(context, "orderingPartyType") &&
            !context["orderingPartyType"])
            return code(422, "MESSAGE_CONTEXT_MISSING", "NOTIFICATION", "Cannot choose exactly one of 50a/52a", {
                validation: "FAIL",
                error: "C06",
                payloadGenerated: false,
            });
        return undefined;
    }
    notificationCountError(context) {
        if (number(context, "occurrenceCount") > 10)
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", "", {
                validation: "FAIL",
                error: "T10",
            });
        return undefined;
    }
    notificationFieldError(context) {
        if (context["58A"])
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", "MT210 has no 58a", {
                validation: "FAIL",
                reason: "58a not applicable",
            });
        if (context["50F"] && context["52A"])
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", "", {
                validation: "FAIL",
                error: "C06",
            });
        if (!context["50a"] &&
            !context["52a"] &&
            !context["50F"] &&
            !context["52A"] &&
            (Object.prototype.hasOwnProperty.call(context, "50a") ||
                Object.prototype.hasOwnProperty.call(context, "52a")))
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", "", {
                validation: "FAIL",
                error: "C06",
            });
        if (context["25.source"])
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", "", {
                validation: "FAIL",
                requiredSources: ["ACCOUNT_MASTER", "NOTIFICATION_CONTEXT"],
            });
        return undefined;
    }
    notificationOccurrenceError(context) {
        const occurrences = context["occurrences"];
        if (Array.isArray(occurrences) &&
            new Set(occurrences.map((entry) => String(entry).slice(0, 3))).size > 1)
            return code(422, "OPTION_CONSTRAINT_VIOLATION", "NOTIFICATION", "", {
                validation: "FAIL",
                error: "C02",
            });
        return undefined;
    }
    notificationResolution(context) {
        const roles = {};
        const tags = {};
        const omitted = [];
        const assertions = [];
        if (string(context, "52A")) {
            roles["orderingInstitution"] = string(context, "52A");
            tags["52A"] = string(context, "52A");
            omitted.push("25", "50a");
            assertions.push("C06 satisfied");
        }
        if (string(context, "56A")) {
            roles["intermediary"] = string(context, "56A");
            tags["56A"] = string(context, "56A");
        }
        if (string(context, "50F")) {
            roles["orderingCustomer"] = (string(context, "50F").split("\n").at(-1) || "").replace(/^\d+\//, "");
            tags["50F"] = string(context, "50F");
            omitted.splice(0, omitted.length, "52a");
            assertions.splice(0, assertions.length, "C06 satisfied");
        }
        if (number(context, "occurrenceCount")) {
            roles["expectedReceipts"] = number(context, "occurrenceCount");
            roles["currency"] = string(context, "currency");
            tags["repetitions"] = number(context, "occurrenceCount");
            omitted.splice(0);
            assertions.splice(0, assertions.length, "same currency", "C06 per occurrence");
        }
        if (number(context, "accountCount") > 1) {
            roles["account"] = string(context, "selectedAccount");
            tags["25"] = string(context, "selectedAccount");
            tags["52A"] = "CHASUS33";
            omitted.splice(0);
            assertions.splice(0);
        }
        else if (number(context, "accountCount") === 1) {
            roles["account"] = "derived single account";
            tags["52A"] = "CHASUS33";
            omitted.splice(0, omitted.length, "25", ...(string(context, "52A") ? ["50a"] : []));
            if (string(context, "52A"))
                assertions.splice(0, assertions.length, "C06 satisfied");
            else
                assertions.splice(0);
        }
        if (Array.isArray(context["qaSeedIds"])) {
            roles["orderingInstitution"] = "CHASUS33";
            roles["account"] = "derived single account";
            tags["52A"] = "CHASUS33";
            omitted.splice(0, omitted.length, "25", "50a");
            assertions.splice(0, assertions.length, "exactly one of 50a/52a");
        }
        return result(200, {
            decision: "RESOLVED",
            messageDefinitionId: "camt.057.001.06",
            businessService: "swift.cbprplus.04",
            canonicalScenario: "NOTICE_TO_RECEIVE",
            canonicalRoles: roles,
            validationScope: "canonical route + MRG; full serialized XML requires controlled Translation Portal golden fixture",
        }, {
            renderer: "MT compatibility view from the same confirmed canonical snapshot",
            tags,
            omitted,
            assertions,
        });
    }
};
exports.MessageDomainResolutionService = MessageDomainResolutionService;
exports.MessageDomainResolutionService = MessageDomainResolutionService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [bank_service_directory_1.BankServiceDirectory,
        nostro_application_service_1.NostroApplicationService,
        database_snapshot_identity_service_1.DatabaseSnapshotIdentityService])
], MessageDomainResolutionService);
//# sourceMappingURL=message-domain-resolution.service.js.map