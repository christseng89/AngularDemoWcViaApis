import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config-loader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../..");
const config = loadConfig(
  process.env.MT2_QA_CONFIG ??
    path.resolve(workspace, "qa/mt2/mt2-final/mt2-final-qa.config.json"),
);
const projects = config.coverageProjects.map((project) => {
  const file = path.resolve(
    workspace,
    "coverage",
    project,
    "coverage-summary.json",
  );
  if (!fs.existsSync(file))
    throw new Error(`FAIL_CLOSED: coverage evidence missing for ${project}`);
  const summary = JSON.parse(fs.readFileSync(file, "utf8")).total;
  return { project, file, lines: summary.lines };
});
const totals = projects.reduce(
  (value, project) => ({
    total: value.total + project.lines.total,
    covered: value.covered + project.lines.covered,
  }),
  { total: 0, covered: 0 },
);
const missingProjects = projects
  .filter(({ lines }) => lines.total === 0)
  .map(({ project }) => project);
const weightedPct =
  totals.total === 0 ? 0 : (totals.covered / totals.total) * 100;
const pct = missingProjects.length ? 0 : weightedPct;
const output = path.resolve(workspace, config.metrics.coverageFile);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      complete: missingProjects.length === 0,
      missingProjects,
      total: { lines: { ...totals, weightedPct, pct } },
      projects,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    projects: projects.length,
    complete: missingProjects.length === 0,
    missingProjects,
    lines: { ...totals, weightedPct, pct },
  }),
);
