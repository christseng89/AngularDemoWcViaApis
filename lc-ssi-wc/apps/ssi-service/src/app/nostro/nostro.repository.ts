import { Injectable } from "@nestjs/common";
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
    )`);
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
