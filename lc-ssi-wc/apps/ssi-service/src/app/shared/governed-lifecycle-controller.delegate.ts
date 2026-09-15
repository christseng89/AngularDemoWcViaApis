import { BadRequestException } from "@nestjs/common";

export type GovernedLifecycleAction = "SUBMIT" | "APPROVE" | "ACTIVATE";

export interface GovernedLifecycleService<TCommand> {
  list(): unknown;
  create(command: TCommand): unknown;
  update(id: string, command: TCommand): unknown;
  revise(id: string, maker: string): unknown;
  transition(
    id: string,
    action: GovernedLifecycleAction,
    actor: string,
  ): unknown;
  revoke(id: string, actor: string, reason: string): unknown;
  audit(): unknown;
}

function governedLifecycleAction(action: string): GovernedLifecycleAction {
  const normalized = action.toUpperCase();
  if (!["SUBMIT", "APPROVE", "ACTIVATE"].includes(normalized))
    throw new BadRequestException("INVALID_ACTION");
  return normalized as GovernedLifecycleAction;
}

export class GovernedLifecycleControllerDelegate<TCommand> {
  constructor(private readonly service: GovernedLifecycleService<TCommand>) {}

  list(): unknown {
    return this.service.list();
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

  transition(id: string, action: string, actor: string): unknown {
    return this.service.transition(id, governedLifecycleAction(action), actor);
  }

  revoke(id: string, actor: string, reason: string): unknown {
    return this.service.revoke(id, actor, reason);
  }

  audit(): unknown {
    return this.service.audit();
  }
}
