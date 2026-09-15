import { BadRequestException } from "@nestjs/common";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MappingCatalogueService } from "./mapping-catalogue.service";

const catalogue = {
  catalogueVersion: "2026.1-test",
  disclaimer: "test only",
  mappings: [
    {
      standardsRelease: "SR2026",
      messageType: "MT400",
      direction: "OUTGOING",
      businessFunction: "COLLECTION_PAYMENT_DIRECT",
      path: "53A",
      sequence: "MESSAGE",
      option: "A",
      canonicalRole: "SENDERS_CORRESPONDENT",
      officialFieldName: "Sender's Correspondent",
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
    },
  ],
};

const create = (value: unknown = catalogue) => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-catalogue-"));
  const path = join(directory, "catalogue.json");
  writeFileSync(path, JSON.stringify(value), "utf8");
  return new MappingCatalogueService({
    SR2026: { path, sourceArtifactId: "G2-SR2026-TEST" },
  });
};

describe("MappingCatalogueService", () => {
  it("loads and freezes an exact release with pinned provenance", () => {
    const loaded = create().get("SR2026");
    expect(loaded).toMatchObject({
      standardsRelease: "SR2026",
      catalogueVersion: "2026.1-test",
      sourceArtifactId: "G2-SR2026-TEST",
    });
    expect(loaded.sourceArtifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.mappings)).toBe(true);
  });

  it("pins the startup snapshot instead of reading the file per call", () => {
    const directory = mkdtempSync(join(tmpdir(), "ssi-catalogue-once-"));
    const path = join(directory, "catalogue.json");
    writeFileSync(path, JSON.stringify(catalogue), "utf8");
    const service = new MappingCatalogueService({
      SR2026: { path, sourceArtifactId: "G2-SR2026-TEST" },
    });
    writeFileSync(path, "not-json", "utf8");
    expect(service.get("SR2026").catalogueVersion).toBe("2026.1-test");
  });

  it("fails closed for an unsupported release", () => {
    expect(() => create().get("SR2025")).toThrow(BadRequestException);
  });

  it.each([
    {},
    { ...catalogue, catalogueVersion: "" },
    { ...catalogue, mappings: [{ ...catalogue.mappings[0], standardsRelease: "SR2025" }] },
  ])("rejects malformed or cross-release catalogue %#", (value) => {
    expect(() => create(value)).toThrow(BadRequestException);
  });

  it("rejects a proven field profile without an official field name", () => {
    const invalid = {
      ...catalogue,
      mappings: catalogue.mappings.map(
        ({ officialFieldName: _officialFieldName, ...mapping }) => mapping,
      ),
    };
    expect(() => create(invalid)).toThrow(BadRequestException);
  });
});
