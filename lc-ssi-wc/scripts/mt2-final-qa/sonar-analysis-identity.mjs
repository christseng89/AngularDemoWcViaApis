import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const parseTaskFile = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

export const analysisMatchesCommit = (analysis, commitSha) =>
  analysis?.revision === commitSha || analysis?.projectVersion === commitSha;

const parseProperties = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );

const globToRegExp = (glob) => {
  const tokens = glob.match(/\*\*\/|\*\*|\*|\?|[^*?]+/g) ?? [];
  const expression = tokens
    .map((token) => {
      if (token === "**/") return "(?:.*/)?";
      if (token === "**") return ".*";
      if (token === "*") return "[^/]*";
      if (token === "?") return "[^/]";
      return token.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${expression}$`);
};

const walkFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  });
};

const propertyList = (properties, name) =>
  String(properties[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const createManifest = (workspace, relativePaths) => {
  const absoluteWorkspace = path.resolve(workspace);
  const files = [...new Set(relativePaths)]
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => {
      const content = fs.readFileSync(path.resolve(absoluteWorkspace, relativePath));
      return {
        path: relativePath,
        bytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      };
    });
  const digest = createHash("sha256");
  for (const file of files)
    digest.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  return { algorithm: "sha256", digest: digest.digest("hex"), files };
};

export const buildSourceManifest = (
  workspace,
  propertiesFile = path.resolve(workspace, "sonar-project.properties"),
) => {
  const properties = parseProperties(fs.readFileSync(propertiesFile, "utf8"));
  const sourceRoots = propertyList(properties, "sonar.sources");
  if (!sourceRoots.length)
    throw new Error("sonar.sources must identify at least one source root");
  const exclusions = propertyList(properties, "sonar.exclusions").map(globToRegExp);
  const absoluteWorkspace = path.resolve(workspace);
  const relativePaths = sourceRoots
    .flatMap((sourceRoot) => walkFiles(path.resolve(absoluteWorkspace, sourceRoot)))
    .map((absolute) => ({
      absolute,
      path: path.relative(absoluteWorkspace, absolute).replaceAll(path.sep, "/"),
    }))
    .filter(({ path: relativePath }) =>
      exclusions.every((exclusion) => !exclusion.test(relativePath)),
    )
    .map(({ path: relativePath }) => relativePath);
  return createManifest(workspace, relativePaths);
};

export const buildTypeScriptAnalysisManifest = (
  workspace,
  propertiesFile = path.resolve(workspace, "sonar-project.properties"),
) => {
  const properties = parseProperties(fs.readFileSync(propertiesFile, "utf8"));
  const absoluteWorkspace = path.resolve(workspace);
  const collect = (roots, inclusions, exclusions) =>
    roots
      .flatMap((root) => walkFiles(path.resolve(absoluteWorkspace, root)))
      .map((absolute) =>
        path.relative(absoluteWorkspace, absolute).replaceAll(path.sep, "/"),
      )
      .filter((relativePath) => /\.tsx?$/.test(relativePath))
      .filter(
        (relativePath) =>
          (!inclusions.length || inclusions.some((pattern) => pattern.test(relativePath))) &&
          exclusions.every((pattern) => !pattern.test(relativePath)),
      );
  const sourceFiles = collect(
    propertyList(properties, "sonar.sources"),
    [],
    propertyList(properties, "sonar.exclusions").map(globToRegExp),
  );
  const testFiles = collect(
    propertyList(properties, "sonar.tests"),
    propertyList(properties, "sonar.test.inclusions").map(globToRegExp),
    propertyList(properties, "sonar.test.exclusions").map(globToRegExp),
  );
  return createManifest(workspace, [...sourceFiles, ...testFiles]);
};

export const createWorktreeIdentity = (manifest) => ({
  kind: "worktree",
  projectVersion: `worktree-${manifest.digest}`,
  revision: null,
  worktreeDigest: manifest.digest,
  sourceManifest: manifest,
});

export const createCommitIdentity = (commitSha) => ({
  kind: "commit",
  projectVersion: commitSha,
  revision: commitSha,
  commitSha,
});

export const analysisMatchesIdentity = (analysis, identity) =>
  identity.kind === "commit"
    ? analysisMatchesCommit(analysis, identity.commitSha)
    : analysis?.projectVersion === identity.projectVersion;
