import { Inject, Injectable, Optional } from "@nestjs/common";
import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { hashCanonical } from "./canonical-json";

export const SQLITE_SNAPSHOT_IDENTITY_METHOD =
  "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1";

type SqlValue = null | number | string | bigint | Uint8Array;
type SnapshotIdentity = { readonly sha256: string; readonly method: string };

const fileIdentity = (path: string): string => {
  try {
    const stat = statSync(path, { bigint: true });
    return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    if (code === "ENOENT") return "MISSING";
    throw error;
  }
};

export const databaseSnapshotFingerprint = (databasePath: string): string =>
  [databasePath, `${databasePath}-wal`]
    .map((path) => `${path}:${fileIdentity(path)}`)
    .join("|");

export const quoteSqliteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

export const normalizeSqliteValue = (value: SqlValue | undefined): null | number | string | object => {
  if (value === undefined) return null;
  if (typeof value === "bigint") return { bigint: value.toString() };
  if (value instanceof Uint8Array)
    return { base64: Buffer.from(value).toString("base64") };
  return value;
};

export const databaseSnapshotIdentity = (
  database: DatabaseSync,
): { sha256: string; method: string } => {
  const tables = database
    .prepare(
      `SELECT name, sql FROM sqlite_schema
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all() as Array<{ name: string; sql: string | null }>;
  const snapshot = tables.map(({ name, sql }) => {
    const columns = database
      .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(name)})`)
      .all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);
    const projection = names.map(quoteSqliteIdentifier).join(", ");
    const ordering = names.map(quoteSqliteIdentifier).join(", ");
    const rows = database
      .prepare(
        `SELECT ${projection} FROM ${quoteSqliteIdentifier(name)}${
          ordering ? ` ORDER BY ${ordering}` : ""
        }`,
      )
      .all()
      .map((row) =>
        Object.fromEntries(
          names.map((column) => [
            column,
            normalizeSqliteValue((row as Record<string, SqlValue>)[column]),
          ]),
        ),
      );
    return { name, sql, columns: names, rows };
  });
  return {
    sha256: hashCanonical({
      method: SQLITE_SNAPSHOT_IDENTITY_METHOD,
      tables: snapshot,
    }),
    method: SQLITE_SNAPSHOT_IDENTITY_METHOD,
  };
};

@Injectable()
export class DatabaseSnapshotIdentityService {
  private readonly databasePath: string;
  private cachedFingerprint?: string;
  private cachedIdentity?: SnapshotIdentity;

  constructor(
    @Optional() @Inject("SSI_DATABASE_PATH") databasePath?: string,
  ) {
    this.databasePath =
      databasePath ?? process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
  }

  current(): SnapshotIdentity {
    const fingerprint = databaseSnapshotFingerprint(this.databasePath);
    if (
      fingerprint === this.cachedFingerprint &&
      this.cachedIdentity !== undefined
    )
      return this.cachedIdentity;

    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      database.exec("BEGIN");
      const identity = databaseSnapshotIdentity(database);
      const stableFingerprint = databaseSnapshotFingerprint(this.databasePath);
      if (stableFingerprint === fingerprint) {
        this.cachedFingerprint = stableFingerprint;
        this.cachedIdentity = identity;
      }
      return identity;
    } finally {
      try {
        database.exec("ROLLBACK");
      } finally {
        database.close();
      }
    }
  }
}
