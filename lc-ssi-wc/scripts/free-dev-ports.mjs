import { execFileSync } from 'node:child_process';

const ports = [3100, 3101, 3102, 4400, 4401];
if (process.platform !== 'win32') {
  console.log('[dev:stop] Automatic port cleanup is currently supported on Windows only.');
  process.exit(0);
}

const command = `$ports=@(${ports.join(',')}); $connections=Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$ports -contains $_.LocalPort}; $ids=$connections.OwningProcess | Sort-Object -Unique; foreach($processId in $ids){Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue}; Write-Output ('closed=' + $ids.Count)`;
try {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim();
  console.log(`[dev:stop] Ports ${ports.join(', ')} checked; ${output}.`);
} catch (error) {
  console.error('[dev:stop] Unable to release development ports.', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
}
