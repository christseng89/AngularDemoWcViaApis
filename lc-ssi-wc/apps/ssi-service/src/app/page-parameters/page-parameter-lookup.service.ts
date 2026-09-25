import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import type {
  PageParameterLookupEnvelope,
  PageParameterLookupResult,
} from "@ssi/contracts";
import { BankServiceDirectory } from "../bank-service-directory";
import { FinControlledFixtureService } from "../fin-controlled-fixture.service";
import { ResolutionPageScenarioCatalogueService } from "./resolution-page-scenario-catalogue.service";
import { PageParameterLookupDefaultsService } from "./page-parameter-lookup-defaults.service";
import { PaymentResolutionPageDefinitionSource } from "./payment-resolution-page-definition.source";
import {
  PaymentGovernedApplicabilityService,
  type PaymentAtomicRouteCandidate,
} from "./payment-governed-applicability.service";
import type { SsiRecord } from "../sqlite-ssi.repository";
import { NostroApplicationService } from "../nostro/nostro-application.service";
import type { NostroRecord } from "../nostro/nostro.repository";
import {
  eligiblePaymentOwnAccounts,
  paymentOwnAccountScenario,
  resolvePaymentOwnAccountPair,
} from "./payment-own-account-eligibility.policy";
import type {
  ResolutionPageConfiguredScenario,
  ResolutionPageScenarioDefinition,
} from "./resolution-page-scenario-catalogue.service";
import { hashCanonical } from "../canonical-json";
import { Mt1SsiResolutionPageDefinitionSource } from "./mt1-ssi-resolution-page-definition.source";
import { Mt1SsiDemoRouteRepository } from "../mt1-ssi-demo-route.repository";
import { EntityRepository } from "../entity/entity.repository";
import { mt2ControlledProfile } from "../mt2-settlement-request.policy";

interface SsiCounterpartyLookupQuery {
  readonly scenarioId: string;
  readonly messageType: string;
  readonly sequence: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly query?: string;
}

interface OwnAccountLookupQuery {
  readonly scenarioId: string;
  readonly messageType: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly receiverBankServiceId?: string;
  readonly ownDebitAccountId?: string;
  readonly targetRole?: string;
  readonly query?: string;
}

const REQUIRED_COUNTERPARTY_CONTEXT = [
  "scenarioId",
  "messageType",
  "sequence",
  "currency",
  "bookingEntity",
  "valueDate",
] as const;
const PAYMENT_MESSAGES = new Set(["MT202", "MT202COV", "MT205", "MT205COV"]);

const requireCounterpartyContext = (
  input: SsiCounterpartyLookupQuery,
): void => {
  const missing = REQUIRED_COUNTERPARTY_CONTEXT.find(
    (key) => !input[key]?.trim(),
  );
  if (missing)
    throw new BadRequestException({
      code: "SSI_COUNTERPARTY_CONTEXT_REQUIRED",
      field: missing,
    });
};

const assertMatchingScenario = (
  input: SsiCounterpartyLookupQuery,
  scenario: ResolutionPageConfiguredScenario | undefined,
  profile: ResolutionPageScenarioDefinition | undefined,
): {
  readonly scenario: ResolutionPageConfiguredScenario;
  readonly profile: ResolutionPageScenarioDefinition;
} => {
  if (!scenario || !profile)
    throw new BadRequestException({
      code: "SSI_COUNTERPARTY_SCENARIO_MISMATCH",
    });
  if (
    profile.messageType !== input.messageType ||
    profile.sequence !== input.sequence
  )
    throw new BadRequestException({
      code: "SSI_COUNTERPARTY_SCENARIO_MISMATCH",
    });
  return { scenario, profile };
};

@Injectable()
export class PageParameterLookupService {
  constructor(
    private readonly directory: BankServiceDirectory,
    private readonly fixtures: FinControlledFixtureService,
    private readonly scenarios: ResolutionPageScenarioCatalogueService,
    @Optional()
    private readonly defaults?: PageParameterLookupDefaultsService,
    @Optional()
    private readonly paymentSource?: PaymentResolutionPageDefinitionSource,
    @Optional()
    private readonly paymentApplicability?: PaymentGovernedApplicabilityService,
    @Optional()
    private readonly nostros?: NostroApplicationService,
    @Optional()
    private readonly mt1Source?: Mt1SsiResolutionPageDefinitionSource,
    @Optional()
    private readonly mt1Routes?: Mt1SsiDemoRouteRepository,
    @Optional()
    private readonly entities?: EntityRepository,
  ) {}

  bankService(bankServiceId: string | undefined): PageParameterLookupResult {
    const bank = this.directory.resolve(bankServiceId);
    return {
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      displayValue: bank.bic,
    };
  }

  bankServices(query = ""): PageParameterLookupEnvelope {
    return {
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      items: this.directory.search(query).map((bank) => ({
        provider: "BANK_SERVICE",
        action: "BANK_SERVICE",
        bankServiceId: bank.bankServiceId,
        bic: bank.bic,
        displayValue: bank.bic,
      })),
    };
  }

  ownAccountReceivers(
    input: OwnAccountLookupQuery,
  ): PageParameterLookupEnvelope {
    const eligible = this.eligibleOwnAccounts(input);
    const scenario = paymentOwnAccountScenario(input.scenarioId);
    if (!scenario)
      throw new BadRequestException({ code: "OWN_ACCOUNT_CONTEXT_REQUIRED" });
    const receiverBics = new Set(
      eligible
        .map(({ accountServicerBic }) => accountServicerBic)
        .filter((bic) => resolvePaymentOwnAccountPair(eligible, scenario, bic)),
    );
    const candidates = eligible.filter(({ accountServicerBic }) =>
      receiverBics.has(accountServicerBic),
    );
    const term = input.query?.trim().toUpperCase() ?? "";
    const byId = new Map<string, PageParameterLookupResult>();
    for (const account of candidates) {
      const bank = this.directory
        .search(account.accountServicerBic)
        .find(({ bic }) => bic === account.accountServicerBic);
      if (
        !bank ||
        (term &&
          ![bank.bic, bank.name].some((value) =>
            value.toUpperCase().includes(term),
          ))
      )
        continue;
      byId.set(bank.bankServiceId, {
        provider: "BANK_SERVICE",
        action: "BANK_SERVICE",
        bankServiceId: bank.bankServiceId,
        bic: bank.bic,
        displayValue: `${bank.bic} — ${bank.name}`,
        bankName: bank.name,
      });
    }
    const items = [...byId.values()];
    const preferred = candidates[0];
    const preferredBank = preferred
      ? this.directory
          .search(preferred.accountServicerBic)
          .find(({ bic }) => bic === preferred.accountServicerBic)
      : undefined;
    return {
      provider: "BANK_SERVICE",
      action: "BANK_SERVICE",
      items,
      ...(!term && preferredBank
        ? {
            defaultSelection: {
              valueField: "bankServiceId" as const,
              value: preferredBank.bankServiceId,
              reasonCode: "GOVERNED_PRIORITY_DEFAULT" as const,
              dependency: {
                fieldId: "context.currency",
                value: input.currency,
              },
            },
          }
        : {}),
    };
  }

  nostroAccounts(input: OwnAccountLookupQuery): PageParameterLookupEnvelope {
    const receiver = this.directory.resolve(input.receiverBankServiceId);
    const debit = input.targetRole === "OWN_DEBIT_ACCOUNT";
    const credit = input.targetRole === "OWN_CREDIT_ACCOUNT";
    if (!debit && !credit)
      throw new BadRequestException({ code: "OWN_ACCOUNT_ROLE_INVALID" });
    const term = input.query?.trim().toUpperCase() ?? "";
    const debitRecord = input.ownDebitAccountId
      ? this.nostros?.list().find(({ id }) => id === input.ownDebitAccountId)
      : undefined;
    const accounts = this.eligibleOwnAccounts(input).filter((record) => {
      const sameReceiver = record.accountServicerBic === receiver.bic;
      if (debit) return sameReceiver;
      if (
        record.id === debitRecord?.id ||
        record.accountReference === debitRecord?.accountReference
      )
        return false;
      return input.scenarioId.endsWith("-OP-BOOK")
        ? sameReceiver
        : !sameReceiver;
    });
    const items = accounts
      .filter(
        (record) =>
          !term ||
          [record.maskedAccountRef, record.accountServicerBic].some((value) =>
            value.toUpperCase().includes(term),
          ),
      )
      .map((record) => ({
        provider: "NOSTRO_ACCOUNT" as const,
        action: "NOSTRO_ACCOUNT" as const,
        nostroId: record.id,
        version: record.version,
        accountServicerBic: record.accountServicerBic,
        maskedAccountRef: record.maskedAccountRef,
        displayValue: `${record.maskedAccountRef} — ${record.accountServicerBic}`,
      }));
    const preferred = items[0];
    return {
      provider: "NOSTRO_ACCOUNT",
      action: "NOSTRO_ACCOUNT",
      items,
      ...(!term && preferred
        ? {
            defaultSelection: {
              valueField: "nostroId" as const,
              value: preferred.nostroId,
              reasonCode: "GOVERNED_PRIORITY_DEFAULT" as const,
              dependency: {
                fieldId: "context.receiverBankServiceId",
                value: input.receiverBankServiceId ?? "",
              },
              companionValues: { version: preferred.version },
            },
          }
        : {}),
    };
  }

  private eligibleOwnAccounts(
    input: OwnAccountLookupQuery,
  ): readonly NostroRecord[] {
    const governedScenario = PAYMENT_MESSAGES.has(input.messageType)
      ? this.paymentSource?.scenarioPolicy(input.messageType, input.scenarioId)
      : undefined;
    if (
      !this.nostros ||
      !governedScenario ||
      !input.currency ||
      !input.bookingEntity ||
      !input.valueDate
    )
      throw new BadRequestException({ code: "OWN_ACCOUNT_CONTEXT_REQUIRED" });
    return eligiblePaymentOwnAccounts(this.nostros.list(), input);
  }

  ssiCounterparties(
    input: SsiCounterpartyLookupQuery,
  ): PageParameterLookupEnvelope {
    requireCounterpartyContext(input);
    const term = input.query?.trim().toUpperCase() ?? "";
    if (input.scenarioId.includes(":MT1-"))
      return this.mt1Counterparties(input);
    if (PAYMENT_MESSAGES.has(input.messageType))
      return this.paymentCounterparties(input, term);
    const governed = this.scenarios.get();
    const scenario = governed.scenarios.find(
      ({ scenarioId }) => scenarioId === input.scenarioId,
    );
    const profile = governed.definitions.find(
      ({ profileId }) => profileId === scenario?.profileId,
    );
    const matched = assertMatchingScenario(input, scenario, profile);
    const eligible = this.eligibleCounterparties(
      input,
      matched.scenario,
      matched.profile,
    );
    const configuredDefault = this.defaults?.find({
      ...input,
      polarity: matched.scenario.polarity,
      expectedHttp: matched.scenario.expectedHttp,
    });
    if (
      configuredDefault &&
      !eligible.some(
        ({ bankServiceId }) =>
          bankServiceId === configuredDefault.defaultBankServiceId,
      )
    )
      throw new BadRequestException({
        code: "SSI_COUNTERPARTY_DEFAULT_NOT_ELIGIBLE",
      });
    const items = term
      ? eligible.filter(({ bic, bankName = "" }) =>
          [bic ?? "", bankName].some((value) =>
            value.toUpperCase().includes(term),
          ),
        )
      : eligible;
    return {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      items,
      ...(!term && configuredDefault
        ? {
            defaultSelection: {
              valueField: "bankServiceId" as const,
              value: configuredDefault.defaultBankServiceId,
              reasonCode: "GOVERNED_CURRENCY_DEFAULT" as const,
              dependency: {
                fieldId: "context.currency" as const,
                value: input.currency,
              },
            },
          }
        : {}),
    };
  }

  private mt1Counterparties(
    input: SsiCounterpartyLookupQuery,
  ): PageParameterLookupEnvelope {
    const definition = this.mt1Source
      ?.all("SR2026")
      .find(({ scenarios }) =>
        scenarios.some(({ scenarioId }) => scenarioId === input.scenarioId),
      );
    const scenario = definition?.scenarios.find(
      ({ scenarioId }) => scenarioId === input.scenarioId,
    );
    if (!definition || !scenario || !this.mt1Routes)
      throw new BadRequestException({
        code: "SSI_COUNTERPARTY_SCENARIO_MISMATCH",
      });
    return this.mt1Routes.lookup({
      ...input,
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      fixtureBindingId: scenario.fixture.bindingId,
      profileId: definition.profile.profileId,
      businessService: definition.profile.businessService ?? "",
      settlementContext: String(
        scenario.inputValues?.["context.settlementContext"] ?? "",
      ) as "INDA" | "INGA" | "COVE",
      resolutionMessageType:
        definition.profile.messageDefinitionId ?? "pacs.008.001.08",
    });
  }

  private paymentCounterparties(
    input: SsiCounterpartyLookupQuery,
    term: string,
  ): PageParameterLookupEnvelope {
    const scenario = this.paymentSource?.scenarioPolicy(
      input.messageType,
      input.scenarioId,
    );
    if (
      !scenario?.sequenceIds.includes(input.sequence) ||
      !this.paymentApplicability
    )
      throw new BadRequestException({
        code: "SSI_COUNTERPARTY_SCENARIO_MISMATCH",
      });
    const query = {
      messageType: input.messageType,
      currency: input.currency,
      bookingEntity: input.bookingEntity,
      valueDate: input.valueDate,
    };
    const definition =
      typeof this.paymentSource?.all === "function"
        ? this.paymentSource
            .all("SR2026")
            .find(({ messageType }) => messageType === input.messageType)
        : undefined;
    const pageScenario = definition?.scenarios.find(
      ({ scenarioId }) => scenarioId === input.scenarioId,
    );
    const contextSha256 = hashCanonical({
      scenarioId: input.scenarioId,
      messageType: input.messageType,
      sequence: input.sequence,
      currency: input.currency,
      bookingEntity: input.bookingEntity,
      valueDate: input.valueDate,
      fixtureBindingId: pageScenario?.fixture.bindingId ?? "",
    });
    const hasAtomic =
      typeof this.paymentApplicability.atomicCandidates === "function";
    const atomic =
      this.paymentApplicability.atomicCandidates?.({
        ...query,
        ...(pageScenario
          ? {
              fixtureBindingId: pageScenario.fixture.bindingId,
              servicerRelationship: pageScenario.servicerRelationship,
            }
          : {}),
      }) ?? [];
    const unfilteredSource: Array<{
      record: SsiRecord;
      candidate?: PaymentAtomicRouteCandidate;
    }> = hasAtomic
      ? atomic.map((candidate) => ({ record: candidate.ssi, candidate }))
      : this.paymentApplicability
          .candidates(query)
          .map((record) => ({ record }));
    const source = unfilteredSource.filter((entry) =>
      this.mt205JurisdictionEligible(input, entry.record),
    );
    const routes = source.flatMap((entry) => {
      const route = this.paymentRouteResult(
        entry,
        definition,
        pageScenario,
        contextSha256,
        input,
      );
      return route ? [route] : [];
    });
    const items = routes
      .filter(
        ({ bic, bankName = "" }) =>
          !term ||
          [bic ?? "", bankName].some((value) =>
            value.toUpperCase().includes(term),
          ),
      )
      .sort((left, right) => (left.bic ?? "").localeCompare(right.bic ?? ""));
    const ranked = source
      .filter(
        (entry) =>
          entry.candidate &&
          Number.isInteger(entry.candidate.nostro.priority) &&
          items.some(
            ({ bic }) => bic === entry.record.route["counterpartyBic"],
          ),
      )
      .sort(
        (left, right) =>
          left.candidate!.nostro.priority - right.candidate!.nostro.priority,
      );
    const eligibleDefault =
      ranked.length &&
      (ranked.length === 1 ||
        ranked[0]!.candidate!.nostro.priority <
          ranked[1]!.candidate!.nostro.priority)
        ? items.find(
            ({ bic }) => bic === ranked[0]!.record.route["counterpartyBic"],
          )
        : undefined;
    return {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      items,
      ...(atomic[0]
        ? {
            eligibilitySnapshot: {
              snapshotId: atomic[0].snapshot.sha256,
              snapshotIdentityMethod: atomic[0].snapshot.method,
              contextSha256,
            },
          }
        : {}),
      ...(!term &&
      eligibleDefault?.bankServiceId &&
      items.filter(
        ({ bankServiceId }) => bankServiceId === eligibleDefault.bankServiceId,
      ).length === 1
        ? {
            defaultSelection: {
              valueField: "bankServiceId" as const,
              value: eligibleDefault.bankServiceId,
              reasonCode: "GOVERNED_PRIORITY_DEFAULT" as const,
              dependency: {
                fieldId: "context.currency" as const,
                value: input.currency,
              },
            },
          }
        : {}),
    };
  }

  private mt205JurisdictionEligible(
    input: SsiCounterpartyLookupQuery,
    record: SsiRecord,
  ): boolean {
    if (!input.messageType.startsWith("MT205") || !this.entities) return true;
    const sender = this.entities
      .list("ACTIVE")
      .find(
        (entity) =>
          entity.branchCode === input.bookingEntity &&
          entity.validFrom <= input.valueDate &&
          (!entity.validTo || entity.validTo >= input.valueDate),
      );
    if (!sender) return false;
    const receiverBic =
      record.route["actualReceiverBic"] ??
      record.route["accountWithBic"] ??
      record.route["counterpartyBic"] ??
      "";
    const receiver = this.directory
      .search(receiverBic)
      .find((bank) => bank.bic === receiverBic);
    return Boolean(
      receiver?.country && receiver.country === sender.countryCode,
    );
  }

  private paymentRouteResult(
    entry: {
      readonly record: SsiRecord;
      readonly candidate?: PaymentAtomicRouteCandidate;
    },
    definition:
      | { readonly definitionId: string; readonly definitionVersion: string }
      | undefined,
    pageScenario:
      { readonly fixture: { readonly bindingId: string } } | undefined,
    contextSha256: string,
    input: SsiCounterpartyLookupQuery,
  ): PageParameterLookupResult | undefined {
    const bic = entry.record.route["counterpartyBic"];
    if (!bic) return undefined;
    const bank = this.directory.search(bic).find((item) => item.bic === bic);
    if (!bank) return undefined;
    const candidate = entry.candidate;
    const actualReceiverBic =
      entry.record.route["actualReceiverBic"] ??
      entry.record.route["accountWithBic"] ??
      "";
    const actualReceiver = this.directory
      .search(actualReceiverBic)
      .find((item) => item.bic === actualReceiverBic);
    const senderEntity = this.entities
      ?.list("ACTIVE")
      .find(
        (entity) =>
          entity.branchCode === input.bookingEntity &&
          entity.validFrom <= input.valueDate &&
          (!entity.validTo || entity.validTo >= input.valueDate),
      );
    const candidateContextSha256 = candidate
      ? hashCanonical({
          baseContextSha256: contextSha256,
          databaseSnapshot: candidate.snapshot,
          ssi: { id: candidate.ssi.id, version: candidate.ssi.version },
          applicability: {
            id: candidate.applicability.id,
            version: candidate.applicability.version,
          },
          nostro: candidate.nostro,
          rma: candidate.rma,
          profile: mt2ControlledProfile(input.messageType),
          route: {
            actualReceiverBic,
            accountWithBic: entry.record.route["accountWithBic"] ?? "",
            executionTransport: entry.record.route["messagingService"] ?? "",
          },
          jurisdiction: {
            senderSourceId: senderEntity?.id ?? "",
            senderSourceVersion: senderEntity?.version ?? 0,
            senderCountry: senderEntity?.countryCode ?? "",
            receiverSourceId: actualReceiver?.bankServiceId ?? "",
            receiverCountry: actualReceiver?.country ?? "",
          },
          topologyRuling: {
            id: "BA-TOPOLOGY-INDA-INGA-001",
            version: "1.0.0",
          },
        })
      : contextSha256;
    const selectedRouteIdentity =
      candidate && definition && pageScenario
        ? {
            routeId: hashCanonical({
              ssi: { id: candidate.ssi.id, version: candidate.ssi.version },
              applicability: {
                id: candidate.applicability.id,
                version: candidate.applicability.version,
              },
              nostro: {
                id: candidate.nostro.id,
                version: candidate.nostro.version,
              },
              rma: candidate.rma,
              contextSha256: candidateContextSha256,
            }),
            definitionId: definition.definitionId,
            definitionVersion: definition.definitionVersion,
            fixtureBindingId: pageScenario.fixture.bindingId,
            contextSha256: candidateContextSha256,
            ssi: { id: candidate.ssi.id, version: candidate.ssi.version },
            applicability: {
              id: candidate.applicability.id,
              version: candidate.applicability.version,
            },
            nostro: {
              id: candidate.nostro.id,
              version: candidate.nostro.version,
            },
            rma: candidate.rma,
          }
        : undefined;
    return {
      provider: "SSI_COUNTERPARTY",
      action: "SSI_COUNTERPARTY",
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      displayValue: `${bank.bic} — ${bank.name}`,
      bankName: bank.name,
      ...(selectedRouteIdentity ? { selectedRouteIdentity } : {}),
    };
  }

  private eligibleCounterparties(
    input: SsiCounterpartyLookupQuery,
    scenario: ResolutionPageConfiguredScenario,
    profile: ResolutionPageScenarioDefinition,
  ): readonly PageParameterLookupResult[] {
    const byId = new Map<string, PageParameterLookupResult>();
    const fixtureCandidates =
      typeof this.fixtures.list === "function"
        ? this.fixtures.list({
            messageType: input.messageType,
            sequence: input.sequence,
            currency: input.currency,
            bookingEntity: input.bookingEntity,
            valueDate: input.valueDate,
            bindingId: scenario.fixtureBindingId,
            includeFixtureGroup: true,
          }).candidates
        : this.fixtures.catalogue();
    for (const candidate of fixtureCandidates) {
      if (
        candidate.settlementLeg !== profile.settlementLeg ||
        (candidate.fixtureGroupId ?? candidate.bindingId) !==
          scenario.fixtureBindingId ||
        candidate.messageType !== input.messageType ||
        candidate.sequence !== input.sequence ||
        candidate.currency !== input.currency ||
        candidate.bookingEntity !== input.bookingEntity ||
        input.valueDate < candidate.effectiveFrom ||
        input.valueDate > candidate.effectiveTo
      )
        continue;
      const bank = this.directory
        .search(candidate.counterpartyBic)
        .find(({ bic }) => bic === candidate.counterpartyBic);
      if (!bank) continue;
      byId.set(bank.bankServiceId, {
        provider: "SSI_COUNTERPARTY",
        action: "SSI_COUNTERPARTY",
        bankServiceId: bank.bankServiceId,
        bic: bank.bic,
        displayValue: `${bank.bic} — ${bank.name}`,
        bankName: bank.name,
      });
    }
    const eligible = [...byId.values()].sort((left, right) =>
      (left.bic ?? "").localeCompare(right.bic ?? ""),
    );
    return eligible;
  }
}
