import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const runner = readFileSync(
  new URL("./run-generic-ssi-browser-matrix.mjs", import.meta.url),
  "utf8",
);

test("the shared MT347 browser runner follows the generic domain index contract", () => {
  assert.doesNotMatch(runner, /Search Payment Message Index/);
  assert.doesNotMatch(runner, /Search payment message index/);
  assert.match(runner, /Search \$\{domainLabel\} Message Index/);
  assert.match(
    runner,
    /Search \$\{domainLabel\.toLowerCase\(\)\} message index/,
  );
});

test("the shared MT347 browser runner opens a scenario with the governed single-click interaction", () => {
  assert.doesNotMatch(
    runner,
    /getByRole\("link", \{\s*name: `Open \$\{scenario\.messageType\} scenarios`/,
  );
  assert.match(
    runner,
    /getByLabel\(`Open \$\{scenario\.messageType\} scenarios`\)/,
  );
  assert.doesNotMatch(runner, /scenarioLink\.dblclick\(\)/);
  assert.match(runner, /scenarioLink\.click\(\)/);
});

test("the shared MT347 browser runner resolves through one bounded click/response operation", () => {
  assert.doesNotMatch(
    runner,
    /locator\("\.workbench-actions button"\)\.click\(\)/,
  );
  assert.match(
    runner,
    /getByRole\("button", \{ name: "Resolve SSI", exact: true \}\)/,
  );
  assert.match(runner, /Promise\.all\(\[\s*page\.waitForResponse/);
});

test("the shared MT347 browser runner selects the governed scenario audience before searching", () => {
  assert.match(runner, /audience: scenario\.audience/);
  assert.match(
    runner,
    /scenario\.audience === "QA_TEST_ONLY"\s*\? "QA \/ test only"\s*:\s*"Operational"/,
  );
});

test("the shared MT347 browser runner completes required downstream lookups before changing counterparty", () => {
  assert.match(
    runner,
    /await completeRequiredBankServiceLookups\(page, scenario\);\s+\n\s+await lookupComponent\s+\.getByRole\("button", \{ name: "Change", exact: true \}\)/,
  );
  assert.match(runner, /const picker = lookup\.getByRole\("dialog"\)/);
  assert.match(runner, /picker\.isVisible\(\)\.catch\(\(\) => false\)/);
});

test("the shared MT347 browser runner includes authoritative presentTags in the positive oracle", () => {
  assert.match(runner, /baseOracle\.expectedPresentTags \?\? \[\]/);
});
