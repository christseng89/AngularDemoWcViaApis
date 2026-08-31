import { RequestValidationError } from '../errors';
import type { BalanceMovement } from '../types';
import type { BalanceService, CreateMovementRequest } from './balanceService';
import type { UnitOfWork } from './unitOfWork';

/**
 * Application service for multi-leg business events. The caller describes the legs, while this service
 * owns the transaction boundary so no HTTP client can observe a partially-created or partially-released
 * event.
 */
export class CompoundMovementService {
  constructor(
    private readonly balance: BalanceService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  create(requests: readonly CreateMovementRequest[]): BalanceMovement[] {
    if (requests.length < 2) throw new RequestValidationError('A compound event requires at least two movement requests.');
    const businessEventIds = new Set(requests.map((request) => request.businessEventId).filter((id): id is string => !!id));
    if (businessEventIds.size !== 1 || requests.some((request) => !request.businessEventId)) {
      throw new RequestValidationError('Every compound movement must carry the same businessEventId.');
    }
    return this.unitOfWork.execute(() =>
      requests.map((request) => {
        const result = this.balance.createMovement(request);
        if (!result.created) throw new RequestValidationError(`Compound movement eventSeq ${request.eventSeq} already exists.`);
        return result.movement;
      }),
    );
  }

  release(movementIds: readonly string[], releasedBy: string): BalanceMovement[] {
    if (movementIds.length < 2) throw new RequestValidationError('A compound release requires at least two movementIds.');
    if (new Set(movementIds).size !== movementIds.length) throw new RequestValidationError('Compound release movementIds must be unique.');
    return this.unitOfWork.execute(() => movementIds.map((movementId) => this.balance.release(movementId, releasedBy)));
  }

  execute(
    actions: readonly { kind: 'release' | 'acknowledge'; movementId: string }[],
    actor: string,
  ): BalanceMovement[] {
    if (actions.length < 2) throw new RequestValidationError('A compound action requires at least two actions.');
    return this.unitOfWork.execute(() =>
      actions.map((action) =>
        action.kind === 'release'
          ? this.balance.release(action.movementId, actor)
          : this.balance.acknowledgeArrival(action.movementId, actor),
      ),
    );
  }
}
