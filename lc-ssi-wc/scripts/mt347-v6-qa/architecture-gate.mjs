import fs from "node:fs";
import path from "node:path";
import { listFiles, normalizePath } from "./file-utils.mjs";
import { result, Status } from "./result.mjs";

const DETECTORS = Object.freeze([
  {
    id: "CASE_SPECIFIC_MT_BRANCH",
    pattern: /(?:===|!==|case\s+)[ \t]*(?:["'`]MT\d{3}(?:COV)?["'`])/g,
  },
  {
    id: "HARDCODED_MT_DECISION_KEY",
    pattern: /(?:^[ \t]*|["'`])MT\d{3}(?:COV)?(?:\||["'`]?\s*:)/gm,
  },
  {
    id: "HARDCODED_SCENARIO",
    pattern:
      /["'`](?:BOOK_TRANSFER_SAME_RECEIVER|CREDIT_ONE_OF_SEVERAL_AT_57A|INITIAL_MT200_201_EQUIVALENCE|NO_MT200_201_EQUIVALENCE)["'`]/g,
  },
  {
    id: "CASE_SPECIFIC_TEMPLATE_BRANCH",
    pattern:
      /@if\s*\([^)]*(?:messageType|scenarioCode)[^)]*(?:===|!==)[^)]*["'`]MT\d{3}(?:COV)?["'`]/g,
  },
  {
    id: "HARDCODED_FIXTURE_BINDING",
    pattern: /["'`]FIX-MT\d{3}[^"'`]*["'`]/g,
  },
]);

const location = (text, index) => {
  const preceding = text.slice(0, index).split(/\r?\n/);
  return {
    line: preceding.length,
    column: preceding.at(-1).length + 1,
  };
};

export const scanUiArchitecture = ({ workspace, uiRoot }) => {
  const absoluteUiRoot = path.resolve(workspace, uiRoot);
  const violations = [];
  for (const file of listFiles(absoluteUiRoot, new Set([".ts", ".html"]))) {
    if (file.endsWith(".spec.ts")) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const detector of DETECTORS) {
      detector.pattern.lastIndex = 0;
      for (const match of text.matchAll(detector.pattern)) {
        const where = location(text, match.index);
        violations.push({
          rule: detector.id,
          file: normalizePath(path.relative(workspace, file)),
          line: where.line,
          column: where.column,
          excerpt: match[0].slice(0, 160),
        });
      }
    }
  }
  const byRule = Object.fromEntries(
    [...new Set(violations.map(({ rule }) => rule))]
      .sort()
      .map((rule) => [
        rule,
        violations.filter((violation) => violation.rule === rule).length,
      ]),
  );
  return result(
    "ADR001_NO_UI_BUSINESS_HARDCODE",
    violations.length === 0 ? Status.PASS : Status.FAIL,
    {
      uiRoot: normalizePath(path.relative(workspace, absoluteUiRoot)),
      violationCount: violations.length,
      byRule,
      violations,
    },
    violations.length === 0
      ? undefined
      : "Angular runtime contains message/scenario/fixture-specific business decisions prohibited by ADR-001",
  );
};
