import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const runner = readFileSync(
  new URL("../e2e-mt2-final-ui.mjs", import.meta.url),
  "utf8",
);

test("MT2 final UI runner uses the parameter-driven Payment index", () => {
  assert.match(runner, /Search Payment Message Index/);
  assert.match(runner, /Search payment message index/);
  assert.match(runner, /Open \$\{scenario\.messageType\} scenarios/);
  assert.doesNotMatch(runner, /Select scenario \$\{journey\.code\}/);
  assert.doesNotMatch(runner, /Select \$\{config\.representativeMessage\}/);
});

test("MT2 final UI runner uses the governed single-click interaction", () => {
  assert.doesNotMatch(runner, /\.dblclick\(\)/);
  assert.match(runner, /messageGroup\.click\(\)/);
  assert.match(runner, /Open \$\{scenario\.label\}/);
  assert.match(runner, /scenarioLink\.click\(\)/);
});

test("MT2 final UI runner exercises current generic controls and execution API", () => {
  assert.match(runner, /ssi-generic-parameter-form form/);
  assert.match(runner, /ssi-bank-service-lookup/);
  assert.match(
    runner,
    /getByRole\("button", \{\s*name: "Resolve SSI",\s*exact: true,?\s*\}\)/,
  );
  assert.match(runner, /resolution-page-definitions\/execute/);
  assert.match(runner, /lookups\/own-account-receivers/);
  assert.doesNotMatch(runner, /settlements\/resolve/);
  assert.doesNotMatch(runner, /Settlement response format/);
});
