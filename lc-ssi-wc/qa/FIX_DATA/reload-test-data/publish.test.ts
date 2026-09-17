import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { RmaReloadDataRepairer, RmaReloadRepairPolicy } from "./publish.ts";
import { OperationalFixtureIsolator } from "./fixture-isolation.ts";

const record = (id: string, service: string, messageTypes: string[]) => ({
  id,
  ownBic: "DEMOHKHH",
  counterpartyBic: "CITIUS33",
  direction: "OUTBOUND",
  service,
  messageTypes,
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
  maker: "maker.test",
  source: "SYNTHETIC_DEMO",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("RmaReloadDataRepairer", () => {
  it("creates one parameter-filtered ACTIVE record and preserves history", () => {
    const directory = mkdtempSync(join(tmpdir(), "rma-reload-repair-"));
    const source = join(directory, "source.sqlite");
    const target = join(directory, "target.sqlite");
    const database = new DatabaseSync(source);
    database.exec(`
      CREATE TABLE rma_authorisation(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE rma_audit_event(id INTEGER PRIMARY KEY AUTOINCREMENT,record_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,payload TEXT NOT NULL,occurred_at TEXT NOT NULL);
    `);
    for (const value of [
      record("z-survivor", "FIN / FINPLUS", [
        "MT103",
        "MT700",
        "pacs.008.001.08",
        "pacs.009.001.08",
      ]),
      record("two", "FINPLUS", [
        "pacs.008.001.12",
        "pacs.009.001.12",
        "pacs.009.001.12.COV",
      ]),
    ]) {
      database
        .prepare("INSERT INTO rma_authorisation VALUES(?,?,?)")
        .run(value.id, JSON.stringify(value), value.updatedAt);
    }
    database.close();
    const policy = new RmaReloadRepairPolicy({
      supportedMessageTypes: [
        "MT103",
        "pacs.008.001.08",
        "pacs.009.001.08",
      ],
      conversions: [
        ["pacs.008.001.12", "pacs.008.001.08"],
        ["pacs.009.001.12", "pacs.009.001.08"],
      ],
      skipKeys: [],
    });
    const report = new RmaReloadDataRepairer(policy).repair({
      sourceDatabase: source,
      repairedDatabase: target,
      repairedAt: "2026-09-17T00:00:00.000Z",
    });
    assert.equal(report.canonicalGroups, 1);
    assert.equal(report.rmaActiveAfter, 1);
    assert.equal(report.supersededRecords, 2);
    assert.equal(report.convertedMessageTypes, 2);
    assert.equal(report.excludedMessageTypes, 2);
    const repaired = new DatabaseSync(target, { readOnly: true });
    const rows = repaired
      .prepare("SELECT payload FROM rma_authorisation")
      .all()
      .map((row) => JSON.parse(String(row["payload"])));
    const active = rows.filter((value) => value.status === "ACTIVE");
    assert.deepEqual(active[0].messageTypes, [
      "MT103",
      "pacs.008.001.08",
      "pacs.009.001.08",
    ]);
    assert.deepEqual(active[0].messageTypeChanges.unchanged, ["MT103"]);
    assert.deepEqual(active[0].messageTypeChanges.added, [
      "pacs.008.001.08",
      "pacs.009.001.08",
    ]);
    assert.deepEqual(active[0].messageTypeChanges.suppressed, [
      "MT700",
      "pacs.008.001.12",
      "pacs.009.001.12",
      "pacs.009.001.12.COV",
    ]);
    assert.equal(
      rows.filter((value) => value.status === "SUPERSEDED").length,
      2,
    );
    repaired.close();
  });
});

describe("OperationalFixtureIsolator", () => {
  it("removes controlled QA rows, derived lineage, dependants and pending QA outbox events", () => {
    const directory = mkdtempSync(join(tmpdir(), "fixture-isolation-"));
    const source = join(directory, "source.sqlite");
    const target = join(directory, "target.sqlite");
    const database = new DatabaseSync(source);
    database.exec(`
      CREATE TABLE ssi(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE nostro_account(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE rma_authorisation(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE ssi_applicability(id TEXT PRIMARY KEY,ssi_id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL,event_type TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
    const insert = (table: string, id: string, payload: object) =>
      database
        .prepare(`INSERT INTO ${table} VALUES(?,?,?)`)
        .run(id, JSON.stringify(payload), "2026-09-17T00:00:00.000Z");
    insert("ssi", "OP-SSI", { id: "OP-SSI", status: "ACTIVE" });
    insert("ssi", "QA-SSI", {
      id: "QA-SSI",
      status: "ACTIVE",
      route: { sampleSet: "PROPOSED_QA_ONLY" },
    });
    insert("nostro_account", "OP-NOSTRO", {
      id: "OP-NOSTRO",
      status: "ACTIVE",
    });
    insert("nostro_account", "QA-NOSTRO", {
      id: "QA-NOSTRO",
      status: "ACTIVE",
      usageGroup: "QA_AMBIGUITY_FIXTURE",
    });
    insert("rma_authorisation", "QA-RMA-SOURCE", {
      id: "QA-RMA-SOURCE",
      status: "SUPERSEDED",
      fixtureStatus: "PROPOSED_QA_ONLY",
    });
    insert("rma_authorisation", "QA-RMA-DERIVED", {
      id: "QA-RMA-DERIVED",
      status: "ACTIVE",
      amendmentOfId: "QA-RMA-SOURCE",
      repairProvenance: { sourceRecordIds: ["QA-RMA-SOURCE"] },
    });
    insert("rma_authorisation", "OP-RMA", {
      id: "OP-RMA",
      status: "ACTIVE",
    });
    database
      .prepare("INSERT INTO ssi_applicability VALUES(?,?,?,?)")
      .run(
        "QA-APPLICABILITY",
        "QA-SSI",
        JSON.stringify({ id: "QA-APPLICABILITY", ssiId: "QA-SSI" }),
        "2026-09-17T00:00:00.000Z",
      );
    database
      .prepare(
        "INSERT INTO outbox(event_id,event_type,payload,status,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        "QA-EVENT",
        "QA_UAT_OVERLAY_CREATED",
        JSON.stringify({ routes: [{ accountReference: "QA-TIE-1" }] }),
        "PENDING",
        "2026-09-17T00:00:00.000Z",
      );
    database.close();

    const report = new OperationalFixtureIsolator().isolate({
      sourceDatabase: source,
      isolatedDatabase: target,
    });

    assert.deepEqual(report.removedByTable, {
      nostro_account: 1,
      outbox: 1,
      rma_authorisation: 2,
      ssi: 1,
      ssi_applicability: 1,
    });
    const isolated = new DatabaseSync(target, { readOnly: true });
    assert.equal(
      isolated.prepare("SELECT count(*) AS n FROM ssi").get()!["n"],
      1,
    );
    assert.equal(
      isolated.prepare("SELECT count(*) AS n FROM nostro_account").get()!["n"],
      1,
    );
    assert.equal(
      isolated.prepare("SELECT count(*) AS n FROM rma_authorisation").get()![
        "n"
      ],
      1,
    );
    assert.equal(
      isolated.prepare("SELECT count(*) AS n FROM ssi_applicability").get()![
        "n"
      ],
      0,
    );
    assert.equal(
      isolated.prepare("SELECT count(*) AS n FROM outbox").get()!["n"],
      0,
    );
    isolated.close();
  });
});
