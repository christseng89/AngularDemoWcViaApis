import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  analysisMatchesIdentity,
  buildSourceManifest,
  buildTypeScriptAnalysisManifest,
  createCommitIdentity,
  createWorktreeIdentity,
  parseTaskFile,
} from "./sonar-analysis-identity.mjs";

const TRUSTED_EXECUTABLE_PATHS = Object.freeze({
  win32: Object.freeze({
    git: Object.freeze([
      String.raw`C:\Program Files\Git\cmd\git.exe`,
      String.raw`C:\Program Files\Git\bin\git.exe`,
    ]),
    docker: Object.freeze([
      String.raw`C:\Program Files\Docker\Docker\resources\bin\docker.exe`,
    ]),
  }),
  linux: Object.freeze({
    git: Object.freeze(["/usr/bin/git"]),
    docker: Object.freeze(["/usr/bin/docker", "/usr/local/bin/docker"]),
  }),
  darwin: Object.freeze({
    git: Object.freeze(["/usr/bin/git"]),
    docker: Object.freeze(["/usr/local/bin/docker"]),
  }),
});

export const resolveTrustedExecutable = (
  executable,
  { platform = process.platform, exists = fs.existsSync } = {},
) => {
  const candidates = TRUSTED_EXECUTABLE_PATHS[platform]?.[executable] ?? [];
  const resolved = candidates.find((candidate) => exists(candidate));
  if (!resolved)
    throw new Error(
      `Unable to resolve ${executable} from a trusted absolute path on ${platform}`,
    );
  return resolved;
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const redactToken = (value, token) => {
  const text = String(value ?? "");
  return token ? text.split(token).join("[REDACTED]") : text;
};

export const parseScannerTask = (output) => {
  const text = String(output ?? "");
  const ceTaskUrl =
    /https?:\/\/[^\s]+\/api\/ce\/task\?id=([A-Za-z0-9_-]+)/.exec(text);
  const ceTaskId =
    ceTaskUrl?.[1] ?? /\bceTaskId=([A-Za-z0-9_-]+)/.exec(text)?.[1];
  const dashboardUrl = /https?:\/\/[^\s]+\/dashboard\?id=[^\s]+/.exec(
    text,
  )?.[0];
  return {
    ...(ceTaskId ? { ceTaskId } : {}),
    ...(ceTaskUrl ? { ceTaskUrl: ceTaskUrl[0] } : {}),
    ...(dashboardUrl ? { dashboardUrl } : {}),
  };
};

const walkTypeScriptConfigs = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkTypeScriptConfigs(absolute);
    return entry.isFile() && /^tsconfig\.(?:app|lib)\.json$/.test(entry.name)
      ? [absolute]
      : [];
  });
};

export const discoverTypeScriptConfigs = (workspace) =>
  ["apps", "libs"]
    .flatMap((root) => walkTypeScriptConfigs(path.resolve(workspace, root)))
    .map((absolute) =>
      path
        .relative(path.resolve(workspace), absolute)
        .replaceAll(path.sep, "/"),
    )
    .sort((left, right) => left.localeCompare(right));

const toContainerPath = (relativePath) =>
  `/usr/src/${relativePath.replaceAll("\\", "/").replace(/^\/+/, "")}`;

export const createScannerEnvironment = ({
  host,
  token,
  typeScriptFiles,
  workspace = process.cwd(),
}) => {
  if ([host, token].some((value) => /[\r\n]/.exec(String(value ?? ""))))
    throw new Error("Sonar environment values must not contain line breaks");
  const temporaryRoot = path.resolve(workspace, "tmp", "sonar");
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporaryRoot, "scanner-env-"));
  const file = path.join(directory, "scanner.env");
  const typeScriptConfigFile = path.join(directory, "tsconfig.sonar.json");
  try {
    fs.writeFileSync(
      file,
      [
        `SONAR_HOST_URL=${host}`,
        ...(token ? [`SONAR_TOKEN=${token}`] : []),
      ].join("\n"),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    fs.writeFileSync(
      typeScriptConfigFile,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "commonjs",
            moduleResolution: "node",
            experimentalDecorators: true,
            useDefineForClassFields: false,
            skipLibCheck: true,
            baseUrl: "/usr/src",
            paths: { "@ssi/*": ["libs/*/src/index.ts"] },
            noEmit: true,
          },
          files: [...new Set(typeScriptFiles ?? [])]
            .sort((left, right) => left.localeCompare(right))
            .map(toContainerPath),
        },
        null,
        2,
      ),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    fs.rmSync(file, { force: true });
    fs.rmSync(typeScriptConfigFile, { force: true });
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    directory,
    file,
    typeScriptConfigFile,
    dispose: () => {
      fs.rmSync(file, { force: true });
      fs.rmSync(typeScriptConfigFile, { force: true });
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
};

export const buildScannerArguments = ({
  workspace,
  project,
  identity,
  envFile,
  typeScriptConfigFile,
  scannerImage = "sonarsource/sonar-scanner-cli:latest",
}) => [
  "run",
  "--rm",
  "--add-host",
  "host.docker.internal:host-gateway",
  "--env-file",
  envFile,
  "-v",
  `${workspace}:/usr/src:ro`,
  "-w",
  "/usr/src",
  scannerImage,
  `-Dsonar.projectKey=${project}`,
  `-Dsonar.projectVersion=${identity.projectVersion}`,
  "-Dsonar.working.directory=/tmp/ssi-wc-scannerwork",
  `-Dsonar.typescript.tsconfigPaths=${toContainerPath(
    path.relative(workspace, typeScriptConfigFile),
  )}`,
  "-Dsonar.javascript.node.maxspace=4096",
  ...(identity.kind === "worktree" ? ["-Dsonar.scm.disabled=true"] : []),
  "-Dsonar.qualitygate.wait=false",
];

export const assertAnalyzerCoverage = (log) => {
  const output = String(log ?? "");
  const invalid = [
    /Skipped\s+\d+\s+file\(s\).*not part of any tsconfig/i,
    /Failed to create(?: TypeScript)? program/i,
    /(?:Could not|Unable to) create TypeScript program/i,
    /Found\s+0\s+tsconfig/i,
    /ERROR\s+Failure during analysis/i,
    /Line\s+\d+\s+is out of range for file/i,
  ].find((pattern) => pattern.test(output));
  if (invalid)
    throw new Error(
      `FAIL_CLOSED: TypeScript analyzer coverage is incomplete: ${output
        .split(/\r?\n/)
        .find((line) => invalid.test(line))}`,
    );
};

const containerRelativePath = (fileName) => {
  const normalized = fileName.replaceAll("\\", "/");
  const marker = "/usr/src/";
  const index = normalized.toLowerCase().indexOf(marker);
  return index >= 0 ? normalized.slice(index + marker.length) : normalized;
};

export const assertTypeScriptProgramCoverage = ({
  configFile,
  expectedFiles,
}) => {
  const loaded = ts.readConfigFile(configFile, ts.sys.readFile);
  if (loaded.error)
    throw new Error(
      `FAIL_CLOSED: analyzer tsconfig could not be read: ${ts.flattenDiagnosticMessageText(
        loaded.error.messageText,
        " ",
      )}`,
    );
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    path.dirname(configFile),
  );
  if (parsed.errors.length)
    throw new Error(
      `FAIL_CLOSED: analyzer tsconfig could not be parsed: ${parsed.errors
        .map(({ messageText }) =>
          ts.flattenDiagnosticMessageText(messageText, " "),
        )
        .join("; ")}`,
    );
  const expected = [...new Set(expectedFiles)].sort((left, right) =>
    left.localeCompare(right),
  );
  const actual = [...new Set(parsed.fileNames.map(containerRelativePath))].sort(
    (left, right) => left.localeCompare(right),
  );
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((file) => !actualSet.has(file));
  const unexpected = actual.filter((file) => !expectedSet.has(file));
  if (missing.length || unexpected.length)
    throw new Error(
      `FAIL_CLOSED: TypeScript program file set mismatch; missing=${missing.join(",") || "none"}; unexpected=${unexpected.join(",") || "none"}`,
    );
  return { expected: expected.length, parsed: actual.length };
};

export const runAnalyzerPreflight = (workspace = process.cwd()) => {
  const sourceManifest = buildSourceManifest(workspace);
  const analyzerManifest = buildTypeScriptAnalysisManifest(workspace);
  if (!analyzerManifest.files.length)
    throw new Error(
      "No indexed TypeScript files were found for Sonar analysis",
    );
  const environment = createScannerEnvironment({
    host: "https://preflight.invalid",
    token: "",
    workspace,
    typeScriptFiles: analyzerManifest.files.map(
      ({ path: relativePath }) => relativePath,
    ),
  });
  try {
    const program = assertTypeScriptProgramCoverage({
      configFile: environment.typeScriptConfigFile,
      expectedFiles: analyzerManifest.files.map(
        ({ path: relativePath }) => relativePath,
      ),
    });
    return {
      sourceFiles: sourceManifest.files.filter(({ path: relativePath }) =>
        /\.tsx?$/.test(relativePath),
      ).length,
      indexedTypeScriptFiles: analyzerManifest.files.length,
      programTypeScriptFiles: program.parsed,
      indexedTypeScriptDigest: analyzerManifest.digest,
    };
  } finally {
    environment.dispose();
  }
};

const walkCoverageReports = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkCoverageReports(absolute);
    return entry.isFile() && entry.name === "lcov.info" ? [absolute] : [];
  });
};

const normalizeLcovSourcePaths = (workspace, content) =>
  content.replace(/^SF:(.+)$/gm, (_line, source) => {
    const normalized = source.trim().replaceAll("\\", "/");
    const absolute = path.resolve(workspace, normalized);
    const relative = path.relative(workspace, absolute);
    if (!relative.startsWith("..") && fs.existsSync(absolute))
      return `SF:${relative.replaceAll(path.sep, "/")}`;
    const segments = normalized
      .split("/")
      .filter((segment) => segment && segment !== "." && segment !== "..");
    for (let index = 0; index < segments.length; index += 1) {
      const candidateSegments = segments.slice(index);
      const candidate = path.resolve(workspace, ...candidateSegments);
      if (fs.existsSync(candidate)) return `SF:${candidateSegments.join("/")}`;
    }
    return `SF:${normalized}`;
  });

export const ensureAggregateLcov = (workspace) => {
  const coverageDirectory = path.resolve(workspace, "coverage");
  const output = path.join(coverageDirectory, "lcov.info");
  const sources = walkCoverageReports(coverageDirectory)
    .filter((source) => path.resolve(source) !== path.resolve(output))
    .sort();
  if (!sources.length) {
    if (fs.existsSync(output)) return { path: output, sources: [output] };
    throw new Error(
      "No LCOV reports were found; run aggregate coverage before Sonar analysis",
    );
  }
  fs.mkdirSync(coverageDirectory, { recursive: true });
  const content = sources
    .map((source) =>
      normalizeLcovSourcePaths(
        workspace,
        fs.readFileSync(source, "utf8"),
      ).trimEnd(),
    )
    .filter(Boolean)
    .join("\n");
  fs.writeFileSync(output, content ? `${content}\n` : "", "utf8");
  return { path: output, sources };
};

const requireSonarConfiguration = () => {
  const host = process.env.SONAR_HOST_URL;
  const token = process.env.SONAR_TOKEN;
  const allowAnonymous = process.env.SONAR_ALLOW_ANONYMOUS === "true";
  if (!host || (!token && !allowAnonymous))
    throw new Error(
      "SONAR_HOST_URL and SONAR_TOKEN are required unless an ephemeral server explicitly allows anonymous analysis",
    );
  return {
    host,
    token,
    project: process.env.SONAR_PROJECT_KEY ?? "lc-ssi-wc",
  };
};

const createAnalysisIdentity = (workspace, sourceManifest) => {
  try {
    const gitExecutable = resolveTrustedExecutable("git");
    const commitSha = execFileSync(gitExecutable, ["rev-parse", "HEAD"], {
      cwd: workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const changes = execFileSync(
      gitExecutable,
      [
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        "apps",
        "libs",
        "scripts",
      ],
      {
        cwd: workspace,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return changes
      ? createWorktreeIdentity(sourceManifest)
      : createCommitIdentity(commitSha);
  } catch {
    return createWorktreeIdentity(sourceManifest);
  }
};

const scannerProcessEnvironment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== "SONAR_TOKEN"),
  );

const assertScannerProcessSucceeded = (scannerProcess) => {
  if (!scannerProcess.error && scannerProcess.status === 0) return;
  throw new Error(
    `Sonar scanner failed${
      scannerProcess.error
        ? `: ${scannerProcess.error.message}`
        : ` with exit ${scannerProcess.status}`
    }`,
  );
};

const runDockerScanner = ({
  workspace,
  project,
  identity,
  scannerHost,
  token,
  typeScriptFiles,
}) => {
  const environment = createScannerEnvironment({
    host: scannerHost,
    token,
    workspace,
    typeScriptFiles,
  });
  try {
    assertTypeScriptProgramCoverage({
      configFile: environment.typeScriptConfigFile,
      expectedFiles: typeScriptFiles,
    });
    const scannerProcess = spawnSync(
      resolveTrustedExecutable("docker"),
      buildScannerArguments({
        workspace,
        project,
        identity,
        envFile: environment.file,
        typeScriptConfigFile: environment.typeScriptConfigFile,
        scannerImage: process.env.SONAR_SCANNER_IMAGE,
      }),
      {
        cwd: workspace,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: scannerProcessEnvironment(),
      },
    );
    const output = `${scannerProcess.stdout ?? ""}${scannerProcess.stderr ?? ""}`;
    if (scannerProcess.stdout)
      process.stdout.write(redactToken(scannerProcess.stdout, token));
    if (scannerProcess.stderr)
      process.stderr.write(redactToken(scannerProcess.stderr, token));
    assertScannerProcessSucceeded(scannerProcess);
    assertAnalyzerCoverage(output);
    return output;
  } catch (error) {
    throw new Error(
      `Sonar scanner failed: ${redactToken(error?.message, token)}`,
    );
  } finally {
    environment.dispose();
  }
};

export const resolveScannerTask = (workspace, scannerOutput) => {
  const capturedTask = parseScannerTask(scannerOutput);
  if (capturedTask.ceTaskId) return capturedTask;
  const reportTaskFile = path.resolve(
    workspace,
    ".scannerwork/report-task.txt",
  );
  if (!fs.existsSync(reportTaskFile)) return capturedTask;
  return parseTaskFile(fs.readFileSync(reportTaskFile, "utf8"));
};

const prepareAnalysisTask = ({
  workspace,
  project,
  identity,
  scannerHost,
  token,
  typeScriptFiles,
  resumeTaskId,
}) => {
  if (resumeTaskId) {
    if (!/^[A-Za-z0-9_-]+$/.test(resumeTaskId))
      throw new Error("Invalid Sonar CE task id");
    return {
      task: { ceTaskId: resumeTaskId },
      analysisMode: "resume",
      aggregateLcov: { sources: [] },
    };
  }
  const aggregateLcov = ensureAggregateLcov(workspace);
  const scannerOutput = runDockerScanner({
    workspace,
    project,
    identity,
    scannerHost,
    token,
    typeScriptFiles,
  });
  return {
    task: resolveScannerTask(workspace, scannerOutput),
    analysisMode: "scan",
    aggregateLcov,
  };
};

export const authorizationHeaders = (token) => {
  if (!token) return {};
  const credentials = Buffer.from(`${token}:`).toString("base64");
  return { authorization: `Basic ${credentials}` };
};

export const waitForCeAnalysis = async ({
  fetchImpl,
  host,
  taskId,
  headers,
}) => {
  let ce;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetchImpl(
      `${host}/api/ce/task?id=${encodeURIComponent(taskId)}`,
      { headers },
    );
    if (!response.ok)
      throw new Error(`Sonar CE API failed: ${response.status}`);
    ce = (await response.json()).task;
    if (ce.status === "SUCCESS") break;
    if (["FAILED", "CANCELED"].includes(ce.status))
      throw new Error(`Sonar analysis ${ce.status}`);
    await sleep(2000);
  }
  if (ce?.status !== "SUCCESS" || !ce.analysisId)
    throw new Error("Sonar CE task did not complete with an analysisId");
  return ce;
};

export const fetchBoundAnalysis = async ({
  fetchImpl,
  host,
  project,
  headers,
  analysisId,
  identity,
}) => {
  const response = await fetchImpl(
    `${host}/api/project_analyses/search?project=${encodeURIComponent(project)}&pageSize=1`,
    { headers },
  );
  if (!response.ok)
    throw new Error(`Sonar analysis API failed: ${response.status}`);
  const analysis = (await response.json()).analyses?.find(
    ({ key }) => key === analysisId,
  );
  if (!analysis || !analysisMatchesIdentity(analysis, identity))
    throw new Error(
      "FAIL_CLOSED: Sonar analysis is not bound to the current source identity",
    );
  return analysis;
};

export const fetchDuplicationDensity = async ({
  fetchImpl,
  host,
  project,
  headers,
}) => {
  const response = await fetchImpl(
    `${host}/api/measures/component?component=${encodeURIComponent(project)}&metricKeys=duplicated_lines_density`,
    { headers },
  );
  if (!response.ok)
    throw new Error(`Sonar measures API failed: ${response.status}`);
  const measures = await response.json();
  const value = Number(
    measures.component?.measures?.find(
      ({ metric }) => metric === "duplicated_lines_density",
    )?.value,
  );
  if (!Number.isFinite(value))
    throw new Error("Sonar duplicated_lines_density is unavailable");
  return value;
};

export const fetchQualityGateStatus = async ({
  fetchImpl,
  host,
  headers,
  analysisId,
}) => {
  const response = await fetchImpl(
    `${host}/api/qualitygates/project_status?analysisId=${encodeURIComponent(analysisId)}`,
    { headers },
  );
  if (!response.ok)
    throw new Error(`Sonar Quality Gate API failed: ${response.status}`);
  const projectStatus = (await response.json()).projectStatus;
  if (projectStatus?.status === "OK") return "OK";
  const failures = (projectStatus?.conditions ?? [])
    .filter(({ status }) => status === "ERROR")
    .map(
      ({ metricKey, actualValue, errorThreshold }) =>
        `${metricKey}=${actualValue} (threshold ${errorThreshold})`,
    )
    .join(", ");
  const failureDetails = failures ? `: ${failures}` : "";
  throw new Error(
    `FAIL_CLOSED: Sonar Quality Gate ${projectStatus?.status ?? "UNKNOWN"}${failureDetails}`,
  );
};

const runAnalysis = async ({
  workspace = process.cwd(),
  fetchImpl = fetch,
  resumeTaskId,
} = {}) => {
  const { host, token, project } = requireSonarConfiguration();
  const sourceManifest = buildSourceManifest(workspace);
  const analyzerManifest = buildTypeScriptAnalysisManifest(workspace);
  const identity = createAnalysisIdentity(workspace, sourceManifest);
  const scannerHost = host
    .replace("localhost", "host.docker.internal")
    .replace("127.0.0.1", "host.docker.internal");
  const typeScriptConfigs = discoverTypeScriptConfigs(workspace);
  if (!typeScriptConfigs.length)
    throw new Error("No application or library TypeScript configs were found");
  const typeScriptFiles = analyzerManifest.files.map(
    ({ path: relativePath }) => relativePath,
  );
  if (!typeScriptFiles.length)
    throw new Error(
      "No TypeScript source files were found in the Sonar manifest",
    );
  const standalonePreflight = runAnalyzerPreflight(workspace);
  const preflight = {
    expected: standalonePreflight.indexedTypeScriptFiles,
    parsed: standalonePreflight.programTypeScriptFiles,
  };
  const { task, analysisMode, aggregateLcov } = prepareAnalysisTask({
    workspace,
    project,
    identity,
    scannerHost,
    token,
    typeScriptFiles,
    resumeTaskId,
  });
  if (!task.ceTaskId)
    throw new Error(
      "Sonar scanner output and report-task.txt lack CE identity",
    );
  const headers = authorizationHeaders(token);
  const ce = await waitForCeAnalysis({
    fetchImpl,
    host,
    taskId: task.ceTaskId,
    headers,
  });
  const analysis = await fetchBoundAnalysis({
    fetchImpl,
    host,
    project,
    headers,
    analysisId: ce.analysisId,
    identity,
  });
  const value = await fetchDuplicationDensity({
    fetchImpl,
    host,
    project,
    headers,
  });
  const qualityGateStatus = await fetchQualityGateStatus({
    fetchImpl,
    host,
    headers,
    analysisId: ce.analysisId,
  });
  const output = path.resolve(
    workspace,
    "qa/reports/latest/mt2/sonar-measures.json",
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        duplicatedLinesDensity: value,
        project,
        projectVersion: identity.projectVersion,
        identityKind: identity.kind,
        revision: analysis.revision ?? identity.revision,
        analysisTime: analysis.date ?? ce.executedAt ?? null,
        ...(identity.kind === "commit"
          ? { commitSha: identity.commitSha }
          : {
              worktreeDigest: identity.worktreeDigest,
            }),
        sourceDigest: sourceManifest.digest,
        sourceManifest,
        analysisId: ce.analysisId,
        qualityGateStatus,
        ceTaskId: task.ceTaskId,
        analysisPurpose: "DUPLICATION_MEASUREMENT",
        analysisMode,
        ...(task.dashboardUrl ? { dashboardUrl: task.dashboardUrl } : {}),
        discoveredTypeScriptConfigs: typeScriptConfigs,
        analyzerTypeScriptManifest: analyzerManifest,
        analyzerPreflight: preflight,
        aggregateLcovSources: aggregateLcov.sources.map((source) =>
          path.relative(workspace, source).replaceAll(path.sep, "/"),
        ),
        verifiedRevision: true,
      },
      null,
      2,
    ),
  );
  return {
    duplicatedLinesDensity: value,
    project,
    projectVersion: identity.projectVersion,
    identityKind: identity.kind,
    revision: analysis.revision ?? identity.revision,
    analysisTime: analysis.date ?? ce.executedAt ?? null,
    ...(identity.kind === "commit"
      ? { commitSha: identity.commitSha }
      : { worktreeDigest: identity.worktreeDigest }),
    analysisId: ce.analysisId,
    qualityGateStatus,
    analysisPurpose: "DUPLICATION_MEASUREMENT",
    analysisMode,
  };
};

export const run = async (options) => {
  const token = process.env.SONAR_TOKEN;
  try {
    return await runAnalysis(options);
  } catch (error) {
    throw new Error(redactToken(error?.message ?? error, token));
  }
};

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const resumeIndex = process.argv.indexOf("--resume-task");
  if (resumeIndex >= 0 && !process.argv[resumeIndex + 1])
    throw new Error("--resume-task requires a Sonar CE task id");
  console.log(
    JSON.stringify(
      process.argv.includes("--preflight")
        ? runAnalyzerPreflight()
        : await run({
            ...(resumeIndex >= 0
              ? { resumeTaskId: process.argv[resumeIndex + 1] }
              : {}),
          }),
      null,
      2,
    ),
  );
}
