import * as fs from 'fs';
import * as path from 'path';

/**
 * BAL-110 — `InstrumentType` and the legal movementType-per-instrument rules are declared once in this
 * Angular app (`balance-component.model.ts`) and once again, independently, in the microservice
 * (`types.ts` for `InstrumentType`; `MOVEMENT_DIRECTION`'s own keys for the flattened set of legal
 * movementTypes). Nothing previously detected drift if one side added/renamed a value without the other
 * following.
 *
 * Reads both sibling projects' source files as plain text (never imports/compiles them) specifically so
 * it can never cross the two projects' separate tsconfigs/Jest configs. Intentionally simple text
 * matching, not a TypeScript parse — if either file's declaration shape changes enough to break the
 * regex, that failure itself is a signal this test needs to be revisited.
 */
function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

/** Extracts the quoted string literals out of a `export type X = | 'A' | 'B' ...;` union declaration. */
function extractUnionLiterals(source: string, typeName: string): string[] {
  const match = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!match) throw new Error(`Could not find "export type ${typeName} = ..." in source — has the declaration shape changed?`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Extracts every quoted string literal appearing anywhere inside a named `export const X = { ... };` block. */
function extractQuotedLiteralsInConst(source: string, constName: string): string[] {
  const match = source.match(new RegExp(`export const ${constName}[\\s\\S]*?=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!match) throw new Error(`Could not find "export const ${constName} = { ... }" in source — has the declaration shape changed?`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Extracts the bare identifier keys of a `export const X: Readonly<Record<string, ...>> = { KEY: value, ... };` block. */
function extractBareKeysInConst(source: string, constName: string): string[] {
  const match = source.match(new RegExp(`export const ${constName}[\\s\\S]*?=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!match) throw new Error(`Could not find "export const ${constName} = { ... }" in source — has the declaration shape changed?`);
  return [...match[1].matchAll(/^\s*([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]);
}

describe('BAL-110 contract: Angular model vs. microservice domain enums stay in sync', () => {
  const angularModel = readSource('./balance-component.model.ts');
  const microserviceTypes = readSource('../../../microservices/balance-component/src/types.ts');
  const microserviceDerivation = readSource('../../../microservices/balance-component/src/domain/balanceDerivation.ts');

  it('InstrumentType has the exact same set of values on both sides', () => {
    const clientValues = extractUnionLiterals(angularModel, 'InstrumentType').sort();
    const serverValues = extractUnionLiterals(microserviceTypes, 'InstrumentType').sort();
    expect(clientValues).toEqual(serverValues);
  });

  it('every movementType the client offers per InstrumentType has a matching MOVEMENT_DIRECTION entry server-side, and vice versa', () => {
    const clientMovementTypes = [...new Set(extractQuotedLiteralsInConst(angularModel, 'MOVEMENT_TYPES_BY_INSTRUMENT'))].sort();
    const serverMovementTypes = extractBareKeysInConst(microserviceDerivation, 'MOVEMENT_DIRECTION').sort();
    expect(clientMovementTypes).toEqual(serverMovementTypes);
  });
});
