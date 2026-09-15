import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashCanonical } from "./canonical-json";
import { scalarText } from "./scalar-text";

export type MappingDirection = "INCOMING" | "OUTGOING";
export type MappingEvidenceStatus = "FIELD_PROFILE_PROVEN" | "PENDING_EVIDENCE";
export interface Mapping {
  standardsRelease: string;
  messageType: string;
  businessService?: string;
  direction: MappingDirection;
  businessFunction: string;
  path: string;
  sequence?: string;
  subsequence?: string;
  settlementLeg?: string;
  tag?: string;
  option?: string;
  qualifier?: string;
  canonicalRole: string;
  officialRole?: string;
  officialFieldName?: string;
  presence?: "MANDATORY" | "OPTIONAL";
  scopeStatus?: "SSI_SUPPORTED" | "OUT_OF_SSI_SCOPE";
  nvrRefs?: string[];
  reusableCandidate: boolean;
  evidenceStatus?: MappingEvidenceStatus;
  suggestionEnabled?: boolean;
  evidenceArtifactId?: string;
  evidencePages?: number[];
  selectionPolicy?:
    "PREFERRED_WHEN_BIC_IDENTIFIED" | "EXCEPTION_REQUIRES_REASON";
  /** Stable reference only. Page scenarios and inputs live in their own versioned catalogue. */
  pageProfileId?: string;
}
export interface LoadedCatalogue {
  standardsRelease: string;
  catalogueVersion: string;
  sourceArtifactId: string;
  sourceArtifactHash: string;
  mappings: readonly Readonly<Mapping>[];
}
export interface CatalogueSource {
  path: string;
  sourceArtifactId: string;
}
export const MAPPING_CATALOGUE_REGISTRY = Symbol("MAPPING_CATALOGUE_REGISTRY");

const defaultRegistry = (): Readonly<Record<string, CatalogueSource>> => ({
  SR2026: {
    path: join(process.cwd(), "parameters", "ssi-mappings.sr2026.json"),
    sourceArtifactId: "parameters/ssi-mappings.sr2026.json",
  },
});

const freezeMapping = (mapping: Mapping): Readonly<Mapping> =>
  Object.freeze({ ...mapping });

const hasText = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim());

const isString = (value: unknown): value is string => typeof value === "string";

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === "string";

const isOptionalOneOf = (value: unknown, allowed: readonly string[]): boolean =>
  value === undefined || allowed.includes(scalarText(value));

const isOptionalStringArray = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

const hasProvenFieldProfile = (mapping: Record<string, unknown>): boolean =>
  mapping["evidenceStatus"] !== "FIELD_PROFILE_PROVEN" ||
  (typeof mapping["sequence"] === "string" &&
    typeof mapping["option"] === "string" &&
    hasText(mapping["officialFieldName"]));

const hasValidEvidencePages = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every((page) => Number.isInteger(page) && Number(page) > 0));

const isMapping = (item: unknown, release: string): item is Mapping => {
  if (!item || typeof item !== "object") return false;
  const mapping = item as Record<string, unknown>;
  return (
    mapping["standardsRelease"] === release &&
    isString(mapping["messageType"]) &&
    isOptionalString(mapping["businessService"]) &&
    ["INCOMING", "OUTGOING"].includes(String(mapping["direction"])) &&
    isString(mapping["businessFunction"]) &&
    isString(mapping["path"]) &&
    isString(mapping["canonicalRole"]) &&
    isOptionalString(mapping["officialFieldName"]) &&
    isOptionalString(mapping["settlementLeg"]) &&
    isOptionalOneOf(mapping["scopeStatus"], [
      "SSI_SUPPORTED",
      "OUT_OF_SSI_SCOPE",
    ]) &&
    isOptionalStringArray(mapping["nvrRefs"]) &&
    hasProvenFieldProfile(mapping) &&
    typeof mapping["reusableCandidate"] === "boolean" &&
    isOptionalOneOf(mapping["evidenceStatus"], [
      "FIELD_PROFILE_PROVEN",
      "PENDING_EVIDENCE",
    ]) &&
    (mapping["suggestionEnabled"] === undefined ||
      typeof mapping["suggestionEnabled"] === "boolean") &&
    isOptionalString(mapping["evidenceArtifactId"]) &&
    isOptionalOneOf(mapping["selectionPolicy"], [
      "PREFERRED_WHEN_BIC_IDENTIFIED",
      "EXCEPTION_REQUIRES_REASON",
    ]) &&
    hasValidEvidencePages(mapping["evidencePages"]) &&
    isOptionalString(mapping["pageProfileId"])
  );
};

@Injectable()
export class MappingCatalogueService {
  private readonly loaded = new Map<string, LoadedCatalogue>();

  constructor(
    @Optional()
    @Inject(MAPPING_CATALOGUE_REGISTRY)
    registry?: Readonly<Record<string, CatalogueSource>>,
  ) {
    for (const [release, source] of Object.entries(
      registry ?? defaultRegistry(),
    ))
      this.loaded.set(release, this.load(release, source));
  }

  get(standardsRelease: string): LoadedCatalogue {
    const catalogue = this.loaded.get(standardsRelease);
    if (!catalogue)
      throw new BadRequestException({
        code: "UNSUPPORTED_STANDARDS_RELEASE",
        standardsRelease,
      });
    return catalogue;
  }

  private load(release: string, source: CatalogueSource): LoadedCatalogue {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(source.path, "utf8"));
    } catch {
      throw new BadRequestException({
        code: "MAPPING_CATALOGUE_LOAD_FAILED",
        release,
      });
    }
    if (!this.isCatalogue(parsed, release))
      throw new BadRequestException({
        code: "MAPPING_CATALOGUE_INVALID",
        release,
      });
    const mappings = Object.freeze(parsed.mappings.map(freezeMapping));
    return Object.freeze({
      standardsRelease: release,
      catalogueVersion: parsed.catalogueVersion,
      sourceArtifactId: source.sourceArtifactId,
      sourceArtifactHash: hashCanonical(parsed),
      mappings,
    });
  }

  private isCatalogue(
    value: unknown,
    release: string,
  ): value is { catalogueVersion: string; mappings: Mapping[] } {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    if (!scalarText(candidate["catalogueVersion"]).trim()) return false;
    if (!Array.isArray(candidate["mappings"]) || !candidate["mappings"].length)
      return false;
    return candidate["mappings"].every((item) => isMapping(item, release));
  }
}
