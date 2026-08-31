import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'microservices/business-days-mock/data/calendar.json');
const calendar = JSON.parse(readFileSync(source, 'utf8'));
const rows = calendar.holidays.map(({ date, name }) => `  { date: '${date}', name: '${name}' },`).join('\n');
const output = `// GENERATED from microservices/business-days-mock/data/calendar.json. Do not edit by hand.\nexport interface DomesticHoliday { readonly date: string; readonly name: string }\nexport const DOMESTIC_HOLIDAYS: readonly DomesticHoliday[] = [\n${rows}\n];\n`;

for (const target of [
  'src/app/transaction-builder/domestic-holidays.generated.ts',
  'microservices/balance-component/src/domain/domesticHolidays.generated.ts',
]) {
  writeFileSync(resolve(root, target), output, 'utf8');
}
