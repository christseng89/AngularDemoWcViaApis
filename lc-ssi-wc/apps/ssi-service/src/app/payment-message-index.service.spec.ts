import { InternalServerErrorException } from "@nestjs/common";
import {
  PaymentMessageIndexService,
  validatePaymentMessageIndex,
} from "./payment-message-index.service";

const mtCompatibility = {
  mtCompatibility: {
    status: "SUPPORTED_SINGLE",
    ssiFields: ["57a"],
    mandatorySsiFields: ["57a"],
    requiredUpstreamFields: [],
    mrgPages: [13],
  },
};

describe("PaymentMessageIndexService", () => {
  it("accepts an ordered MT2XX catalogue with direct, split and notification profiles", () => {
    const index = validatePaymentMessageIndex({
      standardsRelease: "SR2026",
      maxBatchItems: 100,
      items: [
        {
          order: 1,
          messageType: "MT200",
          description: "Own Account Transfer",
          processingMode: "SINGLE",
          profileStatus: "PROFILE_VERIFIED",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
          ...mtCompatibility,
        },
        {
          order: 2,
          messageType: "MT201",
          description: "Multiple Own Account Transfer",
          processingMode: "SPLIT",
          profileStatus: "NO_DIRECT_1_TO_1_PROFILE",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
          ...mtCompatibility,
        },
        {
          order: 9,
          messageType: "MT210",
          description: "Notice to Receive",
          processingMode: "NOTIFICATION",
          profileStatus: "PROFILE_VERIFIED",
          targetMessage: "camt.057.001.06",
          businessService: "swift.cbprplus.04",
          selectable: false,
          ...mtCompatibility,
        },
      ],
    });

    expect(index.items.map((item) => item.messageType)).toEqual([
      "MT200",
      "MT201",
      "MT210",
    ]);
    expect(index.items[1]).toMatchObject({
      processingMode: "SPLIT",
      selectable: true,
    });
  });

  it("loads and returns the deployed parameter registry", () => {
    const index = new PaymentMessageIndexService().getIndex();
    expect(index.standardsRelease).toBe("SR2026");
    expect(index.items[0]?.messageType).toBe("MT200");
    expect(index.pagination).toEqual({
      mode: "PAGE_BY_PAGE", defaultPageSize: 10, maxPageSize: 100,
    });
    expect(
      index.items.find((item) => item.messageType === "MT203"),
    ).toMatchObject({
      processingMode: "SPLIT",
      selectable: false,
    });
  });

  it("exposes exactly the outward FI-to-FI Counterparty SSI allow-list", () => {
    const selectable = new PaymentMessageIndexService()
      .getIndex()
      .items.filter((item) => item.selectable)
      .map((item) => item.messageType);
    expect(selectable).toEqual(["MT202", "MT202COV", "MT205", "MT205COV"]);
  });

  it.each([
    ["MT200", "NOT_SUPPORTED", ["57a"], ["OWN_SSI_PROFILE"]],
    ["MT201", "NOT_SUPPORTED", ["57a"], ["FIN_FI_TO_FI_NOT_AVAILABLE"]],
    ["MT202", "SUPPORTED_SINGLE", [], ["58a"]],
    ["MT202COV", "SUPPORTED_SINGLE", [], ["A.58a", "B.50a", "B.59a"]],
    ["MT203", "NOT_SUPPORTED", [], ["58a", "FIN_FI_TO_FI_NOT_AVAILABLE"]],
    ["MT204", "NOT_SUPPORTED", ["B.53a"], ["DIRECT_DEBIT_MUG_PROFILE"]],
    ["MT205", "SUPPORTED_SINGLE", [], ["52a", "58a"]],
    ["MT205COV", "SUPPORTED_SINGLE", [], ["A.52a", "A.58a", "B.50a", "B.59a"]],
    ["MT210", "NOT_SUPPORTED", [], ["NOTICE_TO_RECEIVE_CONTEXT"]],
  ])(
    "pins %s to its MRG-backed compatibility profile",
    (messageType, status, mandatorySsiFields, requiredUpstreamFields) => {
      const profile = new PaymentMessageIndexService()
        .getIndex()
        .items.find((item) => item.messageType === messageType);
      expect(profile?.mtCompatibility).toMatchObject({
        status,
        mandatorySsiFields,
        requiredUpstreamFields,
      });
      expect(profile?.mtCompatibility.mrgPages.length).toBeGreaterThan(0);
    },
  );

  it("wraps registry loading errors with a stable service code", () => {
    const cwd = jest
      .spyOn(process, "cwd")
      .mockReturnValue("Z:/missing-payment-index");
    let caught: unknown;
    try {
      new PaymentMessageIndexService();
    } catch (error) {
      caught = error;
    } finally {
      cwd.mockRestore();
    }
    expect(caught).toBeInstanceOf(InternalServerErrorException);
    expect(
      (caught as InternalServerErrorException).getResponse(),
    ).toMatchObject({ code: "PAYMENT_MESSAGE_INDEX_INVALID" });
  });

  it("does not expose a non-Error registry parser failure", () => {
    const parse = jest.spyOn(JSON, "parse").mockImplementation(() => {
      throw "RAW_PARSE_FAILURE";
    });
    let caught: unknown;
    try {
      new PaymentMessageIndexService();
    } catch (error) {
      caught = error;
    } finally {
      parse.mockRestore();
    }
    expect(
      (caught as InternalServerErrorException).getResponse(),
    ).toMatchObject({
      code: "PAYMENT_MESSAGE_INDEX_INVALID",
      cause: "UNKNOWN",
    });
  });

  it("records an Error message as the internal registry failure cause", () => {
    const parse = jest.spyOn(JSON, "parse").mockImplementation(() => {
      throw new Error("BROKEN_JSON");
    });
    let caught: unknown;
    try {
      new PaymentMessageIndexService();
    } catch (error) {
      caught = error;
    } finally {
      parse.mockRestore();
    }
    expect(
      (caught as InternalServerErrorException).getResponse(),
    ).toMatchObject({ cause: "BROKEN_JSON" });
  });

  it("sorts valid rows by the configured order", () => {
    const index = validatePaymentMessageIndex({
      standardsRelease: "SR2026",
      maxBatchItems: 2,
      items: [
        {
          order: 2,
          messageType: "MT203",
          description: "B",
          processingMode: "SPLIT",
          profileStatus: "P",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
          ...mtCompatibility,
        },
        {
          order: 1,
          messageType: "MT201",
          description: "A",
          processingMode: "SPLIT",
          profileStatus: "P",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
          ...mtCompatibility,
        },
      ],
    });
    expect(index.items.map((item) => item.messageType)).toEqual([
      "MT201",
      "MT203",
    ]);
  });

  it("rejects duplicate message types and unsupported categories", () => {
    const duplicate = {
      standardsRelease: "SR2026",
      maxBatchItems: 100,
      items: [
        {
          order: 1,
          messageType: "MT201",
          description: "A",
          processingMode: "SPLIT",
          profileStatus: "NO_DIRECT_1_TO_1_PROFILE",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
          ...mtCompatibility,
        },
        {
          order: 2,
          messageType: "MT201",
          description: "B",
          processingMode: "SPLIT",
          profileStatus: "NO_DIRECT_1_TO_1_PROFILE",
          targetMessage: "pacs.009.001.08",
          businessService: "swift.cbprplus.04",
          selectable: true,
          ...mtCompatibility,
        },
      ],
    };
    expect(() => validatePaymentMessageIndex(duplicate)).toThrow(
      "DUPLICATE_PAYMENT_MESSAGE_TYPE",
    );
    expect(() =>
      validatePaymentMessageIndex({
        ...duplicate,
        items: [{ ...duplicate.items[0], messageType: "MT103" }],
      }),
    ).toThrow("PAYMENT_INDEX_MT2XX_ONLY");
  });

  it.each([
    [null, "INVALID_PAYMENT_MESSAGE_INDEX"],
    [
      { standardsRelease: "SR2025", maxBatchItems: 100, items: [] },
      "UNSUPPORTED_PAYMENT_INDEX_RELEASE",
    ],
    [
      { standardsRelease: "SR2026", maxBatchItems: 0, items: [] },
      "INVALID_MAX_BATCH_ITEMS",
    ],
    [
      { standardsRelease: "SR2026", maxBatchItems: "100", items: [] },
      "INVALID_MAX_BATCH_ITEMS",
    ],
    [
      { standardsRelease: "SR2026", maxBatchItems: 100 },
      "PAYMENT_INDEX_ITEMS_REQUIRED",
    ],
    [
      { standardsRelease: "SR2026", maxBatchItems: 100, items: [null] },
      "INVALID_PAYMENT_INDEX_ITEM",
    ],
    [
      { standardsRelease: "SR2026", maxBatchItems: 100, items: [{ order: 1 }] },
      "PAYMENT_INDEX_MT2XX_ONLY",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 1,
            messageType: "MT201",
            description: "A",
            processingMode: "UNKNOWN",
            profileStatus: "P",
            targetMessage: "T",
            businessService: "B",
          },
        ],
      },
      "INVALID_PAYMENT_PROCESSING_MODE",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 0,
            messageType: "MT201",
            description: "A",
            processingMode: "SPLIT",
            profileStatus: "P",
            targetMessage: "T",
            businessService: "B",
          },
        ],
      },
      "INVALID_PAYMENT_INDEX_ORDER",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: "one",
            messageType: "MT201",
            description: "A",
            processingMode: "SPLIT",
            profileStatus: "P",
            targetMessage: "T",
            businessService: "B",
          },
        ],
      },
      "INVALID_PAYMENT_INDEX_ORDER",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 1,
            messageType: "MT201",
            description: "",
            processingMode: "SPLIT",
            profileStatus: "P",
            targetMessage: "T",
            businessService: "B",
          },
        ],
      },
      "PAYMENT_INDEX_DESCRIPTION_REQUIRED",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 1,
            messageType: "MT201",
            processingMode: "SPLIT",
            profileStatus: "P",
            targetMessage: "T",
            businessService: "B",
          },
        ],
      },
      "PAYMENT_INDEX_DESCRIPTION_REQUIRED",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 1,
            messageType: "MT201",
            description: "A",
            processingMode: "SPLIT",
            profileStatus: "",
            targetMessage: "T",
            businessService: "B",
          },
        ],
      },
      "PAYMENT_INDEX_PROFILESTATUS_REQUIRED",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 1,
            messageType: "MT201",
            description: "A",
            processingMode: "SPLIT",
            profileStatus: "P",
            targetMessage: "",
            businessService: "B",
          },
        ],
      },
      "PAYMENT_INDEX_TARGETMESSAGE_REQUIRED",
    ],
    [
      {
        standardsRelease: "SR2026",
        maxBatchItems: 100,
        items: [
          {
            order: 1,
            messageType: "MT201",
            description: "A",
            processingMode: "SPLIT",
            profileStatus: "P",
            targetMessage: "T",
            businessService: "",
          },
        ],
      },
      "PAYMENT_INDEX_BUSINESSSERVICE_REQUIRED",
    ],
  ])("rejects malformed parameter documents", (document, code) => {
    expect(() => validatePaymentMessageIndex(document)).toThrow(code);
  });

  it.each([
    [undefined, "PAYMENT_INDEX_MT_COMPATIBILITY_REQUIRED"],
    [{}, "INVALID_PAYMENT_MT_COMPATIBILITY_STATUS"],
    [
      {
        status: "SUPPORTED_SINGLE",
        ssiFields: "57a",
        mandatorySsiFields: ["57a"],
        requiredUpstreamFields: [],
        mrgPages: [13],
      },
      "INVALID_PAYMENT_SSI_FIELDS",
    ],
    [
      {
        status: "SUPPORTED_SINGLE",
        ssiFields: ["57a"],
        mandatorySsiFields: [""],
        requiredUpstreamFields: [],
        mrgPages: [13],
      },
      "INVALID_PAYMENT_MANDATORY_SSI_FIELDS",
    ],
    [
      {
        status: "SUPPORTED_SINGLE",
        ssiFields: ["57a"],
        mandatorySsiFields: ["57a"],
        requiredUpstreamFields: [1],
        mrgPages: [13],
      },
      "INVALID_PAYMENT_REQUIRED_UPSTREAM_FIELDS",
    ],
    [
      {
        status: "SUPPORTED_SINGLE",
        ssiFields: ["57a"],
        mandatorySsiFields: ["57a"],
        requiredUpstreamFields: [],
        mrgPages: [],
      },
      "PAYMENT_INDEX_MRG_PAGES_REQUIRED",
    ],
  ])("rejects malformed MRG compatibility metadata", (compatibility, code) => {
    expect(() =>
      validatePaymentMessageIndex({
        standardsRelease: "SR2026",
        maxBatchItems: 1,
        items: [
          {
            order: 1,
            messageType: "MT200",
            description: "Own Account Transfer",
            processingMode: "SINGLE",
            profileStatus: "PROFILE_VERIFIED",
            targetMessage: "pacs.009.001.08",
            businessService: "swift.cbprplus.04",
            selectable: true,
            ...(compatibility === undefined
              ? {}
              : { mtCompatibility: compatibility }),
          },
        ],
      }),
    ).toThrow(code);
  });
});
