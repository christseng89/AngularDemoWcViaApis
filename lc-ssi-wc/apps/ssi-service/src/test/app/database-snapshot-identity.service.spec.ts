import { DatabaseSync } from "node:sqlite";
import {
  DatabaseSnapshotIdentityService,
  SQLITE_SNAPSHOT_IDENTITY_METHOD,
  databaseSnapshotFingerprint,
  databaseSnapshotIdentity,
  normalizeSqliteValue,
  quoteSqliteIdentifier,
} from "../../app/database-snapshot-identity.service";

describe("database snapshot identity", () => {
  it("normalises every SQLite value type deterministically", () => {
    expect(normalizeSqliteValue(undefined)).toBeNull();
    expect(normalizeSqliteValue(null)).toBeNull();
    expect(normalizeSqliteValue(7)).toBe(7);
    expect(normalizeSqliteValue("value")).toBe("value");
    expect(normalizeSqliteValue(9n)).toEqual({ bigint: "9" });
    expect(normalizeSqliteValue(new Uint8Array([1, 2, 3]))).toEqual({
      base64: "AQID",
    });
    expect(quoteSqliteIdentifier('a"b')).toBe('"a""b"');
  });

  it("hashes schema, columns, ordered rows, blobs, and selected tables", () => {
    const database = new DatabaseSync(":memory:");
    try {
      database.exec(`
        CREATE TABLE alpha (id INTEGER PRIMARY KEY, name TEXT, payload BLOB);
        CREATE TABLE beta (code TEXT);
        INSERT INTO alpha (id, name, payload) VALUES (2, 'zeta', X'0102'), (1, 'alpha', X'0304');
        INSERT INTO beta (code) VALUES ('B');
      `);
      const all = databaseSnapshotIdentity(database);
      const alpha = databaseSnapshotIdentity(database, ["alpha"]);
      const none = databaseSnapshotIdentity(database, []);

      expect(all).toEqual({
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        method: SQLITE_SNAPSHOT_IDENTITY_METHOD,
      });
      expect(alpha.sha256).not.toBe(all.sha256);
      expect(none.sha256).not.toBe(alpha.sha256);
      expect(databaseSnapshotIdentity(database).sha256).toBe(all.sha256);
    } finally {
      database.close();
    }
  });

  it("fingerprints existing, missing, and invalid file paths", () => {
    expect(databaseSnapshotFingerprint("missing-snapshot.sqlite")).toContain(
      "MISSING",
    );
    expect(databaseSnapshotFingerprint("package.json")).toContain("package.json:");
    expect(() => databaseSnapshotFingerprint("\0")).toThrow();
  });

  it("caches an unchanged logical snapshot", () => {
    const service = new DatabaseSnapshotIdentityService("data/ssi-demo.sqlite");
    const first = service.current();
    const second = service.current();

    expect(first).toEqual(second);
    expect(first.method).toBe(SQLITE_SNAPSHOT_IDENTITY_METHOD);
  });
});
