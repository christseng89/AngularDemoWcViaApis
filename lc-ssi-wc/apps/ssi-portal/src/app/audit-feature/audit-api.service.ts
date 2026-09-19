import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type { Observable } from "rxjs";
import type { GovernanceTab } from "../app-view.models";
import type { AuditRow } from "../audit-presentation";

export interface AuditParameterField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  inputType?: string;
  description?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: readonly string[];
  optionsSource?: string;
}

export interface AuditLifecycleHealth {
  status: "UP" | "DOWN";
  onlineQueryDays: number;
  archiveAfterDays: number;
  archiveRetentionDays: number;
  scheduleIntervalHours: number;
}

export interface AuditOpenApiContract {
  "x-ui-resources": readonly {
    id: string;
    fields?: readonly AuditParameterField[];
  }[];
}

const AUDIT_PATH: Readonly<Record<GovernanceTab, string>> = {
  rma: "rma-authorisations/audit/events",
  entity: "booking-branch-entities/audit/events",
  nostro: "nostro-accounts/audit/events",
  ssi: "audit",
};

@Injectable()
export class AuditApiService {
  private readonly http = inject(HttpClient);
  private readonly api = "http://localhost:3100/api";

  events(tab: GovernanceTab): Observable<readonly AuditRow[]> {
    return this.http.get<AuditRow[]>(`${this.api}/${AUDIT_PATH[tab]}`);
  }

  lifecycle(): Observable<AuditLifecycleHealth> {
    return this.http.get<AuditLifecycleHealth>(
      `${this.api}/health/audit-retention`,
    );
  }

  contract(): Observable<AuditOpenApiContract> {
    return this.http.get<AuditOpenApiContract>(
      "/openapi/swift-data-service.v1.json",
    );
  }
}
