import {
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DatabaseSnapshotIdentityService } from "./database-snapshot-identity.service";
import {
  FinControlledFixtureService,
  type FinControlledFixtureQuery,
} from "./fin-controlled-fixture.service";
import { FinFieldResolutionService } from "./fin-field-resolution.service";
import { BankServiceDirectory } from "./bank-service-directory";

export interface FinControlledResolutionRequest extends FinControlledFixtureQuery {
  transactionReference: string;
  fieldOptions?: Record<string, string>;
  roleBankServiceIds?: Record<string, string>;
  rolePartyIdentifiers?: Record<string, string>;
  roleAccountReferences?: Record<string, string>;
}

@Injectable()
export class FinControlledResolutionService {
  constructor(
    private readonly fixtures: FinControlledFixtureService,
    private readonly resolution: FinFieldResolutionService,
    private readonly snapshots: DatabaseSnapshotIdentityService,
    private readonly bankServices: BankServiceDirectory = new BankServiceDirectory(),
  ) {}

  resolve(request: FinControlledResolutionRequest): Record<string, unknown> {
    this.assertControlledScope(request.messageType);
    const fixtureResult = this.fixtures.list(request);
    if (fixtureResult.count !== 1)
      this.dataQualityFailure(fixtureResult.count, request);
    const selected = fixtureResult.candidates[0]!;
    const result = this.resolution.resolve({
      service: "FIN",
      resolutionMode: request.messageType.startsWith("MT3")
        ? "TREASURY"
        : "TRADE_FINANCE",
      standardsRelease: "SR2026",
      messageType: request.messageType,
      direction: "OUTGOING",
      businessFunction: selected.businessFunction,
      sequence: selected.sequence,
      settlementLeg: selected.settlementLeg,
      ...(request.fieldOptions ? { fieldOptions: request.fieldOptions } : {}),
      transactionReference: request.transactionReference,
      currency: request.currency,
      receiverBic: selected.counterpartyBic,
      bookingEntity: request.bookingEntity,
      valueDate: request.valueDate,
      sourceSsiId: selected.identity.ssi.id,
      roles: {
        ...selected.roleValues,
        ...Object.fromEntries(
          Object.entries(request.roleBankServiceIds ?? {}).map(
            ([role, bankServiceId]) => [
              role,
              this.renderRoleValue(
                this.bankServices.resolve(bankServiceId).bic,
                request.rolePartyIdentifiers?.[role],
                request.roleAccountReferences?.[role],
              ),
            ],
          ),
        ),
      },
      roleSources: selected.roleSources,
      roleEvidence: selected.roleEvidence,
    });
    const snapshot = this.snapshots.current();
    return {
      ...result,
      payloadGenerated: true,
      selectedFixture: {
        fixtureFamily: fixtureResult.fixtureFamily,
        bindingId: selected.bindingId,
        source: fixtureResult.source,
        identity: selected.identity,
      },
      snapshotHash: snapshot.sha256,
      snapshotIdentityMethod: snapshot.method,
    };
  }

  private assertControlledScope(messageType: string): void {
    const boundaryCode = this.boundaryCode(messageType);
    if (!boundaryCode) return;
    throw new UnprocessableEntityException({
      code: boundaryCode,
      auditRecorded: true,
      payloadGenerated: false,
      messageType,
      boundary: "MT347_SSI_REFERENCE_SCOPE",
    });
  }

  private renderRoleValue(
    bic: string,
    partyIdentifier?: string,
    accountReference?: string,
  ): string {
    const prefix = partyIdentifier?.trim() ||
      (accountReference?.trim() ? `/${accountReference.trim()}` : "");
    return prefix ? `${prefix}\n${bic}` : bic;
  }

  private boundaryCode(messageType: string): string | undefined {
    if (messageType === "MT416") return "MESSAGE_TYPE_NOT_SUPPORTED";
    if (messageType === "MT785") return "OUT_OF_SSI_SCOPE";
    return undefined;
  }

  private dataQualityFailure(
    count: number,
    request: FinControlledResolutionRequest,
  ): never {
    const development = ["development", "demo"].includes(
      (process.env["SSI_RUNTIME_ENV"] ?? "development").toLowerCase(),
    );
    throw new HttpException(
      {
        code: "INCORRECT_SSI_CONFIGURATION",
        message: count ? "Controlled SSI configuration is ambiguous" : "Controlled SSI configuration is missing",
        remediation:
          "Correct the governed MT347 fixture configuration and reload Development Test Data.",
        payloadGenerated: false,
        candidateCount: count,
        context: {
          messageType: request.messageType,
          sequence: request.sequence,
          bindingId: request.bindingId,
        },
      },
      development ? 409 : 500,
    );
  }
}
