import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RmaSupportedMessageTypeCatalogue } from "./rma-supported-message-type-catalogue";

const PARAMETER_FILES = [
  "rma-message-scope.sr2026.json",
  "payment-message-index.json",
  "ssi-mappings.sr2026.manifest.json",
  "resolution-page-scenarios.sr2026.json",
  "ssi-mappings.sr2026.json",
] as const;

function parameterDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rma-message-scope-"));
  for (const file of PARAMETER_FILES) {
    cpSync(join(process.cwd(), "parameters", file), join(directory, file));
  }
  return directory;
}

function mutateJson(
  directory: string,
  file: (typeof PARAMETER_FILES)[number],
  mutate: (value: Record<string, unknown>) => void,
): void {
  const path = join(directory, file);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<
    string,
    unknown
  >;
  mutate(value);
  writeFileSync(path, JSON.stringify(value));
}

describe("RMA supported message-type catalogue", () => {
  const policy = RmaSupportedMessageTypeCatalogue.fromWorkspace().loadPolicy();

  it("derives selectable SSI scope from governed parameters", () => {
    expect(policy.supportedMessageTypes).toEqual(
      expect.arrayContaining([
        "MT103",
        "pacs.008.001.08",
        "MT202",
        "pacs.009.001.08",
        "MT300",
        "MT400",
        "MT734",
      ]),
    );
    expect(policy.supportedMessageTypes).not.toContain("MT700");
    expect(policy.supportedMessageTypes).not.toContain("pacs.008.001.12");
  });

  it("exposes one governed presentation catalogue for the directional selector", () => {
    expect(policy.categories.map(({ categoryId }) => categoryId)).toEqual([
      "SECURITY",
      "TRADE_FINANCE",
      "PAYMENT",
    ]);
    expect(policy.items.map(({ messageType }) => messageType)).toEqual(
      policy.supportedMessageTypes,
    );
    expect(
      policy.items.every(
        ({ description, directionApplicability }) =>
          description.trim().length > 0 &&
          directionApplicability.inbound.applicable &&
          directionApplicability.outbound.applicable,
      ),
    ).toBe(true);
  });

  it("exposes governed CBPR+ legacy conversions separately from supported scope", () => {
    expect(policy.legacyConversions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "pacs.008.001.12",
          to: "pacs.008.001.08",
        }),
        expect.objectContaining({
          from: "pacs.009.001.12",
          to: "pacs.009.001.08",
        }),
      ]),
    );
    expect(policy.legacyConversions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "pacs.009.001.12.COV" }),
      ]),
    );
  });

  it("exposes only the approved development reference-gap groups", () => {
    expect(policy.developmentReferenceGapSkips).toEqual([
      expect.objectContaining({
        canonicalKey: "DEMOHKHHXXX|PCBCCNBJXXX|INBOUND",
        requiredSource: "SYNTHETIC_DEMO",
      }),
      expect.objectContaining({
        canonicalKey: "DEMOHKHHXXX|PCBCCNBJXXX|OUTBOUND",
        requiredSource: "SYNTHETIC_DEMO",
      }),
    ]);
  });

  it("keeps the convenience loader on the same governed catalogue", async () => {
    const { loadRmaSupportedMessageTypes } =
      await import("./rma-supported-message-type-catalogue");
    expect(loadRmaSupportedMessageTypes()).toEqual(
      policy.supportedMessageTypes,
    );
  });

  it.each([
    ["schemaVersion", 2],
    ["standardsRelease", "SR2025"],
    ["baseProfiles", null],
    ["legacyConversions", null],
    ["developmentReferenceGapSkips", null],
  ])("fails closed for invalid %s", (field, invalid) => {
    const directory = parameterDirectory();
    mutateJson(directory, "rma-message-scope.sr2026.json", (value) => {
      value[field] = invalid;
    });
    expect(() =>
      new RmaSupportedMessageTypeCatalogue(directory).load(),
    ).toThrow("INVALID_RMA_MESSAGE_SCOPE_PARAMETER");
  });

  it.each([
    ["to", "pacs.008.001.99"],
    ["from", "MT103"],
  ])("rejects an invalid legacy conversion %s", (field, invalid) => {
    const directory = parameterDirectory();
    mutateJson(directory, "rma-message-scope.sr2026.json", (value) => {
      const conversions = value["legacyConversions"] as Record<
        string,
        unknown
      >[];
      if (conversions[0]) conversions[0][field] = invalid;
    });
    expect(() =>
      new RmaSupportedMessageTypeCatalogue(directory).load(),
    ).toThrow("INVALID_RMA_LEGACY_CONVERSION");
  });

  it("ignores non-selectable and out-of-scope payment rows", () => {
    const directory = parameterDirectory();
    mutateJson(directory, "payment-message-index.json", (value) => {
      (value["items"] as unknown[]).push(
        { selectable: true, targetMessage: "camt.999" },
        { selectable: false, messageType: "MT299" },
      );
    });
    const supported = new RmaSupportedMessageTypeCatalogue(directory).load();
    expect(supported).not.toContain("camt.999");
    expect(supported).not.toContain("MT299");
  });
});
