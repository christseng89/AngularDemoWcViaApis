import { createHash, randomUUID } from 'node:crypto';
import { DomainRuleError, SettlementInstruction } from './ssi';

export interface ResolutionRequest {
  readonly counterpartyId: string;
  readonly currency: string;
  readonly businessFunction: string;
  readonly transactionReference: string;
}

export interface ResolutionSnapshot {
  readonly resolutionToken: string;
  readonly snapshotHash: string;
  readonly ssiId: string;
  readonly ssiVersion: number;
  readonly request: ResolutionRequest;
  readonly route: SettlementInstruction['route'];
}

/**
 * @deprecated Prototype-only resolver. Production resolution is implemented by
 * apps/ssi-service/route-resolution.policy and SsiApplicationService.
 */
export class SsiResolutionPolicy {
  resolve(request: ResolutionRequest, candidates: readonly SettlementInstruction[]): ResolutionSnapshot {
    const eligible = candidates.filter((candidate) =>
      candidate.status === 'ACTIVE' &&
      candidate.counterpartyId === request.counterpartyId &&
      candidate.route.currency === request.currency,
    );
    if (eligible.length === 0) throw new DomainRuleError('SSI_NOT_FOUND', 'No active SSI matches the request');
    if (eligible.length > 1) throw new DomainRuleError('SSI_AMBIGUOUS', 'More than one active SSI matches the request');
    const selected = eligible[0];
    if (!selected) throw new DomainRuleError('SSI_NOT_FOUND', 'No active SSI matches the request');
    const payload = JSON.stringify({ request, ssiId: selected.id, version: selected.version, route: selected.route });
    return Object.freeze({
      resolutionToken: randomUUID(),
      snapshotHash: createHash('sha256').update(payload).digest('hex'),
      ssiId: selected.id,
      ssiVersion: selected.version,
      request,
      route: selected.route,
    });
  }
}
