import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Mt1SsiProfileRegistry } from "../../app/mt1-ssi-profile.registry";

describe("Mt1SsiProfileRegistry fail-closed loading", () => {
  it("rejects unreadable and invalid OAS contracts", () => {
    expect(
      () =>
        new Mt1SsiProfileRegistry({
          oasPath: join(process.cwd(), "tmp", "missing-mt1-oas.json"),
        }),
    ).toThrow("MT1_SSI_OAS_LOAD_FAILED");

    const invalidPath = join(process.cwd(), "tmp", "invalid-mt1-oas.json");
    writeFileSync(
      invalidPath,
      JSON.stringify({ "x-mt1-ssi-resolution": { schemaVersion: "0.0" } }),
    );
    expect(
      () => new Mt1SsiProfileRegistry({ oasPath: invalidPath }),
    ).toThrow("MT1_SSI_OAS_INVALID");
  });
});
