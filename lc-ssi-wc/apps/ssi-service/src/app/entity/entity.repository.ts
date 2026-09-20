import { Injectable } from '@nestjs/common';
import { SqliteGovernedRepository,type GovernedRecord } from '../shared/sqlite-governed.repository';
export interface EntityRecord extends GovernedRecord{branchCode:string;branchName:string;legalEntityCode:string;legalEntityName:string;countryCode:string;validFrom:string;validTo:string;maker:string;checker?:string;amendmentOfId?:string;revokeReason?:string;}
@Injectable()
export class EntityRepository extends SqliteGovernedRepository<EntityRecord> {
  constructor() { super("booking_branch_entity", "booking_branch_entity_audit"); }

  activeBookingEntities(asOfDate: string): readonly { value: string; label: string }[] {
    const rows = this.db.prepare(`
      SELECT json_extract(payload,'$.branchCode') AS branchCode,
             json_extract(payload,'$.branchName') AS branchName,id
      FROM booking_branch_entity
      WHERE json_extract(payload,'$.status')='ACTIVE'
        AND json_extract(payload,'$.validFrom')<=?
        AND (COALESCE(json_extract(payload,'$.validTo'),'')='' OR json_extract(payload,'$.validTo')>=?)
      ORDER BY branchCode,id
    `).all(asOfDate, asOfDate) as { branchCode: string; branchName: string; id: string }[];
    const codes = new Set<string>();
    return rows.map(({ branchCode, branchName }) => {
      if (!branchCode?.trim() || codes.has(branchCode))
        throw new Error("RESOLUTION_BOOKING_ENTITY_AMBIGUOUS");
      codes.add(branchCode);
      return { value: branchCode, label: `${branchCode} — ${branchName}` };
    });
  }
}
