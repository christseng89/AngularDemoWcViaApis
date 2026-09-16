import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  GovernedDataRepairReport,
  RepairReportWriter,
} from "./repair-contracts.ts";

export class JsonRepairReportWriter implements RepairReportWriter {
  private readonly outputFile: string;

  constructor(outputFile: string) {
    this.outputFile = outputFile;
  }

  async write(report: GovernedDataRepairReport): Promise<void> {
    await mkdir(dirname(this.outputFile), { recursive: true });
    await writeFile(
      this.outputFile,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
}
