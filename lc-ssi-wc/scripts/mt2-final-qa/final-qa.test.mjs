import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./config-loader.mjs";
import { MetricGate } from "./metric-gate.mjs";
import { ProcessGate } from "./process-gate.mjs";
import { QaOrchestrator } from "./orchestrator.mjs";
import { QualityGate, failed, passed } from "./quality-gate.mjs";
import {
  validateExpectedOutput,
  validateResolutionIdentity,
} from "./expected-output-validator.mjs";
import {
  analysisMatchesCommit,
  analysisMatchesIdentity,
  buildSourceManifest,
  buildTypeScriptAnalysisManifest,
  createCommitIdentity,
  createWorktreeIdentity,
  parseTaskFile,
} from "./sonar-analysis-identity.mjs";
import {
  assertAnalyzerCoverage,
  authorizationHeaders,
  buildScannerArguments,
  createScannerEnvironment,
  discoverTypeScriptConfigs,
  ensureAggregateLcov,
  fetchBoundAnalysis,
  fetchDuplicationDensity,
  assertTypeScriptProgramCoverage,
  parseScannerTask,
  redactToken,
  resolveTrustedExecutable,
  resolveScannerTask,
  run as runSonarAnalysis,
  waitForCeAnalysis,
} from "./sonar-current-analysis.mjs";

test("Sonar scanner resolves process executables from fixed absolute paths", () => {
  const windowsGit = resolveTrustedExecutable("git", {
    platform: "win32",
    exists: (candidate) => candidate === "C:\\Program Files\\Git\\cmd\\git.exe",
  });
  const linuxDocker = resolveTrustedExecutable("docker", {
    platform: "linux",
    exists: (candidate) => candidate === "/usr/bin/docker",
  });

  assert.equal(windowsGit, "C:\\Program Files\\Git\\cmd\\git.exe");
  assert.equal(linuxDocker, "/usr/bin/docker");
  assert.throws(
    () =>
      resolveTrustedExecutable("docker", {
        platform: "win32",
        exists: () => false,
      }),
    /trusted absolute path/,
  );
});

class StubGate extends QualityGate {
  constructor(id, result) {
    super(id);
    this.result = result;
  }
  async execute() {
    return this.result;
  }
}

test("orchestrator is fail-closed and stops after a required failure", async () => {
  const gates = [
    new StubGate("A", passed("A")),
    new StubGate("B", failed("B", "boom")),
    new StubGate("C", passed("C")),
  ];
  const report = await new QaOrchestrator(gates).run();
  assert.equal(report.status, "BLOCKED");
  assert.deepEqual(
    report.results.map(({ gate }) => gate),
    ["A", "B"],
  );
});

test("orchestrator accepts only when every gate passes", async () => {
  const report = await new QaOrchestrator([
    new StubGate("A", passed("A")),
    new StubGate("B", passed("B")),
  ]).run();
  assert.equal(report.status, "ACCEPTED");
});

test("audit mode runs every gate while remaining fail-closed", async () => {
  const report = await new QaOrchestrator(
    [
      new StubGate("A", failed("A", "first failure")),
      new StubGate("B", passed("B")),
      new StubGate("C", failed("C", "last failure")),
    ],
    { failFast: false },
  ).run();
  assert.equal(report.status, "BLOCKED");
  assert.deepEqual(
    report.results.map(({ gate }) => gate),
    ["A", "B", "C"],
  );
});

test("metric boundaries are strictly greater than 95 and less than 1", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-metric-"));
  const file = path.join(directory, "metrics.json");
  fs.writeFileSync(file, JSON.stringify({ coverage: 95, duplication: 1 }));
  assert.equal(
    (await new MetricGate("C", file, "coverage", 95, "gt").execute()).status,
    "FAIL",
  );
  assert.equal(
    (await new MetricGate("D", file, "duplication", 1, "lt").execute()).status,
    "FAIL",
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ coverage: 95.01, duplication: 0.99 }),
  );
  assert.equal(
    (await new MetricGate("C", file, "coverage", 95, "gt").execute()).status,
    "PASS",
  );
  assert.equal(
    (await new MetricGate("D", file, "duplication", 1, "lt").execute()).status,
    "PASS",
  );
});

test("production config loads only the current Proposal case catalogue", () => {
  const config = loadConfig("qa/tests/mt2/final/mt2-final-qa.config.json");
  assert.equal(config.expectedCaseCount, 57);
  assert.deepEqual(config.reviewContract.reviewers, ["BA", "QA", "DBA"]);
  assert.equal(
    config.reviewContract.policy,
    "SINGLE_GENERATED_NEW_RULE_CASE_SET",
  );
  assert.equal(config.reviewContract.allowReviewerPrivateCases, false);
  assert.equal(config.reviewContract.allowArchivedCases, false);
  assert.match(
    config.proposalCaseFile,
    /data[\\/]qa[\\/]mt2[\\/]mt2-pacs009-proposal-case-groups\.json$/,
  );
  assert.equal(config.baselineArtifacts.length, 6);
  assert.ok(
    config.baselineArtifacts.some(
      ({ role }) => role === "CANONICAL_POSITIVE_SEED",
    ),
  );
  assert.equal(
    JSON.stringify(config).includes("MT2XX_測試案例_SSI與NOSTRO"),
    false,
  );
});

test("quality gate cannot be instantiated directly", () => {
  assert.throws(() => new QualityGate("ABSTRACT"), /abstract/);
});

test("expected-output validation checks nested MT and MX content", () => {
  assert.deepEqual(
    validateExpectedOutput(
      { tags: { "58A": "BARCGB22" } },
      { tags: { "58A": "BARCGB22" }, evidence: "ok" },
    ),
    [],
  );
  assert.match(
    validateExpectedOutput(
      { tags: { "58A": "BARCGB22" } },
      { tags: { "58A": "CITIUS33" } },
    )[0],
    /BARCGB22/,
  );
});

test("expected-output validation rejects array and object shape differences", () => {
  assert.match(validateExpectedOutput(["A"], "A")[0], /array/);
  assert.match(validateExpectedOutput(["A"], ["A", "B"])[0], /length/);
  assert.match(validateExpectedOutput({ code: "X" }, null)[0], /object/);
});

test("resolution identity validation fails closed on selected SSI or pinned route drift", () => {
  const expected = {
    canonicalRoles: { selectedSsi: "SSI-UAT-GEN-10" },
    chosenRoute: {
      ssiCode: "SSI-UAT-GEN-10",
      ssiVersion: 1,
      nostroId: "NOSTRO-1",
      nostroVersion: 4,
    },
  };
  const actual = {
    chosenRoute: {
      ssiCode: "SSI-DEMO-021",
      ssiVersion: 1,
      nostroId: "NOSTRO-1",
      nostroVersion: 4,
    },
  };
  assert.match(validateResolutionIdentity(expected, actual)[0], /ssiCode/);
  actual.chosenRoute.ssiCode = "SSI-UAT-GEN-10";
  assert.deepEqual(validateResolutionIdentity(expected, actual), []);
  actual.chosenRoute.nostroVersion = 5;
  assert.match(
    validateResolutionIdentity(expected, actual).at(-1),
    /nostroVersion/,
  );
});

test("missing metric evidence fails closed", async () => {
  const result = await new MetricGate(
    "M",
    "missing-metric.json",
    "x",
    1,
    "lt",
  ).execute();
  assert.equal(result.status, "FAIL");
});

test("abstract execute method throws when a subclass does not implement it", async () => {
  class IncompleteGate extends QualityGate {}
  await assert.rejects(
    () => new IncompleteGate("X").execute(),
    /must be implemented/,
  );
});

test("process gate executes Node with an argument array and no shell parsing", async () => {
  const result = await new ProcessGate(
    {
      id: "NODE_ARGV",
      command: [
        "node",
        "-e",
        "process.stdout.write(process.argv[1])",
        "literal && never interpreted by a shell",
      ],
    },
    { workspace: process.cwd() },
  ).execute();
  assert.equal(result.status, "PASS");
  assert.equal(
    result.evidence.stdout,
    "literal && never interpreted by a shell",
  );
});

test("process gate fails closed for legacy shell strings or other executables", async () => {
  for (const command of [
    "node -e process.exit(0)",
    ["powershell", "-Command", "exit 0"],
  ]) {
    const result = await new ProcessGate(
      { id: "REJECTED_COMMAND", command },
      { workspace: process.cwd() },
    ).execute();
    assert.equal(result.status, "FAIL");
  }
});

test("Sonar task identity and current revision are explicit", () => {
  assert.deepEqual(
    parseTaskFile("ceTaskId=abc\nceTaskUrl=http://sonar/task?id=abc\n"),
    {
      ceTaskId: "abc",
      ceTaskUrl: "http://sonar/task?id=abc",
    },
  );
  assert.equal(
    analysisMatchesCommit({ revision: "commit-a" }, "commit-a"),
    true,
  );
  assert.equal(analysisMatchesCommit({ revision: "old" }, "commit-a"), false);
});

test("Sonar task identity falls back to captured scanner output", () => {
  assert.deepEqual(
    parseScannerTask(
      [
        "INFO  ANALYSIS SUCCESSFUL, you can find the results at:",
        "INFO  http://host.docker.internal:9000/dashboard?id=ssi-wc-prototype",
        "INFO  More about the report processing at http://host.docker.internal:9000/api/ce/task?id=AaCLOc0gGOzCrG-ux9cZ",
      ].join("\n"),
    ),
    {
      ceTaskId: "AaCLOc0gGOzCrG-ux9cZ",
      ceTaskUrl:
        "http://host.docker.internal:9000/api/ce/task?id=AaCLOc0gGOzCrG-ux9cZ",
      dashboardUrl:
        "http://host.docker.internal:9000/dashboard?id=ssi-wc-prototype",
    },
  );
  assert.deepEqual(parseScannerTask("ceTaskId=abc-123"), {
    ceTaskId: "abc-123",
  });
});

test("Sonar resume mode retrieves a task only when its analysis matches current content", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-sonar-resume-"));
  fs.mkdirSync(path.join(directory, "apps", "portal"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "apps", "portal", "main.ts"),
    "export const x = 1;\n",
  );
  fs.writeFileSync(
    path.join(directory, "apps", "portal", "tsconfig.app.json"),
    "{}",
  );
  fs.writeFileSync(
    path.join(directory, "sonar-project.properties"),
    "sonar.sources=apps\nsonar.exclusions=**/*.spec.ts\n",
  );
  const manifest = buildSourceManifest(directory);
  const version = `worktree-${manifest.digest}`;
  const responses = [
    {
      task: { status: "SUCCESS", analysisId: "analysis-1", executedAt: "now" },
    },
    { analyses: [{ key: "analysis-1", projectVersion: version, date: "now" }] },
    {
      component: {
        measures: [{ metric: "duplicated_lines_density", value: "0.5" }],
      },
    },
  ];
  const previous = {
    host: process.env.SONAR_HOST_URL,
    project: process.env.SONAR_PROJECT_KEY,
    token: process.env.SONAR_TOKEN,
  };
  process.env.SONAR_HOST_URL = "http://sonar.invalid";
  process.env.SONAR_PROJECT_KEY = "resume-project";
  process.env.SONAR_TOKEN = "resume-secret";
  try {
    const result = await runSonarAnalysis({
      workspace: directory,
      resumeTaskId: "task-1",
      fetchImpl: async () => ({
        ok: true,
        json: async () => responses.shift(),
      }),
    });
    assert.equal(result.analysisMode, "resume");
    assert.equal(result.projectVersion, version);
    assert.equal(result.duplicatedLinesDensity, 0.5);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      const environmentName =
        name === "host"
          ? "SONAR_HOST_URL"
          : name === "project"
            ? "SONAR_PROJECT_KEY"
            : "SONAR_TOKEN";
      if (value === undefined) delete process.env[environmentName];
      else process.env[environmentName] = value;
    }
  }
});

test("Sonar worktree identity hashes exactly configured non-test sources", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-sonar-source-"));
  fs.mkdirSync(path.join(directory, "apps"), { recursive: true });
  fs.mkdirSync(path.join(directory, "libs"), { recursive: true });
  fs.mkdirSync(path.join(directory, "scripts", "mt2-final-qa"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(directory, "apps", "main.ts"),
    "export const app = 1;\n",
  );
  fs.writeFileSync(path.join(directory, "apps", "main.spec.ts"), "ignored\n");
  fs.writeFileSync(
    path.join(directory, "libs", "domain.ts"),
    "export const domain = 1;\n",
  );
  fs.writeFileSync(
    path.join(directory, "scripts", "mt2-final-qa", "runner.mjs"),
    "export const run = true;\n",
  );
  fs.writeFileSync(
    path.join(directory, "scripts", "mt2-final-qa", "runner.test.mjs"),
    "ignored\n",
  );
  fs.writeFileSync(
    path.join(directory, "sonar-project.properties"),
    [
      "sonar.sources=apps,libs,scripts/mt2-final-qa",
      "sonar.exclusions=**/*.spec.ts,**/*.test.ts,**/*.test.mjs",
    ].join("\n"),
  );

  const first = buildSourceManifest(directory);
  assert.deepEqual(
    first.files.map(({ path: relativePath }) => relativePath),
    ["apps/main.ts", "libs/domain.ts", "scripts/mt2-final-qa/runner.mjs"],
  );
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.equal(
    first.files.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)),
    true,
  );

  const identity = createWorktreeIdentity(first);
  assert.equal(identity.kind, "worktree");
  assert.equal(identity.projectVersion, `worktree-${first.digest}`);
  assert.equal(
    analysisMatchesIdentity(
      { projectVersion: identity.projectVersion },
      identity,
    ),
    true,
  );
  assert.equal(
    analysisMatchesIdentity({ projectVersion: "worktree-stale" }, identity),
    false,
  );

  fs.writeFileSync(
    path.join(directory, "apps", "main.spec.ts"),
    "changed test\n",
  );
  assert.equal(buildSourceManifest(directory).digest, first.digest);
  fs.writeFileSync(
    path.join(directory, "apps", "main.ts"),
    "export const app = 2;\n",
  );
  assert.notEqual(buildSourceManifest(directory).digest, first.digest);
});

test("Sonar scanner keeps credentials out of argv and removes its env file", () => {
  const secret = "rotated-secret-value";
  const scannerEnvironment = createScannerEnvironment({
    host: "http://host.docker.internal:9000",
    token: secret,
    typeScriptFiles: ["apps/portal/src/main.ts", "libs/domain/src/index.ts"],
  });
  try {
    const argumentsList = buildScannerArguments({
      workspace: process.cwd(),
      project: "ssi-wc-prototype",
      identity: { kind: "worktree", projectVersion: "worktree-digest" },
      envFile: scannerEnvironment.file,
      typeScriptConfigFile: scannerEnvironment.typeScriptConfigFile,
      scannerImage: "lc-ssi-sonar-scanner:arm64",
    });
    assert.equal(argumentsList.join(" ").includes(secret), false);
    assert.equal(argumentsList.includes("--env-file"), true);
    assert.equal(argumentsList.includes("lc-ssi-sonar-scanner:arm64"), true);
    assert.equal(argumentsList.includes(`${process.cwd()}:/usr/src:ro`), true);
    assert.equal(
      argumentsList.includes(
        "-Dsonar.working.directory=/tmp/ssi-wc-scannerwork",
      ),
      true,
    );
    assert.match(
      argumentsList.find((argument) =>
        argument.startsWith("-Dsonar.typescript.tsconfigPaths="),
      ),
      /^-Dsonar\.typescript\.tsconfigPaths=\/usr\/src\/tmp\/sonar\/scanner-env-[^/]+\/tsconfig\.sonar\.json$/,
    );
    assert.equal(
      argumentsList.includes("-Dsonar.qualitygate.wait=false"),
      true,
    );
    assert.equal(
      argumentsList.includes("-Dsonar.javascript.node.maxspace=4096"),
      true,
    );
    assert.match(
      fs.readFileSync(scannerEnvironment.file, "utf8"),
      /SONAR_TOKEN=/,
    );
    const analyzerConfig = JSON.parse(
      fs.readFileSync(scannerEnvironment.typeScriptConfigFile, "utf8"),
    );
    assert.equal(analyzerConfig.compilerOptions.moduleResolution, "node");
    assert.deepEqual(analyzerConfig.files, [
      "/usr/src/apps/portal/src/main.ts",
      "/usr/src/libs/domain/src/index.ts",
    ]);
    assert.deepEqual(
      assertTypeScriptProgramCoverage({
        configFile: scannerEnvironment.typeScriptConfigFile,
        expectedFiles: ["apps/portal/src/main.ts", "libs/domain/src/index.ts"],
      }),
      { expected: 2, parsed: 2 },
    );
    assert.throws(
      () =>
        assertTypeScriptProgramCoverage({
          configFile: scannerEnvironment.typeScriptConfigFile,
          expectedFiles: ["apps/portal/src/main.ts"],
        }),
      /set mismatch.*unexpected.*libs\/domain\/src\/index\.ts/i,
    );
    assert.equal(
      redactToken(`scanner rejected ${secret}`, secret),
      "scanner rejected [REDACTED]",
    );
  } finally {
    scannerEnvironment.dispose();
  }
  assert.equal(fs.existsSync(scannerEnvironment.file), false);
  assert.equal(fs.existsSync(scannerEnvironment.typeScriptConfigFile), false);
});

test("Sonar discovers explicit application and library TypeScript configs", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "mt2-sonar-tsconfig-"),
  );
  fs.mkdirSync(path.join(directory, "apps", "portal"), { recursive: true });
  fs.mkdirSync(path.join(directory, "libs", "domain"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "apps", "portal", "tsconfig.app.json"),
    "{}",
  );
  fs.writeFileSync(
    path.join(directory, "apps", "portal", "tsconfig.spec.json"),
    "{}",
  );
  fs.writeFileSync(
    path.join(directory, "libs", "domain", "tsconfig.lib.json"),
    "{}",
  );
  assert.deepEqual(discoverTypeScriptConfigs(directory), [
    "apps/portal/tsconfig.app.json",
    "libs/domain/tsconfig.lib.json",
  ]);
});

test("Sonar TypeScript analysis manifest includes indexed tests and sources", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-sonar-index-"));
  fs.mkdirSync(path.join(directory, "apps", "portal"), { recursive: true });
  fs.writeFileSync(path.join(directory, "apps", "portal", "main.ts"), "");
  fs.writeFileSync(path.join(directory, "apps", "portal", "main.spec.ts"), "");
  fs.writeFileSync(path.join(directory, "apps", "portal", "ignored.txt"), "");
  fs.writeFileSync(
    path.join(directory, "sonar-project.properties"),
    [
      "sonar.sources=apps",
      "sonar.tests=apps",
      "sonar.test.inclusions=**/*.spec.ts,**/*.test.ts",
      "sonar.exclusions=**/*.spec.ts,**/*.test.ts",
    ].join("\n"),
  );
  assert.deepEqual(
    buildTypeScriptAnalysisManifest(directory).files.map(
      ({ path: relativePath }) => relativePath,
    ),
    ["apps/portal/main.spec.ts", "apps/portal/main.ts"],
  );
});

test("Sonar fails closed when TypeScript files are skipped or programs fail", () => {
  assert.doesNotThrow(() =>
    assertAnalyzerCoverage(
      "INFO 124 source files to be analyzed\nINFO ANALYSIS SUCCESSFUL",
    ),
  );
  assert.throws(
    () =>
      assertAnalyzerCoverage(
        "WARN Skipped 124 file(s) because they were not part of any tsconfig",
      ),
    /not part of any tsconfig/,
  );
  assert.throws(
    () => assertAnalyzerCoverage("ERROR Failed to create TypeScript program"),
    /TypeScript program/,
  );
  assert.throws(
    () => assertAnalyzerCoverage("ERROR Failed to create program"),
    /create program/,
  );
  assert.throws(
    () =>
      assertAnalyzerCoverage(
        "ERROR Failure during analysis\nLine 470 is out of range for file service.ts",
      ),
    /Failure during analysis/,
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-sonar-config-"));
  assert.throws(
    () =>
      assertTypeScriptProgramCoverage({
        configFile: path.join(directory, "missing.json"),
        expectedFiles: [],
      }),
    /could not be read/,
  );
  const invalid = path.join(directory, "invalid.json");
  fs.writeFileSync(
    invalid,
    JSON.stringify({ compilerOptions: { module: "invalid" } }),
  );
  assert.throws(
    () =>
      assertTypeScriptProgramCoverage({
        configFile: invalid,
        expectedFiles: [],
      }),
    /could not be parsed/,
  );
});

test("Sonar creates aggregate LCOV when the root report is missing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-sonar-lcov-"));
  const first = path.join(directory, "coverage", "apps", "portal");
  const second = path.join(directory, "coverage", "libs", "domain");
  fs.mkdirSync(first, { recursive: true });
  fs.mkdirSync(second, { recursive: true });
  fs.writeFileSync(
    path.join(first, "lcov.info"),
    "TN:portal\nSF:portal.ts\nend_of_record\n",
  );
  fs.writeFileSync(
    path.join(second, "lcov.info"),
    "TN:domain\nSF:..\\..\\stale-prefix\\libs\\domain\\src\\domain.ts\nend_of_record\n",
  );
  fs.mkdirSync(path.join(directory, "libs", "domain", "src"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(directory, "libs", "domain", "src", "domain.ts"),
    "",
  );
  const result = ensureAggregateLcov(directory);
  assert.equal(result.sources.length, 2);
  assert.match(fs.readFileSync(result.path, "utf8"), /SF:portal\.ts/);
  assert.match(
    fs.readFileSync(result.path, "utf8"),
    /SF:libs\/domain\/src\/domain\.ts/,
  );
});

test("Sonar helper contracts fail closed on invalid remote evidence", async () => {
  assert.deepEqual(authorizationHeaders(), {});
  assert.match(authorizationHeaders("secret").authorization, /^Basic /);

  await assert.rejects(
    waitForCeAnalysis({
      fetchImpl: async () => ({ ok: false, status: 401 }),
      host: "http://sonar.invalid",
      taskId: "task-1",
      headers: {},
    }),
    /CE API failed: 401/,
  );
  await assert.rejects(
    waitForCeAnalysis({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ task: { status: "FAILED" } }),
      }),
      host: "http://sonar.invalid",
      taskId: "task-1",
      headers: {},
    }),
    /analysis FAILED/,
  );

  await assert.rejects(
    fetchBoundAnalysis({
      fetchImpl: async () => ({ ok: false, status: 503 }),
      host: "http://sonar.invalid",
      project: "project",
      headers: {},
      analysisId: "analysis-1",
      identity: createCommitIdentity("revision-1"),
    }),
    /analysis API failed: 503/,
  );
  await assert.rejects(
    fetchBoundAnalysis({
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          analyses: [{ key: "analysis-1", revision: "stale" }],
        }),
      }),
      host: "http://sonar.invalid",
      project: "project",
      headers: {},
      analysisId: "analysis-1",
      identity: createCommitIdentity("revision-1"),
    }),
    /not bound to the current source identity/,
  );

  await assert.rejects(
    fetchDuplicationDensity({
      fetchImpl: async () => ({ ok: false, status: 500 }),
      host: "http://sonar.invalid",
      project: "project",
      headers: {},
    }),
    /measures API failed: 500/,
  );
  await assert.rejects(
    fetchDuplicationDensity({
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
      host: "http://sonar.invalid",
      project: "project",
      headers: {},
    }),
    /duplicated_lines_density is unavailable/,
  );
});

test("Sonar task resolution uses captured output, report file, or empty evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-sonar-task-"));
  assert.deepEqual(resolveScannerTask(directory, "no task here"), {});

  fs.mkdirSync(path.join(directory, ".scannerwork"));
  fs.writeFileSync(
    path.join(directory, ".scannerwork", "report-task.txt"),
    "ceTaskId=file-task\ndashboardUrl=http://sonar/dashboard\n",
  );
  assert.deepEqual(resolveScannerTask(directory, "no task here"), {
    ceTaskId: "file-task",
    dashboardUrl: "http://sonar/dashboard",
  });
  assert.deepEqual(resolveScannerTask(directory, "ceTaskId=output-task"), {
    ceTaskId: "output-task",
  });
});
