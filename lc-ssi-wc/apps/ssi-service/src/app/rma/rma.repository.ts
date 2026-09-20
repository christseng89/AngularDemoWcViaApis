import { Injectable } from "@nestjs/common";
import {
  type PageRequest,
  type PagedResult,
  SqliteGovernedRepository,
  type GovernedRecord,
} from "../shared/sqlite-governed.repository";
import {
  currentStatusProjection,
  type OpenRevisionChangeType,
  type OpenRevisionProjection,
  type OpenRevisionStatus,
} from "../shared/current-status-projection";
import { maintenanceIndexStatuses } from "../shared/maintenance-index-status";

export type RmaDirection = "INBOUND" | "OUTBOUND";
export interface RmaMessageTypeChanges {
  unchanged: string[];
  added: string[];
  suppressed: string[];
}
export interface RmaRecord extends GovernedRecord {
  ownBic: string;
  counterpartyBic: string;
  service: "FIN" | "FINPLUS" | "FIN / FINPLUS";
  services?: ("FIN" | "FINPLUS")[];
  direction: RmaDirection;
  messageTypes: string[];
  messageTypeChanges?: RmaMessageTypeChanges;
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
  at?: string;
  fixtureFamily?: string;
  usageGroup?: string;
  fixtureBindingId?: string;
  operationalOnly?: boolean;
}

export interface RmaPairState {
  ownBic: string;
  counterpartyBic: string;
  directions: Record<RmaDirection, RmaRecord | null>;
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
    this
      .executeSchema(`CREATE INDEX IF NOT EXISTS idx_rma_authorisation_logical_scope_v3 ON rma_authorisation(
      json_extract(payload,'$.status'),
      json_extract(payload,'$.fixtureFamily'),
      CASE WHEN length(trim(json_extract(payload,'$.ownBic')))=8
        THEN trim(json_extract(payload,'$.ownBic')) || 'XXX'
        ELSE trim(json_extract(payload,'$.ownBic')) END,
      CASE WHEN length(trim(json_extract(payload,'$.counterpartyBic')))=8
        THEN trim(json_extract(payload,'$.counterpartyBic')) || 'XXX'
        ELSE trim(json_extract(payload,'$.counterpartyBic')) END,
      json_extract(payload,'$.direction'),
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

  findActivePair(ownBic: string, counterpartyBic: string): RmaPairState {
    const records = this.selectPayloads(
      `SELECT payload FROM rma_authorisation
       WHERE json_extract(payload,'$.status')='ACTIVE'
         AND upper(CASE WHEN length(trim(json_extract(payload,'$.ownBic')))=8
           THEN trim(json_extract(payload,'$.ownBic')) || 'XXX'
           ELSE trim(json_extract(payload,'$.ownBic')) END)=?
         AND upper(CASE WHEN length(trim(json_extract(payload,'$.counterpartyBic')))=8
           THEN trim(json_extract(payload,'$.counterpartyBic')) || 'XXX'
           ELSE trim(json_extract(payload,'$.counterpartyBic')) END)=?
       ORDER BY updated_at DESC, id DESC`,
      ownBic,
      counterpartyBic,
    );
    const merge = (direction: RmaDirection): RmaRecord | null => {
      const matches = records.filter(
        (record) => record.direction === direction,
      );
      const representative = matches[0];
      if (!representative) return null;
      const messageTypes = [
        ...new Set(matches.flatMap((record) => record.messageTypes)),
      ];
      const hasFin = messageTypes.some((value) => value.startsWith("MT"));
      const hasFinPlus = messageTypes.some((value) =>
        value.startsWith("pacs."),
      );
      return {
        ...representative,
        messageTypes,
        service:
          hasFin && hasFinPlus ? "FIN / FINPLUS" : hasFin ? "FIN" : "FINPLUS",
      };
    };
    return {
      ownBic,
      counterpartyBic,
      directions: {
        INBOUND: merge("INBOUND"),
        OUTBOUND: merge("OUTBOUND"),
      },
    };
  }

  listIndexPage(request: PageRequest): PagedResult<RmaRecord> {
    this.expireRevisionWorkInProgress();
    const page = Math.max(1, Math.trunc(request.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.trunc(request.pageSize ?? 20)),
    );
    const clauses: string[] = [];
    const parameters: (string | number)[] = [];
    const statuses = maintenanceIndexStatuses(request.status);
    clauses.push(
      `json_extract(payload,'$.status') IN (${statuses.map(() => "?").join(",")})`,
    );
    parameters.push(...statuses);
    const search = request.search?.trim();
    if (search) {
      clauses.push("payload LIKE ? ESCAPE '\\'");
      parameters.push(
        `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
      );
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    const key = `upper(trim(json_extract(payload,'$.ownBic'))) || '|' ||
      upper(trim(json_extract(payload,'$.counterpartyBic'))) || '|' ||
      json_extract(payload,'$.direction') || '|' || json_extract(payload,'$.status')`;
    const rows = this.queryRows(
      `WITH filtered AS (
         SELECT id, payload, updated_at, ${key} AS logical_key
         FROM rma_authorisation${where}
       ), ranked AS (
         SELECT *, row_number() OVER (
           PARTITION BY logical_key ORDER BY updated_at DESC, id DESC
         ) AS row_number
         FROM filtered
       ), grouped AS (
         SELECT logical_key, max(updated_at) AS latest_updated_at
         FROM filtered GROUP BY logical_key
       ), page_groups AS (
         SELECT logical_key, latest_updated_at, count(*) OVER () AS total_items
         FROM grouped
         ORDER BY latest_updated_at DESC, logical_key DESC
         LIMIT ? OFFSET ?
       )
       SELECT ranked.payload, page_groups.total_items, ranked.logical_key
       FROM page_groups
       JOIN ranked ON ranked.logical_key=page_groups.logical_key AND ranked.row_number=1
       ORDER BY page_groups.latest_updated_at DESC, ranked.logical_key DESC`,
      ...parameters,
      pageSize,
      (page - 1) * pageSize,
    );
    const items = rows.map((row) => {
      const representative = JSON.parse(String(row["payload"])) as RmaRecord;
      const members = this.selectPayloads(
        `SELECT payload FROM rma_authorisation
         WHERE upper(trim(json_extract(payload,'$.ownBic'))) || '|' ||
           upper(trim(json_extract(payload,'$.counterpartyBic'))) || '|' ||
           json_extract(payload,'$.direction') || '|' || json_extract(payload,'$.status')=?`,
        String(row["logical_key"]),
      );
      const messageTypes = [
        ...new Set(members.flatMap((member) => member.messageTypes)),
      ];
      const services = [
        ...new Set(
          messageTypes.map((messageType) =>
            messageType.startsWith("MT")
              ? ("FIN" as const)
              : ("FINPLUS" as const),
          ),
        ),
      ];
      const service: RmaRecord["service"] =
        services.length === 2 ? "FIN / FINPLUS" : services[0]!;
      const openRevision = this.openRevisionForSourceIds(
        members.map((member) => member.id),
      );
      return {
        ...representative,
        messageTypes,
        services,
        service,
        ...currentStatusProjection(openRevision),
      };
    });
    const totalItems = rows.length ? Number(rows[0]!["total_items"]) : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    };
  }

  private openRevisionForSourceIds(
    sourceIds: readonly string[],
  ): OpenRevisionProjection | undefined {
    if (!sourceIds.length) return undefined;
    const placeholders = sourceIds.map(() => "?").join(",");
    const row = this.queryRows(
      `SELECT id,
          json_extract(payload,'$.status') AS status,
          COALESCE(json_extract(payload,'$.changeType'),'REVISION') AS change_type
       FROM rma_authorisation
       WHERE json_extract(payload,'$.amendmentOfId') IN (${placeholders})
         AND json_extract(payload,'$.status') IN ('WIP','DRAFT','PENDING_APPROVAL','APPROVED')
       ORDER BY CASE json_extract(payload,'$.status')
         WHEN 'APPROVED' THEN 4
         WHEN 'PENDING_APPROVAL' THEN 3
         WHEN 'DRAFT' THEN 2
         ELSE 1
       END DESC, updated_at DESC, id DESC
       LIMIT 1`,
      ...sourceIds,
    )[0];
    if (!row) return undefined;
    return {
      id: String(row["id"]),
      status: String(row["status"]) as OpenRevisionStatus,
      changeType: String(row["change_type"]) as OpenRevisionChangeType,
    };
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
    const operationalClause = query.operationalOnly
      ? ` AND json_type(payload,'$.fixtureFamily') IS NULL
          AND (json_type(payload,'$.fixtureBindingIds') IS NULL
               OR (json_type(payload,'$.fixtureBindingIds')='array'
                   AND json_array_length(payload,'$.fixtureBindingIds')=0))`
      : "";
    const dateClause = query.at
      ? ` AND json_extract(payload,'$.validFrom')<=?
          AND json_extract(payload,'$.validTo')>=?`
      : "";
    const parameters = [
      query.ownBic,
      query.counterpartyBic,
      query.service,
      query.service,
      query.service,
      query.direction,
      messageType,
    ];
    if (query.at) parameters.push(query.at, query.at);
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
         AND (json_extract(payload,'$.service')=?
              OR (json_extract(payload,'$.service')='FIN / FINPLUS' AND ? IN ('FIN','FINPLUS'))
              OR EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.services')) WHERE value=?))
         AND json_extract(payload,'$.direction')=?
         AND EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.messageTypes')) WHERE value=?)
         AND json_extract(payload,'$.status')='ACTIVE'
         ${dateClause}${familyClause}${usageClause}${bindingClause}${operationalClause}
       ORDER BY updated_at DESC, id DESC`,
      parameters,
    };
  }
}
