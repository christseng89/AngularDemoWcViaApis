import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scalarText } from "../scalar-text";

export interface ResolutionPageFixtureManifestEntry {
  readonly bindingId: string;
  readonly fixtureSet: string;
  readonly fixtureVersion: string;
  readonly sourceArtifactId: string;
  readonly sourceArtifactSha256: string;
  readonly isolation: "CANONICAL" | "TRANSACTIONAL_NEGATIVE" | "BOUNDARY";
}

export interface ResolutionPageFixtureManifestSource {
  readonly path: string;
  readonly additionalPaths?: readonly string[];
}
export const RESOLUTION_PAGE_FIXTURE_MANIFEST_SOURCE = Symbol(
  "RESOLUTION_PAGE_FIXTURE_MANIFEST_SOURCE",
);
const SHA256 = /^[a-f\d]{64}$/i;
const isolationFor = (
  polarity: unknown,
): ResolutionPageFixtureManifestEntry["isolation"] => {
  if (polarity === "NEGATIVE") return "TRANSACTIONAL_NEGATIVE";
  if (polarity === "BOUNDARY") return "BOUNDARY";
  return "CANONICAL";
};

@Injectable()
export class ResolutionPageFixtureManifestService {
  private readonly entries: ReadonlyMap<
    string,
    ResolutionPageFixtureManifestEntry
  >;

  constructor(
    @Optional()
    @Inject(RESOLUTION_PAGE_FIXTURE_MANIFEST_SOURCE)
    source?: ResolutionPageFixtureManifestSource,
  ) {
    const paths = source
      ? [source.path, ...(source.additionalPaths ?? [])]
      : [
          join(
            process.cwd(),
            "parameters",
            "mt347-fixture-binding-manifest.sr2026.json",
          ),
          join(
            process.cwd(),
            "parameters",
            "resolution-page-fixtures.mt2-pacs009.sr2026.json",
          ),
        ];
    const bindings = paths
      .flatMap((path) => this.load(path))
      .map((entry) => ({
        bindingId: String(entry["bindingId"]),
        fixtureSet: String(entry["fixtureSet"]),
        fixtureVersion:
          scalarText(entry["fixtureVersion"]).trim() ||
          String(entry["bindingId"]).split("@").at(-1) ||
          "v1",
        sourceArtifactId: String(
          entry["sourceFile"] ?? entry["sourceArtifactId"],
        ),
        sourceArtifactSha256: String(
          entry["sourceFileSha256"] ?? entry["sourceArtifactSha256"],
        ),
        isolation: isolationFor(entry["polarity"]),
      }));
    const ids = bindings.map(({ bindingId }) => bindingId);
    if (
      new Set(ids).size !== ids.length ||
      bindings.some(
        (entry) =>
          !entry.bindingId?.trim() ||
          !entry.fixtureSet?.trim() ||
          !entry.fixtureVersion?.trim() ||
          !entry.sourceArtifactId?.trim() ||
          !SHA256.test(entry.sourceArtifactSha256) ||
          !["CANONICAL", "TRANSACTIONAL_NEGATIVE", "BOUNDARY"].includes(
            entry.isolation,
          ),
      )
    )
      throw new BadRequestException({ code: "PAGE_FIXTURE_MANIFEST_INVALID" });
    this.entries = new Map(
      bindings.map((entry) => [entry.bindingId, Object.freeze({ ...entry })]),
    );
  }

  private load(path: string): readonly Record<string, unknown>[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new BadRequestException({
        code: "PAGE_FIXTURE_MANIFEST_LOAD_FAILED",
      });
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as Record<string, unknown>)["bindings"])
    )
      throw new BadRequestException({ code: "PAGE_FIXTURE_MANIFEST_INVALID" });
    return (parsed as { bindings: Record<string, unknown>[] }).bindings;
  }

  require(bindingId: string): ResolutionPageFixtureManifestEntry {
    const entry = this.entries.get(bindingId);
    if (!entry)
      throw new BadRequestException({
        code: "PAGE_FIXTURE_BINDING_NOT_GOVERNED",
        bindingId,
      });
    return entry;
  }

  count(): number {
    return this.entries.size;
  }
}
