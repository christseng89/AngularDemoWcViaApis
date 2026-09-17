import { resolve } from "node:path";
import {
  ApiGovernedDataRepository,
  FetchJsonHttpClient,
} from "./api-snapshot.repository.ts";
import { JsonRepairReportWriter } from "./json-report.writer.ts";
import { GovernedDataRepairPlanner } from "./planner.ts";
import type { GovernedDataRepairReport } from "./repair-contracts.ts";

class RepairCliConfiguration {
  public readonly apiBase: string;
  public readonly outputFile: string;
  public readonly segmentCount: number;

  private constructor(input: {
    apiBase: string;
    outputFile: string;
    segmentCount: number;
  }) {
    this.apiBase = input.apiBase;
    this.outputFile = input.outputFile;
    this.segmentCount = input.segmentCount;
    Object.freeze(this);
  }

  static fromProcess(
    argv: readonly string[],
    environment: NodeJS.ProcessEnv,
  ): RepairCliConfiguration {
    const argumentsByName = new Map<string, string>();
    for (const value of argv) {
      const match = /^--([^=]+)=(.*)$/.exec(value);
      if (match?.[1]) argumentsByName.set(match[1], match[2] ?? "");
    }

    const segmentCount = Number(argumentsByName.get("segments") ?? "4");
    if (
      !Number.isInteger(segmentCount) ||
      segmentCount < 1 ||
      segmentCount > 16
    ) {
      throw new Error(`INVALID_SEGMENT_COUNT:${segmentCount}`);
    }

    return new RepairCliConfiguration({
      apiBase:
        argumentsByName.get("api") ??
        environment["SSI_BFF_URL"] ??
        "http://localhost:3100/api",
      outputFile: resolve(
        argumentsByName.get("output") ?? "tmp/governed-data-repair-v2.json",
      ),
      segmentCount,
    });
  }
}

class ConsoleRepairSummaryPresenter {
  present(report: GovernedDataRepairReport, outputFile: string): void {
    const summary = {
      mode: report.mode,
      outputFile,
      parameterSnapshotId: report.parameterSnapshotId,
      databaseWrites: report.metrics.databaseWrites,
      records: {
        ENTITY: report.domains.ENTITY.recordCount,
        NOSTRO: report.domains.NOSTRO.recordCount,
        SSI: report.domains.SSI.recordCount,
        RMA: report.domains.RMA.recordCount,
      },
      issues: {
        ENTITY: report.domains.ENTITY.issues.length,
        NOSTRO: report.domains.NOSTRO.issues.length,
        SSI: report.domains.SSI.issues.length,
        RMA: report.domains.RMA.issues.length,
      },
      rmaCanonicalGroups: report.domains.RMA.groups.length,
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
}

class GovernedDataRepairCli {
  private readonly configuration: RepairCliConfiguration;
  private readonly presenter: ConsoleRepairSummaryPresenter;

  constructor(
    configuration: RepairCliConfiguration,
    presenter: ConsoleRepairSummaryPresenter,
  ) {
    this.configuration = configuration;
    this.presenter = presenter;
  }

  async run(): Promise<void> {
    const repository = new ApiGovernedDataRepository(
      new FetchJsonHttpClient(this.configuration.apiBase),
    );
    const writer = new JsonRepairReportWriter(this.configuration.outputFile);
    const planner = GovernedDataRepairPlanner.standard(
      repository,
      writer,
      this.configuration.segmentCount,
    );
    const report = await planner.execute();
    this.presenter.present(report, this.configuration.outputFile);
  }

  static fromProcess(): GovernedDataRepairCli {
    return new GovernedDataRepairCli(
      RepairCliConfiguration.fromProcess(process.argv.slice(2), process.env),
      new ConsoleRepairSummaryPresenter(),
    );
  }
}

await GovernedDataRepairCli.fromProcess().run();
