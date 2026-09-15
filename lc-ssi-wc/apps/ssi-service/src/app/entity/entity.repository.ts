import { Injectable } from '@nestjs/common';
import { SqliteGovernedRepository,type GovernedRecord } from '../shared/sqlite-governed.repository';
export interface EntityRecord extends GovernedRecord{branchCode:string;branchName:string;legalEntityCode:string;legalEntityName:string;countryCode:string;validFrom:string;validTo:string;maker:string;checker?:string;amendmentOfId?:string;revokeReason?:string;}
@Injectable() export class EntityRepository extends SqliteGovernedRepository<EntityRecord>{constructor(){super('booking_branch_entity','booking_branch_entity_audit');}}
