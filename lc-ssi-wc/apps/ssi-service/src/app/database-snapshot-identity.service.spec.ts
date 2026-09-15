import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";

describe("DatabaseSnapshotIdentityService", () => {
  let directory: string;
  let databasePath: string;
  let writer: DatabaseSync;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ssi-snapshot-"));
    databasePath = join(directory, "snapshot.sqlite");
    writer = new DatabaseSync(databasePath);
    writer.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE record (id TEXT PRIMARY KEY, value TEXT);",
    );
    writer.prepare("INSERT INTO record VALUES (?, ?)").run("A", "one");
  });

  afterEach(() => {
    writer.close();
    rmSync(directory, { recursive: true, force: true });
    delete process.env["SSI_EVIDENCE_SNAPSHOT_SHA256"];
    delete process.env["SSI_DATABASE_PATH"];
  });

  it("is stable for an unchanged query-visible snapshot", () => {
    const service = new DatabaseSnapshotIdentityService(databasePath);
    expect(service.current()).toEqual(service.current());
  });

  it("reuses the logical snapshot while the database and WAL files are unchanged", () => {
    const prepare = jest.spyOn(DatabaseSync.prototype, "prepare");
    const service = new DatabaseSnapshotIdentityService(databasePath);

    const first = service.current();
    const preparesAfterFirstSnapshot = prepare.mock.calls.length;
    const second = service.current();

    expect(second).toEqual(first);
    expect(prepare).toHaveBeenCalledTimes(preparesAfterFirstSnapshot);
    prepare.mockRestore();
  });

  it("includes committed records still visible through WAL", () => {
    const service = new DatabaseSnapshotIdentityService(databasePath);
    const before = service.current().sha256;
    writer.prepare("INSERT INTO record VALUES (?, ?)").run("B", "two");
    expect(service.current().sha256).not.toBe(before);
  });

  it("does not accept an evidence hash environment override", () => {
    process.env["SSI_EVIDENCE_SNAPSHOT_SHA256"] = "A".repeat(64);
    expect(new DatabaseSnapshotIdentityService(databasePath).current().sha256).not.toBe(
      "a".repeat(64),
    );
  });

  it("uses the configured database path and canonically includes binary values", () => {
    writer.exec('CREATE TABLE "odd""table" (id TEXT PRIMARY KEY, payload BLOB)');
    writer
      .prepare('INSERT INTO "odd""table" VALUES (?, ?)')
      .run("BLOB", Buffer.from([0, 1, 2, 255]));
    process.env["SSI_DATABASE_PATH"] = databasePath;

    const identity = new DatabaseSnapshotIdentityService().current();

    expect(identity.method).toBe("SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1");
    expect(identity.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
