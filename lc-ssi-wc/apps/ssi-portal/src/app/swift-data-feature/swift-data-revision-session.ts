import { inject, Injectable, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { SwiftDataApiService } from "./swift-data-api.service";

type Notice = { kind: "info" | "error"; text: string };

/** One WIP reservation and one in-flight release per SWIFT Data feature instance. */
@Injectable()
export class SwiftDataRevisionSession {
  private readonly api = inject(SwiftDataApiService);
  readonly reservationId = signal<string | null>(null);
  private pendingDeactivation: Promise<boolean> | null = null;

  canDeactivate(
    endpoint: string | null,
    refresh: () => Promise<void>,
    notify: (notice: Notice) => void,
  ): Promise<boolean> {
    if (this.pendingDeactivation) return this.pendingDeactivation;
    const id = this.reservationId();
    if (!id) return Promise.resolve(true);
    if (!endpoint) return Promise.resolve(false);
    const attempt = this.release(endpoint, id, refresh, notify).finally(() => {
      if (this.pendingDeactivation === attempt) this.pendingDeactivation = null;
    });
    this.pendingDeactivation = attempt;
    return attempt;
  }

  private async release(
    endpoint: string,
    id: string,
    refresh: () => Promise<void>,
    notify: (notice: Notice) => void,
  ): Promise<boolean> {
    try {
      await firstValueFrom(this.api.delete(endpoint, id, {
        actor: "maker.revision",
        reason: "Revision cancelled before Save Draft",
      }));
      notify({
        kind: "info",
        text: "Revise 已取消；ACTIVE 紀錄已解除修訂註記。",
      });
      await refresh();
      this.reservationId.set(null);
      return true;
    } catch {
      notify({
        kind: "error",
        text: "取消 Revise 失敗；資料狀態已改變，請重新整理。",
      });
      await refresh();
      return false;
    }
  }
}
