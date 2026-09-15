import { BadRequestException } from "@nestjs/common";
import type { RouteResolutionRequest } from "./route-resolution.policy";
import type { PaymentMessageIndexService } from "./payment-message-index.service";
import { BankServiceDirectory } from "./bank-service-directory";

export type Mt2SettlementResolutionRequest = Omit<
  RouteResolutionRequest,
  "counterpartyType" | "counterpartyBic"
> & {
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
  }>;
};

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
): RouteResolutionRequest {
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
  if (request.messageType !== profile.targetMessage)
    throw new BadRequestException("PAYMENT_SOURCE_TARGET_MISMATCH");
  const bank = bankServices.resolve(
    request.counterpartyBankServiceId ??
      request.beneficiaryBankServiceId ??
      request.bankServiceId,
  );
  return {
    ...request,
    sourceMessageType,
    businessService: profile.businessService,
    counterpartyBic: bank.bic,
    counterpartyCountry: request.counterpartyCountry || bank.country,
    counterpartyType: "BANK",
  };
}
