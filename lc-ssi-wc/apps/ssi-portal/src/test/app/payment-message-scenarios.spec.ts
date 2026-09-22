import {
  PAYMENT_MESSAGE_SCENARIOS,
  bankIdentityByServiceId,
  counterpartySsiPaymentScenarios,
  paymentMessageForScenario,
  sortPaymentMessageScenarios,
} from "../../app/payment-message-scenarios";

describe("payment message scenarios", () => {
  it("publishes the governed MT2 parameter-driven journeys as separate options", () => {
    expect(PAYMENT_MESSAGE_SCENARIOS.map(({ code }) => code)).toEqual([
      "BOOK_TRANSFER_SAME_RECEIVER",
      "CREDIT_ONE_OF_SEVERAL_AT_57A",
      "INITIAL_MT200_201_EQUIVALENCE",
      "NO_MT200_201_EQUIVALENCE",
    ]);
    expect(
      PAYMENT_MESSAGE_SCENARIOS.every(({ controls }) => controls.length > 0),
    ).toBe(true);
  });

  it("keeps parameter-driven scenarios available for every indexed message type", () => {
    const visible = counterpartySsiPaymentScenarios(
      PAYMENT_MESSAGE_SCENARIOS,
      ["MT202", "MT202COV", "MT205", "MT205COV"].map(
        (messageType) => ({
          order: 1,
          messageType,
          description: messageType,
          processingMode: "SINGLE" as const,
          profileStatus: "PROFILE_VERIFIED",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
        }),
      ),
    );

    expect(visible.map(({ code, messageType }) => [code, messageType])).toEqual(
      [
        ["BOOK_TRANSFER_SAME_RECEIVER", "MT202"],
        ["CREDIT_ONE_OF_SEVERAL_AT_57A", "MT202"],
        ["INITIAL_MT200_201_EQUIVALENCE", "MT205"],
        ["NO_MT200_201_EQUIVALENCE", "MT205COV"],
      ],
    );
  });

  it("sorts scenario titles consistently without mutating parameter order", () => {
    const parameters = [...PAYMENT_MESSAGE_SCENARIOS].reverse();
    expect(
      sortPaymentMessageScenarios(parameters, "asc").map(({ title }) => title),
    ).toEqual(
      [...PAYMENT_MESSAGE_SCENARIOS]
        .map(({ title }) => title)
        .sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: "base" }),
        ),
    );
    expect(parameters[0]).toBe(PAYMENT_MESSAGE_SCENARIOS.at(-1));
  });

  it("sorts scenario titles in descending order", () => {
    expect(
      sortPaymentMessageScenarios(PAYMENT_MESSAGE_SCENARIOS, "desc").map(
        ({ title }) => title,
      ),
    ).toEqual(
      [...PAYMENT_MESSAGE_SCENARIOS]
        .map(({ title }) => title)
        .sort((left, right) =>
          right.localeCompare(left, undefined, { sensitivity: "base" }),
        ),
    );
  });

  it("derives the payment transaction from scenario parameters", () => {
    expect(
      paymentMessageForScenario(PAYMENT_MESSAGE_SCENARIOS[0]!),
    ).toMatchObject({
      messageType: "MT202",
      targetMessage: "pacs.009.001.08",
      selectable: true,
    });
  });

  it("resolves a read-only BIC from stable Bank Service identity", () => {
    const banks = [
      { bankServiceId: "BANK-SVC-CITIUS33", bic: "CITIUS33" },
      { bankServiceId: "BANK-SVC-CHASUS33", bic: "CHASUS33" },
    ];
    expect(bankIdentityByServiceId(banks, "BANK-SVC-CHASUS33")?.bic).toBe(
      "CHASUS33",
    );
    expect(bankIdentityByServiceId(banks, "CHASUS33")).toBeUndefined();
  });
});
