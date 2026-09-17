import { readFileSync } from "node:fs";
import { Sha256FileIdentity } from "../governed-data-repair/artifact-io.ts";
import {
  FrozenMt347DemoOracle,
  type Mt347DemoOracleDocument,
} from "./oracle-contract.ts";

export interface Mt347DemoOracleRepositoryOptions {
  readonly oraclePath: string;
  readonly expectedSha256: string;
}

export class Mt347DemoOracleRepository {
  private readonly oraclePath: string;
  private readonly expectedSha256: string;
  private readonly identity: Sha256FileIdentity;

  constructor(options: Mt347DemoOracleRepositoryOptions) {
    this.oraclePath = options.oraclePath;
    this.expectedSha256 = options.expectedSha256.toUpperCase();
    this.identity = new Sha256FileIdentity();
  }

  load(): FrozenMt347DemoOracle {
    const bytes = readFileSync(this.oraclePath);
    this.identity.assertFile(
      this.oraclePath,
      this.expectedSha256,
      "ORACLE_SHA_MISMATCH",
    );

    const document = JSON.parse(bytes.toString("utf8")) as unknown;
    this.assertDocument(document);
    return new FrozenMt347DemoOracle(document);
  }

  private assertDocument(
    value: unknown,
  ): asserts value is Mt347DemoOracleDocument {
    if (!value || typeof value !== "object") {
      throw new Error("INVALID_ORACLE_DOCUMENT");
    }
    const document = value as Partial<Mt347DemoOracleDocument>;
    if (
      document.schemaVersion !== "1.1.0" ||
      document.documentId !== "MT347-DEMO-CLOSURE-V1.1"
    ) {
      throw new Error("UNSUPPORTED_ORACLE_VERSION");
    }
    if (!Array.isArray(document.groups) || document.groups.length !== 208) {
      throw new Error("INVALID_ORACLE_GROUP_COUNT");
    }
    if (document.reconciliation?.allChecksPass !== true) {
      throw new Error("ORACLE_RECONCILIATION_NOT_APPROVED");
    }
  }
}
