import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const OPERATIONAL_TABLES = Object.freeze([
  "booking_branch_entity",
  "nostro_account",
  "rma_authorisation",
  "ssi",
]);

interface IsolationOptions {
  readonly sourceDatabase: string;
  readonly isolatedDatabase: string;
}

export interface FixtureIsolationReport {
  readonly removedByTable: Readonly<Record<string, number>>;
  readonly removedRecordIds: readonly string[];
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

export class OperationalFixtureIsolationPolicy {
  isControlledQaOnly(payload: Readonly<Record<string, unknown>>): boolean {
    if (payload["operationalEligible"] === false) return true;
    const fixtureFamily = text(payload["fixtureFamily"]);
    const usageGroup = text(payload["usageGroup"]);
    const fixtureStatus = text(payload["fixtureStatus"]);
    const sampleSet = text(payload["sampleSet"]);
    if (
      ["QA_POSITIVE", "QA_NEGATIVE", "QA_BOUNDARY"].includes(fixtureFamily) ||
      fixtureFamily.endsWith("-NEGATIVE-QA") ||
      usageGroup.startsWith("QA_") ||
      fixtureStatus === "PROPOSED_QA_ONLY" ||
      sampleSet === "PROPOSED_QA_ONLY"
    )
      return true;
    const route = payload["route"];
    return (
      typeof route === "object" &&
      route !== null &&
      this.isControlledQaOnly(route as Readonly<Record<string, unknown>>)
    );
  }

  isDerivedFromControlledRma(
    payload: Readonly<Record<string, unknown>>,
    controlledRecordIds: ReadonlySet<string>,
  ): boolean {
    const amendmentOfId = payload["amendmentOfId"];
    if (
      typeof amendmentOfId === "string" &&
      controlledRecordIds.has(amendmentOfId)
    )
      return true;
    const provenance = payload["repairProvenance"];
    if (typeof provenance !== "object" || provenance === null) return false;
    const sourceRecordIds = (provenance as Readonly<Record<string, unknown>>)[
      "sourceRecordIds"
    ];
    return (
      Array.isArray(sourceRecordIds) &&
      sourceRecordIds.some(
        (recordId) =>
          typeof recordId === "string" && controlledRecordIds.has(recordId),
      )
    );
  }

  isControlledQaOutbox(eventType: string, payload: string): boolean {
    const normalizedType = text(eventType);
    const normalizedPayload = payload.toUpperCase();
    if (normalizedType.startsWith("QA_")) return true;
    if (
      normalizedPayload.includes("QA-TIE-") ||
      normalizedPayload.includes("PROPOSED_QA_ONLY")
    )
      return true;
    try {
      const parsed = JSON.parse(payload) as unknown;
      return (
        typeof parsed === "object" &&
        parsed !== null &&
        this.isControlledQaOnly(parsed as Readonly<Record<string, unknown>>)
      );
    } catch {
      return false;
    }
  }
}

export class OperationalFixtureIsolator {
  private readonly policy: OperationalFixtureIsolationPolicy;

  constructor(policy = new OperationalFixtureIsolationPolicy()) {
    this.policy = policy;
  }

  isolate(options: IsolationOptions): FixtureIsolationReport {
    mkdirSync(dirname(options.isolatedDatabase), { recursive: true });
    copyFileSync(options.sourceDatabase, options.isolatedDatabase);
    const database = new DatabaseSync(options.isolatedDatabase);
    const removedByTable: Record<string, number> = {};
    const removedRecordIds: string[] = [];
    database.exec("BEGIN IMMEDIATE");
    try {
      const existingTables = new Set(
        (
          database
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as Array<{ name: string }>
        ).map(({ name }) => name),
      );
      const controlledIdsByTable = new Map<string, Set<string>>();
      const parsedRowsByTable = new Map<
        string,
        Array<{
          readonly id: string;
          readonly payload: Readonly<Record<string, unknown>>;
        }>
      >();
      for (const table of OPERATIONAL_TABLES) {
        if (!existingTables.has(table)) continue;
        const rows = database
          .prepare(`SELECT id,payload FROM ${table}`)
          .all() as Array<{ id: string; payload: string }>;
        const parsedRows = rows.map((row) => ({
          id: row.id,
          payload: JSON.parse(row.payload) as Readonly<Record<string, unknown>>,
        }));
        parsedRowsByTable.set(table, parsedRows);
        controlledIdsByTable.set(
          table,
          new Set(
            parsedRows
              .filter(({ payload }) => this.policy.isControlledQaOnly(payload))
              .map(({ id }) => id),
          ),
        );
      }
      const controlledRmaIds =
        controlledIdsByTable.get("rma_authorisation") ?? new Set<string>();
      const rmaRows = parsedRowsByTable.get("rma_authorisation") ?? [];
      let lineageExpanded = true;
      while (lineageExpanded) {
        lineageExpanded = false;
        for (const row of rmaRows) {
          if (controlledRmaIds.has(row.id)) continue;
          if (
            !this.policy.isDerivedFromControlledRma(
              row.payload,
              controlledRmaIds,
            )
          )
            continue;
          controlledRmaIds.add(row.id);
          lineageExpanded = true;
        }
      }
      for (const table of OPERATIONAL_TABLES) {
        if (!existingTables.has(table)) continue;
        const controlledIds = controlledIdsByTable.get(table) ?? new Set();
        const remove = database.prepare(`DELETE FROM ${table} WHERE id=?`);
        let removed = 0;
        for (const id of controlledIds) {
          remove.run(id);
          removed += 1;
          removedRecordIds.push(`${table}:${id}`);
        }
        if (removed > 0) removedByTable[table] = removed;
      }
      if (existingTables.has("ssi_applicability")) {
        const orphanRows = database
          .prepare(
            "SELECT a.id FROM ssi_applicability a " +
              "LEFT JOIN ssi s ON s.id=a.ssi_id WHERE s.id IS NULL",
          )
          .all() as Array<{ id: string }>;
        const remove = database.prepare(
          "DELETE FROM ssi_applicability WHERE id=?",
        );
        for (const row of orphanRows) {
          remove.run(row.id);
          removedRecordIds.push(`ssi_applicability:${row.id}`);
        }
        if (orphanRows.length > 0)
          removedByTable["ssi_applicability"] = orphanRows.length;
      }
      if (existingTables.has("outbox")) {
        const rows = database
          .prepare(
            "SELECT id,event_type,payload FROM outbox WHERE status='PENDING'",
          )
          .all() as Array<{
          id: number;
          event_type: string;
          payload: string;
        }>;
        const remove = database.prepare("DELETE FROM outbox WHERE id=?");
        let removed = 0;
        for (const row of rows) {
          if (!this.policy.isControlledQaOutbox(row.event_type, row.payload))
            continue;
          remove.run(row.id);
          removed += 1;
          removedRecordIds.push(`outbox:${row.id}`);
        }
        if (removed > 0) removedByTable["outbox"] = removed;
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.close();
    }
    return {
      removedByTable: Object.freeze({ ...removedByTable }),
      removedRecordIds: Object.freeze([...removedRecordIds].sort()),
    };
  }
}
