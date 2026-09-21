import {
  governanceRecordValue,
  requestTypeLabel,
} from "../../app/governance-record-value";

describe("governed index presentation values", () => {
  it("preserves the shared Checker and Audit request/status labels", () => {
    expect(requestTypeLabel({ changeType: "SUPPRESSION" })).toBe("SUPPRESSED");
    expect(requestTypeLabel({ changeType: "REVISION" })).toBe("EDIT");
    expect(requestTypeLabel({ amendmentOfId: "SSI-1" })).toBe("EDIT");
    expect(requestTypeLabel({})).toBe("ADD");
    expect(
      governanceRecordValue({ status: "PENDING_APPROVAL" }, "status"),
    ).toBe("SUBMITTED");
  });

  it("retains nested, composite, array and missing-column formatting", () => {
    const record = {
      route: { bookingEntity: "HK01", ownerParty: "BANK-1" },
      messageTypes: ["MT300", "MT304"],
    };
    expect(
      governanceRecordValue(record, "route.bookingEntity|route.ownerParty"),
    ).toBe("HK01 / BANK-1");
    expect(governanceRecordValue(record, "messageTypes")).toBe("MT300, MT304");
    expect(governanceRecordValue(record, "missing.path")).toBe("—");
  });
});
