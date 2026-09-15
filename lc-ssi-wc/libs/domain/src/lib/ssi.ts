export type SsiStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED';

export type SsiScope = 'REUSABLE' | 'TRANSACTION_ONLY';

export interface SettlementRoute {
  readonly currency: string;
  readonly beneficiaryBic: string;
  readonly accountWithBic: string;
  readonly intermediaryBic?: string;
  readonly accountId?: string;
}

export interface AuditEntry {
  readonly action: string;
  readonly actor: string;
  readonly at: string;
  readonly version: number;
  readonly detail?: string;
}

export class DomainRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DomainRuleError';
  }
}

export class SettlementInstruction {
  private _status: SsiStatus = 'DRAFT';
  private _version = 1;
  private _checker?: string;
  private readonly _audit: AuditEntry[] = [];

  private constructor(
    readonly id: string,
    readonly counterpartyId: string,
    readonly scope: SsiScope,
    readonly maker: string,
    private _route: SettlementRoute,
  ) {
    this.record('CREATED', maker);
  }

  static create(input: {
    id: string;
    counterpartyId: string;
    scope: SsiScope;
    maker: string;
    route: SettlementRoute;
  }): SettlementInstruction {
    if (!input.id.trim() || !input.counterpartyId.trim() || !input.maker.trim()) {
      throw new DomainRuleError('REQUIRED_VALUE', 'SSI id, counterparty and maker are required');
    }
    if (!/^[A-Z]{3}$/.test(input.route.currency)) {
      throw new DomainRuleError('INVALID_CURRENCY', 'Currency must be a three-letter uppercase code');
    }
    return new SettlementInstruction(
      input.id,
      input.counterpartyId,
      input.scope,
      input.maker,
      Object.freeze({ ...input.route }),
    );
  }

  get status(): SsiStatus { return this._status; }
  get version(): number { return this._version; }
  get checker(): string | undefined { return this._checker; }
  get route(): SettlementRoute { return { ...this._route }; }
  get audit(): readonly AuditEntry[] { return [...this._audit]; }

  updateRoute(route: SettlementRoute, actor: string): void {
    if (this._status !== 'DRAFT') {
      throw new DomainRuleError('SSI_NOT_EDITABLE', 'Only a draft SSI can be edited');
    }
    this._route = Object.freeze({ ...route });
    this._version += 1;
    this.record('ROUTE_UPDATED', actor);
  }

  submit(actor: string): void {
    this.requireStatus('DRAFT');
    if (actor !== this.maker) {
      throw new DomainRuleError('MAKER_MISMATCH', 'Only the maker can submit this SSI');
    }
    this._status = 'PENDING_APPROVAL';
    this.record('SUBMITTED', actor);
  }

  approve(checker: string): void {
    this.requireStatus('PENDING_APPROVAL');
    if (checker === this.maker) {
      throw new DomainRuleError('FOUR_EYES_VIOLATION', 'Maker cannot approve their own SSI');
    }
    this._checker = checker;
    this._status = 'APPROVED';
    this.record('APPROVED', checker);
  }

  activate(actor: string): void {
    this.requireStatus('APPROVED');
    this._status = 'ACTIVE';
    this.record('ACTIVATED', actor);
  }

  suspend(actor: string, reason: string): void {
    this.requireStatus('ACTIVE');
    if (!reason.trim()) throw new DomainRuleError('REASON_REQUIRED', 'Suspension reason is required');
    this._status = 'SUSPENDED';
    this.record('SUSPENDED', actor, reason);
  }

  private requireStatus(expected: SsiStatus): void {
    if (this._status !== expected) {
      throw new DomainRuleError('INVALID_STATE_TRANSITION', `Expected ${expected}, found ${this._status}`);
    }
  }

  private record(action: string, actor: string, detail?: string): void {
    this._audit.push(Object.freeze({
      action,
      actor,
      at: new Date().toISOString(),
      version: this._version,
      ...(detail === undefined ? {} : { detail }),
    }));
  }
}
