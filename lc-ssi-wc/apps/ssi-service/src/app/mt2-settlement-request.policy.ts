import { BadRequestException } from "@nestjs/common";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import type { PaymentMessageIndexService } from "./payment-message-index.service";
import { BankServiceDirectory } from "./bank-service-directory";

export type Phase1ProfileId =
  | "MT2-MT202-PLAIN-SR2026"
  | "MT2-MT202COV-COV-SR2026"
  | "MT2-MT205-PLAIN-SR2026"
  | "MT2-MT205COV-COV-SR2026";

export type PairedEvidenceProfileId =
  "PACS009-PLAIN-SR2026" | "PACS009-COV-SR2026";

export interface Mt2ControlledProfileBinding {
  readonly profileId: Phase1ProfileId;
  readonly pairedEvidenceProfileId: PairedEvidenceProfileId;
  readonly businessService: "swift.cbprplus.04" | "swift.cbprplus.cov.04";
}

const CONTROLLED_PROFILES: Readonly<
  Record<string, Mt2ControlledProfileBinding>
> = {
  MT202: {
    profileId: "MT2-MT202-PLAIN-SR2026",
    pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
    businessService: "swift.cbprplus.04",
  },
  MT202COV: {
    profileId: "MT2-MT202COV-COV-SR2026",
    pairedEvidenceProfileId: "PACS009-COV-SR2026",
    businessService: "swift.cbprplus.cov.04",
  },
  MT205: {
    profileId: "MT2-MT205-PLAIN-SR2026",
    pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
    businessService: "swift.cbprplus.04",
  },
  MT205COV: {
    profileId: "MT2-MT205COV-COV-SR2026",
    pairedEvidenceProfileId: "PACS009-COV-SR2026",
    businessService: "swift.cbprplus.cov.04",
  },
};

export const mt2ControlledProfile = (
  sourceMessageType: string,
): Mt2ControlledProfileBinding | undefined =>
  CONTROLLED_PROFILES[sourceMessageType];

export type Mt2SettlementResolutionRequest = Omit<
  RouteResolutionRequest,
  "counterpartyType" | "counterpartyBic"
> & {
  readonly profileId?: Phase1ProfileId;
  readonly pairedEvidenceProfileId?: PairedEvidenceProfileId;
  readonly paymentDirection?: "OUTWARD";
  readonly localBankRole?: "INSTRUCTING_AGENT";
  readonly counterpartyBankServiceId?: string;
  readonly accountWithBankServiceId?: string;
  readonly intermediaryBankServiceId?: string;
  readonly receiverCorrespondentBankServiceId?: string;
  readonly senderCorrespondentBankServiceId?: string;
  readonly beneficiaryInstitutionBankServiceId?: string;
  readonly beneficiaryBankServiceId?: string;
  readonly bankServiceId?: string;
  readonly scenarioCode?:
    "BOOK_TRANSFER_SAME_RECEIVER" | "CREDIT_ONE_OF_SEVERAL_AT_57A";
  readonly ownDebitAccountId?: string;
  readonly ownDebitAccountVersion?: number;
  readonly ownCreditAccountId?: string;
  readonly ownCreditAccountVersion?: number;
  readonly receiverBankServiceId?: string;
  readonly incoming21?: string;
  readonly incoming121?: string;
  readonly field32A?: string;
  readonly block3?: Readonly<{ "119": "COV" }>;
  readonly underlyingCustomerCreditTransfer?: true;
  readonly sequenceB?: Readonly<{ "50A": string; "59": string }>;
  readonly previousMessage?: Readonly<{
    type: string;
    "20": string;
    "21": string;
    "121"?: string;
    "A.52A"?: string;
    "A.58A"?: string;
    sequenceB?: Readonly<{ "50A": string; "59": string }>;
    artifactSha256?: string;
    artifactVersion?: string;
    nonCoverAttested?: true;
    attestationId?: string;
    attestationVersion?: string;
    equivalentCoverRuleRecordId?: string;
    equivalentCoverRuleRecordVersion?: string;
  }>;
  readonly initialTransferType?: "MT200" | "MT201";
  readonly selectedApplicabilityId?: string;
  readonly selectedApplicabilityVersion?: number;
  readonly selectedNostroId?: string;
  readonly selectedNostroVersion?: number;
  readonly selectedRmaId?: string;
  readonly selectedRmaVersion?: number;
  readonly selectedRmaDecisionId?: string;
  readonly routeBindingId?: string;
  readonly contextSnapshotId?: string;
  readonly databaseSnapshotId?: string;
  readonly snapshotIdentityMethod?: string;
  readonly senderCountry?: string;
  readonly receiverCountry?: string;
  readonly senderCountrySourceId?: string;
  readonly senderCountrySourceVersion?: string;
  readonly receiverCountrySourceId?: string;
  readonly receiverCountrySourceVersion?: string;
};

export type Mt2BankResolutionRequest = RouteResolutionRequest &
  Partial<Mt2SettlementResolutionRequest> &
  Partial<
    Required<
      Pick<
        Mt2SettlementResolutionRequest,
        | "profileId"
        | "pairedEvidenceProfileId"
        | "paymentDirection"
        | "localBankRole"
      >
    >
  >;

function rejectsClientCounterpartyType(request: object): void {
  if (Object.hasOwn(request, "counterpartyType"))
    throw new BadRequestException("MT2_COUNTERPARTY_TYPE_NOT_ACCEPTED");
}

function rejectsClientCounterpartyBic(request: object): void {
  if (Object.hasOwn(request, "counterpartyBic"))
    throw new BadRequestException("MT2_COUNTERPARTY_BIC_NOT_ACCEPTED");
}

function rejectsManualBankIdentity(request: object): void {
  const manualBicFields = [
    "accountWithBic",
    "intermediaryBic",
    "receiverCorrespondentBic",
    "senderCorrespondentBic",
    "beneficiaryInstitutionBic",
  ];
  if (manualBicFields.some((field) => Object.hasOwn(request, field)))
    throw new BadRequestException("MT2_MANUAL_BIC_NOT_ACCEPTED");
}

export function toMt2BankResolutionRequest(
  request: Mt2SettlementResolutionRequest,
  messageIndex: PaymentMessageIndexService,
  sourceMessageTypeOverride?: string,
  bankServices: BankServiceDirectory = new BankServiceDirectory(),
): Mt2BankResolutionRequest {
  rejectsClientCounterpartyType(request);
  rejectsClientCounterpartyBic(request);
  rejectsManualBankIdentity(request);
  if (!request.currency?.trim())
    throw new BadRequestException("INVALID_ISO_4217_CURRENCY");
  const sourceMessageType =
    sourceMessageTypeOverride ?? request.sourceMessageType?.trim();
  if (!sourceMessageType)
    throw new BadRequestException("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED");
  const profile = messageIndex.findSelectable(sourceMessageType);
  if (!profile) throw new BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED");
  const controlled = mt2ControlledProfile(sourceMessageType);
  if (
    controlled &&
    profile.businessService !== undefined &&
    profile.businessService !== controlled.businessService
  )
    throw new BadRequestException("PAYMENT_PROFILE_BINDING_INVALID");
  if (request.messageType !== profile.targetMessage)
    throw new BadRequestException("PAYMENT_SOURCE_TARGET_MISMATCH");
  const bank = bankServices.resolve(
    request.counterpartyBankServiceId ??
      request.beneficiaryBankServiceId ??
      request.receiverBankServiceId ??
      request.bankServiceId,
  );
  return {
    ...request,
    sourceMessageType,
    ...(controlled
      ? {
          profileId: controlled.profileId,
          pairedEvidenceProfileId: controlled.pairedEvidenceProfileId,
          paymentDirection: "OUTWARD" as const,
          localBankRole: "INSTRUCTING_AGENT" as const,
          businessService: controlled.businessService,
        }
      : { businessService: profile.businessService }),
    counterpartyBic: bank.bic,
    counterpartyCountry: request.counterpartyCountry || bank.country,
    counterpartyType: "BANK",
  };
}
