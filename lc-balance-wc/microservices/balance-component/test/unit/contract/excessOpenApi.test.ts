import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const openApi = readFileSync(resolve(__dirname, '../../../../../analysis/balance-component-api.yaml'), 'utf8');

describe('OpenAPI V4 Excess contract', () => {
  test('publishes the authoritative typed Excess and FX boundary', () => {
    for (const requiredContract of [
      'IdempotencyKey:',
      'MakerExcessAccepted:',
      'CheckerExcessAccepted:',
      'MinimumRequiredIncrease:',
      'ExcessCommandError:',
      'FxRateEvidence:',
      'EXCESS_LIMIT_EXCEEDED',
      'FX_RATE_UNAVAILABLE',
      'FX_RATE_STALE',
      'IDEMPOTENCY_CONFLICT',
      'ILLEGAL_STATE_TRANSITION',
      'INSUFFICIENT_AVAILABLE_BALANCE',
    ]) {
      expect(openApi).toContain(requiredContract);
    }
    expect(openApi).toContain("$ref: '#/components/parameters/IdempotencyKey'");
  });

  test('documents whole Delete Pending and exposes no Return, partial cancellation or cure command', () => {
    expect(openApi).toContain('Delete Pending withdraws the complete transaction');
    expect(openApi).toContain('additionalProperties: false');
    expect(openApi).not.toMatch(/^\s{2}\/(?:return-documents|excess-cure|formal-increase-allocation)[^:]*:/m);

    const cancelRequest = openApi.slice(openApi.indexOf('BalanceMovementCancelRequest:'), openApi.indexOf('DeletePendingAuditRecord:'));
    expect(cancelRequest).not.toMatch(/^\s{8}amount:/m);
  });

  test('states zero-write Maker failure and retained pending Checker failure contracts', () => {
    expect(openApi).toContain('zero-write: no movement, reservation, FX snapshot, decision snapshot or idempotent success');
    expect(openApi).toContain('Checker failure retains the pending movement, Pending Excess Reservation and committed linked facts');
    expect(openApi).toContain('Production never derives BOOKING from BUY or SELL');
  });

  test('publishes B4 locked-Covered creation and all-or-nothing Export authorization assets', () => {
    for (const contract of [
      'ExportAuthorizationClaim:',
      'ExportAuthorizationSnapshot:',
      'ExportAssetPosting:',
      'B4ExportAssetRelease:',
      'EXPORT_EXCESS_ASSET',
      'BENEFICIARY_OR_RECOURSE_PARTY',
      'B3-locked Legal amount',
      'B3-locked Covered amount',
    ]) {
      expect(openApi).toContain(contract);
    }
    expect(openApi).toContain("exportAuthorization:\n                  $ref: '#/components/schemas/ExportAuthorizationClaim'");
  });
});
