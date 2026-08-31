import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const root = new URL('../dist/e2e-hosts/', import.meta.url).pathname.slice(1);
const wc = new URL('../dist/balance-component-wc/browser/', import.meta.url).pathname.slice(1);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const file = pathname.startsWith('/wc/') ? join(wc, pathname.slice(4)) : join(root, pathname === '/' ? 'react.html' : pathname.slice(1));
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(4173, '127.0.0.1', () => console.log('E2E fixture server listening on 4173'));
