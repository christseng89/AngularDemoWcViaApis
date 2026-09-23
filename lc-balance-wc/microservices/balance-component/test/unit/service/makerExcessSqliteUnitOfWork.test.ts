import { createDb, type Db } from '../../../src/db';
import { MakerExcessSubmitService, type MakerExcessSubmitCommand } from '../../../src/service/makerExcessSubmitService';
import { SqliteMakerExcessUnitOfWork } from '../../../src/service/unitOfWork';
import { CommandIdempotencyStore } from '../../../src/store/commandIdempotencyStore';
import { ExcessLedgerStore } from '../../../src/store/excessLedgerStore';
import { FxRateSnapshotStore } from '../../../src/store/fxRateSnapshotStore';
import type { ExcessPolicyConfig } from '../../../src/config/excessPolicyConfig';
import type { CurrencyExchangeQuote } from '../../../src/integration/currencyExchange';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const command: MakerExcessSubmitCommand = {
  commandType: 'MAKER_SUBMIT',
  functionCode: 'A3',
  ownerType: 'IMPORT_LC',
  ownerId: 'logical-lc-1',
  ownerCurrency: 'EUR',
  transactionAmountOwner: '120',
  movementId: 'movement-excess-1',
  actorContext: 'maker-1',
  idempotencyKey: 'key-1',
  requestHash: 'hash-1',
  decisionTime: '2026-09-22T00:00:00.000Z',
};

const policy: Readonly<ExcessPolicyConfig> = {
  policyVersion: 'policy-v1',
  ownerType: 'IMPORT_LC',
  allowancePercentage: '10',
  configuredMaximumUsd: '1000',
  fxMaxStalenessSeconds: 300,
  currencyPrecisions: { EUR: 2 },
  rateScale: 6,
  roundingMode: 'ROUND_HALF_UP',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  fallbackPolicy: 'FAIL_CLOSED',
  pbdFallbackPolicy: { authorized: false, fallbackPolicyId: null, fallbackPolicyVersion: null, effectiveFrom: null, effectiveTo: null },
};

const quote: CurrencyExchangeQuote = {
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  requestedAmount: '1000',
  ratePurpose: 'BOOKING',
  bookingRate: '0.92',
  convertedAmount: '920',
  rateOrigin: 'PROVIDER_SUPPLIED',
  rateSource: 'PROVIDER',
  providerRateId: 'rate-1',
  providerRateVersion: 'opaque-v1',
  requestAttemptId: 'attempt-1',
  rateTimestamp: '2026-09-21T23:59:00.000Z',
  approvalStatus: 'APPROVED',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  correlationId: 'movement-excess-1',
  policyVersion: 'policy-v1',
};

function seedContract(db: Db): void {
  db.prepare(
    `INSERT INTO balance_contracts (
      balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number,
      status, currency, opening_balance, effective_from, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('contract-1', 'logical-lc-1', 1, 'IPLC_LC', 'LC-1', 'ACTIVE', 'EUR', '1000', '2026-01-01', 'maker', '2026-01-01');
}

function insertMovement(db: Db, movementId: string): void {
  db.prepare(
    `INSERT INTO balance_movements (
      movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount,
      ceiling_amount, currency, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(movementId, 'contract-1', 1, 'UTILIZE', 'CONTINGENT', '120', '120', 'EUR', 'PENDING', 'maker-1', '2026-09-22T00:00:00.000Z');
}

function service(db: Db, insert: (movementId: string) => void, resolvedPolicy: Readonly<ExcessPolicyConfig> = policy): MakerExcessSubmitService {
  let nextId = 0;
  const unitOfWork = new SqliteMakerExcessUnitOfWork(db, {
    readFactsVersion: () => 'facts-v1',
    insertMovement: (bundle) => insert(bundle.movementId),
    now: () => '2026-09-22T00:00:00.000Z',
    newId: () => `generated-${++nextId}`,
  });
  return new MakerExcessSubmitService({
    idempotency: { preflight: (scope) => new CommandIdempotencyStore(db).resolve(scope) },
    currentFacts: {
      load: (submitted) => ({
        ownerType: submitted.ownerType,
        ownerId: submitted.ownerId,
        factsVersion: 'facts-v1',
        approvedContractualMaximumOwner: '1000',
        splitInput: functionSplitInput(submitted),
      }),
    },
    policy: { resolve: () => resolvedPolicy },
    fx: { resolveConfiguredMaximum: async () => ({ ok: true, quote }) },
    legacy: { submit: () => ({ kind: 'LEGACY_SUBMIT' }) },
    unitOfWork,
  });
}

function functionSplitInput(submitted: MakerExcessSubmitCommand) {
  const common = {
    transactionCurrency: submitted.ownerCurrency,
    ownerCurrency: submitted.ownerCurrency,
    transactionAmountOwner: submitted.transactionAmountOwner,
  };
  switch (submitted.functionCode) {
    case 'A3':
      return { ...common, functionCode: 'A3' as const, importLcTightAvailableOwner: '100' };
    case 'A3S':
      return {
        ...common,
        functionCode: 'A3S' as const,
        baseParentTightAvailableOwner: '40',
        currentSgRedemptionAmountOwner: '60',
      };
    case 'B3':
      return { ...common, functionCode: 'B3' as const, confirmationTightAvailableOwner: '100' };
  }
}

describe('SqliteMakerExcessUnitOfWork', () => {
  test('commits movement, owner reservation, FX, decision, idempotency and account CAS atomically', async () => {
    const db = createDb(':memory:');
    try {
      seedContract(db);
      await expect(service(db, (movementId) => insertMovement(db, movementId)).submit(command)).resolves.toMatchObject({
        httpStatus: 201,
        body: { excessAmountOwner: '20', workflowStatus: 'PENDING', excessDecision: 'WITHIN_ALLOWANCE' },
      });

      expect(db.prepare('SELECT COUNT(*) AS count FROM balance_movements').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM fx_rate_snapshots').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM excess_decision_snapshots').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM command_idempotency').get()).toEqual({ count: 1 });
      const account = db.prepare('SELECT excess_account_id, owner_currency, version FROM excess_accounts').get() as {
        excess_account_id: string;
        owner_currency: string;
        version: number;
      };
      expect(account).toMatchObject({ owner_currency: 'EUR', version: 2 });
      expect(new ExcessLedgerStore(db).aggregateForAccount(account.excess_account_id, 2)).toEqual({
        pendingReservedOwner: '20',
        approvedUtilizedOwner: '0',
      });

      const candidate = service(db, (movementId) => insertMovement(db, movementId));
      await expect(candidate.submit(command)).resolves.toMatchObject({ httpStatus: 201, body: { movementId: 'movement-excess-1' } });
      await expect(candidate.submit({ ...command, requestHash: 'different-hash' })).resolves.toEqual({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM balance_movements').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM excess_ledger_events').get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  test('rolls back every active fact when movement persistence fails after its own insert', async () => {
    const db = createDb(':memory:');
    try {
      seedContract(db);
      const candidate = service(db, (movementId) => {
        insertMovement(db, movementId);
        throw new Error('injected movement failure');
      });

      await expect(candidate.submit(command)).rejects.toThrow('injected movement failure');
      for (const table of [
        'balance_movements',
        'excess_accounts',
        'excess_ledger_events',
        'fx_rate_snapshots',
        'excess_decision_snapshots',
        'command_idempotency',
      ]) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
    } finally {
      db.close();
    }
  });

  test('serializes two in-flight submissions from independent connections so only one last-slot command persists', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'balance-excess-race-'));
    const databasePath = join(directory, 'race.sqlite');
    const firstDb = createDb(databasePath);
    const secondDb = createDb(databasePath);
    try {
      seedContract(firstDb);
      const lastSlotPolicy = { ...policy, allowancePercentage: '3' };
      let arrivals = 0;
      let releaseFx!: () => void;
      const bothAtFx = new Promise<void>((resolve) => {
        releaseFx = resolve;
      });
      const gatedService = (db: Db, connection: string) => {
        let nextId = 0;
        return new MakerExcessSubmitService({
          idempotency: { preflight: (scope) => new CommandIdempotencyStore(db).resolve(scope) },
          currentFacts: {
            load: (submitted) => ({
              ownerType: submitted.ownerType,
              ownerId: submitted.ownerId,
              factsVersion: 'facts-v1',
              approvedContractualMaximumOwner: '1000',
              splitInput: functionSplitInput(submitted),
            }),
          },
          policy: { resolve: () => lastSlotPolicy },
          fx: {
            resolveConfiguredMaximum: async () => {
              arrivals += 1;
              if (arrivals === 2) releaseFx();
              await bothAtFx;
              return { ok: true, quote };
            },
          },
          legacy: { submit: () => ({ kind: 'LEGACY_SUBMIT' }) },
          unitOfWork: new SqliteMakerExcessUnitOfWork(db, {
            readFactsVersion: () => 'facts-v1',
            insertMovement: (bundle) => insertMovement(db, bundle.movementId),
            now: () => '2026-09-22T00:00:00.000Z',
            newId: () => `race-${connection}-${++nextId}`,
          }),
        });
      };
      const firstPromise = gatedService(firstDb, 'first').submit(command);
      const secondPromise = gatedService(secondDb, 'second').submit({
        ...command,
        movementId: 'movement-excess-2',
        idempotencyKey: 'key-2',
        requestHash: 'hash-2',
      });
      const results = await Promise.all([firstPromise, secondPromise]);

      expect(arrivals).toBe(2);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ httpStatus: 201, body: expect.objectContaining({ excessAmountOwner: '20' }) }),
          expect.objectContaining({
            ok: false,
            httpStatus: 409,
            code: 'EXCESS_LIMIT_EXCEEDED',
            guidance: expect.objectContaining({ outcome: 'FINITE', minimumRequiredIncreaseOwner: '9.71' }),
          }),
        ]),
      );
      expect(firstDb.prepare('SELECT COUNT(*) AS count FROM balance_movements').get()).toEqual({ count: 1 });
      expect(firstDb.prepare('SELECT COUNT(*) AS count FROM excess_accounts').get()).toEqual({ count: 1 });
      for (const table of ['excess_ledger_events', 'fx_rate_snapshots', 'excess_decision_snapshots', 'command_idempotency']) {
        expect(firstDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 1 });
      }
      expect(firstDb.prepare('SELECT COUNT(*) AS count FROM excess_command_attempt_audits').get()).toEqual({ count: 0 });
    } finally {
      secondDb.close();
      firstDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test.each(['A3', 'A3S', 'B3'] as const)('%s over-limit rejection rolls back every real SQLite fact', async (functionCode) => {
    const db = createDb(':memory:');
    try {
      seedContract(db);
      const ownerType = functionCode === 'B3' ? 'EXPORT_CONFIRMATION' : 'IMPORT_LC';
      const ownerId = functionCode === 'B3' ? 'confirmation-1' : 'logical-lc-1';
      const candidate = service(db, (movementId) => insertMovement(db, movementId), {
        ...policy,
        ownerType,
        allowancePercentage: '1',
      });
      await expect(candidate.submit({ ...command, functionCode, ownerType, ownerId, movementId: `movement-${functionCode}` })).resolves.toEqual(
        expect.objectContaining({
          ok: false,
          httpStatus: 409,
          code: 'EXCESS_LIMIT_EXCEEDED',
          guidance: expect.objectContaining({
            outcome: 'FINITE',
            minimumRequiredIncreaseOwner: '9.9',
            evidence: expect.objectContaining({ proposedExcessOwner: '20' }),
          }),
        }),
      );
      for (const table of [
        'balance_movements',
        'excess_accounts',
        'excess_ledger_events',
        'fx_rate_snapshots',
        'excess_decision_snapshots',
        'command_idempotency',
        'excess_command_attempt_audits',
        'sg_capacity_events',
      ]) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
    } finally {
      db.close();
    }
  });

  test('rejects stale facts and a provider snapshot without an attempt id before committing facts', async () => {
    const db = createDb(':memory:');
    try {
      seedContract(db);
      const staleUnitOfWork = new SqliteMakerExcessUnitOfWork(db, {
        readFactsVersion: () => 'facts-v2',
        insertMovement: (bundle) => insertMovement(db, bundle.movementId),
        now: () => '2026-09-22T00:00:00.000Z',
      });
      expect(() =>
        staleUnitOfWork.execute((transaction) => {
          transaction.assertCurrentFactsVersion(command, 'facts-v1');
        }),
      ).toThrow('Current Excess facts changed');
      expect(db.prepare('SELECT COUNT(*) AS count FROM balance_movements').get()).toEqual({ count: 0 });

      insertMovement(db, 'movement-fx-invalid');
      expect(() =>
        new FxRateSnapshotStore(db).insert({
          fxSnapshotId: 'fx-invalid',
          movementId: 'movement-fx-invalid',
          decisionPoint: 'MAKER_SUBMIT',
          quote: { ...quote, correlationId: 'movement-fx-invalid', requestAttemptId: undefined },
          createdAt: '2026-09-22T00:00:00.000Z',
        }),
      ).toThrow('requires requestAttemptId');
      new FxRateSnapshotStore(db).insert({
        fxSnapshotId: 'fx-usd-par',
        movementId: 'movement-fx-invalid',
        decisionPoint: 'MAKER_SUBMIT',
        quote: {
          ...quote,
          toCurrency: 'USD',
          bookingRate: '1',
          convertedAmount: '1000',
          rateOrigin: 'USD_PAR',
          rateSource: 'USD_PAR',
          providerRateId: 'USD_PAR',
          providerRateVersion: '1',
          correlationId: 'movement-fx-invalid',
          requestAttemptId: undefined,
        },
        createdAt: '2026-09-22T00:00:00.000Z',
      });
      expect(db.prepare("SELECT request_attempt_id FROM fx_rate_snapshots WHERE fx_snapshot_id = 'fx-usd-par'").get()).toEqual({
        request_attempt_id: 'USD_PAR',
      });
    } finally {
      db.close();
    }
  });

  test('creates then reuses a currency-bound owner account and rejects a different owner currency', () => {
    const db = createDb(':memory:');
    try {
      const unitOfWork = new SqliteMakerExcessUnitOfWork(db, {
        readFactsVersion: () => 'facts-v1',
        insertMovement: () => undefined,
        now: () => '2026-09-22T00:00:00.000Z',
      });
      const first = unitOfWork.execute((transaction) => transaction.lockAllowance('IMPORT_LC', 'owner-1', 'EUR', 2, 'policy-v1'));
      const second = unitOfWork.execute((transaction) => transaction.lockAllowance('IMPORT_LC', 'owner-1', 'EUR', 2, 'policy-v1'));
      expect(second.excessAccountId).toBe(first.excessAccountId);
      expect(() => unitOfWork.execute((transaction) => transaction.lockAllowance('IMPORT_LC', 'owner-1', 'JPY', 0, 'policy-v1'))).toThrow(
        'Allowance owner currency changed',
      );
      const scope = { commandType: 'MAKER_SUBMIT' as const, ownerId: 'owner-1', actorContext: 'maker-1', key: 'stored-key', requestHash: 'stored-hash' };
      new CommandIdempotencyStore(db).insert(
        scope,
        {
          httpStatus: 201,
          body: {
            movementId: 'stored-movement',
            workflowStatus: 'PENDING',
            coveredAmountOwner: '1',
            excessAmountOwner: '1',
            excessDecision: 'WITHIN_ALLOWANCE',
            businessResultCode: null,
            releaseEligibility: 'ELIGIBLE',
          },
        },
        '2026-09-22T00:00:00.000Z',
      );
      expect(unitOfWork.execute((transaction) => transaction.claimIdempotency(scope))).toMatchObject({ kind: 'REPLAY' });
      expect(unitOfWork.execute((transaction) => transaction.claimIdempotency({ ...scope, requestHash: 'different' }))).toEqual({ kind: 'CONFLICT' });
    } finally {
      db.close();
    }
  });
});
