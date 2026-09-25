import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { finalize } from "rxjs/operators";

type Release = () => void;

@Injectable()
export class DatabaseMutationCoordinator {
  private activeMutations = 0;
  private reloadPending = false;
  private readonly drainedWaiters: Array<() => void> = [];

  beginMutation(): Release {
    if (this.reloadPending)
      throw new ServiceUnavailableException({
        code: "DEMO_RELOAD_IN_PROGRESS",
        retryable: true,
      });
    this.activeMutations += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeMutations -= 1;
      if (this.activeMutations === 0)
        for (const resolve of this.drainedWaiters.splice(0)) resolve();
    };
  }

  async beginReload(): Promise<Release> {
    this.reloadPending = true;
    if (this.activeMutations > 0)
      await new Promise<void>((resolve) => this.drainedWaiters.push(resolve));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reloadPending = false;
    };
  }
}

@Injectable()
export class DatabaseMutationInterceptor implements NestInterceptor {
  constructor(private readonly coordinator: DatabaseMutationCoordinator) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
    }>();
    const method = request.method?.toUpperCase() ?? "GET";
    const reloadRequest = request.url
      ?.split("?", 1)[0]
      ?.endsWith("/settings/development-data/reload");
    if (["GET", "HEAD", "OPTIONS"].includes(method) || reloadRequest)
      return next.handle();
    const release = this.coordinator.beginMutation();
    return next.handle().pipe(finalize(release));
  }
}
