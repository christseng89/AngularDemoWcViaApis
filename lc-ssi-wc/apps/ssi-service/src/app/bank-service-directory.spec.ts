import { BadRequestException } from "@nestjs/common";
import { BankServiceDirectory } from "./bank-service-directory";

describe("BankServiceDirectory", () => {
  const directory = new BankServiceDirectory();

  it("resolves a stable Bank Service identity to its server-side BIC", () => {
    expect(directory.resolve("BANK-SVC-CITIUS33")).toMatchObject({
      bankServiceId: "BANK-SVC-CITIUS33",
      bic: "CITIUS33",
      country: "US",
    });
  });

  it("resolves SSI-referenced BIC8/BIC11 and directory-only identities", () => {
    expect(directory.resolve("BANK-SVC-ROYCCAT2").bic).toBe("ROYCCAT2");
    expect(directory.resolve("BANK-SVC-UBSWCHZH80A").bic).toBe("UBSWCHZH80A");
    expect(directory.resolve("BANK-SVC-DMOAAEAD")).toMatchObject({
      bic: "DMOAAEAD",
      usageGroup: "DIRECTORY_ONLY_NO_SSI",
    });
  });

  it("does not resolve inactive identities", () => {
    expect(() => directory.resolve("BANK-SVC-DMOZUSN1")).toThrow(
      "BANK_SERVICE_NOT_FOUND",
    );
  });

  it("fails closed for a missing or unknown Bank Service identity", () => {
    expect(() => directory.resolve("")).toThrow(
      new BadRequestException("BANK_SERVICE_ID_REQUIRED"),
    );
    expect(() => directory.resolve("BANK-SVC-UNKNOWN")).toThrow(
      new BadRequestException("BANK_SERVICE_NOT_FOUND"),
    );
  });

  it("lists active identities and searches stable ID, BIC and display attributes", () => {
    expect(directory.search()).toHaveLength(28);
    expect(directory.search("bank-svc-citius33")).toEqual([
      expect.objectContaining({ bankServiceId: "BANK-SVC-CITIUS33" }),
    ]);
    expect(directory.search("Frankfurt")).toEqual([
      expect.objectContaining({ bic: "DEUTDEFF" }),
    ]);
    expect(directory.search("no-such-bank")).toEqual([]);
  });
});
