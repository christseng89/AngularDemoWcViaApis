import {
  executableCounterpartySsiProfiles,
  filterPaymentMessageIndex,
  paymentMessageStatusLabel,
  sortPaymentMessageIndex,
} from "./payment-message-index";

const rows = [
  {
    order: 1,
    messageType: "MT200",
    description: "Own Account Transfer",
    processingMode: "SINGLE" as const,
    profileStatus: "PROFILE_VERIFIED",
    targetMessage: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    selectable: true,
  },
  {
    order: 2,
    messageType: "MT201",
    description: "Multiple Own Account Transfer",
    processingMode: "SPLIT" as const,
    profileStatus: "NO_DIRECT_1_TO_1_PROFILE",
    targetMessage: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    selectable: true,
  },
];

describe("payment message index", () => {
  it("keeps unsupported profiles out of the executable SSI list", () => {
    expect(
      executableCounterpartySsiProfiles([
        rows[0]!,
        { ...rows[1]!, selectable: false },
      ]),
    ).toEqual([rows[0]]);
  });

  it("filters by message type or description", () => {
    expect(filterPaymentMessageIndex(rows, "   ")).toBe(rows);
    expect(filterPaymentMessageIndex(rows, "201")).toEqual([rows[1]]);
    expect(filterPaymentMessageIndex(rows, "own account")).toHaveLength(2);
    expect(filterPaymentMessageIndex(rows, "pacs.009")).toHaveLength(2);
  });

  it("explains split processing without claiming a direct mapping", () => {
    expect(paymentMessageStatusLabel(rows[1]!)).toBe(
      "NO DIRECT 1:1 PROFILE · SPLIT PROCESSING SUPPORTED",
    );
    expect(paymentMessageStatusLabel(rows[0]!)).toBe(
      "PROFILE VERIFIED · SINGLE RESOLUTION",
    );
  });

  it("shows the configured status for a non-selectable profile", () => {
    expect(
      paymentMessageStatusLabel({
        order: 6,
        messageType: "MT204",
        description: "Financial Markets Direct Debit",
        processingMode: "SINGLE",
        profileStatus: "SEPARATE_DIRECT_DEBIT_PROFILE",
        targetMessage: "pacs.010.001.03",
        businessService: "swift.cbprplus.04",
        selectable: false,
      }),
    ).toBe("SEPARATE DIRECT DEBIT PROFILE");
  });

  it("labels a selectable notification profile separately", () => {
    expect(
      paymentMessageStatusLabel({
        ...rows[0]!,
        processingMode: "NOTIFICATION",
      }),
    ).toBe("SEPARATE NOTIFICATION PROFILE");
  });

  it("sorts titles in both directions without mutating API order", () => {
    const reversed = [rows[1]!, rows[0]!];
    expect(
      sortPaymentMessageIndex(reversed, "messageType", "asc").map(
        (row) => row.messageType,
      ),
    ).toEqual(["MT200", "MT201"]);
    expect(
      sortPaymentMessageIndex(rows, "description", "desc").map(
        (row) => row.messageType,
      ),
    ).toEqual(["MT200", "MT201"]);
    expect(reversed.map((row) => row.messageType)).toEqual(["MT201", "MT200"]);
  });
});
