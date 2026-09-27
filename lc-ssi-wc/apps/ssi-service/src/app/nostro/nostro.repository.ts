import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import {
  SqliteGovernedRepository,
  type GovernedRecord,
} from "../shared/sqlite-governed.repository";

export interface NostroRecord extends GovernedRecord {
  ownLegalEntityId: string;
  accountServicerBic: string;
  currency: string;
  maskedAccountRef: string;
  accountReference?: string;
  purpose: string;
  priority: number;
  validFrom: string;
  validTo: string;
  maker: string;
  checker?: string;
  allowedBookingEntities?: string[];
  amendmentOfId?: string;
  revokeReason?: string;
  source: "SYNTHETIC_DEMO" | "LICENSED_IMPORT";
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingIds?: string[];
  dataUse?: "OPERATIONAL_DEMO" | "BASELINE" | "FIXTURE" | "QA";
  seedBusinessKey?: string;
}
export interface NostroEligibilityQuery {
  ownLegalEntityId?: string;
  accountReference?: string;
  accountServicerBic: string;
  currency: string;
  purpose: string;
  at: string;
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingId?: string;
}
@Injectable()
export class NostroRepository extends SqliteGovernedRepository<NostroRecord> {
  constructor() {
    super("nostro_account", "nostro_audit_event");
    this
      .executeSchema(`CREATE INDEX IF NOT EXISTS idx_nostro_eligibility_scope_v2 ON nostro_account(
      json_extract(payload,'$.status'),
      json_extract(payload,'$.fixtureFamily'),
      json_extract(payload,'$.accountServicerBic'),
      json_extract(payload,'$.currency'),
      json_extract(payload,'$.purpose'),
      json_extract(payload,'$.validFrom'),
      json_extract(payload,'$.validTo'),
      CAST(json_extract(payload,'$.priority') AS INTEGER),
      json_extract(payload,'$.usageGroup')
    );
    CREATE INDEX IF NOT EXISTS idx_nostro_mt1_candidate_lookup ON nostro_account(
      json_extract(payload,'$.status'),
      json_extract(payload,'$.currency'),
      json_extract(payload,'$.purpose'),
      COALESCE(json_extract(payload,'$.accountReference'), json_extract(payload,'$.maskedAccountRef')),
      json_extract(payload,'$.validFrom'),
      json_extract(payload,'$.validTo')
    );
    DROP INDEX IF EXISTS idx_nostro_operational_index;
    DROP INDEX IF EXISTS idx_nostro_operational_page_v2;
    CREATE INDEX IF NOT EXISTS idx_nostro_operational_page_v3 ON nostro_account(
      json_extract(payload,'$.status'), updated_at DESC, id DESC
    ) WHERE
      json_extract(payload,'$.source')='SYNTHETIC_DEMO'
      AND (json_extract(payload,'$.dataUse')='OPERATIONAL_DEMO'
        OR json_extract(payload,'$.dataUse') IS NULL)
      AND json_extract(payload,'$.ownLegalEntityId') NOT LIKE 'BASELINE-%'
      AND json_extract(payload,'$.fixtureFamily') IS NULL
      AND json_extract(payload,'$.fixtureBindingId') IS NULL
      AND COALESCE(json_array_length(json_extract(payload,'$.fixtureBindingIds')),0)=0
      AND (json_extract(payload,'$.usageGroup') IS NULL
        OR json_extract(payload,'$.usageGroup')='')`);
  }

  protected override listPageScope() {
    return {
      clauses: [
        `json_extract(payload,'$.source')='SYNTHETIC_DEMO'`,
        `(json_extract(payload,'$.dataUse')='OPERATIONAL_DEMO'
          OR json_extract(payload,'$.dataUse') IS NULL)`,
        `json_extract(payload,'$.ownLegalEntityId') NOT LIKE 'BASELINE-%'`,
        `json_extract(payload,'$.fixtureFamily') IS NULL`,
        `json_extract(payload,'$.fixtureBindingId') IS NULL`,
        `COALESCE(json_array_length(json_extract(payload,'$.fixtureBindingIds')),0)=0`,
        `(json_extract(payload,'$.usageGroup') IS NULL OR json_extract(payload,'$.usageGroup')='')`,
      ],
      parameters: [],
    };
  }

  static demoSeedBusinessKey(
    record: Pick<
      NostroRecord,
      | "ownLegalEntityId"
      | "accountServicerBic"
      | "currency"
      | "purpose"
      | "maskedAccountRef"
    >,
  ): string {
    return [
      record.ownLegalEntityId,
      record.accountServicerBic,
      record.currency,
      record.purpose,
      record.maskedAccountRef,
    ]
      .map((value) => value.trim().toUpperCase())
      .join("|");
  }

  static demoSeedId(seedBusinessKey: string): string {
    const hex = createHash("sha256")
      .update(seedBusinessKey)
      .digest("hex")
      .slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
  }

  reserveDemoSeed(record: NostroRecord): NostroRecord {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existingRow = this.db
        .prepare(
          `SELECT payload FROM nostro_account
           WHERE json_extract(payload,'$.seedBusinessKey')=?
           ORDER BY CASE json_extract(payload,'$.status')
             WHEN 'ACTIVE' THEN 6 WHEN 'APPROVED' THEN 5
             WHEN 'PENDING_APPROVAL' THEN 4 WHEN 'DRAFT' THEN 3
             WHEN 'WIP' THEN 2 ELSE 1 END DESC,
             updated_at DESC LIMIT 1`,
        )
        .get(record.seedBusinessKey!) as { payload: unknown } | undefined;
      if (existingRow) {
        this.db.exec("COMMIT");
        return JSON.parse(String(existingRow.payload)) as NostroRecord;
      }
      const now = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO nostro_account(id,payload,updated_at) VALUES(?,?,?)",
        )
        .run(record.id, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO nostro_audit_event(record_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(record.id, "CREATED", record.maker, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO swift_data_outbox(event_id,aggregate_type,event_type,payload,created_at) VALUES(?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          "NOSTRO",
          "NOSTRO_CREATED",
          JSON.stringify(record),
          now,
        );
      this.db.exec("COMMIT");
      return record;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  override explainListPage(status = "ACTIVE"): string[] {
    return this.explainQueryPlan(
      `SELECT payload FROM nostro_account
       WHERE json_extract(payload,'$.source')='SYNTHETIC_DEMO'
         AND (json_extract(payload,'$.dataUse')='OPERATIONAL_DEMO'
          OR json_extract(payload,'$.dataUse') IS NULL)
         AND json_extract(payload,'$.ownLegalEntityId') NOT LIKE 'BASELINE-%'
         AND json_extract(payload,'$.fixtureFamily') IS NULL
         AND json_extract(payload,'$.fixtureBindingId') IS NULL
         AND COALESCE(json_array_length(json_extract(payload,'$.fixtureBindingIds')),0)=0
         AND (json_extract(payload,'$.usageGroup') IS NULL
           OR json_extract(payload,'$.usageGroup')='')
         AND json_extract(payload,'$.status')=?
       ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      status,
      20,
      0,
    );
  }

  findEligible(query: NostroEligibilityQuery): NostroRecord[] {
    const { sql, parameters } = this.eligibleStatement(query);
    return this.selectPayloads(sql, ...parameters);
  }

  explainFindEligible(query: NostroEligibilityQuery): string[] {
    const { sql, parameters } = this.eligibleStatement(query);
    return this.explainQueryPlan(sql, ...parameters);
  }

  indexNames(): string[] {
    return this.tableIndexNames();
  }

  private eligibleStatement(query: NostroEligibilityQuery): {
    sql: string;
    parameters: string[];
  } {
    const familyClause =
      query.fixtureFamily === undefined
        ? ""
        : " AND json_extract(payload,'$.fixtureFamily')=?";
    const usageClause =
      query.usageGroup === undefined
        ? ""
        : " AND json_extract(payload,'$.usageGroup')=?";
    const accountClause =
      query.accountReference === undefined
        ? ""
        : " AND json_extract(payload,'$.accountReference')=?";
    const bookingClause =
      query.ownLegalEntityId === undefined
        ? ""
        : ` AND (
          json_array_length(json_extract(payload,'$.allowedBookingEntities')) IS NULL
          OR json_array_length(json_extract(payload,'$.allowedBookingEntities'))=0
          OR EXISTS (
            SELECT 1 FROM json_each(json_extract(payload,'$.allowedBookingEntities'))
            WHERE value IN ('ANY', ?)
          )
        )`;
    const bindingClause =
      query.fixtureBindingId === undefined
        ? ""
        : ` AND EXISTS (
            SELECT 1 FROM json_each(json_extract(payload,'$.fixtureBindingIds'))
            WHERE value=?
          )`;
    const parameters: string[] = [
      query.accountServicerBic,
      query.currency,
      query.purpose,
      query.at,
      query.at,
    ];
    if (query.fixtureFamily !== undefined) parameters.push(query.fixtureFamily);
    if (query.usageGroup !== undefined) parameters.push(query.usageGroup);
    if (query.accountReference !== undefined)
      parameters.push(query.accountReference);
    if (query.ownLegalEntityId !== undefined)
      parameters.push(query.ownLegalEntityId);
    if (query.fixtureBindingId !== undefined)
      parameters.push(query.fixtureBindingId);
    return {
      sql: `SELECT payload FROM nostro_account
       WHERE json_extract(payload,'$.status')='ACTIVE'
         AND json_extract(payload,'$.accountServicerBic')=?
         AND json_extract(payload,'$.currency')=?
         AND json_extract(payload,'$.purpose')=?
         AND json_extract(payload,'$.validFrom')<=?
         AND json_extract(payload,'$.validTo')>=?
         ${familyClause}${usageClause}${accountClause}${bookingClause}${bindingClause}
       ORDER BY CAST(json_extract(payload,'$.priority') AS INTEGER), id`,
      parameters,
    };
  }
}
