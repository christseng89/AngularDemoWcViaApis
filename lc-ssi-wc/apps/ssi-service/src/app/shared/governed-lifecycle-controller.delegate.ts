import { BadRequestException } from "@nestjs/common";

export type GovernedLifecycleAction =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "ACTIVATE";

export interface GovernedLifecycleService<TCommand> {
  list(status?: string): unknown;
  create(command: TCommand): unknown;
  update(id: string, command: TCommand): unknown;
  revise(id: string, maker: string): unknown;
  suppress(id: string, maker: string, reason: string): unknown;
  transition(
    id: string,
    action: GovernedLifecycleAction,
    actor: string,
    reason?: string,
  ): unknown;
  revoke(id: string, actor: string, reason: string): unknown;
  audit(): unknown;
}

function governedLifecycleAction(action: string): GovernedLifecycleAction {
  const normalized = action.toUpperCase();
  if (!["SUBMIT", "APPROVE", "REJECT", "ACTIVATE"].includes(normalized))
    throw new BadRequestException("INVALID_ACTION");
  return normalized as GovernedLifecycleAction;
}

export class GovernedLifecycleControllerDelegate<TCommand> {
  constructor(private readonly service: GovernedLifecycleService<TCommand>) {}

  list(status?: string): unknown {
    return this.service.list(status);
  }

  create(command: TCommand): unknown {
    return this.service.create(command);
  }

  update(id: string, command: TCommand): unknown {
    return this.service.update(id, command);
  }

  revise(id: string, maker: string): unknown {
    return this.service.revise(id, maker);
  }

  suppress(id: string, maker: string, reason: string): unknown {
    return this.service.suppress(id, maker, reason);
  }

  transition(id: string, action: string, actor: string, reason = ""): unknown {
    return this.service.transition(
      id,
      governedLifecycleAction(action),
      actor,
      reason,
    );
  }

  revoke(id: string, actor: string, reason: string): unknown {
    return this.service.revoke(id, actor, reason);
  }

  audit(): unknown {
    return this.service.audit();
  }
}
