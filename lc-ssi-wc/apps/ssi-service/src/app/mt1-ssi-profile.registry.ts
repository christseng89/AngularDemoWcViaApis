import { Injectable, Optional } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Mt1SsiProfile {
  readonly profileId: string;
  readonly messageType: "MT103" | "pacs.008.001.08";
  readonly messageDefinitionId?: "pacs.008.001.08";
  readonly businessService: string;
  readonly allowedOptions: Readonly<Record<string, readonly string[]>>;
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
}

@Injectable()
export class Mt1SsiProfileRegistry {
  private readonly contract: Mt1SsiOasContract;

  constructor(@Optional() options?: Mt1SsiProfileRegistryOptions) {
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
          typeof profile["allowedOptions"] === "object",
      )
    );
  }
}
