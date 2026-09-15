import { Injectable } from "@nestjs/common";
import {
  SqliteGovernedRepository,
  type GovernedRecord,
} from "../shared/sqlite-governed.repository";

export type RmaDirection = "INBOUND" | "OUTBOUND";
export interface RmaRecord extends GovernedRecord {
  ownBic: string;
  counterpartyBic: string;
  service: "FIN" | "FINPLUS";
  direction: RmaDirection;
  messageTypes: string[];
  validFrom: string;
  validTo: string;
  maker: string;
  checker?: string;
  amendmentOfId?: string;
  revokeReason?: string;
  source: "SYNTHETIC_DEMO" | "LICENSED_IMPORT";
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingIds?: string[];
}

export interface RmaAuthorisationQuery {
  ownBic: string;
  counterpartyBic: string;
  service: string;
  direction: RmaDirection;
  messageType: string;
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingId?: string;
}

@Injectable()
export class RmaRepository extends SqliteGovernedRepository<RmaRecord> {
  constructor() {
    super("rma_authorisation", "rma_audit_event");
    this
      .executeSchema(`CREATE INDEX IF NOT EXISTS idx_rma_authorisation_scope_v2 ON rma_authorisation(
      json_extract(payload,'$.fixtureFamily'),
      CASE WHEN length(trim(json_extract(payload,'$.ownBic')))=8
        THEN trim(json_extract(payload,'$.ownBic')) || 'XXX'
        ELSE trim(json_extract(payload,'$.ownBic')) END,
      CASE WHEN length(trim(json_extract(payload,'$.counterpartyBic')))=8
        THEN trim(json_extract(payload,'$.counterpartyBic')) || 'XXX'
        ELSE trim(json_extract(payload,'$.counterpartyBic')) END,
      json_extract(payload,'$.service'),
      json_extract(payload,'$.direction'),
      json_extract(payload,'$.status'),
      json_extract(payload,'$.validFrom'),
      json_extract(payload,'$.validTo'),
      json_extract(payload,'$.usageGroup')
    )`);
  }

  findAuthorised(query: RmaAuthorisationQuery): RmaRecord[] {
    const exactStatement = this.authorisationStatement(
      query,
      query.messageType,
    );
    const exact = this.selectPayloads(
      exactStatement.sql,
      ...exactStatement.parameters,
    );
    if (exact.length) return exact;
    const wildcardStatement = this.authorisationStatement(query, "*");
    return this.selectPayloads(
      wildcardStatement.sql,
      ...wildcardStatement.parameters,
    );
  }

  explainFindAuthorised(query: RmaAuthorisationQuery): string[] {
    const { sql, parameters } = this.authorisationStatement(
      query,
      query.messageType,
    );
    return this.explainQueryPlan(sql, ...parameters);
  }

  indexNames(): string[] {
    return this.tableIndexNames();
  }

  private authorisationStatement(
    query: RmaAuthorisationQuery,
    messageType: string,
  ): { sql: string; parameters: string[] } {
    const familyClause =
      query.fixtureFamily === undefined
        ? ""
        : " AND json_extract(payload,'$.fixtureFamily')=?";
    const usageClause =
      query.usageGroup === undefined
        ? ""
        : " AND json_extract(payload,'$.usageGroup')=?";
    const bindingClause =
      query.fixtureBindingId === undefined
        ? ""
        : ` AND EXISTS (
            SELECT 1 FROM json_each(json_extract(payload,'$.fixtureBindingIds'))
            WHERE value=?
          )`;
    const parameters = [
      query.ownBic,
      query.counterpartyBic,
      query.service,
      query.direction,
      messageType,
    ];
    if (query.fixtureFamily !== undefined) parameters.push(query.fixtureFamily);
    if (query.usageGroup !== undefined) parameters.push(query.usageGroup);
    if (query.fixtureBindingId !== undefined)
      parameters.push(query.fixtureBindingId);
    return {
      sql: `SELECT payload FROM rma_authorisation
       WHERE (CASE WHEN length(trim(json_extract(payload,'$.ownBic')))=8
          THEN trim(json_extract(payload,'$.ownBic')) || 'XXX'
          ELSE trim(json_extract(payload,'$.ownBic')) END)=?
         AND (CASE WHEN length(trim(json_extract(payload,'$.counterpartyBic')))=8
          THEN trim(json_extract(payload,'$.counterpartyBic')) || 'XXX'
          ELSE trim(json_extract(payload,'$.counterpartyBic')) END)=?
         AND json_extract(payload,'$.service')=?
         AND json_extract(payload,'$.direction')=?
         AND EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.messageTypes')) WHERE value=?)
         ${familyClause}${usageClause}${bindingClause}
       ORDER BY id`,
      parameters,
    };
  }
}
