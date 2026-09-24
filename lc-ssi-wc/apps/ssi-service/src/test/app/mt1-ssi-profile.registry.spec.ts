import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Mt1SsiProfileRegistry } from "../../app/mt1-ssi-profile.registry";

describe("Mt1SsiProfileRegistry fail-closed loading", () => {
  it("publishes the controlled MT profile index and evidence pairing policy", () => {
    const profiles = new Mt1SsiProfileRegistry().profiles();

    expect(
      profiles.map(({ profileId, index, resolutionEvidence }) => ({
        profileId,
        index,
        resolutionEvidence,
      })),
    ).toEqual([
      {
        profileId: "MT103-BASE-SR2026",
        index: {
          visible: true,
          groupId: "PAYMENT:MT103:BASE",
          label: "MT103 — Base",
          order: 1,
          generatedFields: ["53a", "54a", "55a", "56a", "57a"],
        },
        resolutionEvidence: {
          formats: ["SWIFT_MT", "ISO_20022"],
          swiftMtRenderableOptions: ["A"],
          counterpartProfileId: "PACS008-PLAIN-SR2026",
          counterpartBusinessService: "swift.cbprplus.04",
        },
      },
      {
        profileId: "MT103-STP-SR2026",
        index: {
          visible: true,
          groupId: "PAYMENT:MT103:STP",
          label: "MT103 — STP",
          order: 2,
          generatedFields: ["53a", "54A", "55A", "56A", "57A"],
        },
        resolutionEvidence: {
          formats: ["SWIFT_MT", "ISO_20022"],
          swiftMtRenderableOptions: ["A"],
          counterpartProfileId: "PACS008-STP-SR2026",
          counterpartBusinessService: "swift.cbprplus.stp.04",
        },
      },
      {
        profileId: "MT103-REMIT-SR2026",
        index: {
          visible: true,
          groupId: "PAYMENT:MT103:REMIT",
          label: "MT103 — REMIT",
          order: 3,
          generatedFields: ["53a", "54a", "55a", "56a", "57a"],
        },
        resolutionEvidence: {
          formats: ["SWIFT_MT"],
          swiftMtRenderableOptions: ["A"],
        },
      },
      {
        profileId: "PACS008-PLAIN-SR2026",
        index: {
          visible: false,
          groupId: "PAYMENT:PACS008:PLAIN",
          label: "pacs.008 — Plain",
          order: 4,
          generatedFields: [],
        },
        resolutionEvidence: { formats: ["ISO_20022"] },
      },
      {
        profileId: "PACS008-STP-SR2026",
        index: {
          visible: false,
          groupId: "PAYMENT:PACS008:STP",
          label: "pacs.008 — STP",
          order: 5,
          generatedFields: [],
        },
        resolutionEvidence: { formats: ["ISO_20022"] },
      },
    ]);
  });

  it("requires an effective approved Product/service/community/MUG gate for REMIT", () => {
    const remit = new Mt1SsiProfileRegistry().find("MT103-REMIT-SR2026");

    expect(remit?.approval).toEqual({
      status: "APPROVED",
      product: "FIN",
      service: "MT103_REMIT",
      community: "CBPR_PLUS",
      mug: "MT103_REMIT_SR2026",
      effectiveFrom: "2026-01-01",
      effectiveTo: "9999-12-31",
    });
  });

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
    expect(() => new Mt1SsiProfileRegistry({ oasPath: invalidPath })).toThrow(
      "MT1_SSI_OAS_INVALID",
    );
  });

  it("rejects a counterpart that does not exist or has a different business service", () => {
    const source = JSON.parse(
      readFileSync(
        join(process.cwd(), "openapi", "swift-data-service.v1.json"),
        "utf8",
      ),
    ) as {
      "x-mt1-ssi-resolution": {
        profiles: Array<{
          profileId: string;
          resolutionEvidence: {
            counterpartProfileId?: string;
            counterpartBusinessService?: string;
          };
        }>;
      };
    };
    const contract = source["x-mt1-ssi-resolution"];
    const base = contract.profiles.find(
      (profile: Record<string, unknown>) =>
        profile["profileId"] === "MT103-BASE-SR2026",
    );
    base.resolutionEvidence.counterpartProfileId = "PACS008-MISSING-SR2026";
    const missingPath = join(
      process.cwd(),
      "tmp",
      "invalid-mt1-counterpart-oas.json",
    );
    writeFileSync(missingPath, JSON.stringify(source));
    expect(() => new Mt1SsiProfileRegistry({ oasPath: missingPath })).toThrow(
      "MT1_SSI_OAS_INVALID",
    );

    base.resolutionEvidence.counterpartProfileId = "PACS008-PLAIN-SR2026";
    base.resolutionEvidence.counterpartBusinessService =
      "swift.cbprplus.stp.04";
    writeFileSync(missingPath, JSON.stringify(source));
    expect(() => new Mt1SsiProfileRegistry({ oasPath: missingPath })).toThrow(
      "MT1_SSI_OAS_INVALID",
    );
  });
});
