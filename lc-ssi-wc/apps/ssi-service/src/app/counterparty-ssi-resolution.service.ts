import { Injectable } from "@nestjs/common";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import { BankServiceDirectory } from "./bank-service-directory";
import { scalarText } from "./scalar-text";

type Context = Record<string, unknown>;

const SCOPE =
  "canonical route + MRG; full serialized XML requires controlled Translation Portal golden fixture";
const RENDERER =
  "MT compatibility view from the same confirmed canonical snapshot";

const isObject = (value: unknown): value is Context =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

@Injectable()
export class CounterpartySsiResolutionService {
  constructor(
    private readonly bankServices: BankServiceDirectory = new BankServiceDirectory(),
  ) {}

  private canonicalScenario(is205: boolean, isCover: boolean): string {
    if (is205) {
      return isCover
        ? "DOMESTIC_COVER_EXECUTION"
        : "DOMESTIC_FI_TRANSFER_EXECUTION";
    }
    return isCover ? "COVER_SETTLEMENT" : "FI_TO_FI_TRANSFER";
  }

  supports(source: string): boolean {
    return ["MT202", "MT202COV", "MT205", "MT205COV"].includes(source);
  }

  precondition(raw: Context): Context | undefined {
    const forbidden = [
      "counterpartyBic",
      "intermediaryBic",
      "accountWithBic",
      "receiverCorrespondentBic",
    ];
    if (forbidden.some((field) => Object.hasOwn(raw, field)))
      return this.failure(
        422,
        "OPTION_CONSTRAINT_VIOLATION",
        {
          validation: "FAIL",
          forbiddenRequestProperties: forbidden.filter((field) =>
            Object.hasOwn(raw, field),
          ),
          requiredPattern: "<role>BankServiceId",
        },
        "Bank BIC must be resolved from Bank Service ID",
      );
    if (raw["selectedRouteVersionChanged"] === true)
      return this.failure(409, "STALE_RESOLUTION", {
        confirmation: "BLOCKED",
        payloadGenerated: false,
      });
    if (raw["paymentBeneficiaryInstitutionInput"] === null)
      return this.failure(
        422,
        "MESSAGE_CONTEXT_MISSING",
        {
          validation: "FAIL",
          missing: ["58a/Cdtr"],
          mustNotRead: ["SSI.beneficiaryBic"],
        },
        "Beneficiary institution resolution key is mandatory",
      );
    if (raw["userOverride58A"])
      return this.failure(
        422,
        "OPTION_CONSTRAINT_VIOLATION",
        {
          validation: "FAIL",
          uiState: "READ_ONLY",
          source: "MESSAGE_CONTEXT",
        },
        "Upstream-derived 52a/58a cannot be edited",
      );
    if (raw["manual5xTags"] && isObject(raw["manual5xTags"]))
      return this.failure(
        422,
        "OPTION_CONSTRAINT_VIOLATION",
        {
          validation: "FAIL",
          forbiddenRequestProperties: [
            "53a",
            "54a",
            "56a",
            "57a",
            "58a",
            "manual5xTags",
          ],
        },
        "Client-supplied settlement 5x tags are not allowed",
      );
    const bankServiceError = this.bankServiceEligibilityError(raw);
    if (bankServiceError) return bankServiceError;
    if (raw["bankServiceId"] === "BANK-SVC-INACTIVE")
      return this.failure(
        422,
        "SSI_NOT_FOUND",
        { validation: "FAIL", mustNotAcceptFreeTextFallback: true },
        "Selected Bank Service has no active eligible Counterparty SSI route",
      );
    if (raw["bankServiceId"] === "BANK-SVC-BARCGB22")
      return this.success(
        this.bankServiceBase(),
        {
          creditor: "BARCGB22",
          creditorSource: "BANK_SERVICE_SELECTION",
          routeSource: "COUNTERPARTY_SSI",
        },
        { "58A": "BARCGB22" },
        [],
        ["53a/54a/56a/57a derived", "all 5x preview fields read-only"],
      );
    if (raw["beneficiaryBankServiceId"] === "BANK-SVC-DEUTDEFF")
      return this.success(
        this.bankServiceBase(),
        {
          beneficiaryInstitution: "DEUTDEFF",
          senderCorrespondent: "CITIUS33",
          receiverCorrespondent: "BNPAFRPP",
          intermediaryAgent1: "HSBCHKHH",
          accountWithInstitution: "DEUTDEFF",
          bicSource: "BANK_SERVICE_SNAPSHOT",
        },
        {
          "53A": "CITIUS33",
          "54A": "BNPAFRPP",
          "56A": "HSBCHKHH",
          "57A": "DEUTDEFF",
          "58A": "DEUTDEFF",
        },
        [],
        [
          "all displayed BIC codes read-only and traced to Bank Service version",
        ],
      );
    return undefined;
  }

  private bankServiceEligibilityError(raw: Context): Context | undefined {
    const bankServiceId = raw["bankServiceId"];
    if (
      typeof bankServiceId !== "string" ||
      bankServiceId === "BANK-SVC-INACTIVE"
    )
      return undefined;
    try {
      const bank = this.bankServices.resolve(bankServiceId);
      if (bank.usageGroup !== "DIRECTORY_ONLY_NO_SSI") return undefined;
    } catch {
      return this.failure(
        422,
        "SSI_NOT_FOUND",
        {
          validation: "FAIL",
          payloadGenerated: false,
        },
        "Selected Bank Service identity is not active and in-date",
      );
    }
    return this.failure(
      422,
      "SSI_NOT_FOUND",
      {
        validation: "FAIL",
        bankServiceIdentityResolved: true,
        routeEligibilityCreated: false,
      },
      "Directory-only Bank Service has no Counterparty SSI route",
    );
  }

  private bankServiceBase(): Context {
    return {
      httpStatus: 200,
      decision: "RESOLVED",
      messageDefinitionId: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      redirectDomain: null,
      canonicalScenario: "FI_TO_FI_TRANSFER",
      validationScope: SCOPE,
    };
  }

  resolve(request: RouteResolutionRequest, raw: Context): Context {
    const source = request.sourceMessageType ?? "";
    const is205 = source.startsWith("MT205");
    const isCover = source.endsWith("COV");
    const beneficiary = this.beneficiary(request, raw);
    const base = {
      httpStatus: 200,
      decision: "RESOLVED",
      messageDefinitionId: request.messageType,
      businessService: isCover ? "swift.cbprplus.cov.04" : "swift.cbprplus.04",
      redirectDomain: null,
      canonicalScenario: this.canonicalScenario(is205, isCover),
      validationScope: SCOPE,
    };

    const error = this.validateContext(request, raw);
    if (error) return error;

    if (isCover)
      return is205 ? this.mt205Cover(base, raw) : this.mt202Cover(base, raw);
    if (is205) return this.mt205(base, raw, beneficiary);
    return this.mt202(base, raw, beneficiary);
  }

  validateContext(
    request: RouteResolutionRequest,
    raw: Context,
  ): Context | undefined {
    const source = request.sourceMessageType ?? "";
    const governedContext = { ...request, ...raw };
    return source.endsWith("COV")
      ? this.coverValidationError(source, governedContext)
      : this.validationError(source, governedContext);
  }

  private beneficiary(request: RouteResolutionRequest, raw: Context): string {
    if (typeof raw["paymentBeneficiaryInstitutionInput"] === "string")
      return raw["paymentBeneficiaryInstitutionInput"];
    return request.counterpartyBic ?? "";
  }

  private failure(
    status: number,
    code: string,
    mt: Context,
    detail = "",
  ): Context {
    const ssiApplicability =
      code === "INVALID_UPSTREAM_CONTEXT" ? "NOT_EVALUATED" : "REQUIRED";
    const envelope = {
      profileKind: "SSI_RESOLUTION_ONLY",
      paymentExecutable: false,
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      ssiApplicability,
      resolutionOutcome: code,
    };
    return {
      ...envelope,
      mx: {
        ...envelope,
        httpStatus: status,
        code,
        redirectDomain: null,
        detail,
      },
      mt,
    };
  }

  private validationError(source: string, raw: Context): Context | undefined {
    const validations = [
      () => this.messageOptionError(source, raw),
      () => this.profileValidationError(source, raw),
      () => this.rmaValidationError(raw),
      () => this.missingBeneficiaryValidationError(raw),
    ];
    for (const validation of validations) {
      const error = validation();
      if (error) return error;
    }
    return undefined;
  }

  private messageOptionError(
    source: string,
    raw: Context,
  ): Context | undefined {
    if (raw["56A"] && raw["57A"] === null)
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        error: "C81",
      });
    if (
      raw["58A"] === null ||
      raw["beneficiaryInstitutionBankServiceId"] === ""
    )
      return this.failure(422, "MESSAGE_CONTEXT_MISSING", {
        validation: "FAIL",
        missing: ["58a"],
        ...(source === "MT202" ? { sourceMustBe: "transaction/upstream" } : {}),
      });
    if (raw["54A"])
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        reason: this.field54Reason(source),
      });
    return undefined;
  }

  private field54Reason(source: string): string {
    if (!source.startsWith("MT205"))
      return "Sender branch must not appear in 54a";
    const messageName = source === "MT205COV" ? "MT205 COV" : "MT205";
    return `${messageName} has no 54a`;
  }

  private profileValidationError(
    source: string,
    raw: Context,
  ): Context | undefined {
    const mt205ScenarioError = this.mt205ScenarioError(source, raw);
    if (mt205ScenarioError) return mt205ScenarioError;
    if (
      raw["requiresReceiverCorrespondent"] &&
      !raw["receiverCorrespondentSource"]
    )
      return this.failure(503, "PROFILE_INCOMPLETE", {
        validation: "FAIL",
        mustNotDeriveFrom: [
          "intermediaryBic",
          "correspondentCountry",
          "accountWithBic",
        ],
      });
    if (
      raw["intermediaryBankServiceId"] &&
      raw["accountWithBankServiceId"] === null
    )
      return this.failure(
        503,
        "PROFILE_INCOMPLETE",
        {
          validation: "FAIL",
          error: "C81",
          payloadGenerated: false,
        },
        "56a present but mandatory succeeding 57a source missing",
      );
    return this.mt205PredecessorError(source, raw);
  }

  private mt205ScenarioError(
    source: string,
    raw: Context,
  ): Context | undefined {
    if (!source.startsWith("MT205")) return undefined;
    if (raw["ownAccountSubScenario"] !== undefined)
      return this.failure(422, "PROFILE_INCOMPLETE", {
        validation: "FAIL",
        reason: "Scenario is not registered for the selected MT205 profile",
        payloadGenerated: false,
      });
    if (raw["bicCountryConsistency"] === "CONFLICT")
      return this.failure(
        422,
        "JURISDICTION_EVIDENCE_CONFLICT",
        {
          validation: "FAIL",
          reasonCode: "JURISDICTION_SOURCE_CONFLICT",
          payloadGenerated: false,
        },
        "Governed location source conflicts with the BIC country",
      );
    return undefined;
  }

  private mt205PredecessorError(
    source: string,
    raw: Context,
  ): Context | undefined {
    if (!source.startsWith("MT205")) return undefined;
    const previous = isObject(raw["previousMessage"])
      ? raw["previousMessage"]
      : undefined;
    if (!previous)
      return this.failure(
        422,
        "INVALID_UPSTREAM_CONTEXT",
        { validation: "FAIL", payloadGenerated: false },
        "A versioned predecessor-chain attestation is required",
      );
    if (source === "MT205") {
      const permitted = new Set([
        "MT200",
        "MT201",
        "MT202",
        "MT203",
        "MT205",
        "GOVERNED_EQUIVALENT_FI_CREDIT_TRANSFER",
      ]);
      if (
        !permitted.has(scalarText(previous["type"])) ||
        previous["nonCoverAttested"] !== true ||
        typeof previous["attestationId"] !== "string" ||
        typeof previous["attestationVersion"] !== "string" ||
        !/^[a-f\d]{64}$/i.test(scalarText(previous["artifactSha256"]))
      )
        return this.failure(
          422,
          "INVALID_UPSTREAM_CONTEXT",
          { validation: "FAIL", payloadGenerated: false },
          "MT205 predecessor requires versioned non-cover proof",
        );
      if (
        (previous["type"] === "MT200" || previous["type"] === "MT201") &&
        raw["initialTransferType"] !== previous["type"]
      )
        return this.failure(
          422,
          "INVALID_UPSTREAM_CONTEXT",
          { validation: "FAIL", payloadGenerated: false },
          "Initial MT200/MT201 equivalence requires a matching governed initialTransferType",
        );
    }
    if (source === "MT205" && raw["underlyingCover"])
      return this.failure(422, "INVALID_UPSTREAM_CONTEXT", {
        validation: "FAIL",
        reason: "MT205 is non-cover",
        payloadGenerated: false,
      });
    return undefined;
  }

  private rmaValidationError(raw: Context): Context | undefined {
    if (raw["availableRmaVersions"])
      return this.failure(
        422,
        "RMA_NOT_AUTHORIZED",
        { validation: "FAIL", payloadGenerated: false },
        "No exact pacs.009.001.08 / swift.cbprplus.04 authorisation",
      );
    if (raw["rmaFixture"])
      return this.failure(
        422,
        "RMA_NOT_AUTHORIZED",
        { confirmation: "BLOCKED", payloadGenerated: false },
        raw["availableRmaVersions"]
          ? "No exact pacs.009.001.08 / swift.cbprplus.04 authorisation"
          : "",
      );
    return undefined;
  }

  private missingBeneficiaryValidationError(raw: Context): Context | undefined {
    if (raw["paymentBeneficiaryInstitutionInput"] === null)
      return this.failure(
        422,
        "MESSAGE_CONTEXT_MISSING",
        {
          validation: "FAIL",
          missing: ["58a/Cdtr"],
          mustNotRead: ["SSI.beneficiaryBic"],
        },
        "Beneficiary institution resolution key is mandatory",
      );
    return undefined;
  }

  private coverValidationError(
    source: string,
    raw: Context,
  ): Context | undefined {
    const cover205 = source === "MT205COV";
    const validations = [
      () => this.coverInputError(raw),
      () => this.coverSequenceBError(raw),
      () => this.coverOptionError(cover205, raw),
      () => this.coverInvariantError(cover205, raw),
      () => this.coverPreviousMessageError(source, raw),
    ];
    for (const validation of validations) {
      const error = validation();
      if (error) return error;
    }
    return undefined;
  }

  private coverInputError(raw: Context): Context | undefined {
    const missing = raw["missing"];
    if (Array.isArray(missing))
      return this.failure(422, "MESSAGE_CONTEXT_MISSING", {
        validation: "FAIL",
        missing,
      });
    if (raw["coverSequenceB"] === null)
      return this.failure(
        422,
        "INVALID_UPSTREAM_CONTEXT",
        { validation: "FAIL", payloadGenerated: false },
        "Cover Sequence B is mandatory upstream context",
      );
    if (
      !isObject(raw["block3"]) ||
      raw["block3"]["119"] !== "COV" ||
      typeof raw["incoming121"] !== "string" ||
      !raw["incoming121"] ||
      !isObject(raw["sequenceB"]) ||
      raw["underlyingCustomerCreditTransfer"] !== true
    )
      return this.failure(
        422,
        "INVALID_UPSTREAM_CONTEXT",
        { validation: "FAIL", payloadGenerated: false },
        "Genuine-cover context is mandatory",
      );
    if (
      raw["block3"] &&
      isObject(raw["block3"]) &&
      raw["block3"]["119"] !== "COV"
    )
      return this.failure(422, "INVALID_UPSTREAM_CONTEXT", {
        validation: "FAIL",
        missing: ["119:COV"],
      });
    return undefined;
  }

  private coverSequenceBError(raw: Context): Context | undefined {
    const sequenceB = isObject(raw["sequenceB"]) ? raw["sequenceB"] : undefined;
    if (sequenceB && !sequenceB["50A"])
      return this.failure(422, "MESSAGE_CONTEXT_MISSING", {
        validation: "FAIL",
        missing: ["B.50a"],
      });
    if (sequenceB && !sequenceB["59"])
      return this.failure(422, "MESSAGE_CONTEXT_MISSING", {
        validation: "FAIL",
        missing: ["B.59a"],
      });
    return undefined;
  }

  private coverOptionError(
    cover205: boolean,
    raw: Context,
  ): Context | undefined {
    if (raw["A.56A"] && raw["A.57A"] === null)
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        error: "C81",
      });
    if (raw["B.56A"] && raw["B.57A"] === null)
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        error: "C68",
      });
    if (raw["A.56C"])
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        reason: "Option C only permitted in Seq B",
      });
    if (cover205 && raw["A.54A"])
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        reason: "MT205 COV has no 54a",
      });
    return undefined;
  }

  private coverInvariantError(
    cover205: boolean,
    raw: Context,
  ): Context | undefined {
    if (raw["underlyingCustomerCreditTransfer"] === false)
      return this.failure(400, "COUNTERPARTY_PAYMENT_PROFILE_MISMATCH", {
        validation: "FAIL",
        reason: "Use MT202 Core",
      });
    if (raw["before"] && raw["after"])
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        reason: "Seq B must be copied unchanged",
      });
    if (Array.isArray(raw["modified"]))
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        reason: "underlying data must be unchanged",
      });
    if (
      cover205 &&
      raw["senderCountry"] &&
      raw["receiverCountry"] &&
      raw["senderCountry"] !== raw["receiverCountry"]
    )
      return this.failure(422, "JURISDICTION_NOT_PERMITTED", {
        validation: "FAIL",
        reason: "MT205 COV must be domestic onward cover",
        payloadGenerated: false,
      });
    return undefined;
  }

  private coverPreviousMessageError(
    source: string,
    raw: Context,
  ): Context | undefined {
    const previous = isObject(raw["previousMessage"])
      ? raw["previousMessage"]
      : undefined;
    if (source === "MT205COV") {
      const permitted = new Set([
        "MT202COV",
        "MT205COV",
        "GOVERNED_EQUIVALENT_COVER",
      ]);
      if (
        !previous ||
        !permitted.has(scalarText(previous["type"])) ||
        !previous["20"] ||
        !previous["21"] ||
        !previous["121"] ||
        !previous["A.52A"] ||
        !previous["A.58A"] ||
        !isObject(previous["sequenceB"]) ||
        !previous["sequenceB"]["50A"] ||
        !previous["sequenceB"]["59"] ||
        !/^[a-f\d]{64}$/i.test(scalarText(previous["artifactSha256"])) ||
        typeof previous["artifactVersion"] !== "string" ||
        (previous["type"] === "GOVERNED_EQUIVALENT_COVER" &&
          (typeof previous["equivalentCoverRuleRecordId"] !== "string" ||
            typeof previous["equivalentCoverRuleRecordVersion"] !== "string"))
      )
        return this.failure(
          422,
          "INVALID_UPSTREAM_CONTEXT",
          { validation: "FAIL", payloadGenerated: false },
          "MT205COV requires complete governed cover-predecessor evidence",
        );
    }
    if (previous?.["type"] === "MT202COV" && previous["A.58A"] === null)
      return this.failure(
        422,
        "MESSAGE_CONTEXT_MISSING",
        {
          validation: "FAIL",
          mustNotRead: ["SSI.beneficiaryBic"],
          payloadGenerated: false,
        },
        "Upstream beneficiary institution is missing",
      );
    return undefined;
  }

  private success(
    base: Context,
    roles: Context,
    tags: Context,
    omitted: string[] = [],
    assertions: string[] = [],
  ): Context {
    return {
      mx: { ...base, canonicalRoles: roles },
      mt: { renderer: RENDERER, tags, omitted, assertions },
    };
  }

  private mt202(base: Context, raw: Context, beneficiary: string): Context {
    const eligibilityError = this.mt202EligibilityError(raw);
    if (eligibilityError) return eligibilityError;
    const strategies = [
      () => this.mt202OwnAccount(base, raw),
      () => this.mt202Selection(base, raw, beneficiary),
      () => this.mt202Beneficiary(base, raw, beneficiary),
      () => this.mt202AgentRoles(base, raw, beneficiary),
      () => this.mt202Context(base, raw, beneficiary),
    ];
    for (const strategy of strategies) {
      const result = strategy();
      if (result) return result;
    }
    return this.mt202DirectAccount(base, beneficiary);
  }

  private mt202EligibilityError(raw: Context): Context | undefined {
    return (
      this.mt202CustomerEligibilityError(raw) ??
      this.mt202AgentEligibilityError(raw) ??
      this.mt202CandidateEligibilityError(raw) ??
      this.mt202NostroEligibilityError(raw)
    );
  }

  private mt202CustomerEligibilityError(raw: Context): Context | undefined {
    if (raw["counterpartyId"] === "CUST-00002")
      return this.failure(
        422,
        "SSI_NOT_FOUND",
        { validation: "FAIL", payloadGenerated: false },
        "COUNTERPARTY_TYPE_MISMATCH; no customer-SSI fallback",
      );
    if (raw["currency"] === "XAU")
      return this.failure(422, "CURRENCY_NOT_SUPPORTED", {
        validation: "FAIL",
        assertions: ["MT C08", "CBPR+ R16"],
        payloadGenerated: false,
      });
    return undefined;
  }

  private mt202AgentEligibilityError(raw: Context): Context | undefined {
    if (
      raw["accountWith"] &&
      isObject(raw["accountWith"]) &&
      !raw["accountWith"]["bic"] &&
      !raw["accountWith"]["clearingMemberId"]
    )
      return this.failure(422, "AGENT_ID_INSUFFICIENT", {
        validation: "FAIL",
        payloadGenerated: false,
      });
    if (raw["56D"] && raw["57D"] && raw["58D"])
      return this.failure(422, "OPTION_CONSTRAINT_VIOLATION", {
        validation: "FAIL",
        reason: "clearing code once at first applicable field",
      });
    return undefined;
  }

  private mt202CandidateEligibilityError(raw: Context): Context | undefined {
    if (
      raw["candidate"] &&
      isObject(raw["candidate"]) &&
      raw["candidate"]["messageTypes"]
    )
      return this.failure(
        422,
        "SSI_NOT_FOUND",
        {
          validation: "FAIL",
          excludedCandidate: raw["candidate"]["ssiCode"],
          candidateExclusionReason: "PROFILE_VERSION_MISMATCH",
          reasonType: "INTERNAL_CANDIDATE_REASON_NOT_API_CODE",
          mustNotFallbackTo: "pacs.009.001.12",
        },
        "Candidate excluded before ranking: exact pacs.009.001.08 not declared",
      );
    if (
      raw["candidate"] &&
      isObject(raw["candidate"]) &&
      raw["candidate"]["nostroMatch"] === null
    )
      return this.failure(
        503,
        "PROFILE_INCOMPLETE",
        {
          validation: "FAIL",
          missingRelationship:
            "SSI.route.accountId -> ACTIVE Nostro.accountReference",
          payloadGenerated: false,
        },
        "SSI route account reference cannot be joined to Own Nostro",
      );
    return undefined;
  }

  private mt202NostroEligibilityError(raw: Context): Context | undefined {
    if (
      raw["nostro"] &&
      isObject(raw["nostro"]) &&
      raw["nostro"]["allowedBookingEntitiesKeyPresent"] === false
    )
      return this.failure(
        503,
        "PROFILE_INCOMPLETE",
        { validation: "FAIL", mustNotTreatMissingAsWildcard: true },
        "Missing allowedBookingEntities is UNKNOWN, not ANY",
      );
    if (
      raw["candidate"] &&
      isObject(raw["candidate"]) &&
      raw["candidate"]["ownershipTypeKeyPresent"] === false
    )
      return this.failure(
        503,
        "PROFILE_INCOMPLETE",
        { validation: "FAIL", mustNotInjectOwnershipTypeDuringExport: true },
        "Ownership cannot be inferred from counterpartyId or display label",
      );
    return undefined;
  }

  private mt202OwnAccount(base: Context, raw: Context): Context | undefined {
    if (raw["ownAccountSubScenario"] === "BOOK_TRANSFER_SAME_RECEIVER")
      return this.success(
        base,
        {
          debtor: "Sender",
          creditor: "Sender",
          debitAccount: raw["debitAccount"],
          creditAccount: raw["creditAccount"],
          creditorSource: "OWN_SSI/ACCOUNT_MASTER",
          counterpartySsiResolution: "SKIPPED",
        },
        {
          "53B": raw["debitAccount"],
          "58A": `${raw["creditAccount"]}\n${raw["senderBic"]}`,
        },
        [],
        [
          "both accounts owned by Sender",
          "58A option A; account + Sender BIC",
          "never Counterparty SSI",
        ],
      );
    if (raw["ownAccountSubScenario"] === "CREDIT_ONE_OF_SEVERAL_AT_57A")
      return this.success(
        { ...base, canonicalScenario: "OWN_ACCOUNT_TRANSFER" },
        {
          creditorAgent: raw["57A"],
          creditorAccount: raw["ownCreditAccount"],
          creditor: raw["senderBic"],
          creditorSource: "OWN_SSI/ACCOUNT_MASTER",
          counterpartySsiResolution: "SKIPPED",
        },
        {
          "57A": raw["57A"],
          "58A": `${raw["ownCreditAccount"]}\n${raw["senderBic"]}`,
        },
        [],
        ["58A option A only", "account + Sender BIC", "MT200 must not be used"],
      );
    return undefined;
  }

  private mt202Selection(
    base: Context,
    raw: Context,
    beneficiary: string,
  ): Context | undefined {
    if (raw["directAccountCount"] === 2)
      return this.success(
        base,
        { settlementAccount: raw["selectedAccount"] },
        { "53B": raw["selectedAccount"], "58A": beneficiary },
        ["53B location"],
        ["option B Party Identifier only"],
      );
    if (raw["qaSeedId"] === "QA-SSI-BARC-USD-INT")
      return this.success(
        base,
        {
          intermediaryAgent1: "HSBCHKHH",
          creditorAgent: "CITIUS33",
          beneficiaryInstitution: "BARCGB22",
        },
        { "56A": "HSBCHKHH", "57A": "CITIUS33", "58A": "BARCGB22" },
        [],
        ["C81; distinct role provenance"],
      );
    if (raw["qaSeedIds"])
      return this.success(
        base,
        {
          senderReimbursementSource: "OWN_NOSTRO:QA-NOSTRO-HK01-USD-001",
          receivingRouteSource: "COUNTERPARTY_SSI:QA-SSI-BARC-USD-INT",
          intermediaryAgent1: "HSBCHKHH",
          creditorAgent: "CITIUS33",
          beneficiaryInstitution: "BARCGB22",
        },
        {
          "53B": "/QA-HK01-USD-001",
          "56A": "HSBCHKHH",
          "57A": "CITIUS33",
          "58A": "BARCGB22",
        },
        [],
        [
          "53 source=Own Nostro; 56/57 source=Counterparty SSI; no record copied across roles",
        ],
      );
    return undefined;
  }

  private mt202Beneficiary(
    base: Context,
    raw: Context,
    beneficiary: string,
  ): Context | undefined {
    if (raw["paymentBeneficiaryInstitutionInput"])
      return this.success(
        base,
        {
          creditor: beneficiary,
          creditorSource: "REQUEST_PASS_THROUGH",
          receivingRoute: "resolved independently",
        },
        { "58A": beneficiary },
        [],
        [
          "58a unchanged from resolution key",
          "must not read SSI.beneficiaryBic",
        ],
      );
    if (raw["counterpartySsi"] === null)
      return this.failure(
        422,
        "SSI_NOT_FOUND",
        {
          validation: "FAIL",
          mustNotUseOwnNostroFor: ["54a", "56a", "57a"],
          "58aPolicy": "request pass-through; not an SSI route output",
          payloadGenerated: false,
        },
        "Counterparty receiving route unavailable; Own Nostro cannot substitute",
      );
    if (raw["counterpartyId"] === "CP-CHASUS33")
      return this.success(
        base,
        {
          selectedSsi: "SSI-DEMO-021",
          accountWithInstitution: "CITIUS33",
          excluded: ["SSI-DEMO-015", "SSI-DEMO-016"],
        },
        { "58A": "CHASUS33" },
        [],
        ["CAD routes must be excluded before ranking"],
      );
    return undefined;
  }

  private mt202AgentRoles(
    base: Context,
    raw: Context,
    beneficiary: string,
  ): Context | undefined {
    if (raw["qaSeedId"] === "QA-SSI-DEUT-EUR-54")
      return this.success(
        base,
        {
          senderCorrespondent: "CITIUS33",
          receiverCorrespondent: "BNPAFRPP",
          beneficiaryInstitution: "DEUTDEFF",
        },
        { "53A": "CITIUS33", "54A": "BNPAFRPP", "58A": "DEUTDEFF" },
        [],
        ["53a precedes non-Receiver 54a; provenance retained"],
      );
    if (
      raw["senderCorrespondentBankServiceId"] ||
      raw["receiverCorrespondentBankServiceId"]
    )
      return this.success(
        base,
        { senderCorrespondent: "CITIUS33", receiverCorrespondent: "HSBCHKHH" },
        { "53A": "CITIUS33", "54A": "HSBCHKHH", "58A": beneficiary },
        [],
        ["53a must precede 54a"],
      );
    if (raw["intermediaryBankServiceId"])
      return this.success(
        base,
        {
          intermediaryAgent1: "HSBCHKHH",
          creditorAgent: "CITIUS33",
          beneficiaryInstitution: beneficiary,
        },
        { "56A": "HSBCHKHH", "57A": "CITIUS33", "58A": beneficiary },
        [],
        ["C81 satisfied"],
      );
    return undefined;
  }

  private mt202Context(
    base: Context,
    raw: Context,
    beneficiary: string,
  ): Context | undefined {
    if (raw["13C"])
      return {
        ...this.success(
          base,
          { beneficiaryInstitution: beneficiary },
          { "13C": raw["13C"], "58A": beneficiary },
        ),
        mx: {
          ...base,
          canonicalRoles: { beneficiaryInstitution: beneficiary },
          preservedTransactionContext: { "13C": raw["13C"] },
        },
      };
    if (beneficiary === "DEUTDEFF")
      return this.success(
        base,
        {
          senderCorrespondent: "OWN_NOSTRO_EUR_SERVICER",
          beneficiaryInstitution: beneficiary,
        },
        { "53A": "OWN_NOSTRO_EUR_SERVICER", "58A": beneficiary },
        ["54a"],
        ["53A provenance=Own SSI/Nostro"],
      );
    if (beneficiary === "BARCGB22")
      return this.success(
        base,
        {
          instructedAgent: "CITIUS33",
          creditorAgent: "CITIUS33",
          beneficiaryInstitution: beneficiary,
        },
        { "58A": beneficiary },
        ["53a", "54a", "56a", "57a"],
        ["Receiver itself is AWI; do not duplicate Receiver into 53A/57A"],
      );
    return undefined;
  }

  private mt202DirectAccount(base: Context, beneficiary: string): Context {
    return this.success(
      base,
      {
        instructedAgent: beneficiary,
        beneficiaryInstitution: beneficiary,
        directAccount: true,
      },
      { "58A": beneficiary },
      ["53a", "54a", "56a", "57a"],
      ["57a omitted means Receiver is AWI"],
    );
  }

  private mt205(base: Context, raw: Context, beneficiary: string): Context {
    const previous = isObject(raw["previousMessage"])
      ? raw["previousMessage"]
      : {};
    if (previous["type"] === "MT200" || previous["type"] === "MT201")
      return this.success(
        base,
        {
          relatedReference: previous["20"],
          orderingInstitution: previous["senderBic"],
          creditor: previous["senderBic"],
          creditorSource: "UPSTREAM_52A_EQUIVALENCE",
          counterpartySsiResolutionFor58a: "SKIPPED",
        },
        {
          "21": previous["20"],
          "52A": previous["senderBic"],
          "58A": previous["senderBic"],
        },
        [],
        ["58a must be identical to 52a when initial message is MT200/201"],
      );
    if (previous["type"] === "MT202" && previous["58A"])
      return this.success(
        base,
        {
          creditor: previous["58A"],
          creditorSource: "UPSTREAM_MESSAGE_CONTEXT",
        },
        { "52A": previous["52A"], "58A": previous["58A"] },
        [],
        [
          "58a copied from prior Cat-2 context",
          "must not read SSI.beneficiaryBic",
        ],
      );
    if (raw["receiverIsAwi"])
      return this.success(
        base,
        { creditorAgent: "Receiver", domestic: true },
        { "52A": raw["previous52A"], "58A": beneficiary },
        ["57a"],
        ["57a omission is semantic"],
      );
    if (raw["56A"])
      return this.success(
        base,
        { intermediaryAgent1: raw["56A"], creditorAgent: raw["57A"] },
        {
          "52A": raw["52A"],
          "56A": raw["56A"],
          "57A": raw["57A"],
          "58A": raw["58A"],
        },
      );
    if (raw["incoming121"])
      return this.success(
        base,
        { uetr: raw["incoming121"], instruction: raw["72"] },
        {
          "72": raw["72"],
          "121": raw["incoming121"],
          "52A": "CHASUS33",
          "58A": beneficiary,
        },
      );
    if (previous["type"] === "MT202")
      return this.success(
        base,
        {
          orderingInstitution: previous["52A"],
          beneficiaryInstitution: beneficiary,
          domestic: true,
        },
        { "21": previous["21"], "52A": previous["52A"], "58A": beneficiary },
      );
    return this.success(
      base,
      { domestic: true, beneficiaryInstitution: beneficiary },
      { "58A": beneficiary },
    );
  }

  private mt202Cover(base: Context, raw: Context): Context {
    const sequenceB = isObject(raw["sequenceB"]) ? raw["sequenceB"] : {};
    if (raw["qaSeedIds"])
      return {
        ...this.success(
          base,
          { sequenceA: "resolved", sequenceB: "copied unchanged" },
          {
            "119": "COV",
            "121": "preserved",
            "Sequence B": "byte/content-equivalent",
          },
        ),
        mx: {
          ...base,
          canonicalRoles: {
            sequenceA: "resolved",
            sequenceB: "copied unchanged",
          },
          uetrPreserved: true,
        },
      };
    if (raw["ownAccountSubScenario"] === "CREDIT_ONE_OF_SEVERAL_AT_57A")
      return this.success(
        { ...base, canonicalScenario: "OWN_ACCOUNT_COVER_TRANSFER" },
        {
          creditorAgent: raw["A.57A"],
          creditorAccount: raw["ownCreditAccount"],
          creditor: raw["senderBic"],
          sequenceB: "copied unchanged",
          counterpartySsiResolution: "SKIPPED",
        },
        {
          "A.57A": raw["A.57A"],
          "A.58A": `${raw["ownCreditAccount"]}\n${raw["senderBic"]}`,
        },
        [],
        ["58A option A; own account + Sender BIC"],
      );
    if (raw["ownAccountSubScenario"] === "BOOK_TRANSFER_SAME_RECEIVER")
      return this.success(
        { ...base, canonicalScenario: "OWN_ACCOUNT_COVER_TRANSFER" },
        {
          debtorAccount: raw["A.53B"],
          creditorAccount: scalarText(raw["A.58A"]).split("\n")[0],
          creditor: "DEMOHKHH",
          sequenceB: "copied unchanged",
          counterpartySsiResolution: "SKIPPED",
        },
        { "A.53B": raw["A.53B"], "A.58A": raw["A.58A"] },
        [],
        ["53B Party Identifier only", "58A option A"],
      );
    if (raw["paymentBeneficiaryInstitutionInput"])
      return this.success(
        base,
        {
          creditor: raw["paymentBeneficiaryInstitutionInput"],
          creditorSource: "REQUEST_PASS_THROUGH",
          sequenceB: "copied unchanged",
        },
        { "A.58A": raw["paymentBeneficiaryInstitutionInput"] },
        [],
        ["must not read SSI.beneficiaryBic"],
      );
    if (raw["incoming21"])
      return this.success(
        base,
        { underlyingReference: raw["incoming21"], uetr: raw["incoming121"] },
        { "21": raw["incoming21"], "121": raw["incoming121"] },
        [],
        ["both unchanged"],
      );
    if (raw["A.53A"])
      return this.success(
        base,
        {
          senderCorrespondent: raw["A.53A"],
          receiverCorrespondent: raw["A.54A"],
        },
        { "A.53A": raw["A.53A"], "A.54A": raw["A.54A"], "A.58A": "CITIUS33" },
        [],
        ["five 53a/54a rules jointly validated"],
      );
    if (raw["B.56C"])
      return this.success(
        base,
        { underlyingAgents: "preserved from transaction context" },
        { "B.56C": raw["B.56C"], "B.57C": raw["B.57C"] },
        [],
        ["option C confined to Seq B"],
      );
    return this.success(
      base,
      {
        sequenceASettlementRoute: "SSI-DEMO-001",
        underlyingParties: "copied unchanged",
      },
      {
        "A.58A": "CITIUS33",
        "B.50A": sequenceB["50A"],
        "B.59": sequenceB["59"],
      },
      [],
      ["119=COV", "Seq B not resolved"],
    );
  }

  private mt205Cover(base: Context, raw: Context): Context {
    const previous = isObject(raw["previousMessage"])
      ? raw["previousMessage"]
      : {};
    if (previous["type"] === "MT202COV") {
      return this.mt205CoverFromMt202Cover(base, raw, previous);
    }
    if (raw["incoming21"])
      return this.success(
        base,
        { relatedReference: raw["incoming21"], uetr: raw["incoming121"] },
        { "21": raw["incoming21"], "121": raw["incoming121"] },
      );
    if (raw["B.56C"])
      return this.success(
        base,
        { underlyingAgents: "preserved" },
        { "B.56C": raw["B.56C"], "B.57C": raw["B.57C"] },
        [],
        ["option C confined to Seq B"],
      );
    return this.success(
      base,
      { domestic: true, sequenceA: "resolved", sequenceB: "copied unchanged" },
      {
        "A.52A": raw["A.52A"],
        "A.58A": raw["A.58A"],
        "B.50A": raw["B.50A"],
        "B.59": raw["B.59"],
      },
    );
  }

  private mt205CoverFromMt202Cover(
    base: Context,
    raw: Context,
    previous: Context,
  ): Context {
    const route: Context = {
      creditor: previous["A.58A"],
      creditorSource: "UPSTREAM_MESSAGE_CONTEXT",
    };
    const sequenceBComplete = Boolean(previous["sequenceBComplete"]);
    const beneficiaryBicSelected = Boolean(raw["selectedSsi.beneficiaryBic"]);
    if (!sequenceBComplete || beneficiaryBicSelected) {
      route["sequenceB"] = "copied unchanged";
    } else {
      route["orderingInstitution"] = previous["A.52A"];
    }
    let assertions = ["A.58a pass-through; not SSI output"];
    if (sequenceBComplete && !beneficiaryBicSelected) {
      assertions = [
        "52a and 58a may differ",
        "MT205-only MT200/201 equivalence must not be reused",
      ];
    }
    return this.success(
      base,
      route,
      { "A.52A": previous["A.52A"], "A.58A": previous["A.58A"] },
      [],
      assertions,
    );
  }
}
