import { readFileSync } from "node:fs";
import { join } from "node:path";

interface OasParameter {
  readonly name: string;
  readonly required?: boolean;
  readonly schema?: {
    readonly enum?: readonly (string | boolean)[];
  };
}

interface OasOperation {
  readonly operationId?: string;
  readonly parameters?: readonly OasParameter[];
}

interface OasSchema {
  readonly description?: string;
  readonly properties?: Readonly<
    Record<
      string,
      {
        readonly type?: string;
        readonly enum?: readonly string[];
        readonly description?: string;
      }
    >
  >;
}

interface Mt1OasContract {
  readonly messageFamily: string;
  readonly paymentDirection: string;
  readonly localBankRole: string;
  readonly productType: string;
  readonly profileSelectionRule: string;
}

interface OasDocument {
  readonly "x-mt1-ssi-resolution": Mt1OasContract;
  readonly "x-mt2-ssi-resolution": Mt1OasContract;
  readonly paths: Readonly<Record<string, { readonly get?: OasOperation }>>;
  readonly components: {
    readonly schemas: Readonly<Record<string, OasSchema>>;
  };
}

const readOasText = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

const readOas = (path: string): OasDocument =>
  JSON.parse(readOasText(path)) as OasDocument;

describe("MT1 / pacs.008 outward SSI OpenAPI contract", () => {
  it("publishes the controlled SSI-only boundary and profile-selection invariant", () => {
    const contract = readOas("openapi/swift-data-service.v1.json")[
      "x-mt1-ssi-resolution"
    ];

    expect(contract).toMatchObject({
      messageFamily: "MT1_PACS008",
      paymentDirection: "OUTWARD",
      localBankRole: "INSTRUCTING_AGENT",
      productType: "SSI_RESOLUTION_ONLY",
    });
    expect(contract.profileSelectionRule).toContain("BizSvc");
    expect(contract.profileSelectionRule).toContain("MsgDefIdr");
  });

  it("publishes the MT2 / pacs.009 outward SSI-only boundary", () => {
    expect(
      readOas("openapi/swift-data-service.v1.json")["x-mt2-ssi-resolution"],
    ).toMatchObject({
      messageFamily: "MT2_PACS009",
      paymentDirection: "OUTWARD",
      localBankRole: "INSTRUCTING_AGENT",
      productType: "SSI_RESOLUTION_ONLY",
    });
  });

  it("documents MT103 and pacs.008 page-definition selection", () => {
    const operation = readOas("openapi/swift-data-service.v1.json").paths[
      "/v1/resolution-page-definitions"
    ]?.get;
    const parameters = new Map(
      operation?.parameters?.map((parameter) => [parameter.name, parameter]),
    );

    expect(parameters.get("messageType")?.schema?.enum).toEqual(
      expect.arrayContaining(["MT103", "pacs.008.001.08"]),
    );
    expect(parameters.get("businessService")?.schema?.enum).toEqual(
      expect.arrayContaining([
        "FIN-MT103-BASE",
        "FIN-MT103-STP",
        "FIN-MT103-REMIT",
        "swift.cbprplus.04",
        "swift.cbprplus.stp.04",
      ]),
    );
  });

  it("documents the governed counterparty lookup required before resolution", () => {
    const operation = readOas("openapi/swift-data-service.v1.json").paths[
      "/v1/resolution-page-definitions/lookups/ssi-counterparties"
    ]?.get;

    expect(operation?.operationId).toBe("listSsiCounterparties");
    expect(
      operation?.parameters
        ?.filter(({ required }) => required)
        .map(({ name }) => name),
    ).toEqual([
      "scenarioId",
      "messageType",
      "sequence",
      "currency",
      "bookingEntity",
      "valueDate",
    ]);
  });

  it("publishes MT1 applicability, outcome and atomic route identity", () => {
    const execution = readOas("openapi/swift-data-service.v1.json").components
      .schemas["ResolutionPageExecutionResult"];

    expect(execution?.properties?.["ssiApplicability"]?.enum).toEqual([
      "NOT_EVALUATED",
      "REQUIRED",
      "NOT_REQUIRED",
    ]);
    expect(execution?.properties?.["resolutionOutcome"]?.enum).toEqual([
      "BILATERAL_RELATIONSHIP_CONFIRMED",
      "ELIGIBLE_COMPLETE_ROUTE",
      "NO_ELIGIBLE_SSI",
      "AMBIGUOUS_ROUTE",
      "STALE",
      "INVALID_CONTEXT_TOPOLOGY",
      "INVALID_UPSTREAM_CONTEXT",
      "PROFILE_INCOMPLETE",
      "UNSUPPORTED_DIRECTION",
      "UNSUPPORTED_PROFILE",
      "RMA_NOT_AUTHORIZED",
      "JURISDICTION_EVIDENCE_CONFLICT",
      "JURISDICTION_NOT_PERMITTED",
    ]);
    expect(execution?.properties?.["routeBindingId"]?.type).toBe("string");
    expect(execution?.properties?.["profileKind"]?.enum).toEqual([
      "SSI_RESOLUTION_ONLY",
    ]);
    expect(execution?.properties?.["paymentExecutable"]?.enum).toEqual([
      false,
    ]);
    expect(execution?.properties?.["contextSnapshotId"]?.type).toBe("string");
    expect(execution?.properties?.["rmaAuthorizationDecisionId"]?.type).toBe(
      "string",
    );
    expect(execution?.properties?.["evidenceCards"]?.type).toBe("array");
    expect(execution?.properties?.["outputs"]?.description).toContain(
      "MT103 Base and STP",
    );
    expect(execution?.properties?.["outputs"]?.description).toContain(
      "MT103 REMIT returns SWIFT_MT only",
    );
  });

  it("keeps the canonical and browser-served contracts byte-identical", () => {
    expect(
      readOasText("apps/ssi-portal/public/openapi/swift-data-service.v1.json"),
    ).toBe(readOasText("openapi/swift-data-service.v1.json"));
  });
});
