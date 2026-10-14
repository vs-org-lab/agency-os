import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import path from 'node:path';

/**
 * Serves the exported Brand Hub site on :3001 for the end-to-end tests, with every unknown path
 * answered by index.html as the Vercel rewrite does, and /os/* forwarded to the OS under test with
 * the deployment protection bypass, so the site and its API share one origin.
 */
const root = path.resolve(import.meta.dirname, '../../../brand-hub/out');
const osUrl = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const port = Number(process.env.HUB_SITE_PORT ?? 3001);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/os/')) {
    const target = new URL(url.pathname.slice('/os'.length) + url.search, osUrl);
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers = { ...request.headers, host: target.host };
    if (bypass) headers['x-vercel-protection-bypass'] = bypass;
    const upstream = send(target, { method: request.method, headers }, (answer) => {
      response.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(response);
    });
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
    return;
  }
  const candidate = path.join(root, decodeURIComponent(url.pathname));
  const file =
    candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : path.join(root, 'index.html');
  response.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
}).listen(port);
