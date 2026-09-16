export type Direction = "INBOUND" | "OUTBOUND";

export interface CanonicalIdentity {
  readonly value: string;
}

abstract class CanonicalKey implements CanonicalIdentity {
  public readonly value: string;

  protected constructor(value: string) {
    this.value = value;
  }

  equals(other: CanonicalIdentity): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

class CanonicalText implements CanonicalIdentity {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static required(value: unknown, field: string): CanonicalText {
    const token = String(value ?? "")
      .trim()
      .toUpperCase();
    if (!token) throw new Error(`REQUIRED_${field.toUpperCase()}`);
    return new CanonicalText(token);
  }
}

export class CanonicalBic implements CanonicalIdentity {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static from(value: unknown): CanonicalBic {
    const bic = CanonicalText.required(value, "bic").value.replace(/\s+/g, "");
    if (/^[A-Z0-9]{8}$/.test(bic)) return new CanonicalBic(`${bic}XXX`);
    if (/^[A-Z0-9]{11}$/.test(bic)) return new CanonicalBic(bic);
    throw new Error(`INVALID_BIC:${bic}`);
  }

  equals(other: CanonicalBic): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export class EntityCanonicalKey extends CanonicalKey {
  private constructor(value: string) {
    super(value);
  }

  static from(
    legalEntityCode: unknown,
    branchCode: unknown,
  ): EntityCanonicalKey {
    return new EntityCanonicalKey(
      [
        CanonicalText.required(legalEntityCode, "legalEntityCode").value,
        CanonicalText.required(branchCode, "branchCode").value,
      ].join("|"),
    );
  }
}

export interface NostroIdentityInput {
  readonly ownLegalEntityId: unknown;
  readonly accountServicerBic: unknown;
  readonly currency: unknown;
  readonly purpose: unknown;
  readonly maskedAccountRef: unknown;
}

export class NostroCanonicalKey extends CanonicalKey {
  private constructor(value: string) {
    super(value);
  }

  static from(input: NostroIdentityInput): NostroCanonicalKey {
    return new NostroCanonicalKey(
      [
        CanonicalText.required(input.ownLegalEntityId, "ownLegalEntityId")
          .value,
        CanonicalBic.from(input.accountServicerBic).value,
        CanonicalText.required(input.currency, "currency").value,
        CanonicalText.required(input.purpose, "purpose").value,
        CanonicalText.required(input.maskedAccountRef, "maskedAccountRef")
          .value,
      ].join("|"),
    );
  }
}

export interface SsiIdentityInput {
  readonly ownershipType: unknown;
  readonly ownerParty: unknown;
  readonly publisherParty: unknown;
  readonly counterpartyType: unknown;
  readonly counterpartyBic: unknown;
  readonly scope: unknown;
  readonly currency: unknown;
  readonly businessFunction: unknown;
}

export class SsiCanonicalKey extends CanonicalKey {
  private constructor(value: string) {
    super(value);
  }

  static from(input: SsiIdentityInput): SsiCanonicalKey {
    const counterpartyBic = CanonicalText.required(
      input.counterpartyBic,
      "counterpartyBic",
    ).value;
    const canonicalCounterparty =
      counterpartyBic === "ANY"
        ? "ANY"
        : CanonicalBic.from(counterpartyBic).value;

    return new SsiCanonicalKey(
      [
        CanonicalText.required(input.ownershipType, "ownershipType").value,
        CanonicalText.required(input.ownerParty, "ownerParty").value,
        CanonicalText.required(input.publisherParty, "publisherParty").value,
        CanonicalText.required(input.counterpartyType, "counterpartyType")
          .value,
        canonicalCounterparty,
        CanonicalText.required(input.scope, "scope").value,
        CanonicalText.required(input.currency, "currency").value,
        CanonicalText.required(input.businessFunction, "businessFunction")
          .value,
      ].join("|"),
    );
  }
}

export class RmaCanonicalKey extends CanonicalKey {
  private constructor(value: string) {
    super(value);
  }

  static from(
    ownBic: unknown,
    counterpartyBic: unknown,
    directionValue: unknown,
  ): RmaCanonicalKey {
    const direction = CanonicalText.required(directionValue, "direction").value;
    if (direction !== "INBOUND" && direction !== "OUTBOUND") {
      throw new Error(`INVALID_DIRECTION:${direction}`);
    }

    return new RmaCanonicalKey(
      [
        CanonicalBic.from(ownBic).value,
        CanonicalBic.from(counterpartyBic).value,
        direction,
      ].join("|"),
    );
  }
}

export class SegmentationPolicy {
  public readonly segmentCount: number;

  constructor(segmentCount: number) {
    if (!Number.isInteger(segmentCount) || segmentCount < 1) {
      throw new Error(`INVALID_SEGMENT_COUNT:${segmentCount}`);
    }
    this.segmentCount = segmentCount;
  }

  segmentOf(identity: CanonicalIdentity): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < identity.value.length; index += 1) {
      hash ^= identity.value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % this.segmentCount;
  }
}
