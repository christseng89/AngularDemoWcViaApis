import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AuditRetentionRepository,
  GOVERNED_AUDIT_TABLES,
} from "../../../app/audit-retention/audit-retention.repository";

describe("AuditRetentionRepository", () => {
  let directory: string;
  let databasePath: string;
  let previousPath: string | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "audit-retention-"));
    databasePath = join(directory, "audit.sqlite");
    previousPath = process.env["SSI_DATABASE_PATH"];
    process.env["SSI_DATABASE_PATH"] = databasePath;
    const db = new DatabaseSync(databasePath);
    for (const table of GOVERNED_AUDIT_TABLES) {
      db.exec(
        `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL)`,
      );
      const insert = db.prepare(`INSERT INTO ${table}(occurred_at) VALUES (?)`);
      insert.run("2026-09-04T11:59:59.999Z");
      insert.run("2026-09-04T12:00:00.000Z");
      insert.run("2026-09-04T12:00:00.001Z");
    }
    db.exec(
      "CREATE TABLE business_record (id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL)",
    );
    db.prepare("INSERT INTO business_record(occurred_at) VALUES (?)").run(
      "2020-01-01T00:00:00.000Z",
    );
    db.close();
  });

  afterEach(() => {
    if (previousPath === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = previousPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it("archives verified rows, retains cutoff boundaries and purges expired archive rows", () => {
    const repository = new AuditRetentionRepository();
    const seedArchive = new DatabaseSync(databasePath);
    seedArchive
      .prepare(
        `INSERT INTO audit_event_archive(
          source_table,source_row_id,occurred_at,archived_at,payload,payload_sha256
        ) VALUES(?,?,?,?,?,?)`,
      )
      .run(
        "audit_event",
        999,
        "2024-01-01T00:00:00.000Z",
        "2025-09-10T11:59:59.999Z",
        "{}",
        "old-hash",
      );
    seedArchive.close();
    const result = repository.runLifecycle(
      "2026-09-04T12:00:00.000Z",
      "2025-09-10T12:00:00.000Z",
      "2026-09-11T12:00:00.000Z",
    );
    repository.onModuleDestroy();

    expect(result.totalArchived).toBe(4);
    expect(result.archivedByTable).toEqual(
      Object.fromEntries(GOVERNED_AUDIT_TABLES.map((table) => [table, 1])),
    );
    expect(result.purgedFromArchive).toBe(1);
    const db = new DatabaseSync(databasePath);
    for (const table of GOVERNED_AUDIT_TABLES) {
      const rows = db
        .prepare(`SELECT occurred_at FROM ${table} ORDER BY occurred_at`)
        .all();
      expect(rows).toEqual([
        { occurred_at: "2026-09-04T12:00:00.000Z" },
        { occurred_at: "2026-09-04T12:00:00.001Z" },
      ]);
    }
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM audit_event_archive").get(),
    ).toEqual({ count: 4 });
    const archiveRows = repositoryRows(db);
    expect(archiveRows.every((row) => row.payload_sha256.length === 64)).toBe(
      true,
    );
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM business_record").get(),
    ).toEqual({ count: 1 });
    db.close();
  });
});

const repositoryRows = (db: DatabaseSync) =>
  db
    .prepare(
      "SELECT payload_sha256 FROM audit_event_archive ORDER BY source_table",
    )
    .all() as { payload_sha256: string }[];
