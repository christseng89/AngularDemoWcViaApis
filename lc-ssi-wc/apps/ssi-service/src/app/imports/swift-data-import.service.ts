import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  SsiApplicationService,
  type CreateSsiCommand,
} from "../ssi-application.service";
import {
  RmaApplicationService,
  type RmaCommand,
} from "../rma/rma-application.service";
import {
  NostroApplicationService,
  type NostroCommand,
} from "../nostro/nostro-application.service";
import {
  EntityApplicationService,
  type EntityCommand,
} from "../entity/entity-application.service";
import { Mt347DemoImportValidationProfile } from "./mt347-demo-import-validation.profile";
export interface ImportRequest {
  dataType: "SSI" | "RMA" | "NOSTRO" | "ENTITY";
  fileName: string;
  checksum?: string;
  dryRun?: boolean;
  idempotencyKey: string;
  records: unknown[];
}
interface ImportExecutionTelemetry {
  databaseWriteAttempts: number;
  nostroLookupAttempts: number;
}
const validEnvelope = (request: ImportRequest): boolean =>
  Boolean(request.fileName?.endsWith(".json")) &&
  Boolean(request.idempotencyKey) &&
  Array.isArray(request.records) &&
  request.records.length >= 1 &&
  request.records.length <= 500 &&
  ["SSI", "RMA", "NOSTRO", "ENTITY"].includes(request.dataType);

const checksumFor = (records: unknown[]): string =>
  createHash("sha256").update(JSON.stringify(records)).digest("hex");

@Injectable()
export class SwiftDataImportService {
  private readonly completed = new Map<string, unknown>();
  constructor(
    private readonly ssi: SsiApplicationService,
    private readonly rma: RmaApplicationService,
    private readonly nostro: NostroApplicationService,
    private readonly entity: EntityApplicationService,
    private readonly mt347DemoProfile: Mt347DemoImportValidationProfile =
      new Mt347DemoImportValidationProfile(),
  ) {}
  import(request: ImportRequest): unknown {
    if (!validEnvelope(request))
      throw new BadRequestException("INVALID_IMPORT_ENVELOPE");
    const actual = checksumFor(request.records);
    if (request.checksum && request.checksum.toLowerCase() !== actual)
      throw new BadRequestException("CHECKSUM_MISMATCH");
    if (this.completed.has(request.idempotencyKey))
      return this.completed.get(request.idempotencyKey);
    const telemetry: ImportExecutionTelemetry = {
      databaseWriteAttempts: 0,
      nostroLookupAttempts: 0,
    };
    const results = request.records.map((record, index) =>
      this.importRecord(request, record, index, telemetry),
    );
    const response = this.importResponse(request, actual, results, telemetry);
    if (!request.dryRun) this.completed.set(request.idempotencyKey, response);
    return response;
  }

  private importRecord(
    request: ImportRequest,
    record: unknown,
    index: number,
    telemetry: ImportExecutionTelemetry,
  ): Record<string, unknown> {
    try {
      if (request.dryRun) {
        this.validateDryRunRecord(request.dataType, record);
        return { row: index + 1, status: "VALIDATED" };
      }
      telemetry.databaseWriteAttempts += 1;
      const created = this.createRecord(request.dataType, record);
      return { row: index + 1, status: "DRAFT_CREATED", id: created.id };
    } catch (error) {
      return {
        row: index + 1,
        status: "REJECTED",
        code: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      };
    }
  }

  private validateDryRunRecord(
    dataType: ImportRequest["dataType"],
    record: unknown,
  ): void {
    if (
      dataType === "SSI" &&
      this.mt347DemoProfile.validateDryRunIfApplicable(record)
    ) {
      return;
    }
    this.validateRecord(dataType, record);
  }

  private validateRecord(
    dataType: ImportRequest["dataType"],
    record: unknown,
  ): void {
    if (dataType === "SSI") this.ssi.validate(record as CreateSsiCommand);
    else if (dataType === "RMA") this.rma.validateCommand(record as RmaCommand);
    else if (dataType === "NOSTRO")
      this.nostro.validateCommand(record as NostroCommand);
    else this.entity.validateCommand(record as EntityCommand);
  }

  private createRecord(dataType: ImportRequest["dataType"], record: unknown) {
    if (dataType === "SSI") return this.ssi.create(record as CreateSsiCommand);
    if (dataType === "RMA") return this.rma.create(record as RmaCommand);
    if (dataType === "NOSTRO")
      return this.nostro.create(record as NostroCommand);
    return this.entity.create(record as EntityCommand);
  }

  private importResponse(
    request: ImportRequest,
    checksum: string,
    results: readonly Record<string, unknown>[],
    telemetry: ImportExecutionTelemetry,
  ): Record<string, unknown> {
    return {
      dataType: request.dataType,
      fileName: request.fileName,
      dryRun: Boolean(request.dryRun),
      checksum,
      total: results.length,
      accepted: results.filter((r) => r.status !== "REJECTED").length,
      rejected: results.filter((r) => r.status === "REJECTED").length,
      results,
      executionTelemetry: {
        databaseWriteAttempts: telemetry.databaseWriteAttempts,
        nostroLookupAttempts: telemetry.nostroLookupAttempts,
      },
    };
  }
}
