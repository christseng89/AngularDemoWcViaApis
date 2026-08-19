import * as fs from 'fs';
import * as path from 'path';

/**
 * desiger-comments.md F-06 ("`BalanceContract`/`BalanceMovement` are hand-duplicated across the wire
 * boundary" — both sides' own comments admit these are "kept in sync by hand"; already caused one real,
 * confirmed gap, `balanceBefore`/`balanceAfter` silently missing from the Angular interface until a
 * stricter typing pass caught it). Same "read both sibling projects' source files as plain text, never
 * import/compile them" convention `instrument-type-contract.spec.ts` (BAL-110) already established for
 * this exact "two independently-maintained sources of truth" problem shape — see that file's own doc
 * comment for the full "never cross the two projects' separate tsconfigs/Jest configs" reasoning.
 *
 * **Deliberately a ONE-DIRECTION subset check (Angular's own declared fields ⊆ the microservice's own
 * declared fields), never a full set-equality check.** Angular's own `BalanceContract`/`BalanceMovement`
 * interfaces are — by their own doc comments — an intentional SUBSET of the microservice's own shape:
 * fields like `legRef`/`accountEntries`/`lmtsReservationId`/`transactionDate`/`sourceModule` (on
 * `BalanceMovement`) or `contractVersion`/`openingBalance`/`effectiveFrom` (on `BalanceContract`) exist
 * server-side but are deliberately never declared on the Angular side, since the UI never reads them — a
 * full equality check would be actively wrong here, flagging every one of those as a "gap" when none is.
 *
 * **Known, disclosed limitation, not silently glossed over**: this test can only catch a field NAME
 * that's declared on the Angular side but doesn't exist server-side (a rename/typo drift). It structurally
 * CANNOT catch the actual historical bug this finding cites (`balanceBefore`/`balanceAfter`) — a field
 * that exists server-side, that the UI's own code already reads (typically through a loose `any` cast),
 * but that was never added to the Angular interface's own declared field list at all — since there is
 * nothing on the Angular side for a "declared fields" scan to find in that case. Closing that class of gap
 * for real would need either a fully generated, single-source-of-truth type (rejected as disproportionate
 * for this fix — this project's own root CLAUDE.md already documents `analysis/balance-component-api.yaml`
 * itself lagging the real implementation, so generating FROM it would encode staleness as a compile-time
 * guarantee rather than removing the risk) or a runtime/code-review practice, not a static contract test.
 * This test still earns its keep for the narrower, cheaper risk it DOES cover: a field renamed on one side
 * without the other following.
 */
function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

/**
 * Extracts the top-level field names (ignoring doc comments) from an `export interface X { ... }` block.
 * Intentionally simple text matching, not a TypeScript parse — assumes no field's own type is an inline
 * `{ ... }` object-literal (true for `BalanceContract`/`BalanceMovement` on both sides as of this writing;
 * if that ever changes, this regex will under- or over-match, which is itself a signal this test needs
 * revisiting, not something it should silently paper over).
 */
function extractInterfaceFieldNames(source: string, interfaceName: string): string[] {
  const match = source.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Could not find "export interface ${interfaceName} { ... }" in source — has the declaration shape changed?`);
  return [...match[1].matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\??:\s*\S/gm)].map((m) => m[1]);
}

describe('desiger-comments.md F-06 contract: Angular BalanceContract/BalanceMovement fields ⊆ microservice fields', () => {
  const angularApi = readSource('./balance-component-api.service.ts');
  const microserviceTypes = readSource('../../../microservices/balance-component/src/types.ts');

  it('every BalanceContract field the Angular client declares also exists on the microservice side', () => {
    const clientFields = extractInterfaceFieldNames(angularApi, 'BalanceContract');
    expect(clientFields.length).toBeGreaterThan(0); // guards against the regex silently matching nothing
    const serverFields = new Set(extractInterfaceFieldNames(microserviceTypes, 'BalanceContract'));
    const missing = clientFields.filter((f) => !serverFields.has(f));
    expect(missing).toEqual([]);
  });

  it('every BalanceMovement field the Angular client declares also exists on the microservice side', () => {
    const clientFields = extractInterfaceFieldNames(angularApi, 'BalanceMovement');
    expect(clientFields.length).toBeGreaterThan(0);
    const serverFields = new Set(extractInterfaceFieldNames(microserviceTypes, 'BalanceMovement'));
    const missing = clientFields.filter((f) => !serverFields.has(f));
    expect(missing).toEqual([]);
  });
});
