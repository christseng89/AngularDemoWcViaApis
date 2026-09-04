import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as yaml from 'js-yaml';

const root = resolve(new URL('..', import.meta.url).pathname.slice(1));
const docs = [
  'README.md',
  'docs/http-retry-policy.md',
  'docs/balance-account-number-maintenance.md',
  'docs/configuration.md',
  'docs/web-component-usage.md',
  'docs/web-component.md',
  'docs/framework-integrations.md',
  'docs/web-component-contract.md',
  'docs/web-component-styling.md',
  'docs/web-component-governance.md',
  'docs/web-component-operations.md',
  'docs/web-component-testing.md',
  'docs/releasing-web-component.md',
  'docs/migrations/web-component-v1.md',
  'docs/current-behavior.md',
  'docs/engineering-standards.md',
  'docs/architecture.md',
  'docs/decisions/README.md',
  'docs/decisions/2026-08-31-web-component-phase-6-formalization.md',
  'docs/decisions/2026-08-31-web-component-oas-no-change.md',
];

const failures = [];
for (const relative of docs) {
  const absolute = resolve(root, relative);
  const markdown = readFileSync(absolute, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const linked = resolve(dirname(absolute), decodeURIComponent(target));
    if (!existsSync(linked)) failures.push(`${relative}: missing link ${match[1]}`);
  }
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
for (const script of ['build:wc', 'typecheck:adapters', 'e2e', 'release:prepare', 'release:verify']) {
  if (!packageJson.scripts[script]) failures.push(`README command has no package script: ${script}`);
}

const configurationDoc = readFileSync(resolve(root, 'docs/configuration.md'), 'utf8');
const rootEnv = readFileSync(resolve(root, '.env'), 'utf8');
for (const line of rootEnv.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith('#') && entry.includes('='))) {
  const name = line.slice(0, line.indexOf('='));
  const value = line.slice(line.indexOf('=') + 1);
  if (!configurationDoc.includes(`\`${name}\``)) failures.push(`docs/configuration.md: missing .env variable ${name}`);
  if (/(SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY)/i.test(name)) {
    if (!configurationDoc.includes(`| \`${name}\` | \`${name}=...\` |`)) failures.push(`docs/configuration.md: sensitive value for ${name} is not masked`);
  } else if (!configurationDoc.includes(`| \`${name}\` | \`${value}\` |`)) {
    failures.push(`docs/configuration.md: stale .env value for ${name}`);
  }
}
if (!configurationDoc.includes('AAA=...')) failures.push('docs/configuration.md: sensitive .env masking convention is missing');
for (const subpath of ['./wc', './contract', './adapters/angular', './adapters/react', './adapters/vue']) {
  if (!packageJson.exports[subpath]) failures.push(`documented package export missing: ${subpath}`);
}

const loadYaml = yaml.load ?? yaml.default?.load;
if (!loadYaml) throw new Error('js-yaml does not expose a YAML load function');
const balanceOas = loadYaml(readFileSync(resolve(root, 'analysis/balance-component-api.yaml'), 'utf8'));
const channelOas = loadYaml(readFileSync(resolve(root, 'analysis/balance-component-channel-api.yaml'), 'utf8'));
for (const [name, document] of [
  ['balance', balanceOas],
  ['channel', channelOas],
]) {
  if (!document || typeof document !== 'object' || !String(document.openapi).startsWith('3.')) {
    failures.push(`${name} OAS is not a parsed OpenAPI 3 document`);
  }
}

const routeFiles = ['src/routes/balanceContracts.ts', 'src/routes/balanceMovements.ts', 'src/routes/deletePendingAudit.ts', 'src/routes/balanceAccountMappings.ts'];
for (const relative of routeFiles) {
  const source = readFileSync(resolve(root, 'microservices/balance-component', relative), 'utf8');
  for (const match of source.matchAll(/router\.(?:get|post|put|patch|delete)\('([^']+)'/g)) {
    const path = match[1].replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    if (!balanceOas.paths?.[path]) failures.push(`microservice route absent from Balance OAS: ${path}`);
  }
}

if (failures.length) throw new Error(`WC documentation verification failed:\n${failures.join('\n')}`);
console.log(`WC docs verified: ${docs.length} Markdown files, 2 parsed OAS files, route/OAS coverage and package examples.`);
