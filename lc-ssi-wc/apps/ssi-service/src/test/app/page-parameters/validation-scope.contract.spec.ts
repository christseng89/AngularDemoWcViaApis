import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  PageParameterNvrOutcome,
  PageParameterValidationDisposition,
  PageParameterValidationScope,
  ResolutionPageGeneratedOutput,
} from "@ssi/contracts";

interface OasSchema {
  readonly enum?: readonly string[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, unknown>>;
}

interface OasDocument {
  readonly "x-ui-resources": readonly {
    readonly id: string;
    readonly fields: readonly {
      readonly key: string;
      readonly options?: readonly string[];
    }[];
  }[];
  readonly components: {
    readonly schemas: Readonly<Record<string, OasSchema>>;
  };
}

const readOas = (path: string): OasDocument =>
  JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as OasDocument;

describe("resolution-page NVR validation scope contract", () => {
  it("models validation scope and expected outcome independently from execution", () => {
    const validationScope: PageParameterValidationScope =
      "IN_SCOPE_SSI_TAG_NVR";
    const expectedOutcome: PageParameterNvrOutcome = "PASS";
    const disposition: PageParameterValidationDisposition = {
      validationScope,
      owner: "SSI_FIELD_RESOLUTION_API",
      taxonomy: "NETWORK_VALIDATED_RULE",
      expectedOutcome,
      ruleIds: ["RULE-C81"],
    };

    expect(disposition).toEqual({
      validationScope: "IN_SCOPE_SSI_TAG_NVR",
      owner: "SSI_FIELD_RESOLUTION_API",
      taxonomy: "NETWORK_VALIDATED_RULE",
      expectedOutcome: "PASS",
      ruleIds: ["RULE-C81"],
    });
  });

  it("publishes the additive validation schemas and all canonical outcomes", () => {
    const oas = readOas("openapi/swift-data-service.v1.json");
    const schemas = oas.components.schemas;

    expect(schemas["PageParameterValidationScope"]?.enum).toEqual([
      "IN_SCOPE_SSI_TAG_NVR",
      "OUT_OF_SCOPE_FULL_FIN_NVR",
    ]);
    expect(schemas["PageParameterNvrOutcome"]?.enum).toEqual([
      "PASS",
      "FAIL",
      "NOT_EVALUATED",
    ]);
    expect(schemas["PageParameterValidationDisposition"]?.required).toEqual([
      "validationScope",
      "owner",
      "taxonomy",
      "expectedOutcome",
      "ruleIds",
    ]);
    expect(schemas["ResolutionPageExecutionResult"]?.properties).toHaveProperty(
      "nvrOutcome",
    );
  });

  it("publishes generic server-generated MT and ISO 20022 output contracts", () => {
    const mt: ResolutionPageGeneratedOutput = {
      outputId: "swift-mt",
      format: "SWIFT_MT",
      label: "MT202",
      messageIdentity: "MT202",
      mediaType: "application/json",
      document: { tags: { "53A": "CITIUS33" } },
    };
    const pacs: ResolutionPageGeneratedOutput = {
      outputId: "iso-20022",
      format: "ISO_20022",
      label: "pacs.009.001.08",
      messageIdentity: "pacs.009.001.08",
      mediaType: "application/json",
      document: { messageDefinitionId: "pacs.009.001.08" },
    };
    const oas = readOas("openapi/swift-data-service.v1.json");
    const output = oas.components.schemas["ResolutionPageGeneratedOutput"];
    const execution = oas.components.schemas["ResolutionPageExecutionResult"];

    expect([mt.format, pacs.format]).toEqual(["SWIFT_MT", "ISO_20022"]);
    expect(output?.required).toEqual([
      "outputId",
      "format",
      "label",
      "messageIdentity",
      "mediaType",
      "document",
    ]);
    expect(execution?.required).toContain("outputs");
    expect(execution?.properties).toHaveProperty("outputs");
  });

  it("adds the governed .08 message definition without fabricating profile suffixes", () => {
    const oas = readOas("openapi/swift-data-service.v1.json");
    const rma = oas["x-ui-resources"].find(({ id }) => id === "rma");
    const messageTypes = rma?.fields.find(
      ({ key }) => key === "messageTypes",
    )?.options;

    expect(messageTypes).toEqual(
      expect.arrayContaining([
        "pacs.009.001.08",
        "pacs.009.001.12",
        "pacs.009.001.12.COV",
      ]),
    );
    expect(messageTypes).not.toContain("pacs.009.001.08.COV");
    expect(messageTypes).not.toContain("pacs.009.001.08.ADV");
  });

  it("keeps the service and portal OpenAPI mirrors byte-identical", () => {
    expect(
      readFileSync(
        join(
          process.cwd(),
          "apps/ssi-portal/public/openapi/swift-data-service.v1.json",
        ),
        "utf8",
      ),
    ).toBe(
      readFileSync(
        join(process.cwd(), "openapi/swift-data-service.v1.json"),
        "utf8",
      ),
    );
  });

  it("does not expose raw COV 32A as a client submission field", () => {
    const oas = readOas("openapi/swift-data-service.v1.json");
    const submission = oas.components.schemas["ResolutionPageSubmission"];
    const values = submission?.properties?.["values"] as
      | { readonly description?: string; readonly properties?: object }
      | undefined;

    expect(values?.properties).not.toHaveProperty("context.swift32A");
    expect(values?.description).toContain(
      "derives 32A from governed typed date, currency and amount values",
    );
  });
});
