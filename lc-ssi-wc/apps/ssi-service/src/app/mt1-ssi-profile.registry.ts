import { Injectable, Optional } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Mt1SsiProfile {
  readonly profileId: string;
  readonly messageType: "MT103" | "pacs.008.001.08";
  readonly messageDefinitionId?: "pacs.008.001.08";
  readonly businessService: string;
  readonly allowedOptions: Readonly<Record<string, readonly string[]>>;
  readonly index: {
    readonly visible: boolean;
    readonly groupId: string;
    readonly label: string;
    readonly order: number;
    readonly generatedFields: readonly string[];
  };
  readonly resolutionEvidence: {
    readonly formats: readonly ("SWIFT_MT" | "ISO_20022")[];
    readonly swiftMtRenderableOptions?: readonly string[];
    readonly counterpartProfileId?: string;
    readonly counterpartBusinessService?: string;
  };
  readonly approval?: {
    readonly status: "APPROVED";
    readonly product: string;
    readonly service: string;
    readonly community: string;
    readonly mug: string;
    readonly effectiveFrom: string;
    readonly effectiveTo: string;
  };
}

export interface Mt1SsiInputParameter {
  readonly fieldId: string;
  readonly path: string;
  readonly label: string;
  readonly control: "SELECT" | "DATE";
  readonly dataType: "ISO_CURRENCY" | "STRING" | "DATE" | "SWIFT_BIC";
  readonly options?: readonly string[];
  readonly defaultValue?: string;
  readonly lookup?: "SSI_COUNTERPARTY";
  readonly displayOrder: number;
}

export interface Mt1SsiScenario {
  readonly scenarioId: string;
  readonly label: string;
  readonly transferMethod: "SERIAL" | "COVER";
  readonly settlementContext: "INDA" | "INGA" | "COVE";
  readonly fixtureBindingId: string;
}

interface Mt1SsiOasContract {
  readonly schemaVersion: "1.0";
  readonly standardsRelease: "SR2026";
  readonly scope: "OUTWARD_SSI_ONLY";
  readonly profiles: readonly Mt1SsiProfile[];
  readonly inputParameters: readonly Mt1SsiInputParameter[];
  readonly scenarios: readonly Mt1SsiScenario[];
}

export interface Mt1SsiProfileRegistryOptions {
  readonly oasPath?: string;
  readonly asOfDate?: string;
}

@Injectable()
export class Mt1SsiProfileRegistry {
  private readonly contract: Mt1SsiOasContract;
  private readonly asOfDate: string;

  constructor(@Optional() options?: Mt1SsiProfileRegistryOptions) {
    this.asOfDate = options?.asOfDate ?? new Date().toISOString().slice(0, 10);
    const path =
      options?.oasPath ??
      join(process.cwd(), "openapi", "swift-data-service.v1.json");
    this.contract = this.load(path);
  }

  profiles(): readonly Mt1SsiProfile[] {
    return this.contract.profiles;
  }

  inputs(): readonly Mt1SsiInputParameter[] {
    return this.contract.inputParameters;
  }

  scenarios(): readonly Mt1SsiScenario[] {
    return this.contract.scenarios;
  }

  find(profileId: string): Mt1SsiProfile | undefined {
    return this.contract.profiles.find(
      (profile) => profile.profileId === profileId,
    );
  }

  private load(path: string): Mt1SsiOasContract {
    let value: unknown;
    try {
      const document = JSON.parse(readFileSync(path, "utf8")) as Record<
        string,
        unknown
      >;
      value = document["x-mt1-ssi-resolution"];
    } catch {
      throw new Error("MT1_SSI_OAS_LOAD_FAILED");
    }
    if (!this.valid(value)) throw new Error("MT1_SSI_OAS_INVALID");
    return value;
  }

  private valid(value: unknown): value is Mt1SsiOasContract {
    if (!value || typeof value !== "object") return false;
    const contract = value as Record<string, unknown>;
    if (
      contract["schemaVersion"] !== "1.0" ||
      contract["standardsRelease"] !== "SR2026" ||
      contract["scope"] !== "OUTWARD_SSI_ONLY" ||
      !Array.isArray(contract["profiles"]) ||
      contract["profiles"].length !== 5 ||
      !Array.isArray(contract["inputParameters"]) ||
      !Array.isArray(contract["scenarios"])
    )
      return false;
    const profiles = contract["profiles"] as Record<string, unknown>[];
    const validIndex = (profile: Record<string, unknown>): boolean => {
      const index = profile["index"] as Record<string, unknown> | undefined;
      return Boolean(
        index &&
        typeof index["visible"] === "boolean" &&
        typeof index["groupId"] === "string" &&
        typeof index["label"] === "string" &&
        Number.isInteger(index["order"]) &&
        Array.isArray(index["generatedFields"]) &&
        index["generatedFields"].every(
          (field) => typeof field === "string" && field.trim(),
        ),
      );
    };
    const validEvidence = (profile: Record<string, unknown>): boolean => {
      const evidence = profile["resolutionEvidence"] as
        Record<string, unknown> | undefined;
      return Boolean(
        evidence &&
        Array.isArray(evidence["formats"]) &&
        evidence["formats"].length > 0 &&
        evidence["formats"].every((format) =>
          ["SWIFT_MT", "ISO_20022"].includes(String(format)),
        ) &&
        (evidence["swiftMtRenderableOptions"] === undefined ||
          (Array.isArray(evidence["swiftMtRenderableOptions"]) &&
            evidence["swiftMtRenderableOptions"].every(
              (option) => typeof option === "string" && option.trim(),
            ))) &&
        (evidence["counterpartProfileId"] === undefined ||
          typeof evidence["counterpartProfileId"] === "string") &&
        (evidence["counterpartBusinessService"] === undefined ||
          typeof evidence["counterpartBusinessService"] === "string"),
      );
    };
    const validApproval = (profile: Record<string, unknown>): boolean => {
      if (profile["profileId"] !== "MT103-REMIT-SR2026") return true;
      const approval = profile["approval"] as
        | Record<string, unknown>
        | undefined;
      return Boolean(
        approval?.["status"] === "APPROVED" &&
          ["product", "service", "community", "mug"].every(
            (key) => typeof approval[key] === "string" && approval[key],
          ) &&
          typeof approval?.["effectiveFrom"] === "string" &&
          approval["effectiveFrom"] <= this.asOfDate &&
          typeof approval?.["effectiveTo"] === "string" &&
          approval["effectiveTo"] >= this.asOfDate,
      );
    };
    const profilesById = new Map(
      profiles.map((profile) => [String(profile["profileId"]), profile]),
    );
    const validCounterpart = (profile: Record<string, unknown>): boolean => {
      const evidence = profile["resolutionEvidence"] as Record<string, unknown>;
      const counterpartId = evidence["counterpartProfileId"];
      const counterpartService = evidence["counterpartBusinessService"];
      if (counterpartId === undefined && counterpartService === undefined)
        return true;
      if (
        typeof counterpartId !== "string" ||
        typeof counterpartService !== "string"
      )
        return false;
      const counterpart = profilesById.get(counterpartId);
      const counterpartEvidence = counterpart?.["resolutionEvidence"] as
        Record<string, unknown> | undefined;
      return Boolean(
        counterpart &&
        counterpart["messageType"] === "pacs.008.001.08" &&
        counterpart["businessService"] === counterpartService &&
        Array.isArray(counterpartEvidence?.["formats"]) &&
        counterpartEvidence["formats"].includes("ISO_20022"),
      );
    };
    return (
      new Set(profiles.map((profile) => profile["profileId"])).size === 5 &&
      profiles.every(
        (profile) =>
          typeof profile["profileId"] === "string" &&
          ["MT103", "pacs.008.001.08"].includes(
            String(profile["messageType"]),
          ) &&
          typeof profile["businessService"] === "string" &&
          profile["allowedOptions"] !== null &&
          typeof profile["allowedOptions"] === "object" &&
          validIndex(profile) &&
          validEvidence(profile) &&
          validApproval(profile) &&
          validCounterpart(profile),
      )
    );
  }
}
