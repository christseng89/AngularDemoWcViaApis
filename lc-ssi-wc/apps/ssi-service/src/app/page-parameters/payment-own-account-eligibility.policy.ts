import type { NostroRecord } from "../nostro/nostro.repository";

export type PaymentOwnAccountScenario =
  "BOOK_TRANSFER_SAME_RECEIVER" | "CREDIT_ONE_OF_SEVERAL_AT_57A";

export interface PaymentOwnAccountContext {
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
}

type PaymentNostroRecord = NostroRecord & {
  readonly fixtureFamily?: string;
};

export const paymentOwnAccountScenario = (
  scenarioId: string,
): PaymentOwnAccountScenario | undefined => {
  if (scenarioId.endsWith("-OP-BOOK")) return "BOOK_TRANSFER_SAME_RECEIVER";
  if (scenarioId.endsWith("-OP-CREDIT-57A"))
    return "CREDIT_ONE_OF_SEVERAL_AT_57A";
  return undefined;
};

export const eligiblePaymentOwnAccounts = (
  records: readonly NostroRecord[],
  context: PaymentOwnAccountContext,
): readonly NostroRecord[] =>
  records
    .filter((record) => {
      const fixtureFamily = (
        record as PaymentNostroRecord
      ).fixtureFamily?.trim();
      const paymentOwned = !fixtureFamily || /^MT2[-_]/i.test(fixtureFamily);
      return (
        paymentOwned &&
        record.status === "ACTIVE" &&
        record.purpose === "SETTLEMENT" &&
        record.currency === context.currency &&
        record.ownLegalEntityId === context.bookingEntity &&
        (!record.allowedBookingEntities?.length ||
          record.allowedBookingEntities.includes("ANY") ||
          record.allowedBookingEntities.includes(context.bookingEntity)) &&
        record.validFrom.slice(0, 10) <= context.valueDate &&
        context.valueDate <= record.validTo.slice(0, 10)
      );
    })
    .sort(
      (left, right) =>
        left.priority - right.priority || left.id.localeCompare(right.id),
    );

export const resolvePaymentOwnAccountPair = (
  eligible: readonly NostroRecord[],
  scenario: PaymentOwnAccountScenario,
  receiverBic: string,
):
  | { readonly debit: NostroRecord; readonly credit: NostroRecord }
  | undefined => {
  const debit = eligible.find(
    ({ accountServicerBic }) => accountServicerBic === receiverBic,
  );
  if (!debit) return undefined;
  const sameAccount = (record: NostroRecord): boolean =>
    record.id === debit.id ||
    record.accountReference === debit.accountReference;
  const credit = eligible.find(
    (record) =>
      !sameAccount(record) &&
      (scenario === "BOOK_TRANSFER_SAME_RECEIVER"
        ? record.accountServicerBic === receiverBic
        : record.accountServicerBic !== receiverBic),
  );
  return credit ? { debit, credit } : undefined;
};
