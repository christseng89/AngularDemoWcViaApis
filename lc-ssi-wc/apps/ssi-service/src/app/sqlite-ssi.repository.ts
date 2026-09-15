import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { onlineAuditCutoffUtc } from "./audit-retention/audit-retention.policy";

export interface SsiRecord {
  id: string;
  counterpartyId: string;
  scope: string;
  maker: string;
  checker?: string;
  status: string;
  version: number;
  route: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  ownershipType?: "OWN" | "COUNTERPARTY";
  ownerParty?: string;
  publisherParty?: string;
  revokeReason?: string;
  amendmentOfId?: string;
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingIds?: string[];
}
export interface SsiApplicabilityRecord {
  id: string;
  ssiId: string;
  consumer: string;
  product: string;
  businessFunction: string;
  paymentLeg: string;
  direction: string;
  status: "ACTIVE" | "INACTIVE";
  validFrom: string;
  validTo: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  fixtureBindingIds?: string[];
}
export type SsiApplicabilityInput = Omit<
  SsiApplicabilityRecord,
  "id" | "ssiId" | "version" | "createdAt" | "updatedAt"
>;

export interface PaymentSsiCandidateQuery {
  readonly sourceMessageType: string;
  readonly messageType: string;
  readonly businessService: string;
  readonly valueDate: string;
  readonly currency?: string;
  readonly bookingEntity?: string;
  readonly fixtureBindingId?: string;
}
export interface PaymentSsiCandidateBinding {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
}

export interface FinControlledFixtureRepositoryQuery {
  readonly messageType: string;
  readonly sequence?: string;
  readonly currency: string;
  readonly bookingEntity: string;
  readonly valueDate: string;
  readonly bindingId?: string;
  readonly includeFixtureGroup?: boolean;
}

export interface FinControlledFixtureRepositoryRow {
  readonly ssi: SsiRecord;
  readonly applicability: SsiApplicabilityRecord;
}

@Injectable()
export class SqliteSsiRepository implements OnModuleDestroy {
  private readonly db: DatabaseSync;
  constructor() {
    const path = process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS ssi (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ssi_applicability (id TEXT PRIMARY KEY, ssi_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_ssi_id ON ssi_applicability(ssi_id);
      CREATE INDEX IF NOT EXISTS idx_ssi_operational_lookup ON ssi(
        json_extract(payload,'$.status'),
        json_extract(payload,'$.route.routePurpose'),
        json_extract(payload,'$.route.currency'),
        json_extract(payload,'$.route.bookingEntity')
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_lookup ON ssi_applicability(
        json_extract(payload,'$.status'),
        json_extract(payload,'$.consumer'),
        json_extract(payload,'$.product'),
        json_extract(payload,'$.businessFunction'),
        json_extract(payload,'$.paymentLeg'),
        json_extract(payload,'$.direction'),
        ssi_id
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_fin_fixture_lookup ON ssi(
        json_extract(payload,'$.fixtureFamily'),
        json_extract(payload,'$.status'),
        json_extract(payload,'$.route.currency'),
        json_extract(payload,'$.route.bookingEntity'),
        json_extract(payload,'$.fixtureBindingId')
      );
      CREATE INDEX IF NOT EXISTS idx_ssi_applicability_fin_fixture_lookup ON ssi_applicability(
        json_extract(payload,'$.fixtureFamily'),
        json_extract(payload,'$.status'),
        json_extract(payload,'$.messageType'),
        json_extract(payload,'$.sequence'),
        json_extract(payload,'$.currency'),
        json_extract(payload,'$.fixtureBindingId'),
        ssi_id
      );
      CREATE TABLE IF NOT EXISTS audit_event (id INTEGER PRIMARY KEY AUTOINCREMENT, ssi_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inbox (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, processed_at TEXT NOT NULL);`);
  }
  list(): SsiRecord[] {
    return this.db
      .prepare("SELECT payload FROM ssi ORDER BY updated_at DESC")
      .all()
      .map(
        (row) =>
          JSON.parse(
            String((row as { payload: unknown }).payload),
          ) as SsiRecord,
      );
  }
  find(id: string): SsiRecord | undefined {
    const row = this.db
      .prepare("SELECT payload FROM ssi WHERE id=?")
      .get(id) as { payload: unknown } | undefined;
    return row ? (JSON.parse(String(row.payload)) as SsiRecord) : undefined;
  }
  listApplicability(ssiId?: string): SsiApplicabilityRecord[] {
    const rows = ssiId
      ? this.db
          .prepare(
            "SELECT payload FROM ssi_applicability WHERE ssi_id=? ORDER BY id",
          )
          .all(ssiId)
      : this.db
          .prepare("SELECT payload FROM ssi_applicability ORDER BY ssi_id,id")
          .all();
    return rows.map(
      (row) =>
        JSON.parse(
          String((row as { payload: unknown }).payload),
        ) as SsiApplicabilityRecord,
    );
  }
  findPaymentCandidates(query: PaymentSsiCandidateQuery): SsiRecord[] {
    return this.findPaymentCandidateBindings(query).map(({ ssi }) => ssi);
  }
  findPaymentCandidateBindings(
    query: PaymentSsiCandidateQuery,
  ): PaymentSsiCandidateBinding[] {
    const currency = query.currency?.trim() ?? "";
    const bookingEntity = query.bookingEntity?.trim() ?? "";
    const fixtureBindingId = query.fixtureBindingId?.trim() ?? "";
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
         FROM ssi AS s
         JOIN ssi_applicability AS a ON a.ssi_id = s.id
         WHERE json_extract(s.payload,'$.status') = 'ACTIVE'
           AND json_extract(s.payload,'$.route.routePurpose') = 'INTERBANK_TRANSFER'
           AND json_extract(a.payload,'$.status') = 'ACTIVE'
           AND json_extract(a.payload,'$.validFrom') <= ?
           AND json_extract(a.payload,'$.validTo') >= ?
           AND json_extract(a.payload,'$.consumer') IN ('CENTRAL_PAYMENT','ANY')
           AND json_extract(a.payload,'$.product') IN ('CENTRAL_PAYMENT','ANY')
           AND json_extract(a.payload,'$.businessFunction') IN ('INTERBANK_TRANSFER','ANY')
           AND json_extract(a.payload,'$.paymentLeg') IN ('INTERBANK_SETTLEMENT','ANY')
           AND json_extract(a.payload,'$.direction') IN ('OUTBOUND','ANY')
           AND COALESCE(json_extract(s.payload,'$.route.currency'),'') <> ''
           AND COALESCE(json_extract(s.payload,'$.route.bookingEntity'),'') <> ''
           AND COALESCE(json_extract(s.payload,'$.route.validFrom'),'') <= ?
           AND COALESCE(json_extract(s.payload,'$.route.validTo'),'') >= ?
           AND instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.sourceMessageTypes'),''),' ','') || ',', ',' || ? || ',') > 0
           AND instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.messageTypes'),''),' ','') || ',', ',' || ? || ',') > 0
           AND instr(',' || replace(COALESCE(json_extract(s.payload,'$.route.businessService'),''),' ','') || ',', ',' || ? || ',') > 0
           AND (? = '' OR json_extract(s.payload,'$.route.currency') = ?)
           AND (? = '' OR json_extract(s.payload,'$.route.bookingEntity') = ?)
           AND (? = '' OR EXISTS (SELECT 1 FROM json_each(json_extract(s.payload,'$.fixtureBindingIds')) WHERE value = ?))
           AND (? = '' OR EXISTS (SELECT 1 FROM json_each(json_extract(a.payload,'$.fixtureBindingIds')) WHERE value = ?))
         ORDER BY CAST(COALESCE(json_extract(s.payload,'$.route.priority'),'999999') AS INTEGER),
                  json_extract(s.payload,'$.route.counterpartyBic')`,
      )
      .all(
        query.valueDate,
        query.valueDate,
        query.valueDate,
        query.valueDate,
        query.sourceMessageType,
        query.messageType,
        query.businessService,
        currency,
        currency,
        bookingEntity,
        bookingEntity,
        fixtureBindingId,
        fixtureBindingId,
        fixtureBindingId,
        fixtureBindingId,
      );
    return rows.map((row) => {
      const payloads = row as {
        ssi_payload: unknown;
        applicability_payload: unknown;
      };
      return {
        ssi: JSON.parse(String(payloads.ssi_payload)) as SsiRecord,
        applicability: JSON.parse(
          String(payloads.applicability_payload),
        ) as SsiApplicabilityRecord,
      };
    });
  }
  findFinControlledFixtures(
    query: FinControlledFixtureRepositoryQuery,
  ): FinControlledFixtureRepositoryRow[] {
    const sequence = query.sequence?.trim() ?? "";
    const bindingId = query.bindingId?.trim() ?? "";
    const includeFixtureGroup = query.includeFixtureGroup === true ? 1 : 0;
    const rows = this.db
      .prepare(
        `SELECT s.payload AS ssi_payload, a.payload AS applicability_payload
         FROM ssi AS s
         JOIN ssi_applicability AS a ON a.ssi_id = s.id
         WHERE json_extract(s.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
           AND json_extract(s.payload,'$.status') = 'ACTIVE'
           AND json_extract(s.payload,'$.route.currency') = ?
           AND json_extract(s.payload,'$.route.bookingEntity') = ?
           AND json_extract(a.payload,'$.fixtureFamily') = 'MT347-SR2026-SSI'
           AND json_extract(a.payload,'$.status') = 'ACTIVE'
           AND json_extract(a.payload,'$.messageType') = ?
           AND (? = '' OR json_extract(a.payload,'$.sequence') = ?)
           AND json_extract(a.payload,'$.currency') = ?
           AND json_extract(a.payload,'$.validFrom') <= ?
           AND json_extract(a.payload,'$.validTo') >= ?
           AND (
             ? = '' OR
             json_extract(s.payload,'$.fixtureBindingId') = ? OR
             (? = 1 AND json_extract(s.payload,'$.route.fixtureGroupId') = ?)
           )
           AND (
             ? = '' OR
             json_extract(a.payload,'$.fixtureBindingId') = ? OR
             (? = 1 AND json_extract(s.payload,'$.route.fixtureGroupId') = ?)
           )
         ORDER BY json_extract(s.payload,'$.fixtureBindingId')`,
      )
      .all(
        query.currency,
        query.bookingEntity,
        query.messageType,
        sequence,
        sequence,
        query.currency,
        query.valueDate,
        query.valueDate,
        bindingId,
        bindingId,
        includeFixtureGroup,
        bindingId,
        bindingId,
        bindingId,
        includeFixtureGroup,
        bindingId,
      );
    return rows.map((row) => {
      const payloads = row as {
        ssi_payload: unknown;
        applicability_payload: unknown;
      };
      return {
        ssi: JSON.parse(String(payloads.ssi_payload)) as SsiRecord,
        applicability: JSON.parse(
          String(payloads.applicability_payload),
        ) as SsiApplicabilityRecord,
      };
    });
  }
  replaceApplicability(
    ssiId: string,
    inputs: readonly SsiApplicabilityInput[],
    actor: string,
  ): SsiApplicabilityRecord[] {
    const now = new Date().toISOString();
    const previous = this.listApplicability(ssiId);
    const version = Math.max(0, ...previous.map((item) => item.version)) + 1;
    const records = inputs.map((input, index): SsiApplicabilityRecord => ({
      ...input,
      id: `${ssiId}:APPL:${index + 1}`,
      ssiId,
      version,
      createdAt: now,
      updatedAt: now,
    }));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("DELETE FROM ssi_applicability WHERE ssi_id=?")
        .run(ssiId);
      const insert = this.db.prepare(
        "INSERT INTO ssi_applicability(id,ssi_id,payload,updated_at) VALUES(?,?,?,?)",
      );
      for (const record of records)
        insert.run(record.id, ssiId, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(
          ssiId,
          "APPLICABILITY_REPLACED",
          actor,
          JSON.stringify(records),
          now,
        );
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
        )
        .run(
          randomUUID(),
          "SSI_APPLICABILITY_REPLACED",
          JSON.stringify({ ssiId, records }),
          now,
        );
      this.db.exec("COMMIT");
      return records;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  save(record: SsiRecord, action: string, actor: string): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO ssi(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(record.id, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO audit_event(ssi_id,action,actor,payload,occurred_at) VALUES(?,?,?,?,?)",
        )
        .run(record.id, action, actor, JSON.stringify(record), now);
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,event_type,payload,created_at) VALUES(?,?,?,?)",
        )
        .run(randomUUID(), `SSI_${action}`, JSON.stringify(record), now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  audit(): unknown[] {
    return this.db
      .prepare(
        "SELECT * FROM audit_event WHERE julianday(occurred_at) >= julianday(?) ORDER BY id DESC",
      )
      .all(onlineAuditCutoffUtc());
  }
  onModuleDestroy(): void {
    this.db.close();
  }
}
