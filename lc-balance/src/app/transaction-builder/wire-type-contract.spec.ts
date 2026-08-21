import * as fs from 'fs';
import * as path from 'path';

/**
 * desiger-comments.md F-06 — `BalanceContract`/`BalanceMovement` are hand-duplicated across the wire
 * boundary. Same "read both sibling projects' source files as plain text, never import/compile them"
 * convention `instrument-type-contract.spec.ts` (BAL-110) established.
 *
 * Deliberately a ONE-DIRECTION subset check (Angular's own declared fields ⊆ the microservice's), never
 * full equality — Angular's interfaces are an intentional subset of the microservice's own shape (fields
 * the UI never reads are deliberately never declared client-side), so equality would flag every one as a
 * false gap.
 *
 * Known limitation: this can only catch a field declared on the Angular side but missing server-side (a
 * rename/typo drift). It cannot catch a field that exists server-side, that the UI already reads via a
 * loose `any` cast, but was never added to the Angular interface at all — there's nothing on the Angular
 * side for a "declared fields" scan to find. Closing that gap needs a generated single-source-of-truth
 * type or a code-review practice, not a static contract test.
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
