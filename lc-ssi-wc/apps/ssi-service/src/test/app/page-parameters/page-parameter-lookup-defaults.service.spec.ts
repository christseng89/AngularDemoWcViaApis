import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PageParameterLookupDefaultsService } from "../../../app/page-parameters/page-parameter-lookup-defaults.service";

describe("PageParameterLookupDefaultsService", () => {
  it("rejects more than one default for the same governed currency context", () => {
    const directory = mkdtempSync(join(tmpdir(), "ssi-lookup-defaults-"));
    const path = join(directory, "defaults.json");
    const policy = {
      policyId: "POLICY-1",
      scope: "EXECUTABLE_SSI",
      bookingEntity: "HK01",
      currencies: ["EUR", "USD"],
      defaultBankServiceId: "BANK-SVC-DEUTDEFF",
    };
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: "1.0",
        policies: [
          policy,
          { ...policy, policyId: "POLICY-2", currencies: ["USD"] },
        ],
      }),
    );
    try {
      expect(() => new PageParameterLookupDefaultsService({ path })).toThrow(
        "PAGE_PARAMETER_LOOKUP_DEFAULT_NOT_UNIQUE",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
