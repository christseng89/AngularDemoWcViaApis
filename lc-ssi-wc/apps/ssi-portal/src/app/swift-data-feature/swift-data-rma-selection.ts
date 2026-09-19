import { inject, Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { scalarText } from "../scalar-text";
import { SwiftDataApiService } from "./swift-data-api.service";
import type { Row } from "./swift-data.models";

/** Governed RMA pair-direction selection cache, scoped to one CRUD feature. */
@Injectable()
export class SwiftDataRmaSelection {
  private readonly api = inject(SwiftDataApiService);
  private readonly directionMessageTypes = new Map<string, readonly string[]>();

  forDirection(
    model: Record<string, unknown>,
    direction: "INBOUND" | "OUTBOUND",
  ): readonly string[] {
    if (model["direction"] === direction)
      return this.messageTypesFrom(model["messageTypes"]);
    return this.directionMessageTypes.get(this.key(model, direction)) ?? [];
  }

  cache(rows: readonly Row[], resourceId: string): void {
    if (resourceId !== "rma") return;
    const candidates = new Map<string, Row[]>();
    for (const row of rows) {
      const direction = row["direction"];
      if (direction !== "INBOUND" && direction !== "OUTBOUND") continue;
      const key = this.key(row, direction);
      const group = candidates.get(key) ?? [];
      group.push(row);
      candidates.set(key, group);
    }
    for (const [key, group] of candidates)
      this.directionMessageTypes.set(
        key,
        this.messageTypesFrom(this.preferredRow(group)["messageTypes"]),
      );
  }

  /** false means only the other direction failed to load; current direction remains usable. */
  async hydrate(row: Row, resourceId: string): Promise<boolean> {
    if (resourceId !== "rma") return true;
    this.cache([row], resourceId);
    const counterpartyBic = scalarText(row["counterpartyBic"]).trim();
    if (!counterpartyBic) return true;
    try {
      const ownBic = scalarText(row["ownBic"]).trim().toLocaleUpperCase();
      const query = new URLSearchParams({ ownBic, counterpartyBic });
      const pairState = await firstValueFrom(this.api.pairState(query));
      this.cache(
        Object.values(pairState.directions).filter(
          (candidate): candidate is Row => candidate !== null,
        ),
        resourceId,
      );
      return true;
    } catch {
      return false;
    }
  }

  private preferredRow(rows: readonly Row[]): Row {
    const statusPriority: Record<string, number> = {
      WIP: 4,
      DRAFT: 3,
      PENDING_APPROVAL: 2,
      ACTIVE: 1,
    };
    return [...rows].sort(
      (left, right) =>
        (statusPriority[right.status] ?? 0) -
          (statusPriority[left.status] ?? 0) || right.version - left.version,
    )[0]!;
  }

  private key(model: Record<string, unknown>, direction: "INBOUND" | "OUTBOUND"): string {
    return [
      scalarText(model["ownBic"]).trim().toLocaleUpperCase(),
      scalarText(model["counterpartyBic"]).trim().toLocaleUpperCase(),
      direction,
    ].join("|");
  }

  private messageTypesFrom(value: unknown): readonly string[] {
    const values = Array.isArray(value) ? value : scalarText(value).split(",");
    return values.map((item) => scalarText(item).trim()).filter(Boolean);
  }
}
