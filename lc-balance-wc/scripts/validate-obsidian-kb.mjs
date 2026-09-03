import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const vault = resolve(repo, 'docs', 'obsidian-balance-kb-v3.2');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() && extname(path) === '.md' ? [path] : [];
  });
}

const notes = files(vault).map((path) => ({ path, content: readFileSync(path, 'utf8') }));
const errors = [];
const titles = new Map();
const aliases = new Map();
const bodies = new Map();

for (const note of notes) {
  const title = note.content.match(/^title:\s+"(.*)"$/m)?.[1];
  if (!title) errors.push(`${note.path}: missing title`);
  else if (titles.has(title)) errors.push(`${note.path}: duplicate title ${title}`);
  else titles.set(title, note.path);

  const aliasLine = note.content.match(/^aliases:\s+\[(.*)]$/m)?.[1] ?? '';
  for (const match of aliasLine.matchAll(/"([^"]+)"/g)) aliases.set(match[1], note.path);

  if (!/^generated:\s+true$/m.test(note.content)) errors.push(`${note.path}: not generated`);
  for (const match of note.content.matchAll(/^\s+-\s+"([^"]+)"$/gm)) {
    const source = resolve(repo, match[1]);
    if (!existsSync(source)) errors.push(`${note.path}: missing source ${match[1]}`);
  }

  const body = note.content
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^# .*$/m, '')
    .replace(/^> \[!important\][\s\S]*?\n> .*?\n/m, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (body.length > 80) {
    if (bodies.has(body)) errors.push(`${note.path}: duplicate canonical body with ${bodies.get(body)}`);
    else bodies.set(body, note.path);
  }
}

for (const note of notes) {
  for (const match of note.content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g)) {
    const target = match[1];
    if (!titles.has(target) && !aliases.has(target) && !notes.some((candidate) => basename(candidate.path, '.md') === target)) {
      errors.push(`${note.path}: broken Wiki link ${target}`);
    }
  }
}

const coverageNote = notes.find((note) => /[\\/]Documentation Coverage\.md$/.test(note.path));
const coverage = Number(coverageNote?.content.match(/\*\*Coverage:\s+([\d.]+)%\*\*/)?.[1]);
if (!(coverage > 95)) errors.push(`Documentation coverage must be >95%, got ${coverage || 'missing'}%`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ notes: notes.length, titles: titles.size, duplicateBodies: 0, brokenLinks: 0, missingSources: 0, documentationCoveragePct: coverage }, null, 2));
}
