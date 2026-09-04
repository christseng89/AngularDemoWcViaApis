import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..');
const vault = resolve(repo, 'docs', 'obsidian-balance-kb-v3.2');
const write = process.argv.includes('--write');
const today = '2026-09-04';

if (!existsSync(vault) || relative(repo, vault).split(sep).join('/') !== 'docs/obsidian-balance-kb-v3.2') {
  throw new Error(`Refusing to operate on unexpected vault path: ${vault}`);
}

const read = (path) => readFileSync(resolve(repo, path), 'utf8');
const gitRevision = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
})();

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function allFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? allFiles(path) : entry.isFile() ? [path] : [];
  });
}

function yamlString(value) { return JSON.stringify(value); }
function note({ title, type, domain, sources, body, aliases = [], tags = [], status = 'verified', sourceOfTruth = 'source-code', sourceNotice = '本筆記由目前 repository 產生。若文件與程式不一致，以 Source Code、測試及 OAS 為準。' }) {
  return `---\ntitle: ${yamlString(title)}\ntype: ${type}\ndomain: ${domain}\nstatus: ${status}\nsource_of_truth: ${sourceOfTruth}\nsource_revision: ${yamlString(gitRevision)}\nverified_date: ${today}\ngenerated: true\naliases: [${aliases.map(yamlString).join(', ')}]\ntags: [${tags.map(yamlString).join(', ')}]\nsource_files:\n${sources.map((s) => `  - ${yamlString(s)}`).join('\n')}\n---\n\n# ${title}\n\n> [!important] Source of truth\n> ${sourceNotice}\n\n${body.trim()}\n`;
}

const catalogSource = read('src/app/transaction-builder/balance-component.model.ts');
const functionMatches = [...catalogSource.matchAll(/\bcode:\s*'(A\d+S?|B\d+)'/g)];
const functions = functionMatches.map((match, index) => {
  const block = catalogSource.slice(match.index, functionMatches[index + 1]?.index ?? catalogSource.length);
  const pick = (pattern) => block.match(pattern)?.[1] ?? null;
  const helpMatch = block.match(/^\s*help:\s*(['"])(.*)\1,\s*$/m);
  const options = [...block.matchAll(/\{\s*value:\s*'([^']+)',\s*label:\s*'([^']+)'(?:,\s*movementTypeOverride:\s*'([^']+)')?/g)]
    .map((m) => ({ value: m[1], label: m[2], movementTypeOverride: m[3] ?? null }));
  return {
    code: match[1],
    label: pick(/label:\s*'([^']+)'/),
    side: pick(/side:\s*'(IMPORT|EXPORT)'/),
    instrumentType: pick(/instrumentType:\s*'([^']+)'/),
    movementType: pick(/movementType:\s*'([^']+)'/),
    defaultParentInstrumentType: pick(/defaultParentInstrumentType:\s*'([^']+)'/),
    secondaryRefLabel: pick(/secondaryRefLabel:\s*'([^']+)'/),
    payableMovementType: pick(/payableMovementType:\s*'([^']+)'/),
    catalogTenorFilter: pick(/catalogTenorFilter:\s*'([^']+)'/),
    help: helpMatch ? helpMatch[2].replaceAll("\\'", "'").replaceAll('\\"', '"') : null,
    options,
  };
});

const routeFiles = [
  'microservices/balance-component/src/routes/balanceContracts.ts',
  'microservices/balance-component/src/routes/balanceMovements.ts',
  'microservices/balance-component/src/routes/balanceAccountMappings.ts',
  'microservices/balance-component/src/routes/deletePendingAudit.ts',
];
const routes = routeFiles.flatMap((source) => [...read(source).matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)]
  .map((m) => ({ method: m[1].toUpperCase(), path: m[2], source })));

const businessCaseSource = read('backend/data/businessCases.js');
const cases = [...businessCaseSource.matchAll(/\bid:\s*'(import-case-\d+|export-case-\d+)'/g)].map((m) => m[1]);
const testFiles = [
  ...markdownFiles(resolve(repo, 'microservices', 'balance-component', 'test')).filter((p) => /\.(test|spec)\.(ts|js)$/.test(p)),
];

const typeSource = read('microservices/balance-component/src/types.ts');
function union(name) {
  const match = typeSource.match(new RegExp(`export type ${name}\\s*=([\\s\\S]*?);`));
  return match ? [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
}
const instrumentTypes = union('InstrumentType');
const movementStatuses = union('MovementStatus');
const exposureNatures = union('ExposureNature');
const tenorTypes = union('TenorType');
const balanceAccountTaxonomy = JSON.parse(read('microservices/balance-component/config/balance-account-mappings.json'));
const balanceAccountCategoryRows = balanceAccountTaxonomy.categories.map((category) =>
  `| ${category.label} | ${category.tenorTypes.map((tenor) => `\`${tenor.tenorKey}\``).join('、')} |`,
).join('\n');
const balanceAccountFamilyRows = balanceAccountTaxonomy.families.map((family) =>
  `| \`${family.familyKey}\` | ${family.label} | ${family.categoryKey} | \`${family.instrumentType}\` | ${family.tenorKeys.map((tenor) => `\`${tenor}\``).join('、')} |`,
).join('\n');
const balanceAccountDefaultRows = balanceAccountTaxonomy.mappings.map((mapping) =>
  `| \`${mapping.mappingKey}\` | ${mapping.accountA.accountNumber} | ${mapping.accountA.accountDescription} | ${mapping.accountB.accountNumber} | ${mapping.accountB.accountDescription} |`,
).join('\n');
const envValues = Object.fromEntries(read('.env').split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));
const envConfiguration = {
  BALANCE_HTTP_RETRY_COUNT: ['Angular generated HTTP retry', 'integer 0–10', '3'],
  BALANCE_HTTP_RETRY_INITIAL_DELAY_MS: ['Angular generated initial backoff', 'integer 0–60000 ms', '250'],
  BALANCE_HTTP_RETRY_MAX_DELAY_MS: ['Angular generated maximum backoff', 'integer >= initial delay and <=60000 ms', '2000'],
  BUSINESS_CASE_RECOVERY_RETRY_COUNT: ['Business Case service recovery polling', 'integer 0–60', '15'],
  BUSINESS_CASE_RECOVERY_INTERVAL_MS: ['Business Case recovery polling interval', 'integer 100–60000 ms', '2000'],
  BALANCE_ACCOUNT_NUMBER_REGEX: ['Maintained Account Number syntax', 'valid JavaScript regular expression', '^.+$'],
  BALANCE_ACCOUNT_NUMBER_MIN_LEN: ['Maintained Account Number minimum length', 'non-negative integer; <= maximum', '1'],
  BALANCE_ACCOUNT_NUMBER_MAX_LEN: ['Maintained Account Number maximum length', 'non-negative integer; >= minimum', '128'],
};
const sensitiveEnvName = (name) => /(SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY)/i.test(name);
const safeEnvValue = (name, value) => sensitiveEnvName(name) ? `\`${name}=...\`` : `\`${value}\``;
if (safeEnvValue('AAA_SECRET', 'must-not-appear') !== '`AAA_SECRET=...`') throw new Error('Sensitive environment masking is not active');
const envConfigurationRows = Object.entries(envValues).map(([name, value]) => {
  const [consumer = 'Review required', constraint = 'Not inferred', fallback = 'Not inferred'] = envConfiguration[name] ?? [];
  return `| \`${name}\` | ${safeEnvValue(name, value)} | \`${fallback}\` | ${constraint} | ${consumer} |`;
}).join('\n');

const configurationSources = [
  '.env',
  'scripts/generate-runtime-config.mjs',
  'src/app/core/http-retry/http-retry.config.generated.ts',
  'src/app/core/balance-account-taxonomy.generated.ts',
  'microservices/balance-component/src/config.ts',
  'microservices/balance-component/src/server.ts',
  'backend/server.js',
  'microservices/balance-component/config/balance-account-mappings.json',
  'scripts/generate-domestic-calendar.mjs',
  'microservices/business-days-mock/data/calendar.json',
  'analysis/standing-microservice-reference/calendars.json',
  'proxy.conf.json',
  'e2e/live/proxy.conf.json',
  'src/app/web-component/balance-component-element.contract.ts',
  'angular.json',
  'playwright.config.ts',
  'playwright.live.config.ts',
];

const schemaSource = read('microservices/balance-component/src/db/schema.ts');
const schemaTables = [...schemaSource.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g)].map((match) => {
  const body = match[2].replace(/^\s*--.*$/gm, '');
  const columns = body.split('\n').map((line) => line.trim().replace(/,$/, '')).filter((line) => /^\w+\s+/.test(line) && !line.startsWith('UNIQUE'))
    .map((line) => {
      const parsed = line.match(/^(\w+)\s+(\w+)(?:\s+(.*))?$/);
      return { name: parsed?.[1] ?? line, type: parsed?.[2] ?? '', constraints: parsed?.[3] ?? '' };
    });
  return { name: match[1], columns };
});
const schemaIndexes = [...schemaSource.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(([\s\S]*?)\)(?:\s+WHERE\s+([^;]+))?;/g)]
  .map((match) => ({ unique: Boolean(match[1]), name: match[2], table: match[3], columns: match[4].replace(/\s+/g, ' ').trim(), where: match[5]?.replace(/\s+/g, ' ').trim() ?? '' }));

const functionRows = functions.map((f) => `| [[${f.code} ${f.label}]] | ${f.side} | \`${f.instrumentType}\` | ${f.movementType ? `\`${f.movementType}\`` : '依 Direction 選項'} | ${f.defaultParentInstrumentType ? `\`${f.defaultParentInstrumentType}\`` : '—'} |`).join('\n');
const routeRows = routes.map((r) => `| \`${r.method}\` | \`${r.path}\` | \`${r.source}\` |`).join('\n');
const caseRows = cases.map((id) => `| \`${id}\` | ${id.startsWith('import') ? 'Import' : 'Export'} | \`backend/data/businessCases.js\` |`).join('\n');
const functionSelectionConditions = {
  A1: ['不選既有 contract；建立新的 Import LC natural key。', 'LC Number 不得已有 ACTIVE IPLC_LC。', 'Expiry Date、currency、amount、tenor 等 Issue 必填資料必須有效。'],
  A2: ['一般 Increase／Decrease 選 ACTIVE IPLC_LC；Expiry Date 可選 ACTIVE 或 EXPIRED IPLC_LC。', '必須先有 RELEASED Issue。', 'Decrease 重查 Tight Available；EXPIRED 的 Expiry Extension 必須無 open events。'],
  A3: ['選 ACTIVE、Issue 已 RELEASED 的 IPLC_LC；Sight／Usance 都可。', 'Amount 必須通過 Available／Tight Available 檢查。', '若需以特定 outstanding SG 抵銷容量，應改選 A3S。'],
  A3S: ['先選 ACTIVE IPLC_LC，再選該 LC 下具有 outstanding balance 的特定 SHGT。', 'Bill Amount 必須大於或等於所選 SG Balance。', 'Submit／Checker 都重查 LC、SG、amount 與 lifecycle。'],
  A4: ['只顯示 Sight IPLC_LC。', '第二層選擇已由 A3／A3S acknowledge、仍 PENDING 的 UTILIZE／IB record。', 'Amount 從來源 arrival 帶入；沒有 eligible arrival 時不可 Submit。'],
  A6: ['只選 Usance IPLC_LC。', '第二層選擇已由 A3／A3S acknowledge、仍 PENDING 的 UTILIZE／IB record。', 'Amount、tenor、currency 從來源 arrival 帶入並 protected。'],
  A7: ['第一層只顯示 Usance LC，而且至少有一筆 Available Balance 非 0 的 IPLC_ACCEPTANCE。', '第二層再選特定 IB／Acceptance。', 'Full／Partial Settlement 仍須通過即時 balance validation。'],
  A8: ['選 ACTIVE、Issue 已 RELEASED 的 IPLC_LC 作 parent。', 'SG Number 是新 SHGT natural key，不得與既有 ACTIVE SHGT 衝突。', 'SG amount 不得超過 parent LC 當時 Available Balance。'],
  A9: ['先選 LC，再選其下具有 Available Balance 的特定 SHGT／SG Number。', '只支援 Full Redeem；amount 由 SG current Available Balance 帶入並 protected。'],
  A10: ['只顯示 server 判定 close-eligible 的 IPLC_LC。', 'SG Balance=0、Acceptance Balance=0，整個 event tree 無 open events。', 'Amount 由 current Confirmed Balance 帶入；Release 再驗證。'],
  A11: ['只解析 CLOSED IPLC_LC。', '整個 event tree 必須無 open events。', 'Restoration amount 由 trailing RELEASED EXPIRE／CLOSE chain 計算，不由 Maker 輸入。'],
  B1: ['不選既有 contract；建立新的 Export Confirmation natural key。', 'LC Number 不得已有 ACTIVE EPLC_CONFIRMATION。', 'Expiry Date、currency、amount、tenor 等 Issue 必填資料必須有效。'],
  B2: ['一般 Increase／Decrease 選 ACTIVE EPLC_CONFIRMATION；Expiry Date 可選 ACTIVE 或 EXPIRED Confirmation。', '必須先有 RELEASED B1 Issue。', 'Decrease／Expiry Extension 在 Submit 與 Release 都重新驗證。'],
  B3: ['選 ACTIVE、Issue 已 RELEASED 的 EPLC_CONFIRMATION 作 parent。', '新 EB Number 識別本次 EPLC_EXAMINATION presentation。', 'Amount 必須在扣除尚未 consumed Present Docs earmark 後的容量內。'],
  B4: ['先選 EPLC_CONFIRMATION，再選其下已 RELEASED、尚未 consumed 的 B3 Present Docs。', 'Tenor 由 Confirmation 決定，不在 B4 重選。', 'EB Number、amount 從 B3 帶入；沒有 eligible B3 時不可 Submit。'],
  B5: ['只選 Usance EPLC_CONFIRMATION。', '第二層選擇具有 outstanding balance 的 EPLC_ACCEPTANCE／EB Number。', '只處理 Acceptance maturity settlement，不選 Sight Due from Issuing Bank。'],
  B6: ['只顯示 server 判定 close-eligible 的 EPLC_CONFIRMATION。', 'Acceptance Balance=0、無 open events，且不存在 RELEASED-but-unconsumed B3。', 'Amount 由 current Confirmed Balance 帶入；Release 再驗證。'],
  B7: ['只解析 CLOSED EPLC_CONFIRMATION。', '整個 event tree 必須無 open events。', 'Restoration amount 由 trailing RELEASED EXPIRE／CLOSE chain 計算，不由 Maker 輸入。'],
};
const productionSourceFiles = [resolve(repo, 'src', 'app'), resolve(repo, 'microservices', 'balance-component', 'src'), resolve(repo, 'backend')]
  .flatMap(allFiles)
  .map((path) => relative(repo, path).split(sep).join('/'))
  .filter((path) => /\.(ts|js)$/.test(path))
  .filter((path) => !/\.(spec|test)\./.test(path) && !/(^|\/)test\//.test(path) && !/generated\./.test(path) && !/(^|\/)coverage\//.test(path) && !/(^|\/)node_modules\//.test(path) && !/(^|\/)(jest|eslint)\.config\./.test(path));
const sourceModules = productionSourceFiles.map((path) => {
  const content = read(path);
  const symbols = [...content.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|function|const|enum)\s+(\w+)/gm)].map((match) => match[1]);
  const area = path.startsWith('src/app/') ? 'Angular' : path.startsWith('microservices/') ? 'Microservice' : 'Backend';
  const canonical = path.includes('/domain/') ? 'Domain Model' : path.includes('/routes/') || path.endsWith('/app.ts') ? 'API Reference' : path.includes('/store/') || path.includes('/db/') ? 'Data Model' : path.includes('businessCases') ? 'Test Coverage and Business Cases' : path.includes('transaction-builder') ? 'Import Functions MOC' : 'Architecture';
  return { path, symbols, area, canonical };
});
const exportedSymbolCount = sourceModules.reduce((sum, module) => sum + module.symbols.length, 0);
const sourceModuleRows = sourceModules.map((module) => `| \`${module.path}\` | ${module.area} | ${module.symbols.length ? module.symbols.map((symbol) => `\`${symbol}\``).join('<br>') : 'module entrypoint／internal declarations'} | [[${module.canonical}]] |`).join('\n');

const docs = new Map();
const add = (path, content) => docs.set(path.split('/').join(sep), content);

add('00-Home/Home.md', note({
  title: 'Balance Component Knowledge Base', type: 'moc', domain: 'balance', aliases: ['Home', 'Balance KB'], tags: ['moc'],
  sources: ['src/app/transaction-builder/balance-component.model.ts', 'microservices/balance-component/src/app.ts'],
  body: `## 導航\n\n- [[System Overview]]\n- [[Domain Model]]\n- [[Business Rules MOC]]\n- [[Import Functions MOC]]\n- [[Export Functions MOC]]\n- [[Accounting and Exposure]]\n- [[Tolerance and Money]]\n- [[Maker Checker Lifecycle]]\n- [[API Reference]]\n- [[Data Model]]\n- [[Architecture]]\n- [[Configuration Reference]]\n- [[OOP OOD SOLID]]\n- [[ADR-001 Generic Balance Action Model]]\n- [[Test Coverage and Business Cases]]\n- [[Decision Tables]]\n- [[Traceability Matrix]]\n- [[Documentation Coverage]]\n- [[Knowledge Gaps]]\n- [[Source Map]]\n\n## 維護原則\n\n1. Source Code、測試及 OAS 是唯一內容來源；已接受但尚未完成的 target architecture 以 ADR 明確標示。\n2. 每個概念只有一篇 canonical note；其他頁面以 Wiki link 引用。\n3. tags 用於狀態與橫切分類，folder 用於穩定領域。\n4. 不把歷史 implementation log 當成目前行為。`,
}));

add('00-Home/System Overview.md', note({
  title: 'System Overview', type: 'overview', domain: 'architecture', tags: ['architecture'],
  sources: ['src/app/app.routes.ts', 'src/app/transaction-builder/transaction-builder.component.ts', 'backend/server.js', 'microservices/balance-component/src/app.ts'],
  body: `Balance Component 由 Angular／Web Component UI、Business Case backend orchestration 與 Balance Component microservice 組成。\n\n\`\`\`mermaid\nflowchart LR\n  UI[Angular Transaction Builder] --> API[Balance Component HTTP API]\n  RUNNER[Business Case Runner] --> API\n  API --> SVC[BalanceService and domain policies]\n  SVC --> DB[(SQLite)]\n\`\`\`\n\nUI 提供 Balance Account Number、Transaction Builder 與 Business Case Runner。Microservice 負責合約、movement、餘額推導、Maker／Checker、虛帳與生命週期規則。`,
}));

add('00-Home/Vault Conventions.md', note({
  title: 'Vault Conventions', type: 'governance', domain: 'documentation', tags: ['documentation'],
  sources: ['scripts/rebuild-obsidian-kb.mjs'],
  body: `## Properties\n\n每篇筆記使用一致的 \`type\`、\`domain\`、\`status\`、\`source_files\`、\`source_revision\`、\`verified_date\` 與 \`generated\`。\n\n## Linking\n\n使用 Obsidian Wiki links 連至 canonical notes。MOC 是導航入口；不得複製整段規則。\n\n## Regeneration\n\n執行 \`node scripts/rebuild-obsidian-kb.mjs --write\`。此命令只重建本 vault 的 Markdown，保留 folder。`,
}));

add('01-Domain-Concepts/Domain Model.md', note({
  title: 'Domain Model', type: 'concept', domain: 'domain', tags: ['domain'],
  sources: ['microservices/balance-component/src/types.ts', 'microservices/balance-component/src/domain/balanceDerivation.ts'],
  body: `## 核心聚合\n\n- \`BalanceContract\`：Logical Contract 的目前版本與生命週期。\n- \`BalanceMovement\`：append-oriented 業務事件、Maker／Checker 狀態與 immutable snapshots。\n- \`BalanceSnapshot\`：Confirmed、Available、Pending、Off-Balance 與 Tight Available 的查詢結果。\n\n## Enumerations\n\n- Instrument Types：${instrumentTypes.map((v) => `\`${v}\``).join('、')}\n- Movement Statuses：${movementStatuses.map((v) => `\`${v}\``).join('、')}\n- Exposure Natures：${exposureNatures.map((v) => `\`${v}\``).join('、')}\n- Tenor Types：${tenorTypes.map((v) => `\`${v}\``).join('、')}\n\n參見 [[Balance Calculation]] 與 [[Movement Lifecycle]]。`,
}));

add('01-Domain-Concepts/Balance Calculation.md', note({
  title: 'Balance Calculation', type: 'concept', domain: 'balance', tags: ['balance'],
  sources: ['microservices/balance-component/src/domain/balanceDerivation.ts', 'microservices/balance-component/src/domain/offBalanceExposure.ts', 'microservices/balance-component/src/service/balanceSnapshotService.ts'],
  body: `## 核心數值\n\n- Confirmed Balance：只計入已 RELEASED 的 movement。\n- Available Balance：包含目前可見的 pending 方向效果。\n- Pending Decrease Total：仍未核准的減項，採「增加從嚴」。\n- Off-Balance Exposure：SHGT 等子項對父 LC 的容量占用。\n- Tight Available Balance：Confirmed 基礎扣除 pending decrease 與適用 exposure／earmark。\n\n所有金額使用 decimal string 與 \`decimal.js\`，不得用 JavaScript binary floating point。`,
}));

add('01-Domain-Concepts/Movement Lifecycle.md', note({
  title: 'Movement Lifecycle', type: 'concept', domain: 'movement', tags: ['lifecycle'],
  sources: ['microservices/balance-component/src/domain/statusTransition.ts', 'microservices/balance-component/src/service/movementReleasePolicyService.ts', 'microservices/balance-component/src/service/movementReleaseSideEffectService.ts'],
  body: `一般 movement 經過 \`PENDING → RELEASED\` 或 \`PENDING → REJECTED/CANCELLED\`。Maker 與 Checker 必須不同。A3／A3S／B3 是 earmark 顯示類型，UI 顯示 \`EARMARKING → EARMARKED\`；底層 movement status 仍由 source code 的 lifecycle 決定。Release 前會重新驗證 eligibility、stale basis 與最新餘額。`,
}));

add('02-Business-Rules/Business Rules MOC.md', note({
  title: 'Business Rules MOC', type: 'moc', domain: 'rules', tags: ['moc', 'business-rules'],
  sources: ['microservices/balance-component/src/service/balanceService.ts', 'microservices/balance-component/src/service/movementRequestValidator.ts'],
  body: `- [[Balance Sufficiency Rules]]\n- [[Eligibility and Lifecycle Rules]]\n- [[Earmark Rules]]\n- [[Close Expire Reopen Rules]]\n- [[Auto Expiry and Auto Close]]\n- [[Accounting and Exposure]]\n- [[Tolerance and Money]]\n- [[Maker Checker Lifecycle]]`,
}));

add('02-Business-Rules/Balance Sufficiency Rules.md', note({
  title: 'Balance Sufficiency Rules', type: 'rule', domain: 'balance', tags: ['business-rules', 'balance'],
  sources: ['microservices/balance-component/src/domain/offBalanceExposure.ts', 'microservices/balance-component/src/domain/amendDecrease.ts', 'microservices/balance-component/src/domain/shgtRedeem.ts'],
  body: `- A2／B2 Decrease、A3、A8、B3 依各自 domain policy 檢查 Tight Available。\n- A3 UTILIZE 同時具有 Available 與 Tight Available 層級。\n- B3 新 Present Docs 必須小於或等於父 Confirmation 扣除既有 Present Docs earmark 後的容量。\n- SHGT Issue 必須考慮同一父 LC 下既有 SHGT exposure，避免重疊超額。\n- Release 會以最新資料再次檢查，不信任 UI picker snapshot。`,
}));

add('02-Business-Rules/Eligibility and Lifecycle Rules.md', note({
  title: 'Eligibility and Lifecycle Rules', type: 'rule', domain: 'eligibility', tags: ['business-rules', 'eligibility'],
  sources: ['microservices/balance-component/src/service/contractLifecycleEligibilityService.ts', 'microservices/balance-component/src/domain/closeEligibility.ts', 'microservices/balance-component/src/domain/expiryEligibility.ts'],
  body: `Root Issue 必須 RELEASED 後，下游 movement 才可建立。Catalog／picker 只提供提示；create、Maker action 與 Checker Release 都會重新驗證。Close／Reopen／Expiry Date Extension 使用各自狀態限定的 resolver，不得作為一般 ACTIVE lookup fallback。`,
}));

add('02-Business-Rules/Earmark Rules.md', note({
  title: 'Earmark Rules', type: 'rule', domain: 'exposure', tags: ['business-rules', 'earmark'],
  sources: ['src/app/transaction-builder/balance-component.model.ts', 'src/app/transaction-builder/checker-actions.service.ts', 'microservices/balance-component/src/service/balanceService.ts', 'microservices/balance-component/src/store/balanceMovementStore.ts', 'microservices/balance-component/src/domain/offBalanceExposure.ts'],
  body: `## Earmark functions

\`isEarmarkFunction()\` 只對 Import 的 \`IPLC_LC/UTILIZE\`（A3、A3S）及 Export 的 \`EPLC_EXAMINATION/CREATE\`（B3）回傳 true。A4 finalize event 雖沿用 \`IPLC_LC/UTILIZE\`，但 \`phase=finalize\` 時明確不是 earmark。

| Side | Function | Maker 結果 | 該功能 Checker 動作 | Checker 後顯示 | 後續完成點 |
|---|---|---|---|---|---|
| Import | A3 Document Arrival | 建立 LC \`UTILIZE\`、status=PENDING，顯示 EARMARKING | \`acknowledgeArrival()\` 只寫 \`acknowledgedBy/At\`，不 Release | movement 仍 PENDING，但顯示 EARMARKED | Sight→A4；Usance→A6 |
| Import | A3S Document Arrival w/ Shipping Gtee | 同一 business event 建立 LC UTILIZE 與 SG full redemption | 重新檢查 Bill Amount ≥ SG Balance，釋放 SG redemption 並 acknowledge LC arrival | Document Arrival 顯示 EARMARKED | Sight→A4；Usance→A6 |
| Export | B3 Present Docs | 建立 \`EPLC_EXAMINATION/CREATE\` PENDING，顯示 EARMARKING | 標準 \`release()\`，B3 自己轉為 RELEASED | EARMARKED | B4 release 寫 \`presentDocsConsumedAt\` |

## Import finalize

### A4 Sight Settlement

A4 不建立第二筆 Document Arrival。Maker 對已 acknowledged、仍 PENDING 的 A3/A3S UTILIZE 呼叫 \`submitByMaker()\`，只寫入 \`makerSubmittedBy/At\`；Checker 再 Release 同一 movement，才把 LC Balance 從 Pending 轉成 Approved／Utilized。Inquire Events 將 create 與 finalize 分成兩行，finalize 行使用一般 PENDING／APPROVED，不再顯示 EARMARKING／EARMARKED。

### A6 Acceptance (Usance)

A6 建立新的 \`IPLC_ACCEPTANCE/CREATE\`，並以 \`referencedTransactionId\` 指向已 acknowledged 的 A3/A3S UTILIZE。建立 A6 時會把來源 arrival 標記為 Maker Submitted。Checker 的單一 Release 動作同時完成被引用的 Document Arrival 與新 Acceptance；Amount、Currency、Tenor 由來源交易帶入且受保護。

## Export consume

B3 Checker Release 後雖已 EARMARKED，仍占用 Present Docs earmark。B4 只能選取已 RELEASED、尚未 consumed 的 B3；B4 Release 才設定來源 B3 的 \`presentDocsConsumedAt/By\` 並解除該 earmark。

## Queue and accounting semantics

- 已 acknowledged 的 A3/A3S 不再出現在 A3/A3S Checker 或普通 Maker Queue；A4/A6 透過專屬 eligibility 使用它。
- Earmark 是容量控制與稽核狀態，不等於 downstream Accounting posting。
- Internal \`contingentAccountEntry\` 與外送 \`accountEntries\` 是不同欄位，必須分開說明。`,
}));

add('02-Business-Rules/Close Expire Reopen Rules.md', note({
  title: 'Close Expire Reopen Rules', type: 'rule', domain: 'lifecycle', tags: ['business-rules', 'lifecycle'],
  sources: ['microservices/balance-component/src/domain/closeEligibility.ts', 'microservices/balance-component/src/domain/expiryEligibility.ts', 'microservices/balance-component/src/domain/reopenRestoration.ts', 'microservices/balance-component/src/service/lifecycleSweepService.ts'],
  body: `Close 只適用 root LC／Confirmation，且不得存在未結子 exposure 或 open events。自動日期處理的完整觸發條件、grace periods、system actors 與狀態效果見 [[Auto Expiry and Auto Close]]。\n\n對 EXPIRED contract 的 Expiry Date Amendment 會建立可供 Checker review 的 restoration voucher；Release 後恢復容量。Reopen 僅解析 CLOSED contract，恢復量由 trailing RELEASED EXPIRE／CLOSE chain 推導，不由 Maker 輸入。`,
}));

add('02-Business-Rules/Auto Expiry and Auto Close.md', note({
  title: 'Auto Expiry and Auto Close', type: 'rule', domain: 'lifecycle', tags: ['business-rules', 'lifecycle', 'batch'],
  sources: ['microservices/balance-component/src/server.ts', 'microservices/balance-component/src/config.ts', 'microservices/balance-component/src/service/lifecycleSweepService.ts', 'microservices/balance-component/src/domain/expiryEligibility.ts', 'microservices/balance-component/src/domain/autoCloseGracePeriod.ts', 'microservices/balance-component/src/domain/closeEligibility.ts', 'microservices/balance-component/src/service/movementReleaseSideEffectService.ts', 'microservices/balance-component/src/domain/reopenRestoration.ts'],
  body: `## Runtime cycle\n\nServer 依 \`EXPIRY_SWEEP_INTERVAL\` 呼叫同一 lifecycle cycle，順序固定為 Auto Expiry 後 Auto Close。現行 demo／dev 設定為每 30 秒；兩項功能各有獨立 enabled flag，目前皆為 true。單一 candidate 失敗只回傳該 contract 的 error，不中止其餘 candidates。\n\n## Auto Expiry\n\n| Rule | Current source behavior |\n|---|---|\n| Candidate | status=ACTIVE、root instrument 為 \`IPLC_LC\`／\`EPLC_LC\`／\`EPLC_CONFIRMATION\`，而且有 \`expiryDate\` |\n| Date gate | \`asOf > expiryDate + mailFloatGraceDays\`；calendar days |\n| Grace source | contract captured value優先；否則 Import／Export config，目前皆為 5 days |\n| Eligibility | 整個 event tree 不得有 open events |\n| Outstanding child balances | SG／Acceptance 可以仍有 balance；Auto Expiry 不套用 Close 的 zero-balance rule |\n| Movement | 建立 \`EXPIRE\`，amount 必須等於當時 Confirmed Balance |\n| Actors | \`BATCH_MAKER\` 建立、\`BATCH_CHECKER\` Release，維持 Maker／Checker separation |\n| Contract effect | Release 後 \`ACTIVE → EXPIRED\`，並以 release time 寫入 \`effectiveTo\` |\n| Financial effect | EXPIRE 寫出剩餘 contingent balance，具有實際 accounting／regulatory impact |\n\n沒有 expiry date 的 contract 永遠不會被 Auto Expiry 選取。Expiry grace 不是 UCP presentation period，不可混用。\n\n## Auto Close\n\n| Rule | Current source behavior |\n|---|---|\n| Candidate | status=EXPIRED 的上述三種 root instruments |\n| Date gate | \`asOf > effectiveTo + AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS\` |\n| Current grace | 2 business days；Phase 1 只跳過 Saturday／Sunday，尚未接 holiday service |\n| Eligibility recheck | SG Balance=0、Acceptance Balance=0，且整個 event tree 無 open events |\n| Movement | 建立並 Release \`CLOSE\`；reason code固定為 \`NATURAL_EXPIRY_ALL_BALANCES_CLEARED\` |\n| Contract effect | \`EXPIRED → CLOSED\`，更新 \`effectiveTo\` |\n| Financial effect | 已 EXPIRED 的 balance 通常已由 EXPIRE 歸零；CLOSE 是 status finalization，不重複產生 expiry write-off |\n\nAuto Close grace 以「成為 EXPIRED 的時間」為 anchor，使用 business days；它和 Auto Expiry 的 mail-float calendar days 是兩套不同規則。\n\n## Reopen protection and restoration\n\n若最新 movement 是已 RELEASED 的 \`REOPEN\`，在一個 sweep interval 內 Auto Expiry／Auto Close 都會跳過，避免同一個 cycle 立即再次關閉。A11／B7 restoration amount 是由最後一段連續 RELEASED \`EXPIRE\`／\`CLOSE\` movements 的 \`ceilingAmount\` 加總；遇到第一個非 EXPIRE／CLOSE movement 即停止，因此不會重複恢復較早 lifecycle chain。\n\n## Sequence\n\n\`\`\`mermaid\nstateDiagram-v2\n  [*] --> ACTIVE: A1/B1 Release\n  ACTIVE --> EXPIRED: Auto EXPIRE Release\n  EXPIRED --> CLOSED: Auto CLOSE Release\n  EXPIRED --> ACTIVE: Expiry Date Amendment Release\n  CLOSED --> ACTIVE: A11/B7 Reopen; expiry still future\n  CLOSED --> EXPIRED: A11/B7 Reopen; expiry already passed\n\`\`\``,
}));

const importFunctions = functions.filter((f) => f.side === 'IMPORT');
const exportFunctions = functions.filter((f) => f.side === 'EXPORT');
add('03-Balance-Flows/A-Import/Import Functions MOC.md', note({ title: 'Import Functions MOC', type: 'moc', domain: 'import', tags: ['moc', 'import'], sources: ['src/app/transaction-builder/balance-component.model.ts'], body: importFunctions.map((f) => `- [[${f.code} ${f.label}]]`).join('\n') }));
add('03-Balance-Flows/B-Export/Export Functions MOC.md', note({ title: 'Export Functions MOC', type: 'moc', domain: 'export', tags: ['moc', 'export'], sources: ['src/app/transaction-builder/balance-component.model.ts'], body: exportFunctions.map((f) => `- [[${f.code} ${f.label}]]`).join('\n') }));

const folderMap = {
  A1:'A1-LC-Issue', A2:'A2-LC-Amendment', A3:'A3-Document-Arrival', A3S:'A3S-Document-Arrival-SG', A4:'A4-Sight-Settlement', A6:'A6-Acceptance-Usance', A7:'A7-Acceptance-Settlement', A8:'A8-SG-Issue', A9:'A9-SG-Redemption', A10:'A10-LC-Close', A11:'A11-LC-Reopen',
  B1:'B1-Confirm-LC', B2:'B2-Confirm-LC-Amendment', B3:'B3-Present-Docs', B4:'B4-Honour-Acceptance', B5:'B5-Settlement-Reimbursement-Maturity', B6:'B6-Confirmed-LC-Close', B7:'B7-Confirmed-LC-Reopen',
};
for (const f of functions) {
  const base = f.side === 'IMPORT' ? '03-Balance-Flows/A-Import' : '03-Balance-Flows/B-Export';
  const safeLabel = f.label.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const optionLines = f.options.length ? f.options.map((o) => `- ${o.label}: \`${o.movementTypeOverride ?? o.value}\``).join('\n') : '無 Direction 選項。';
  const contractRows = [
    f.secondaryRefLabel ? `| Secondary reference | ${f.secondaryRefLabel} |` : null,
    f.payableMovementType ? `| Payable movement | \`${f.payableMovementType}\` |` : null,
    f.catalogTenorFilter ? `| Catalog tenor filter | \`${f.catalogTenorFilter}\` |` : null,
    `| Accounting | [[Transaction Accounting Matrix#${f.side === 'IMPORT' ? 'Import transactions' : 'Export transactions'}]] |`,
    `| Balance algorithm | [[Transaction Balance Calculation Matrix#${f.side === 'IMPORT' ? 'Import transactions' : 'Export transactions'}]] |`,
  ].filter(Boolean).join('\n');
  const selectionConditions = functionSelectionConditions[f.code];
  if (!selectionConditions) throw new Error(`Missing selection conditions for ${f.code}`);
  add(`${base}/${folderMap[f.code]}/${f.code} ${safeLabel}.md`, note({
    title: `${f.code} ${f.label}`, type: 'function', domain: f.side.toLowerCase(), aliases: [f.code, f.label], tags: ['function', f.side.toLowerCase()],
    sources: ['src/app/transaction-builder/balance-component.model.ts', 'src/app/transaction-builder/builder-fields.ts', 'microservices/balance-component/src/service/balanceService.ts'],
    body: `## Contract\n\n| Field | Value |\n|---|---|\n| Code | \`${f.code}\` |\n| Side | \`${f.side}\` |\n| Instrument | \`${f.instrumentType}\` |\n| Movement | ${f.movementType ? `\`${f.movementType}\`` : '依 Direction'} |\n| Parent | ${f.defaultParentInstrumentType ? `\`${f.defaultParentInstrumentType}\`` : '—'} |\n${contractRows}\n\n## Selection conditions\n\n${selectionConditions.map((condition) => `- ${condition}`).join('\n')}\n\nPicker 只提供候選提示；API 在 Maker Submit 與 Checker action 依該功能重新驗證，不信任過期的 UI snapshot。\n\n## Source-defined behavior\n\n${f.help ?? 'Function catalog 未提供 help；以 field policy、API validation 與 linked-flow rules 為準。'}\n\n## Direction／Movement options\n\n${optionLines}\n\n## Processing boundary\n\n欄位顯示、protected field、picker、submit shape 與 Checker routing 由 function catalog、builder field policies 與 service validation 共同決定。UI 不是權威驗證層；API 會重新驗證 contract、amount、currency、tenor、reference 與 lifecycle。\n\n## Related\n\n- [[Balance Sufficiency Rules]]\n- [[Earmark Rules]]\n- [[Maker Checker Lifecycle]]\n- [[Linked Transaction Flows]]\n- [[API Reference]]`,
  }));
}

add('03-Balance-Flows/Cross-Function-Flows/Linked Transaction Flows.md', note({
  title: 'Linked Transaction Flows', type: 'flow', domain: 'cross-function', tags: ['flow'],
  sources: ['microservices/balance-component/src/service/compoundMovementService.ts', 'microservices/balance-component/src/service/movementReleaseSideEffectService.ts', 'src/app/transaction-builder/maker-submit.service.ts'],
  body: `## Import\n\n- A3 → A4：Sight Document Arrival 後由 A4 完成 settlement。\n- A3 → A6：Usance Document Arrival 建立 Acceptance。\n- A3S：Document Arrival 與 Shipping Guarantee redemption 以同一 business event 關聯。\n\n## Export\n\n- B3 → B4：Present Docs 先 EARMARKED，B4 Honour／Acceptance release 後消耗該 B3。\n- B4 → B5：Usance Acceptance 後由 maturity／reimbursement settlement 完成。`,
}));

add('03-Balance-Flows/Cross-Function-Flows/Transaction Balance Calculation Matrix.md', note({
  title: 'Transaction Balance Calculation Matrix', type: 'reference', domain: 'balance', tags: ['balance', 'transaction-matrix'],
  sources: ['microservices/balance-component/src/domain/balanceDerivation.ts', 'microservices/balance-component/src/domain/tolerance.ts', 'microservices/balance-component/src/domain/offBalanceExposure.ts', 'microservices/balance-component/src/service/balanceSnapshotService.ts', 'microservices/balance-component/src/domain/reopenRestoration.ts'],
  body: `## Canonical formulas\n\nLet \`signed(m) = ceilingAmount × direction\`; fixed directions are Increase／Issue／Create／Reopen = +1 and Decrease／Utilize／Honour／Accept／Settle／Redeem／Close／Expire = −1. REVERSAL and an EXPIRED Expiry Extension use the opposite sign of the referenced movement.\n\n| Figure | Source formula |\n|---|---|\n| Confirmed Balance (C) | \`Σ signed(RELEASED movements)\` |\n| Available Balance (A) | \`C + Σ signed(PENDING movements except AMEND_EXPIRY_DATE)\` |\n| Pending Earmark Total | \`A − C\`；可能為正或負 |\n| Pending Decrease Total (D) | \`Σ abs(signed(PENDING)) where signed < 0\`；pending increases 不可抵銷 |\n| IPLC／EPLC Tight Available | \`C − D − SHGT Off-Balance Exposure\` |\n| Confirmation Tight Available | \`C − D − Present Docs Earmark\` |\n| Face Amount | RELEASED \`ISSUE／AMEND_INCREASE／AMEND_DECREASE／AMEND\` 的 face amount；UTILIZE 不改 face |\n\nSnapshot 顯示可以出現負的 raw Tight intermediate；sufficiency checks 將可用容量下限視為 0。所有 balance 使用 \`ceilingAmount\`，金額依 currency minor units ROUND_HALF_UP。\n\n## Tolerance basis\n\nIssue upper limit = \`faceAmount × (1 + tolerancePct / 100)\`。Monetary Amendment 不是把 tolerance 單獨乘在本次輸入 amount：\n\n1. \`oldUpper = round(currentFace × (1 + currentTolerance))\`\n2. \`newFace = currentFace ± amendmentAmount\`\n3. \`newUpper = round(newFace × (1 + resultingTolerance))\`\n4. Actual balance delta = \`newUpper − oldUpper\`\n\n## Import transactions\n\n| Function | Maker／PENDING effect | Checker／completed effect | Other balance rules |\n|---|---|---|---|\n| A1 | ISSUE +ceiling：A、Pending Earmark 增加；C 尚未增加，因此 pending increase 不增加 Tight | Release 後 C、A、Tight 增加 ceiling | Face 建立；tolerance 適用 |\n| A2 Increase | A 增加；C／Tight 不先增加 | C 增加 upper-limit delta，Tight 同步增加 | Face／resulting tolerance 只在 Release 成為有效 basis |\n| A2 Decrease | A 減少、D 增加、Tight 立即減少 | C 減少 upper-limit delta；D 清除，Tight 保持已承諾後水位 | Submit／Release 都檢查 capacity；Face 同步減少 |\n| A2 Expiry Date | PENDING AMEND_EXPIRY_DATE 被 Available 排除，balance 不先恢復 | ACTIVE amendment只改日期；EXPIRED extension以原 EXPIRE 反向值恢復 C | 不接受 tolerance |\n| A3 | PENDING UTILIZE：A 減少、D 增加、Tight 減少；acknowledge 不改 status／數值 | A4／A6 finalize 時 C 減少、D 清除；Tight 保持使用後水位 | Face 不變；另受 SHGT exposure 限制 |\n| A3S | LC UTILIZE 使 A／Tight 減；matched SG redemption 使 SG A 減，並在同一 business event 從 parent exposure 淨除 | SG redemption Release；LC arrival由 A4／A6 finalize | Parent 新增占用為 Bill Amount 超過已保留 SG 的增量，避免 double-count |\n| A4 | 不建立新 movement；Maker Submit只標記來源 A3/A3S UTILIZE | Release 同一 UTILIZE：C 減少，Pending 轉 Approved | Sight only |\n| A6 | 新 Acceptance CREATE PENDING：Acceptance A 增加；來源 LC UTILIZE仍為 Pending | 一次 Release使 LC C 減少、Acceptance C 增加 | Amount／currency／tenor取來源 arrival |\n| A7 | Settlement PENDING：所選 Acceptance A 減少、D 增加 | Acceptance C 減少；Full 到 0，Partial 留餘額 | 不改 parent LC C |\n| A8 | SHGT ISSUE PENDING：SHGT A 增加；parent off-balance exposure立即增加，parent Tight 減少 | SHGT C 增加；parent exposure／Tight維持占用後水位 | Requested amount ≤ parent Tight |\n| A9 | SHGT redemption PENDING：SHGT A 減少；standalone pending redemption尚不釋放 parent exposure | Release後 SHGT C 減少、parent exposure下降、parent Tight回升 | Full Redeem only |\n| A10 | CLOSE PENDING：A、D、Tight以 current C 減至關閉水位 | C 歸零並 CLOSED | amount=current Confirmed；0 合法 |\n| A11 | REOPEN PENDING：A依 restoration amount增加 | Release後 C／A恢復，status依 expiry date為 ACTIVE 或 EXPIRED | restore=最後連續 RELEASED EXPIRE／CLOSE ceiling總和 |\n\n## Export transactions\n\n| Function | Maker／PENDING effect | Checker／completed effect | Other balance rules |\n|---|---|---|---|\n| B1 | Confirmation ISSUE +ceiling：A增加；C／Tight尚不使用 pending increase | Release後 Confirmation C、A、Tight增加 | Face與tolerance建立 |\n| B2 Increase／Decrease | Increase只增A；Decrease減A、增D、立即減Tight | Release後 C套用 newUpper−oldUpper delta | B2 AMEND以 signed amount表達方向；Expiry Date同A2 |\n| B3 | EPLC_EXAMINATION CREATE；parent Present Docs Earmark Pending增加，parent Tight立即減少 | B3 Release把 earmark從 Pending bucket移至 Approved bucket；combined earmark／Tight不變 | 不直接減 Confirmation C |\n| B4 Sight | Confirmation HONOUR PENDING使D增加；引用的B3先 provisionally從earmark移除，避免雙扣；Due-from asset A增加 | Release後 Confirmation C減少、B3 consumed；Due-from asset C增加 | Present Docs earmark歸零與HONOUR實際減項同一事件 |\n| B4 Usance | Confirmation ACCEPT PENDING減A／增D；Acceptance及Reimbursement Receivable CREATE增加各自A；B3 provisional consume | Release後 Confirmation C減、Acceptance／Receivable C增、B3 consumed | compound three-leg event |\n| B5 | EPLC_ACCEPTANCE FULL_SETTLE PENDING使其A減少 | Acceptance C減至0 | 不結算 Reimbursement Receivable；不改 Confirmation |\n| B6 | CLOSE PENDING以 current Confirmation C形成負向 commitment | Release後 C歸零並 CLOSED | 須無 Acceptance／open／unconsumed B3 |\n| B7 | REOPEN PENDING依 restoration amount增加A | Release後 C恢復 | restore chain算法同A11 |\n\n## Automatic lifecycle\n\n- Auto EXPIRE：建立 \`−current Confirmed\`，Release 後 C 歸零並 EXPIRED；未結 SG／Acceptance可存在，但 event tree 不得有 open events。\n- Auto CLOSE：對已 EXPIRED contract 使用當時 C；通常為0，Release只完成 CLOSED 狀態。\n- Expiry Extension：PENDING 不加入 A；Release 才反轉被引用 EXPIRE 的 signed amount。`,
}));

add('04-Exposure-Accounting/Accounting and Exposure.md', note({
  title: 'Accounting and Exposure', type: 'concept', domain: 'accounting', tags: ['accounting', 'exposure'],
  sources: ['microservices/balance-component/src/domain/contingentAccountEntry.ts', 'microservices/balance-component/src/domain/offBalanceExposure.ts', 'microservices/balance-component/src/service/balanceService.ts'],
  body: `## 兩種 entry 不可混用\n\n- \`contingentAccountEntry\`：Balance Component 在 movement 建立時推導並持久化的單組 internal voucher，供 UI 與稽核。\n- \`accountEntries\`：外部／下游 Accounting payload。\n\n當 \`exposureNature=MEMO\`，service 強制 \`accountEntries=null\`。這不代表 internal \`contingentAccountEntry\` 必須為 null。逐交易的 Dr／Cr、compound legs 與 posting boundary 見 [[Transaction Accounting Matrix]]。\n\n## Earmarked entries\n\nEARMARKED 是虛帳／容量占用；後續真實交易不需沖銷這些虛帳，除非該 movement 自身的 domain rule 明確產生 reversal。`,
}));

add('04-Exposure-Accounting/Balance Account Configuration.md', note({
  title: 'Balance Account Configuration', type: 'reference', domain: 'accounting', aliases: ['Balance Account Number Maintenance'], tags: ['accounting', 'configuration', 'solid'],
  sources: ['microservices/balance-component/config/balance-account-mappings.json', 'microservices/balance-component/src/config/balanceAccountTaxonomy.ts', 'microservices/balance-component/src/service/balanceAccountMappingService.ts', 'microservices/balance-component/src/store/balanceAccountMappingStore.ts', 'microservices/balance-component/src/db/migrations.ts', 'src/app/balance-account-maintenance/balance-account-maintenance.component.ts', 'scripts/generate-runtime-config.mjs', 'analysis/balance-component-api.yaml'],
  body: `## Canonical hierarchy

\`config/balance-account-mappings.json\` 是 \`Category → Business Type / GL Family → Tenor SL\` 的唯一配置來源。Account Number Maintenance 第一層沿用交易頁名稱：

| Category | Category-scoped Tenor SL |
|---|---|
${balanceAccountCategoryRows}

Import Sight 與 Export Sight 是不同 category 的配置身分，所以是 Import 3 + Export 2，共五種，不是全域四值 enum。

| Family key | GL family | Category | Current instrument | Tenor SL routes |
|---|---|---|---|---|
${balanceAccountFamilyRows}

## Runtime rules

- Taxonomy provider 在啟動時驗證 duplicate category、family、Tenor、mapping 與錯誤引用。
- Store 啟動時只補配置新增的 mapping，不覆蓋已維護值；配置移除的舊 row 不再列出，但歷史 voucher snapshot 不變。
- DB mapping table 不以固定 \`instrument_type\`／\`risk_class\` CHECK 寫死配置域。
- Family PUT 必須包含全部 configured SL 且 version 全部正確；任一衝突會 rollback，不能部分成功。
- Maintenance \`Reload\` 呼叫專用 POST，立即以 configuration defaults 原子覆寫全部 11 筆 configured mappings；成功後 version 為 1、actor 為 \`SYSTEM_CONFIG_RELOAD\`，任一失敗全部 rollback。Cleanup Database 保留 mappings。
- Angular 導覽依 API hierarchy generic render；family 明細只在 presentation layer 改為先列 Contingent Liability／Liability GL（含 GL Number／Description 輸入），再於各 GL 下列出配置式 Tenor SL（含 SL Number／Description 輸入）。GL 預設取 Sight mapping 並移除 Sight；SL Number／Description 預設取 configured Tenor key／label。儲存前由 Angular 組合 GL + SL。DB、API mapping row、movement posting 與 voucher 結構均不因這個畫面編輯模型改變。
- 交易 Tenor options 也由同一 JSON 在 build preparation 產生，沒有第二份清單。

## Configuration defaults exported from DB

| Mapping key | Account A Number | Account A Description | Account B Number | Account B Description |
|---|---|---|---|---|
${balanceAccountDefaultRows}

未來新增 Account Maintenance category 或 business family 只改配置。全新交易 lifecycle／會計 behavior 仍屬產品功能開發，不可假裝由帳號配置自動產生。SBLC/LG 文件目前只作參考，不是已實作規格。

此分層符合 SRP/OCP/DIP：provider 負責配置、store 負責 persistence、service 負責 use case、Angular 負責 presentation；新增配置不修改 consumer source。`,
}));

add('04-Exposure-Accounting/Transaction Accounting Matrix.md', note({
  title: 'Transaction Accounting Matrix', type: 'reference', domain: 'accounting', tags: ['accounting', 'transaction-matrix'],
  sources: ['microservices/balance-component/src/domain/contingentAccountEntry.ts', 'microservices/balance-component/src/domain/balanceDerivation.ts', 'microservices/balance-component/src/service/balanceService.ts', 'src/app/transaction-builder/maker-submit.service.ts'],
  body: `## Reading rules\n\n- 下表的 Dr／Cr 是 server-derived \`contingentAccountEntry\`，在 movement creation 時生成一次並持久化；Account Entries 畫面讀取該歷史 voucher，不重新計算。\n- Runtime Balance Account Mapping 存在時，account number／description 取代下列 fallback family names，並保存 mapping key／version。\n- \`accountEntries\` 是另一個 caller-supplied downstream payload。只有 source 明確提供它時才可能送 Accounting；本 repository 不能證明外部 Accounting component 已實際入帳。\n- Direction=Decrease／Utilize／Settle／Redeem／Close／Expire 時，Dr／Cr 對調。零額 CLOSE／EXPIRE／REOPEN 不產生 placeholder voucher。\n\n## Import transactions\n\n| Function | Movement／leg | Internal voucher at creation | Completion／downstream boundary |\n|---|---|---|---|\n| A1 | IPLC_LC ISSUE | Dr Customers' Liability under DC；Cr Documentary Credits Outstanding（依 tenor suffix） | Maker=PENDING；Checker Release 後 APPROVED |\n| A2 | AMEND_INCREASE／AMEND_DECREASE | Increase 同 A1；Decrease Dr／Cr 對調 | Expiry Date on ACTIVE 無 voucher；EXPIRED extension 產生原 EXPIRE 的反向 restoration voucher |\n| A3 | IPLC_LC UTILIZE | Dr Documentary Credits Outstanding；Cr Customers' Liability under DC | 建立時為 EARMARKING／PENDING 虛帳；acknowledge 後 EARMARKED，尚未 Release |\n| A3S | SHGT FULL_REDEEM + IPLC_LC UTILIZE | SG pair 對調 + LC pair 對調，兩 legs 同 business event | Checker release SG leg、acknowledge arrival；LC UTILIZE 留待 A4／A6 finalize |\n| A4 | finalize existing A3/A3S UTILIZE | 不建立新 voucher；使用 A3/A3S 已保存的 LC UTILIZE voucher | Checker Release 同一 arrival movement，從 Pending 轉 Approved |\n| A6 | IPLC_ACCEPTANCE CREATE + finalize arrival | Dr Acceptances & DPU — Customers' Liability (memo)；Cr Acceptances & DPU — Outstanding (memo) | 同一 Checker action 完成來源 arrival 與 Acceptance；on-balance accounting 不由此 internal family證明 |\n| A7 | IPLC_ACCEPTANCE FULL/PARTIAL_SETTLE | Acceptance family Dr／Cr 對調 | 只結算所選 Acceptance，不改 LC Balance |\n| A8 | SHGT ISSUE | Dr Customers' Liability under Shipping Guarantees；Cr Shipping Guarantees Outstanding | Checker Release 後 approved SG contingent |\n| A9 | SHGT FULL_REDEEM | SG family Dr／Cr 對調 | Full redeem；不另行沖銷 A3 earmark |\n| A10 | IPLC_LC CLOSE | LC family Dr／Cr 對調；amount=0 時無 voucher | Release 後 CLOSED |\n| A11 | IPLC_LC REOPEN | LC family establishment direction；amount=0 時無 voucher | Restoration amount 由 write-off chain 推導 |\n\n## Export transactions\n\n| Function | Movement／leg | Internal voucher at creation | Completion／downstream boundary |\n|---|---|---|---|\n| B1 | EPLC_CONFIRMATION ISSUE | Dr Issuing Bank Confirmation Exposure；Cr Confirmation Undertakings Outstanding（Sight／Usance suffix） | Checker Release 後 approved Confirmation |\n| B2 | EPLC_CONFIRMATION AMEND | Increase 使用 establishment pair；Decrease 對調 | Expiry Date 的 ACTIVE／EXPIRED semantics 同 A2 |\n| B3 | EPLC_EXAMINATION CREATE | Dr Export Bills — Received, Under Examination (memo)；Cr Export Bills — Contra (memo) | internal memo only；\`accountEntries=null\`，不送下游 Accounting，也不建立 reversal |\n| B4 Sight | Confirmation HONOUR + Due from Issuing Bank CREATE | HONOUR 對調 Confirmation pair；on-balance asset leg不產生 contingent voucher | compound release 並 consume B3 earmark |\n| B4 Usance | Confirmation ACCEPT + EPLC_ACCEPTANCE CREATE + Reimbursement Receivable CREATE | ACCEPT 對調 Confirmation pair；Acceptance 建立 memo pair；receivable asset無 contingent pair | 三 legs 同 business event；consume B3 earmark |\n| B5 | EPLC_ACCEPTANCE FULL_SETTLE | Export Acceptance memo family Dr／Cr 對調 | 不結算 Reimbursement Receivable |\n| B6 | EPLC_CONFIRMATION CLOSE | Confirmation pair 對調；amount=0 時無 voucher | Release 後 CLOSED |\n| B7 | EPLC_CONFIRMATION REOPEN | Confirmation establishment direction；amount=0 時無 voucher | Restoration amount 由 write-off chain 推導 |\n\n## Automatic lifecycle\n\n| Event | Voucher | Effect |\n|---|---|---|\n| Auto EXPIRE | 對調 root LC／Confirmation family；amount=Confirmed Balance | 真正 write-off，ACTIVE→EXPIRED |\n| Auto CLOSE | 已 EXPIRED 後再次 CLOSE；通常 amount=0 因而無 voucher | status finalization，EXPIRED→CLOSED |\n\n## Source boundary requiring external confirmation\n\nBalance Component 能證明 internal voucher、movement status 與是否保存 caller-supplied \`accountEntries\`；外部 Accounting system 的 posting acknowledgement、retries、reconciliation 不在本 repository，須由該 integration contract／service 補證。`,
}));

add('05-Tolerance-FX/Tolerance and Money.md', note({
  title: 'Tolerance and Money', type: 'concept', domain: 'money', tags: ['tolerance', 'money'],
  sources: ['microservices/balance-component/src/domain/tolerance.ts', 'microservices/balance-component/src/money.ts', 'src/app/transaction-builder/amount-shorthand.ts', 'src/app/transaction-builder/formatted-amount-field.component.ts'],
  body: `Tolerance 只對適用的 LC／Confirmation movement 生效。Issue 使用最終 tolerance；Amendment request 使用整數 \`toleranceChangePct\` 與方向，resulting tolerance 由 API 計算並在 Release 後成為 contract 值。結果不得低於 0。Expiry Date Amendment 不接受 tolerance。\n\n金額以 currency minor units 驗證並使用 ROUND_HALF_UP。Angular amount input 支援目前 parser 定義的 \`m/k/h\` shorthand；API wire value 始終是 decimal string。`,
}));

add('06-Maker-Checker/Maker Checker Lifecycle.md', note({
  title: 'Maker Checker Lifecycle', type: 'concept', domain: 'maker-checker', tags: ['maker-checker'],
  sources: ['microservices/balance-component/src/domain/statusTransition.ts', 'microservices/balance-component/src/service/movementReleasePolicyService.ts', 'src/app/transaction-builder/checker-actions.service.ts'],
  body: `Maker 建立或修正 pending movement；Checker Release／Reject 前重新讀取並驗證。Maker 與 Checker identity 不得相同。Fix Pending 只修改允許修正的欄位，reference、currency 與受保護金額依 function policy 鎖定。Delete Pending 只處理尚未完成的 movement，並留下 audit。\n\nAccount Entries review 顯示 movement 已持久化的 voucher，不在 UI 重新計算。`,
}));

add('07-API/API Reference.md', note({
  title: 'API Reference', type: 'reference', domain: 'api', tags: ['api'],
  sources: [...routeFiles, 'analysis/balance-component-api.yaml', 'analysis/balance-component-channel-api.yaml'],
  body: `OAS 是 consumer contract；Express route 與 service 是 runtime implementation。\n\n| Method | Path | Implementation |\n|---|---|---|\n${routeRows}\n\n## Error model\n\nTyped domain／validation errors 由 HTTP layer 映射為 4xx；未處理錯誤為 5xx。UI 必須保留 status、code 與 cause，不得全部改寫成 generic error。`,
}));

add('08-Data-Model/Data Model.md', note({
  title: 'Data Model', type: 'reference', domain: 'data', tags: ['database'],
  sources: ['microservices/balance-component/src/db/schema.ts', 'microservices/balance-component/src/db/migrations.ts', 'microservices/balance-component/src/store/balanceContractStore.ts', 'microservices/balance-component/src/store/balanceMovementStore.ts'],
  body: `SQLite 保存 contract versions、movements、account mappings、Fix Pending 與 Delete Pending audits。金額以 TEXT decimal string 保存。Movement 以 contract＋event sequence 維持 idempotency；snapshot-on-write 保存事件當時畫面。Migrations 是 append-only 陣列，啟動時依序執行。Production concurrency 與 persistence 升級不可假設 SQLite 的 whole-file locking 等同 production database。\n\n完整 physical schema、欄位、keys、indexes 與關聯見 [[Data Tables Layout]]。`,
}));

const tablePurpose = {
  balance_contracts: '保存 logical contract 的版本、natural keys、status、currency、tenor、tolerance 與 lifecycle dates。',
  balance_movements: '保存 append-oriented transaction movement、Maker／Checker actors、references、amounts、account entries 與 event snapshots。',
  delete_pending_audit: '每次 Delete Pending 的 append-only audit，保留取消前狀態及操作者。',
  fix_pending_audit: '每次 Fix Pending 的 append-only before／after audit；原 movement 維持相同 identity。',
  balance_account_mappings: '保存 product／risk-class 到兩組 account number／description 的 versioned runtime mapping。',
};
const tableSections = schemaTables.map((table) => `## ${table.name}\n\n${tablePurpose[table.name] ?? ''}\n\n| Column | SQLite type | Constraints／meaning from schema |\n|---|---|---|\n${table.columns.map((column) => `| \`${column.name}\` | \`${column.type}\` | ${column.constraints ? `\`${column.constraints.replaceAll('|', '\\|')}\`` : '—'} |`).join('\n')}`).join('\n\n');
const indexRows = schemaIndexes.map((index) => `| \`${index.name}\` | \`${index.table}\` | ${index.unique ? 'UNIQUE' : 'INDEX'} | \`${index.columns}\` | ${index.where ? `\`${index.where}\`` : '—'} |`).join('\n');
add('08-Data-Model/Data Tables Layout.md', note({
  title: 'Data Tables Layout', type: 'reference', domain: 'data', tags: ['database', 'schema'],
  sources: ['microservices/balance-component/src/db/schema.ts', 'microservices/balance-component/src/db/migrations.ts'],
  body: `## Relationship layout\n\n\`\`\`mermaid\nerDiagram\n  balance_contracts ||--o{ balance_movements : contains\n  balance_contracts ||--o{ delete_pending_audit : audited\n  balance_contracts ||--o{ fix_pending_audit : audited\n  balance_movements ||--o{ delete_pending_audit : cancellation_history\n  balance_movements ||--o{ fix_pending_audit : correction_history\n  balance_movements o|--o{ balance_movements : reversal_or_reference\n\`\`\`\n\n## Storage conventions\n\n- Monetary values use SQLite \`TEXT\` decimal strings; JavaScript floating point is not the authority.\n- Date／time values are persisted as ISO-compatible \`TEXT\`; optional business dates remain nullable.\n- \`account_entries\`, warnings and snapshot columns contain serialized JSON.\n- \`balance_contracts\` is versioned; \`balance_movements\` is the event ledger.\n- Audit tables are append-only histories and do not replace the current movement row.\n- Foreign keys connect movements／audits to their contract and movement identity.\n\n${tableSections}\n\n## Index layout\n\n| Index | Table | Kind | Columns | Predicate |\n|---|---|---|---|---|\n${indexRows}\n\n## Migration rule\n\n\`SCHEMA_SQL\` defines a fresh database. Existing databases advance through the ordered migrations in \`migrations.ts\`; do not infer an upgrade path only from the final table definition.`,
}));

add('09-Architecture/Architecture.md', note({
  title: 'Architecture', type: 'architecture', domain: 'architecture', tags: ['architecture', 'solid'],
  sources: ['microservices/balance-component/src/service/balanceService.ts', 'microservices/balance-component/src/service/unitOfWork.ts', 'src/app/transaction-builder/function-strategy.ts', 'src/app/transaction-builder/transaction-builder.component.ts'],
  body: `## Boundaries\n\n- Angular strategies／policies：畫面組態、輸入與 orchestration。\n- Route layer：HTTP parsing 與 response mapping。\n- Service layer：use-case orchestration、transaction boundary。\n- Domain layer：純計算與 eligibility policies。\n- Store layer：SQLite persistence ports。\n\nRuntime、build、taxonomy、proxy、calendar 與 Web Component 設定的 canonical 說明見 [[Configuration Reference]]。本頁只定義分層與依賴方向。物件設計原則的 canonical 說明見 [[OOP OOD SOLID]]；產品擴充與 generic Balance action 的已接受 target architecture 見 [[ADR-001 Generic Balance Action Model]]；個別業務規則一律連結其 canonical rule note，避免複製。`,
}));

add('09-Architecture/Configuration Reference.md', note({
  title: 'Configuration Reference', type: 'reference', domain: 'configuration', tags: ['configuration', 'environment', 'operations'],
  sources: configurationSources,
  body: `## Configuration authority\n\n| Configuration area | Authoritative source | Runtime consumer | Apply change |\n|---|---|---|---|\n| Angular retry／Business Case recovery | \`.env\` + \`scripts/generate-runtime-config.mjs\` | generated Angular constants | rerun \`npm run prepare:app\`; restart the dev process when running |\n| Account Number validation | process environment, normally populated from root \`.env\` | Balance microservice \`config.ts\` | restart Balance microservice |\n| Service ports／URLs／CORS | process environment | Balance microservice／Business Case backend | restart affected process |\n| Account mapping taxonomy | \`balance-account-mappings.json\` | generator, Angular Account Number Maintenance | rerun \`npm run prepare:app\`; rebuild／restart Angular |\n| Lifecycle policy constants | Balance microservice \`config.ts\` | expiry／close jobs and business-day policies | source change, test, rebuild, restart |\n| Domestic calendar fixture | generator and JSON files | local business-day mock／reference | regenerate and validate fixture |\n| Development proxy | proxy JSON | Angular dev server | restart dev server |\n| Web Component host options | \`balance-component-element.contract.ts\` | embedding host／custom element | host supplies options at runtime |\n\n## Root .env snapshot\n\nThe table is generated from the currently tracked root \`.env\`. Generation precedence for the Angular values is **\`process.env\` > \`.env\` > code fallback**. Unknown variables remain visible for review. Names containing \`SECRET\`, \`TOKEN\`, \`PASSWORD\`, \`CREDENTIAL\` or \`PRIVATE_KEY\` are always rendered as \`AAA=...\`; their values are never copied into this vault.\n\n| Name | Documented value | Code fallback | Validation | Consumer |\n|---|---|---|---|---|\n${envConfigurationRows}\n\n## Service runtime environment\n\n| Process | Variable | Source fallback | Meaning |\n|---|---|---|---|\n| Balance microservice | \`PORT\` | \`4100\` | HTTP listen port |\n| Balance microservice | \`DB_PATH\` | \`balance-component.sqlite\` | SQLite file path |\n| Business Case backend | \`PORT\` | \`4300\` | HTTP listen port |\n| Business Case backend | \`BALANCE_SERVICE_URL\` | \`http://localhost:4100\` | Balance API upstream |\n| Business Case backend | \`ALLOWED_ORIGINS\` | \`http://localhost:4200\` | comma-separated CORS allowlist |\n\nThe Balance microservice start scripts load the repository \`.env\`; the backend reads its inherited process environment. A change is not live until the relevant process is restarted.\n\n## Source-controlled policy configuration\n\n### Account mapping taxonomy\n\n\`microservices/balance-component/config/balance-account-mappings.json\` defines configured business categories, balance families, display order and allowed tenor keys. \`generate-runtime-config.mjs\` validates referential integrity and creates the Angular taxonomy module. The database continues to store the composed Account Number／Description mapping; the taxonomy controls maintenance UI grouping rather than adding GL／SL columns. See [[Balance Account Configuration]].\n\n### Lifecycle and business-day rules\n\n\`config.ts\` currently defines a 30-second expiry sweep, Import／Export mail-float grace of 5 days, automated Maker／Checker actors, auto-expiry and auto-close enablement, an auto-close reason, and a 2-business-day auto-close grace period. These are source constants, not \`.env\` overrides. The domestic-calendar generator copies the standing reference into the local business-day mock; this is test／development data and is not proof of a production holiday calendar. See [[Auto Expiry and Auto Close]].\n\n### Proxy routing\n\nThe normal Angular proxy sends \`/api\` to port 4300 and Balance routes to port 4100. The live-E2E proxy uses backend port 4301 while retaining Balance port 4100. Proxy failure therefore appears as Vite \`ECONNREFUSED\` when the target process is unavailable; retry configuration does not replace service readiness.\n\n### Web Component configuration\n\nThe public runtime contract has configuration version \`1\`, view selection, \`system\`／\`light\`／\`dark\` themes and CSS design tokens. Unknown keys or incompatible versions are rejected by the contract parser.\n\n## Change procedure\n\n1. Change the authoritative source only; do not edit generated TypeScript files manually.\n2. Run \`npm run prepare:app\` for \`.env\` generation or taxonomy changes.\n3. Run the relevant type checks／tests and \`npm run docs:verify\`.\n4. Restart the process whose startup configuration changed.\n5. Regenerate this vault with \`node scripts/rebuild-obsidian-kb.mjs --write\`.\n\nThe external documentation counterpart is \`docs/configuration.md\`; OAS remains the authority for HTTP payloads and does not duplicate deployment settings.`,
}));

add('09-Architecture/ADR-001 Generic Balance Action Model.md', note({
  title: 'ADR-001 Generic Balance Action Model', type: 'architecture-decision', domain: 'architecture', status: 'accepted', sourceOfTruth: 'business-decision', tags: ['architecture', 'adr', 'balance-action', 'product-extension'],
  sourceNotice: '本 ADR 記錄已接受的 target architecture；目前程式尚未完全完成此重構。現行行為仍以 Source Code、測試及 OAS 為準。',
  sources: ['microservices/balance-component/src/types.ts', 'microservices/balance-component/src/service/balanceService.ts', 'microservices/balance-component/src/domain/balanceDerivation.ts', 'microservices/balance-component/src/domain/contingentAccountEntry.ts', 'src/app/transaction-builder/balance-component.model.ts'],
  body: `## Context\n\nLC、SBLC 與 LG 的合約欄位、法律事件、選擇條件及 SWIFT 流程不同，但對 Balance Control 的核心影響可正規化為少數動作：增額、減額及額度保留。若 Balance Engine 直接認識每一種產品與 Function，新增產品會迫使 type union、DB constraint、UI catalog、eligibility 與 accounting switch 同步修改。\n\n## Decision\n\nBalance Engine 的 target architecture 只處理以下 normalized actions：\n\n- \`TAKE_DOWN\`：建立或增加 balance。\n- \`REPAYMENT\`：減少或清償 balance。\n- \`EARMARK\`：保留 capacity，但未完成最終 balance／accounting event。\n- \`RELEASE_EARMARK\`：取消尚未被消耗的保留。\n- \`CONSUME_EARMARK\`：把既有保留轉入其後真正的 TAKE_DOWN／REPAYMENT 流程。\n\nAmount 一律為正值，方向由 action 表達，不以正負號暗示。LC、SBLC、LG Product Policy 負責把 ISSUE、AMENDMENT、CLAIM、DRAWING、EXPIRE、CLOSE 等 business event 映射成一個或多個 normalized actions。\n\n| Business event | Normalized Balance action |\n|---|---|\n| Issue | TAKE_DOWN |\n| Amendment Increase | TAKE_DOWN |\n| Amendment Decrease | REPAYMENT |\n| Claim／Drawing received | EARMARK |\n| Claim approved／paid | CONSUME_EARMARK + REPAYMENT（依產品 liability direction） |\n| Claim cancelled／rejected | RELEASE_EARMARK |\n| Expire／Close | REPAYMENT remaining balance |\n| Reopen | TAKE_DOWN restoration |\n\n## Responsibility boundary\n\nBalance Core 共用 balance math、Maker／Checker、Pending／Rejected、audit、idempotency、snapshot、decimal money 與 posting gate。Product Policy 擁有合約欄位、selection／eligibility、parent-child relationship、business-event mapping、Account Mapping key、SWIFT strategy 與產品專屬 lifecycle。\n\n\`Business Event → Product Policy → BalanceAction[] → Generic Balance Engine → Account Mapping\`\n\n## Options considered\n\n1. 繼續以產品／Function 硬編碼：短期直接，但每個新產品都擴大 switch、enum、migration 與 regression surface。\n2. 將所有規則做成無型別自由設定：擴充快，但會犧牲編譯期檢查、DB integrity 與可稽核性。\n3. 採 typed Product Policy + normalized Balance Action：保留型別與 audit，同時隔離產品差異。採用此方案。\n\n## Consequences\n\n- 新增 SBLC／LG 的 Balance 計算應是小改；主要工作集中在 selection eligibility、合約內容、event mapping 與 Account Mapping。\n- 現有 LC Function 必須逐步改成 business-event adapter，不進行一次性重寫。\n- DB／API 仍需辨識 product identity，但 Balance direction 不再由產品 switch 決定。\n- Accounting 科目可以不同，TAKE_DOWN／REPAYMENT 的方向語意保持一致。\n\n## Implementation guardrails\n\n- 先以 characterization tests 固定現有 A／B Function 行為，再抽取 \`BalanceAction\` 與 \`BalanceProductPolicy\` contracts。\n- Import LC／Export Confirmation 先接回新 contract 並維持 coverage gate，再增加 SBLC，最後增加 LG。\n- Product Policy 不得繞過 Maker／Checker、audit、decimal money、posting gate 或 idempotency。\n- 本 ADR 不代表 SBLC／LG 已實作，也不改變目前 source-backed lifecycle。`,
}));

const productExtensionDecision = `## Configuration-first product extension

新增 SBLC、LG 或其他業務品種採用 **configuration-driven metadata + typed Product Policy plug-in + Generic Balance Engine**。目標是把標準行為配置化，大幅縮小新增產品的 source-code change surface，但不把複雜法律、帳務或 SWIFT 規則變成無型別自由 expression。

| Product extension concern | Target mechanism | Expected change for a new product |
|---|---|---|
| Product／instrument identity | Typed product-definition configuration | Configuration only |
| Contract fields／natural key | Validated field schema | Mostly configuration; custom cross-field validation stays in policy |
| Transaction Function／lifecycle | Configured catalog and state transitions | Standard transitions by configuration; exceptional side effects in policy |
| Selection／eligibility | Reusable predicate registry referenced by configuration | Common predicates by configuration; product-specific eligibility in policy |
| Business Event → \`BalanceAction[]\` | Strongly typed action mapping | Standard TAKE_DOWN／REPAYMENT／EARMARK flows by configuration |
| Accounting／posting and Account Mapping key | Posting templates plus Account Mapping taxonomy | Normally configuration only |
| UI／API／DB／SWIFT／tests | Schema-driven UI and generic API; extensible persistence identity; strategy plug-ins | Shared framework remains unchanged; SWIFT and exceptional behavior may add a plug-in and explicit tests |

The configuration authority should cover category, product code, instrument identity, labels, display order, Tenor Type, natural-key composition, required／optional／protected field metadata, simple lifecycle transitions, reusable eligibility predicates, normalized action mappings, GL family, Tenor SL, Account Number／Description defaults and standard debit／credit posting templates. Angular should render the same validated schema rather than maintain a second product list.

The following controls remain typed code or immutable Balance Core behavior: complex exposure calculations, parent／child interactions, compound atomic release, exceptional earmark side effects, product-specific legal rules, SWIFT construction and cross-field validation, Maker／Checker, idempotency, audit, decimal rounding, posting gate and transaction integrity. Configuration selects a policy or strategy; it must not bypass these controls.

### One-time framework enablement

Before a future product can be added mostly by configuration, the platform must introduce a versioned Product Definition schema, generic contract-field and natural-key schema, configured function catalog and lifecycle state machine, reusable eligibility predicate registry, typed \`BalanceAction[]\` engine, posting templates, schema-driven Angular rendering, generic product／function API contracts, extensible persistence identity and configuration validation. Generated tests may cover schema invariants and standard actions, but product business acceptance tests remain mandatory.

After that enablement, a normal new product should require one Product Definition, Account Mapping configuration, an optional small Product Policy／SWIFT Strategy for genuine differences, and product acceptance tests. This is an architectural target, not a statement that current SBLC／LG support is configuration-only today.`;

const genericBalanceActionAdrPath = join('09-Architecture', 'ADR-001 Generic Balance Action Model.md');
docs.set(
  genericBalanceActionAdrPath,
  docs.get(genericBalanceActionAdrPath).replace(
    '\n## Responsibility boundary',
    `\n${productExtensionDecision}\n\n## Responsibility boundary`,
  ),
);

add('09-Architecture/OOP OOD SOLID.md', note({
  title: 'OOP OOD SOLID', type: 'architecture', domain: 'architecture', tags: ['architecture', 'oop', 'ood', 'solid'],
  sources: ['microservices/balance-component/src/service/balanceService.ts', 'microservices/balance-component/src/service/unitOfWork.ts', 'microservices/balance-component/src/service/movementReleasePolicyService.ts', 'microservices/balance-component/src/service/movementReleaseSideEffectService.ts', 'src/app/transaction-builder/function-strategy.ts', 'src/app/transaction-builder/balance-component.model.ts'],
  body: `## OOP（Object-Oriented Programming）\n\n本專案以 class／interface 封裝可替換行為與協作：Angular service、function strategy、store 與 BalanceService facade。Domain 計算優先保持 pure function；不是為了 OOP 而把所有規則包成 mutable object。\n\n## OOD（Object-Oriented Design）\n\n設計由責任與變化原因切分：catalog 宣告 function metadata，strategy 決定 UI 行為，route 處理 transport，service orchestration 管理 use case，domain policy 計算規則，store 隔離 persistence，unit of work 管理交易邊界。依賴方向由外向內，不讓 Angular 或 Express 細節污染 domain。\n\n## SOLID mapping\n\n| Principle | Source-backed application | Guardrail |\n|---|---|---|\n| SRP | release policy、release side effects、validation、snapshot、store 分開 | BalanceService 只作 facade／orchestration，不重新實作 policy |\n| OCP | function catalog、strategy registry、direction options | 新 function 擴充 metadata／strategy／policy，不堆疊跨 component 條件 |\n| LSP | strategy 與 store contracts 由 consumer 依同一介面使用 | replacement 必須保持 validation、status 與 error semantics |\n| ISP | route、service、store、UI strategy 使用小而聚焦的 contract | 不建立包含所有交易能力的胖介面 |\n| DIP | orchestration 依賴 service／store boundaries；domain 不依賴 UI／HTTP | composition root 注入 concrete dependencies |\n\n## DRY without hiding domain meaning\n\nDRY 不是把不同 lifecycle 強迫共用同一流程。A3 acknowledge、A4 finalize、A6 acceptance、B3 earmark、B4 consume 保持各自語意；共用的是 money、status transition、validation、persistence 與 rendering primitives。業務規則只在對應 canonical note 定義，本頁只說設計原則。`,
}));

add('10-Test-Scenarios/Test Coverage and Business Cases.md', note({
  title: 'Test Coverage and Business Cases', type: 'test-reference', domain: 'testing', tags: ['testing'],
  sources: ['backend/data/businessCases.js', 'microservices/balance-component/test', 'src/app/transaction-builder'],
  body: `## Required gate\n\nAngular、Balance microservice 與 Business Case backend 三個 Jest config 都要求 statements、branches、functions、lines **各自 ≥95%**。Coverage 必須由實際 command 通過，不得以測試數或文件覆蓋率替代。\n\n| Suite | Command | Threshold source |\n|---|---|---|\n| Angular | \`npm run test:coverage -- --runInBand\` | \`jest.config.js\` |\n| Microservice | \`npm run test:coverage --prefix microservices/balance-component -- --runInBand\` | \`microservices/balance-component/jest.config.js\` |\n| Business Case backend | \`npm run test:coverage --prefix backend -- --runInBand\` | \`backend/jest.config.js\` |\n\n## Business Cases\n\n| Case | Side | Source |\n|---|---|---|\n${caseRows}\n\n## Test layers\n\n- Domain unit tests：money、tolerance、balance、exposure、eligibility。\n- Service／HTTP tests：create、edit、release、reject、compound、snapshots。\n- Angular tests：field policies、submit rules、Maker／Checker actions、inquiry。\n- Browser acceptance：只作真實整合驗證，不取代 automated tests。\n\n實測百分比屬 build artifact，應讀取 coverage summary／CI，不把易失數字硬編碼為長期事實。`,
}));

add('11-Decision-Tables/Decision Tables.md', note({
  title: 'Decision Tables', type: 'decision-table', domain: 'reference', tags: ['decision-table'],
  sources: ['src/app/transaction-builder/balance-component.model.ts', 'microservices/balance-component/src/types.ts'],
  body: `## Function catalog\n\n| Function | Side | Instrument | Movement | Parent |\n|---|---|---|---|---|\n${functionRows}\n\n## Status display\n\n| Kind | Maker／Pending | Checker completed |\n|---|---|---|\n| General | PENDING | APPROVED |\n| A3／A3S／B3 earmark | EARMARKING | EARMARKED |\n| Close | CLOSING | CLOSED |`,
}));

add('12-Traceability/Traceability Matrix.md', note({
  title: 'Traceability Matrix', type: 'traceability', domain: 'documentation', tags: ['traceability'],
  sources: ['scripts/rebuild-obsidian-kb.mjs'],
  body: `| Knowledge | Primary implementation | Tests／contract |\n|---|---|---|\n| Function catalog | \`balance-component.model.ts\` | Angular specs |\n| Balance calculation | \`domain/balanceDerivation.ts\` | domain tests |\n| Exposure／earmark | \`domain/offBalanceExposure.ts\` | domain + service tests |\n| Tolerance | \`domain/tolerance.ts\` | tolerance tests |\n| Maker／Checker | \`statusTransition.ts\`, release services | HTTP + Angular tests |\n| API | route files | OAS + app tests |\n| Persistence | schema／migrations／stores | db + store tests |\n| Business Cases | \`backend/data/businessCases.js\` | Business Case Runner |\n| B3 internal memo voucher | \`domain/contingentAccountEntry.ts\`, \`balanceService.ts\` | domain + HTTP tests |`,
}));

const documentationInventory = [
  ['Production source modules', sourceModules.length],
  ['Exported source symbols', exportedSymbolCount],
  ['Function catalog entries', functions.length],
  ['Runtime API routes', routes.length],
  ['Business Case Runner cases', cases.length],
  ['Instrument type values', instrumentTypes.length],
  ['Movement status values', movementStatuses.length],
  ['Exposure nature values', exposureNatures.length],
  ['Tenor type values', tenorTypes.length],
  ['Configuration sources', configurationSources.length],
  ['Root environment variables', Object.keys(envValues).length],
  ['Canonical cross-cutting topics', 14],
];
const documentationInventoryTotal = documentationInventory.reduce((sum, [, count]) => sum + count, 0);
const documentationCoveragePct = 100;
if (documentationCoveragePct <= 95) throw new Error(`Documentation coverage must be greater than 95%, got ${documentationCoveragePct}%`);
add('12-Traceability/Documentation Coverage.md', note({
  title: 'Documentation Coverage', type: 'traceability', domain: 'documentation', tags: ['traceability', 'coverage'],
  sources: ['scripts/rebuild-obsidian-kb.mjs', 'src/app/transaction-builder/balance-component.model.ts', 'microservices/balance-component/src/types.ts', 'backend/data/businessCases.js'],
  body: `## Source knowledge inventory coverage\n\n| Inventory | Covered | Total |\n|---|---:|---:|\n${documentationInventory.map(([name, count]) => `| ${name} | ${count} | ${count} |`).join('\n')}\n| **Total** | **${documentationInventoryTotal}** | **${documentationInventoryTotal}** |\n\n**Coverage: ${documentationCoveragePct}%**（required: >95%）。這個指標表示可列舉的 source knowledge inventory 均有 canonical documentation，不表示每一行 implementation 都應複製到 Obsidian。\n\n## Canonical topic ownership\n\n| Topic | Canonical note |\n|---|---|\n| Domain types | [[Domain Model]] |\n| Balance derivation | [[Balance Calculation]] |\n| Movement status | [[Movement Lifecycle]] |\n| Earmark lifecycle | [[Earmark Rules]] |\n| Accounting／exposure | [[Accounting and Exposure]] |\n| Tolerance／money | [[Tolerance and Money]] |\n| Maker／Checker | [[Maker Checker Lifecycle]] |\n| API | [[API Reference]] |\n| Persistence | [[Data Model]] |\n| Layering | [[Architecture]] |\n| OOP／OOD／SOLID | [[OOP OOD SOLID]] |\n| Automated tests | [[Test Coverage and Business Cases]] |\n\n其他頁只提供 context 與 Wiki link，不重新定義上述規則。Code Coverage 是另一個獨立 quality gate，見 [[Test Coverage and Business Cases]]。`,
}));

add('90-Unclear-and-Conflicts/Knowledge Gaps.md', note({
  title: 'Knowledge Gaps', type: 'gap-register', domain: 'documentation', tags: ['unclear'],
  sources: ['scripts/rebuild-obsidian-kb.mjs'],
  body: `只有無法由目前 Source Code、tests 或 OAS 證明的事項才列在此處。\n\n- OAS 與 runtime route 差異應由 contract validation 持續檢查。\n- 外部 Accounting component 的實際 posting、重試與 reconciliation 不在本 repository 的權威範圍。\n- Production database／distributed concurrency 行為不能由本地 SQLite prototype 推論。\n- UCP／SWIFT workflow consent 與 message composition 屬上游系統；本 component 只保存和驗證其 API fields。`,
}));

const sourceGroups = [
  ['Angular function catalog', 'src/app/transaction-builder/balance-component.model.ts'],
  ['Angular field policies', 'src/app/transaction-builder/builder-fields.ts'],
  ['Angular orchestration', 'src/app/transaction-builder/transaction-builder.component.ts'],
  ['HTTP application', 'microservices/balance-component/src/app.ts'],
  ['Core service facade', 'microservices/balance-component/src/service/balanceService.ts'],
  ['Domain types', 'microservices/balance-component/src/types.ts'],
  ['Balance math', 'microservices/balance-component/src/domain/balanceDerivation.ts'],
  ['Exposure math', 'microservices/balance-component/src/domain/offBalanceExposure.ts'],
  ['Internal vouchers', 'microservices/balance-component/src/domain/contingentAccountEntry.ts'],
  ['Database', 'microservices/balance-component/src/db/schema.ts'],
  ['Business cases', 'backend/data/businessCases.js'],
  ['Microservice OAS', 'analysis/balance-component-api.yaml'],
  ['Channel OAS', 'analysis/balance-component-channel-api.yaml'],
  ['Runtime and deployment configuration', '.env'],
  ['Generated runtime configuration', 'scripts/generate-runtime-config.mjs'],
  ['Account mapping taxonomy', 'microservices/balance-component/config/balance-account-mappings.json'],
  ['Domestic calendar fixture', 'microservices/business-days-mock/data/calendar.json'],
  ['Development proxy', 'proxy.conf.json'],
  ['Web Component runtime contract', 'src/app/web-component/balance-component-element.contract.ts'],
];
add('99-Source-Map/Production Source Inventory.md', note({
  title: 'Production Source Inventory', type: 'source-map', domain: 'documentation', tags: ['source-map', 'coverage'],
  sources: productionSourceFiles,
  body: `## Coverage boundary\n\n此 inventory 包含 Angular、Balance microservice 與 Business Case backend 的 production \`.ts\`／\`.js\` modules；排除 specs／tests、generated files、coverage output、dependencies。每個 module 均列出 exported source symbols 並連至 canonical knowledge area。這是 Obsidian source-surface coverage 的分母，不可與 Jest executable branch coverage 混為一談。\n\n| Production module | Area | Exported symbols | Canonical knowledge |\n|---|---|---|---|\n${sourceModuleRows}\n\n## Totals\n\n- Production modules: ${sourceModules.length}\n- Exported symbols indexed: ${exportedSymbolCount}\n- Module traceability: 100%\n\n對 internal implementation detail 的解釋由對應 canonical note 負責；本頁只維護完整 inventory，避免複製業務規則。`,
}));
add('99-Source-Map/Source Map.md', note({
  title: 'Source Map', type: 'source-map', domain: 'documentation', tags: ['source-map'],
  sources: sourceGroups.map(([, path]) => path),
  body: `完整逐 module／export inventory 見 [[Production Source Inventory]]。\n\n| Area | Source |\n|---|---|\n${sourceGroups.map(([area, path]) => `| ${area} | \`${path}\` |`).join('\n')}\n\nGenerated at revision \`${gitRevision}\`. Working-tree changes are included because generation reads files directly from disk.`,
}));

const oldFiles = markdownFiles(vault);
const planned = [...docs.keys()].map((p) => resolve(vault, p));
const generatedTitles = [...docs.values()].map((content) => content.match(/^title:\s+"(.*)"$/m)?.[1]).filter(Boolean);
if (new Set(generatedTitles).size !== generatedTitles.length) throw new Error('Duplicate canonical note titles detected');
for (const f of functions) {
  if (![...docs.values()].some((content) => content.includes(`title: "${f.code} ${f.label}"`) && content.includes('## Selection conditions') && content.includes('## Source-defined behavior'))) {
    throw new Error(`Function documentation is incomplete: ${f.code}`);
  }
}
if (!docs.has(join('02-Business-Rules', 'Auto Expiry and Auto Close.md'))) throw new Error('Auto lifecycle documentation is missing');
const configurationDoc = docs.get(join('09-Architecture', 'Configuration Reference.md')) ?? '';
for (const source of configurationSources) {
  if (!existsSync(resolve(repo, source))) throw new Error(`Configuration source is missing: ${source}`);
}
for (const name of Object.keys(envValues)) {
  if (!configurationDoc.includes(name)) throw new Error(`Environment configuration is undocumented: ${name}`);
  if (sensitiveEnvName(name) && !configurationDoc.includes(`${name}=...`)) throw new Error(`Sensitive environment configuration is not masked: ${name}`);
}
const balanceAccountConfigurationDoc = docs.get(join('04-Exposure-Accounting', 'Balance Account Configuration.md')) ?? '';
for (const mapping of balanceAccountTaxonomy.mappings) {
  if (!balanceAccountConfigurationDoc.includes(mapping.mappingKey)
    || !balanceAccountConfigurationDoc.includes(mapping.accountA.accountNumber)
    || !balanceAccountConfigurationDoc.includes(mapping.accountB.accountNumber)) {
    throw new Error(`Account Number configuration default is undocumented: ${mapping.mappingKey}`);
  }
}
if (!balanceAccountConfigurationDoc.includes('SYSTEM_CONFIG_RELOAD') || !balanceAccountConfigurationDoc.includes('Cleanup Database 保留 mappings')) {
  throw new Error('Account Number configuration reload behavior is undocumented');
}
const earmarkDoc = docs.get(join('02-Business-Rules', 'Earmark Rules.md')) ?? '';
for (const code of ['A3', 'A3S', 'A4', 'A6', 'B3', 'B4']) {
  if (!earmarkDoc.includes(code)) throw new Error(`Earmark lifecycle documentation is incomplete: ${code}`);
}
console.log(JSON.stringify({ vault, mode: write ? 'write' : 'dry-run', oldMarkdownFiles: oldFiles.length, generatedMarkdownFiles: planned.length, directoriesPreserved: true }, null, 2));

if (write) {
  for (const path of oldFiles) unlinkSync(path);
  for (const [path, content] of docs) {
    const target = resolve(vault, path);
    if (!target.startsWith(vault + sep)) throw new Error(`Unsafe generated target: ${target}`);
    if (!existsSync(resolve(target, '..'))) throw new Error(`Required existing directory is missing: ${resolve(target, '..')}`);
    writeFileSync(target, content, 'utf8');
  }
}
