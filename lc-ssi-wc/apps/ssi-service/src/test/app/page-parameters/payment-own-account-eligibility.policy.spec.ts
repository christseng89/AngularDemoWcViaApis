import type { NostroRecord } from "../../../app/nostro/nostro.repository";
import {
  eligiblePaymentOwnAccounts,
  resolvePaymentOwnAccountPair,
} from "../../../app/page-parameters/payment-own-account-eligibility.policy";

const nostro = (
  id: string,
  accountServicerBic: string,
  priority = 1,
): NostroRecord => ({
  id,
  version: 1,
  status: "ACTIVE",
  purpose: "SETTLEMENT",
  currency: "USD",
  ownLegalEntityId: "HK01",
  allowedBookingEntities: ["HK01"],
  accountServicerBic,
  accountReference: `${id}-REF`,
  maskedAccountRef: id,
  priority,
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
});

describe("payment own-account eligibility policy", () => {
  it("uses the stable id as the tie-breaker for equal-priority accounts", () => {
    expect(
      eligiblePaymentOwnAccounts(
        [nostro("B", "CITIUS33"), nostro("A", "DEUTDEFF")],
        {
          currency: "USD",
          bookingEntity: "HK01",
          valueDate: "2026-09-15",
        },
      ).map(({ id }) => id),
    ).toEqual(["A", "B"]);
  });

  it("returns no pair when either the debit or governed credit leg is missing", () => {
    const debit = nostro("DEBIT", "CITIUS33");
    expect(
      resolvePaymentOwnAccountPair(
        [],
        "BOOK_TRANSFER_SAME_RECEIVER",
        "CITIUS33",
      ),
    ).toBeUndefined();
    expect(
      resolvePaymentOwnAccountPair(
        [debit],
        "BOOK_TRANSFER_SAME_RECEIVER",
        "CITIUS33",
      ),
    ).toBeUndefined();
  });
});
