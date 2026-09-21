import { MessageDomainResolutionService } from "../../app/message-domain-resolution.service";
import type { NostroApplicationService } from "../../app/nostro/nostro-application.service";
import type { DatabaseSnapshotIdentityService } from "../../app/database-snapshot-identity.service";

describe("MessageDomainResolutionService", () => {
  const snapshotIdentity = {
    current: () => ({
      sha256: "A".repeat(64).toLowerCase(),
      method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    }),
  } as DatabaseSnapshotIdentityService;
  const service = new MessageDomainResolutionService();

  it("returns a single mx/mt contract with nullable redirectDomain", () => {
    expect(
      service.resolve("OWN_SSI_NOSTRO", {
        directAccountCount: 1,
        receiverBankServiceId: "BANK-SVC-CITIUS33",
        currency: "USD",
      }),
    ).toMatchObject({
      mx: {
        decision: "RESOLVED",
        redirectDomain: null,
        canonicalScenario: "OWN_ACCOUNT_TRANSFER",
      },
      mt: { tags: { "57A": "CITIUS33" } },
    });
  });

  it("fails closed when an own-account Bank Service identity is missing", () => {
    expect(
      service.resolve("OWN_SSI_NOSTRO", { accountWithBankServiceId: "" }),
    ).toMatchObject({
      mx: {
        code: "PROFILE_INCOMPLETE",
        redirectDomain: null,
        payloadGenerated: false,
      },
    });
  });

  it("fails closed instead of accepting raw bank BICs or synthesising a default", () => {
    expect(
      service.resolve("OWN_SSI_NOSTRO", { accountWithBic: "CITIUS33" }),
    ).toMatchObject({ mx: { code: "BANK_SERVICE_ID_REQUIRED" } });
    expect(service.resolve("OWN_SSI_NOSTRO", {})).toMatchObject({
      mx: { code: "BANK_SERVICE_ID_REQUIRED" },
    });
  });

  it("rejects invalid direct-debit and notification message structures", () => {
    expect(
      service.resolve("FI_DIRECT_DEBIT", { sequenceBCount: 11 }),
    ).toMatchObject({ mx: { code: "OPTION_CONSTRAINT_VIOLATION" } });
    expect(
      service.resolve("NOTIFICATION", { orderingPartyType: null }),
    ).toMatchObject({ mx: { code: "MESSAGE_CONTEXT_MISSING" } });
  });

  describe("BOOK_TRANSFER_SAME_RECEIVER", () => {
    const recordFor = (nostroId: string) => ({
      id: nostroId,
      version: 4,
      status: "ACTIVE",
      ownLegalEntityId: "HK01",
      allowedBookingEntities: ["HK01"],
      accountServicerBic: "CITIUS33",
      currency: "USD",
      accountReference: nostroId === "DEBIT" ? "DEBIT-REF" : "CREDIT-REF",
      maskedAccountRef: "DEMO-MASKED",
      purpose: "SETTLEMENT",
      priority: 10,
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
    });
    const pinned = {
      resolvePinned: jest.fn(({ nostroId }: { nostroId: string }) => ({
        decision: "RESOLVED",
        record: recordFor(nostroId),
      })),
    };
    const scenarioService = new MessageDomainResolutionService(
      undefined,
      pinned as unknown as NostroApplicationService,
      snapshotIdentity,
    );
    const request = {
      scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER",
      ownDebitAccountId: "DEBIT",
      ownDebitAccountVersion: 4,
      ownCreditAccountId: "CREDIT",
      ownCreditAccountVersion: 4,
      receiverBankServiceId: "BANK-SVC-CITIUS33",
      bookingEntity: "HK01",
      currency: "USD",
      valueDate: "2026-06-30",
    };

    it("uses own-account domain, skips counterparty SSI and renders mandatory 53B plus 58A", () => {
      expect(scenarioService.resolve("OWN_SSI_NOSTRO", request)).toMatchObject({
        mx: {
          httpStatus: 200,
          decision: "RESOLVED",
          resolutionDomain: "OWN_SSI_NOSTRO",
          counterpartySsiResolution: "SKIPPED",
          chosenRoute: null,
          candidates: [],
          canonicalRoles: {
            sender: "DEMOHKHH",
            debtor: "DEMOHKHH",
            receiver: "CITIUS33",
            beneficiary: "DEMOHKHH",
          },
          roleProvenance: {
            debtor: {
              value: "DEMOHKHH",
              source: "OWN_ENTITY",
            },
            beneficiary: {
              value: "DEMOHKHH",
              source: "OWN_ENTITY",
              bankServiceId: "BANK-SVC-DEMOHKHH",
            },
          },
          messageComposerContext: {
            DbtrAcct: {
              value: "DEBIT-REF",
              source: "OWN_SSI_NOSTRO",
            },
            CdtrAcct: {
              value: "CREDIT-REF",
              source: "OWN_SSI_NOSTRO",
            },
            SttlmAcct: {
              value: "DEBIT-REF",
              source: "OWN_SSI_NOSTRO",
              semanticRole: "SETTLEMENT_DEBIT_ACCOUNT",
            },
            Cdtr: { value: "DEMOHKHH", source: "OWN_ENTITY" },
          },
        },
        mt: {
          tags: {
            "53B": "/DEBIT-REF",
            "58A": "/CREDIT-REF\nDEMOHKHH",
          },
          omitted: ["57A"],
          renderingDecisions: {
            "57A": { outcome: "OMITTED_BY_RULE" },
          },
        },
      });
    });

    it("fails closed when debit and credit pins identify the same account version", () => {
      expect(
        scenarioService.resolve("OWN_SSI_NOSTRO", {
          ...request,
          ownCreditAccountId: "DEBIT",
          ownCreditAccountVersion: 4,
        }),
      ).toMatchObject({
        mx: {
          httpStatus: 422,
          code: "OPTION_CONSTRAINT_VIOLATION",
          reasonCode: "OWN_ACCOUNT_DEBIT_CREDIT_COLLISION",
          payloadGenerated: false,
        },
      });
    });

    it("fails closed when different records render the same account reference", () => {
      const duplicateReference = {
        resolvePinned: jest.fn(({ nostroId }: { nostroId: string }) => ({
          decision: "RESOLVED",
          record: {
            ...recordFor(nostroId),
            accountReference: "DEMO-NORTHSTAR-USD-001",
          },
        })),
      };
      const duplicateReferenceService = new MessageDomainResolutionService(
        undefined,
        duplicateReference as unknown as NostroApplicationService,
        snapshotIdentity,
      );
      expect(
        duplicateReferenceService.resolve("OWN_SSI_NOSTRO", request),
      ).toMatchObject({
        mx: {
          httpStatus: 422,
          code: "OPTION_CONSTRAINT_VIOLATION",
          reasonCode: "OWN_ACCOUNT_DEBIT_CREDIT_COLLISION",
          payloadGenerated: false,
        },
      });
    });

    it("returns deterministic reason codes for currency then receiver mismatch", () => {
      pinned.resolvePinned
        .mockReturnValueOnce({
          decision: "RESOLVED",
          record: { ...recordFor("DEBIT"), currency: "EUR" },
        })
        .mockReturnValueOnce({
          decision: "RESOLVED",
          record: recordFor("CREDIT"),
        });
      expect(scenarioService.resolve("OWN_SSI_NOSTRO", request)).toMatchObject({
        mx: {
          httpStatus: 422,
          code: "OPTION_CONSTRAINT_VIOLATION",
          reasonCode: "OWN_ACCOUNT_CURRENCY_MISMATCH",
          payloadGenerated: false,
        },
      });
    });

    it("includes 57A for credit-one-of-several at a non-Receiver institution", () => {
      pinned.resolvePinned
        .mockReturnValueOnce({
          decision: "RESOLVED",
          record: {
            ...recordFor("CREDIT"),
            accountServicerBic: "CITIUS33",
            accountReference: "CREDIT-AT-57A",
          },
        })
        .mockReturnValueOnce({
          decision: "RESOLVED",
          record: {
            ...recordFor("DEBIT"),
            accountServicerBic: "BARCGB22",
            accountReference: "DEBIT-AT-RECEIVER",
          },
        });
      expect(
        scenarioService.resolve("OWN_SSI_NOSTRO", {
          ...request,
          scenarioCode: "CREDIT_ONE_OF_SEVERAL_AT_57A",
          receiverBankServiceId: "BANK-SVC-BARCGB22",
        }),
      ).toMatchObject({
        mx: {
          resolutionDomain: "OWN_SSI_NOSTRO",
          counterpartySsiResolution: "SKIPPED",
          messageComposerContext: {
            DbtrAcct: { value: "DEBIT-AT-RECEIVER" },
            CdtrAcct: { value: "CREDIT-AT-57A" },
          },
        },
        mt: {
          tags: {
            "53B": "/DEBIT-AT-RECEIVER",
            "57A": "CITIUS33",
            "58A": "/CREDIT-AT-57A\nDEMOHKHH",
          },
          renderingDecisions: {
            "53B": { outcome: "INCLUDE", option: "B" },
            "57A": { outcome: "INCLUDE" },
          },
        },
      });
    });

    it("rejects a 57A scenario when Receiver and Account With Institution are equal", () => {
      expect(
        scenarioService.resolve("OWN_SSI_NOSTRO", {
          ...request,
          scenarioCode: "CREDIT_ONE_OF_SEVERAL_AT_57A",
        }),
      ).toMatchObject({
        mx: {
          httpStatus: 422,
          reasonCode: "OWN_ACCOUNT_RECEIVER_MISMATCH",
          payloadGenerated: false,
        },
      });
    });

    it.each([
      [
        "unsupported scenario",
        { ...request, scenarioCode: "UNKNOWN_OWN_ACCOUNT_SCENARIO" },
        "OWN_ACCOUNT_SCENARIO_NOT_SUPPORTED",
      ],
      [
        "missing pinned credit identity",
        {
          ...request,
          ownCreditAccountId: "",
          ownCreditAccountVersion: undefined,
        },
        "OWN_ACCOUNT_PIN_REQUIRED",
      ],
      [
        "missing receiver identity",
        { ...request, receiverBankServiceId: "" },
        "RECEIVER_BANK_SERVICE_REQUIRED",
      ],
    ])("fails closed for %s", (_label, input, reasonCode) => {
      expect(scenarioService.resolve("OWN_SSI_NOSTRO", input)).toMatchObject({
        mx: {
          httpStatus: 422,
          decision: "REJECTED",
          code: "OPTION_CONSTRAINT_VIOLATION",
          reasonCode,
          chosenRoute: null,
          candidates: [],
          payloadGenerated: false,
          resolutionTrace: { counterpartySsiQueried: false },
        },
      });
    });

    it("fails closed when the pinned Nostro service is unavailable", () => {
      const unavailable = new MessageDomainResolutionService();
      expect(unavailable.resolve("OWN_SSI_NOSTRO", request)).toMatchObject({
        mx: {
          reasonCode: "OWN_NOSTRO_SERVICE_UNAVAILABLE",
          counterpartySsiResolution: "SKIPPED",
        },
      });
    });

    it("does not fall back when the pinned debit version is rejected", () => {
      const rejecting = {
        resolvePinned: jest
          .fn()
          .mockReturnValueOnce(pinned.resolvePinned({ nostroId: "CREDIT" }))
          .mockReturnValueOnce({
            decision: "REJECTED",
            reasonCode: "OWN_ACCOUNT_VERSION_MISMATCH",
          }),
      };
      const rejectingService = new MessageDomainResolutionService(
        undefined,
        rejecting as unknown as NostroApplicationService,
      );
      expect(rejectingService.resolve("OWN_SSI_NOSTRO", request)).toMatchObject(
        {
          mx: { reasonCode: "OWN_ACCOUNT_VERSION_MISMATCH" },
        },
      );
      expect(rejecting.resolvePinned).toHaveBeenCalledTimes(2);
    });

    it("rejects a book transfer when either account has another servicer", () => {
      const mismatched = {
        resolvePinned: jest.fn(({ nostroId }: { nostroId: string }) => ({
          decision: "RESOLVED",
          record: {
            ...recordFor(nostroId),
            accountServicerBic: nostroId === "CREDIT" ? "HSBCHKHH" : "CITIUS33",
          },
        })),
      };
      const mismatchedService = new MessageDomainResolutionService(
        undefined,
        mismatched as unknown as NostroApplicationService,
      );
      expect(
        mismatchedService.resolve("OWN_SSI_NOSTRO", request),
      ).toMatchObject({
        mx: { reasonCode: "OWN_ACCOUNT_RECEIVER_MISMATCH" },
      });
    });
  });
});

describe("MessageDomainResolutionService validation and rendering matrix", () => {
  const service = new MessageDomainResolutionService();

  it.each([
    [{ field53: { option: "A" } }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ currency: "XAU" }, "CURRENCY_NOT_SUPPORTED"],
    [{ field32A: "260912XAU100," }, "CURRENCY_NOT_SUPPORTED"],
    [{ "58A": "CITIUS33" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ requestedUse: "BOOK_TRANSFER" }, "MESSAGE_TYPE_NOT_SUPPORTED"],
  ])(
    "rejects invalid own-account message context %#",
    (context, expectedCode) => {
      expect(service.resolve("OWN_SSI_NOSTRO", context)).toMatchObject({
        mx: { code: expectedCode, payloadGenerated: false },
      });
    },
  );

  it("keeps counterparty SSI out of an incomplete own-Nostro profile", () => {
    expect(
      service.resolve("OWN_SSI_NOSTRO", {
        ownNostro: null,
        availableCounterpartySsi: "CP-SSI-9",
      }),
    ).toMatchObject({
      mx: {
        httpStatus: 503,
        code: "PROFILE_INCOMPLETE",
        detail: expect.stringContaining("cannot substitute"),
      },
      mt: { mustNotUse: ["CP-SSI-9"] },
    });
  });

  it.each(["receiver", "intermediaryBic"])(
    "rejects the legacy raw identity field %s",
    (field) => {
      expect(
        service.resolve("OWN_SSI_NOSTRO", { [field]: "CITIUS33" }),
      ).toMatchObject({ mx: { code: "BANK_SERVICE_ID_REQUIRED" } });
    },
  );

  it("renders a selected own account, intermediary and two-account semantics", () => {
    expect(
      service.resolve("OWN_SSI_NOSTRO", {
        accountWithBankServiceId: "BANK-SVC-CITIUS33",
        intermediaryBankServiceId: "BANK-SVC-BOFAUS3N",
        selectedDebitAccount: "/OWN-USD-2",
        directAccountCount: 2,
      }),
    ).toMatchObject({
      mx: {
        canonicalRoles: {
          settlementAccount: "/OWN-USD-2",
          intermediaryAgent: "BOFAUS3N",
          beneficiary: "Sender",
        },
      },
      mt: {
        tags: {
          "53B": "/OWN-USD-2",
          "56A": "BOFAUS3N",
          "57A": "CITIUS33",
        },
        omitted: ["53B location", "58a", "58a"],
      },
    });
  });

  it("uses the controlled QA seed route without inventing a raw BIC", () => {
    expect(
      service.resolve("OWN_SSI_NOSTRO", { qaSeedId: "QA-OWN-1" }),
    ).toMatchObject({
      mx: {
        canonicalRoles: {
          ownNostro: "/QA-HK01-USD-001",
          accountServicer: "CITIUS33",
          beneficiary: "Sender",
        },
      },
      mt: { tags: { "57A": "CITIUS33" } },
    });
  });

  it.each([
    [
      { sourceMessageType: "MT204", messageType: "pacs.010.001.03" },
      "MESSAGE_TYPE_NOT_SUPPORTED",
    ],
    [
      { sourceMessageType: "MT204", messageType: "pacs.009.001.08" },
      "PAYMENT_SOURCE_TARGET_MISMATCH",
    ],
    [{}, "BANK_SERVICE_ID_REQUIRED"],
    [{ debitInstitution: "CITIUS33" }, "BANK_SERVICE_ID_REQUIRED"],
    [{ debitInstitutionBankServiceId: "" }, "BANK_SERVICE_ID_REQUIRED"],
    [{ mugActive: false }, "PROFILE_INCOMPLETE"],
    [{ mandateStatus: "INACTIVE" }, "PROFILE_INCOMPLETE"],
    [{ "19EqualsSum32B": false }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ "19": "100" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ "B.53A.source": "generic SSI" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ sequenceB: ["USD100", "EUR200"] }, "OPTION_CONSTRAINT_VIOLATION"],
  ])(
    "fails closed for direct-debit policy case %#",
    (context, expectedCode) => {
      expect(service.resolve("FI_DIRECT_DEBIT", context)).toMatchObject({
        mx: { code: expectedCode, payloadGenerated: false },
      });
    },
  );

  it("renders an evidenced multi-transaction direct-debit route", () => {
    expect(
      service.resolve("FI_DIRECT_DEBIT", {
        mugActive: true,
        senderBic: "DEMOHKHH",
        "A.57A": "BOFAUS3N",
        "A.58A": "DEMOHKHH",
        "B.53A": "CITIUS33",
        sequenceBCount: 2,
        qaSeedIds: ["QA-DD-1", "QA-DD-2"],
      }),
    ).toMatchObject({
      mx: {
        decision: "RESOLVED",
        canonicalRoles: {
          creditor: "DEMOHKHH",
          debtorAgent: "CITIUS33",
          accountWithInstitution: "BOFAUS3N",
          directDebitTransactions: 2,
        },
      },
      mt: {
        tags: {
          "A.57A": "BOFAUS3N",
          "A.58A": "DEMOHKHH",
          "B.53A": "CITIUS33",
          "19": "sum(32B)",
          "B.sequenceCount": 2,
        },
        assertions: ["mandate source; 58a always Sender"],
      },
    });
  });

  it("accepts a registered debit-institution Bank Service identity", () => {
    expect(
      service.resolve("FI_DIRECT_DEBIT", {
        debitInstitutionBankServiceId: "BANK-SVC-CITIUS33",
      }),
    ).toMatchObject({ mx: { decision: "RESOLVED" } });
  });

  it("records that optional 58a was deliberately omitted", () => {
    expect(
      service.resolve("FI_DIRECT_DEBIT", {
        "A.58a": "OMIT",
        senderBic: "DEMOHKHH",
      }),
    ).toMatchObject({
      mx: {
        canonicalRoles: {
          creditor: "DEMOHKHH",
          creditorSource: "SENDER_IDENTITY",
          mt58aOutcome: "OMITTED_BY_RULE",
        },
      },
      mt: { tags: {}, omitted: ["A.58a"] },
    });
  });

  it.each([
    [{}, "MESSAGE_CONTEXT_MISSING"],
    [{ sourceMessageType: "MT210" }, "MESSAGE_TYPE_NOT_SUPPORTED"],
    [{ currency: "XAU" }, "CURRENCY_NOT_SUPPORTED"],
    [{ occurrenceCount: 11 }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ "58A": "CITIUS33" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ "50F": "1/ACME", "52A": "CHASUS33" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ "50a": "", "52a": "" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ "25.source": "free text" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ occurrences: ["USD100", "EUR200"] }, "OPTION_CONSTRAINT_VIOLATION"],
  ])(
    "fails closed for notification policy case %#",
    (context, expectedCode) => {
      expect(service.resolve("NOTIFICATION", context)).toMatchObject({
        mx: { code: expectedCode, payloadGenerated: false },
      });
    },
  );

  it("renders ordering, intermediary, occurrence and selected-account context", () => {
    expect(
      service.resolve("NOTIFICATION", {
        "52A": "CHASUS33",
        "56A": "BOFAUS3N",
        occurrenceCount: 2,
        currency: "USD",
        accountCount: 2,
        selectedAccount: "/USD-RECEIPTS",
      }),
    ).toMatchObject({
      mx: {
        decision: "RESOLVED",
        canonicalRoles: {
          orderingInstitution: "CHASUS33",
          intermediary: "BOFAUS3N",
          expectedReceipts: 2,
          account: "/USD-RECEIPTS",
        },
      },
      mt: {
        tags: {
          "25": "/USD-RECEIPTS",
          "52A": "CHASUS33",
          "56A": "BOFAUS3N",
          repetitions: 2,
        },
        omitted: [],
        assertions: [],
      },
    });
  });

  it.each([
    [{ accountCount: 1, "52A": "CHASUS33" }, ["25", "50a"], ["C06 satisfied"]],
    [{ accountCount: 1 }, ["25"], []],
    [{ qaSeedIds: ["QA-NOTICE-1"] }, ["25", "50a"], ["exactly one of 50a/52a"]],
  ])(
    "derives single-account notification semantics %#",
    (context, omitted, assertions) => {
      expect(service.resolve("NOTIFICATION", context)).toMatchObject({
        mx: { canonicalRoles: { account: "derived single account" } },
        mt: { tags: { "52A": "CHASUS33" }, omitted, assertions },
      });
    },
  );

  it("normalizes the ordering customer name from the last 50F line", () => {
    expect(
      service.resolve("NOTIFICATION", { "50F": "/123\n1/ACME TRADING" }),
    ).toMatchObject({
      mx: { canonicalRoles: { orderingCustomer: "ACME TRADING" } },
      mt: {
        tags: { "50F": "/123\n1/ACME TRADING" },
        omitted: ["52a"],
        assertions: ["C06 satisfied"],
      },
    });
  });
});
