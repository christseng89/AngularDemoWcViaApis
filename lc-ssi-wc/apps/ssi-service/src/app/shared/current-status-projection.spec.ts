import {
  currentStatusFromOpenRevision,
  type OpenRevisionProjection,
} from "./current-status-projection";

describe("currentStatusFromOpenRevision", () => {
  const ordinaryStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const;
  const resources = ["RMA", "ENTITY", "NOSTRO", "SSI"] as const;

  for (const resource of resources) {
    it(`${resource}: projects EMPTY without an open child`, () => {
      expect(currentStatusFromOpenRevision(undefined)).toBe("EMPTY");
    });

    it(`${resource}: projects WIP ordinary child as IN_PROGRESS`, () => {
      expect(
        currentStatusFromOpenRevision({
          status: "WIP",
          changeType: "REVISION",
        }),
      ).toBe("IN_PROGRESS");
    });

    for (const status of ordinaryStatuses) {
      it(`${resource}: projects ${status} ordinary child as DRAFTED`, () => {
        expect(
          currentStatusFromOpenRevision({ status, changeType: "REVISION" }),
        ).toBe("DRAFTED");
      });

      it(`${resource}: projects ${status} suppression child as SUPPRESSED`, () => {
        expect(
          currentStatusFromOpenRevision({ status, changeType: "SUPPRESSION" }),
        ).toBe("SUPPRESSED");
      });
    }
  }

  it("fails closed for a suppression WIP reservation", () => {
    const child: OpenRevisionProjection = {
      status: "WIP",
      changeType: "SUPPRESSION",
    };
    expect(currentStatusFromOpenRevision(child)).toBe("IN_PROGRESS");
  });
});
