import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

interface EvidenceField {
  sequence: string;
  tag: string;
  options: string[];
  fieldName: string;
}
interface MessageEvidence {
  messageType: string;
  pages: number[];
  coverage: string;
  status: string;
  fields?: EvidenceField[];
}
interface Manifest {
  sourceArtifacts: Array<{
    fileName: string;
    sha256: string;
    pageCount: number;
  }>;
  messageEvidence: MessageEvidence[];
}
interface Mapping {
  messageType: string;
  path: string;
  sequence?: string;
  option?: string;
  evidenceStatus?: string;
  suggestionEnabled?: boolean;
  evidenceArtifactId?: string;
  officialFieldName?: string;
  tag?: string;
  evidencePages?: number[];
}

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(
    join(root, "parameters", "ssi-mappings.sr2026.manifest.json"),
    "utf8",
  ),
) as Manifest;
const catalogue = JSON.parse(
  readFileSync(join(root, "parameters", "ssi-mappings.sr2026.json"), "utf8"),
) as { mappings: Mapping[] };

describe("Gate G2 SR2026 evidence", () => {
  it("pins the supplied source artifacts", () => {
    for (const artifact of manifest.sourceArtifacts) {
      const source = readFileSync(join(root, artifact.fileName));
      expect(createHash("sha256").update(source).digest("hex")).toBe(
        artifact.sha256,
      );
      expect(artifact.pageCount).toBeGreaterThan(0);
    }
  });

  it("does not treat pending-evidence messages as verified catalogue sources", () => {
    const pending = new Set(
      manifest.messageEvidence
        .filter((message) => message.status === "PENDING_EVIDENCE")
        .map((message) => message.messageType),
    );
    const unsupportedActiveRows = catalogue.mappings
      .filter(
        (mapping) =>
          pending.has(mapping.messageType) &&
          (mapping.evidenceStatus !== "PENDING_EVIDENCE" ||
            mapping.suggestionEnabled !== false),
      )
      .map((mapping) => `${mapping.messageType}:${mapping.path}`);
    expect(unsupportedActiveRows).toEqual([]);
  });

  it("uses complete sequence/tag/option profile keys for evidenced 5x rows", () => {
    const evidenced = new Map(
      manifest.messageEvidence
        .filter((message) => message.coverage === "FULL_MESSAGE_PROFILE")
        .map((message) => [message.messageType, message]),
    );
    const incomplete = catalogue.mappings
      .filter(
        (mapping) =>
          evidenced.has(mapping.messageType) &&
          /^5[0-9][A-Z]$/.test(mapping.path),
      )
      .filter(
        (mapping) =>
          !mapping.sequence ||
          !mapping.option ||
          mapping.evidenceStatus !== "FIELD_PROFILE_PROVEN" ||
          !mapping.evidenceArtifactId ||
          !mapping.officialFieldName,
      )
      .map((mapping) => `${mapping.messageType}:${mapping.path}`);
    expect(incomplete).toEqual([]);
  });

  it("cross-checks every MT3/MT4/MT7 catalogue row against its SR2026 MRG manifest", () => {
    const profiles = new Map(
      manifest.messageEvidence
        .filter(
          (message) =>
            /^MT[347]/.test(message.messageType) &&
            message.status === "FIELD_PROFILE_PROVEN",
        )
        .map((message) => [message.messageType, message]),
    );
    const rows = catalogue.mappings.filter(
      (mapping) =>
        /^MT[347]/.test(mapping.messageType) &&
        mapping.evidenceStatus === "FIELD_PROFILE_PROVEN",
    );
    const issues = rows.flatMap((mapping) => {
      const profile = profiles.get(mapping.messageType);
      if (!profile) return [`${mapping.messageType}:${mapping.path}:PROFILE`];
      const field = profile.fields?.find(
        (candidate) =>
          candidate.sequence === mapping.sequence &&
          candidate.tag === mapping.tag &&
          candidate.options.includes(mapping.option ?? ""),
      );
      if (!field) return [`${mapping.messageType}:${mapping.path}:FIELD_KEY`];
      if (field.fieldName !== mapping.officialFieldName)
        return [`${mapping.messageType}:${mapping.path}:FIELD_NAME`];
      if (
        !mapping.evidencePages?.length ||
        mapping.evidencePages.some((page) => !profile.pages.includes(page))
      )
        return [`${mapping.messageType}:${mapping.path}:EVIDENCE_PAGE`];
      return [];
    });

    expect(profiles.size).toBe(32);
    expect(rows).toHaveLength(476);
    expect(issues).toEqual([]);
  });
});
