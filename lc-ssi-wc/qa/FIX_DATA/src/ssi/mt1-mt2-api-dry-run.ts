import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { SsiMt1Mt2CandidateGenerator } from "./mt1-mt2-candidate-generator.ts";

type JsonObject = Record<string, unknown>;
type Fetch = typeof fetch;

interface RuntimeResponse {
  readonly currentSnapshot: { readonly sha256: string; readonly method: string };
}

interface ImportResponse {
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly results: readonly JsonObject[];
  readonly executionTelemetry: {
    readonly databaseWriteAttempts: number;
    readonly nostroLookupAttempts: number;
  };
}

export interface Mt1Mt2ApiDryRunReport {
  readonly status: "PASS";
  readonly mode: "API_DRY_RUN_ZERO_WRITE";
  readonly apiBase: string;
  readonly candidateSsiRows: 49;
  readonly accepted: 49;
  readonly rejected: 0;
  readonly applicabilityContextsReconciled: 128;
  readonly ruleGroups: 67;
  readonly inScopeGroups: 62;
  readonly outOfScopeGroups: 5;
  readonly outOfScopeSubmitted: 0;
  readonly virtualNostroMode: "CONTROLLED_VIRTUAL_STUB_ONLY";
  readonly expectedVirtualNostroCalls: 0;
  readonly actualVirtualNostroCalls: 0;
  readonly beforeSnapshot: string;
  readonly afterSnapshot: string;
  readonly databaseWrites: 0;
  readonly candidateSha256: string;
  readonly applicabilityMappingSha256: string;
  readonly applicabilityMappings: readonly {
    readonly sourceId: string;
    readonly successorId: string;
    readonly ssiId: string;
  }[];
}

const sha = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").toUpperCase();

export class Mt1Mt2ApiDryRun {
  private readonly fetcher: Fetch;
  private readonly databasePath: string;
  private readonly ruleTablePath: string;
  private readonly apiBase: string;

  constructor(
    databasePath: string,
    ruleTablePath: string,
    apiBase: string,
    fetcher: Fetch = fetch,
  ) {
    this.databasePath = databasePath;
    this.ruleTablePath = ruleTablePath;
    this.apiBase = apiBase;
    this.fetcher = fetcher;
  }

  async run(): Promise<Mt1Mt2ApiDryRunReport> {
    const candidates = new SsiMt1Mt2CandidateGenerator(
      this.databasePath,
      this.ruleTablePath,
    ).generate();
    const table = JSON.parse(readFileSync(resolve(this.ruleTablePath), "utf8")) as {
      rows: JsonObject[];
    };
    const before = await this.get<RuntimeResponse>("settings/runtime");
    const response = await this.get<ImportResponse>("swift-data/imports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "SSI",
        fileName: "ssi-mt1-mt2-pacs008-pacs009-demo.json",
        dryRun: true,
        idempotencyKey: `ssi-mt1-mt2-dry-run-${randomUUID()}`,
        records: candidates.ssi.map((item) => item.payload),
      }),
    });
    const after = await this.get<RuntimeResponse>("settings/runtime");
    const oos = table.rows.filter(
      (row) => String(row.scopeStatus) === "OUT_OF_SCOPE_CLOSED",
    );
    const oosSourceIds = new Set(
      oos.map((row) =>
        String((row.inputCondition as JsonObject).sourceRecordId),
      ),
    );
    const submittedOos = candidates.ssi.filter((candidate) =>
      oosSourceIds.has(candidate.sourceId),
    ).length;
    const expectedVirtualNostroCalls = table.rows.reduce(
      (sum, row) => sum + Number(row.expectedStubCallCount),
      0,
    );
    if (
      response.total !== 49 ||
      response.accepted !== 49 ||
      response.rejected !== 0 ||
      candidates.applicability.length !== 128 ||
      table.rows.length !== 67 ||
      oos.length !== 5 ||
      submittedOos !== 0 ||
      expectedVirtualNostroCalls !== 0 ||
      response.executionTelemetry.databaseWriteAttempts !== 0 ||
      response.executionTelemetry.nostroLookupAttempts !== 0 ||
      before.currentSnapshot.sha256 !== after.currentSnapshot.sha256
    )
      throw new Error("MT1_MT2_API_DRY_RUN_FAILED");
    const applicabilityMappings = candidates.applicability.map((item) => ({
      sourceId: item.sourceId,
      successorId: item.id,
      ssiId: item.ssiId,
    }));
    return {
      status: "PASS",
      mode: "API_DRY_RUN_ZERO_WRITE",
      apiBase: this.apiBase,
      candidateSsiRows: 49,
      accepted: 49,
      rejected: 0,
      applicabilityContextsReconciled: 128,
      ruleGroups: 67,
      inScopeGroups: 62,
      outOfScopeGroups: 5,
      outOfScopeSubmitted: submittedOos,
      virtualNostroMode: "CONTROLLED_VIRTUAL_STUB_ONLY",
      expectedVirtualNostroCalls: 0,
      actualVirtualNostroCalls:
        response.executionTelemetry.nostroLookupAttempts,
      beforeSnapshot: before.currentSnapshot.sha256,
      afterSnapshot: after.currentSnapshot.sha256,
      databaseWrites: response.executionTelemetry.databaseWriteAttempts,
      candidateSha256: sha(candidates),
      applicabilityMappingSha256: sha(applicabilityMappings),
      applicabilityMappings,
    };
  }

  private async get<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(
      `${this.apiBase.replace(/\/$/, "")}/api/${path}`,
      init,
    );
    const text = await response.text();
    if (!response.ok)
      throw new Error(`API_DRY_RUN_REQUEST_FAILED:${response.status}:${text}`);
    return JSON.parse(text) as T;
  }
}

const main = async (): Promise<void> => {
  const root = resolve(process.cwd());
  const output = resolve(
    root,
    "qa/FIX_DATA/ssi/mt1-mt2/round6-api-dry-run-evidence.v1.json",
  );
  const report = await new Mt1Mt2ApiDryRun(
    resolve(root, "data/ssi-demo.sqlite"),
    resolve(root, "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json"),
    process.env["SSI_API_BASE"] ?? "http://localhost:3101",
  ).run();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

if (process.argv[1]?.endsWith("mt1-mt2-api-dry-run.ts"))
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
