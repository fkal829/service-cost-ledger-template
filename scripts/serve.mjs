#!/usr/bin/env node
// 토큰 없이 이 컴퓨터에서 데이터를 보고 고친다. 페이지(docs/)를 띄우고, 저장하면 data/ledger.json에 바로 쓴다.
// 사용: node scripts/serve.mjs  → 브라우저에서 http://localhost:4321 (다른 기기에는 열리지 않는다)
// 저장한 내용을 GitHub에 올리려면: git add data/ledger.json && git commit -m "데이터 수정" && git push
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data/ledger.json');
const PORT = Number(process.env.PORT || 4321);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ver = () => existsSync(DATA) ? String(statSync(DATA).mtimeMs) : '0';

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/local-ledger'){
    if (req.method === 'GET'){
      const body = existsSync(DATA) ? readFileSync(DATA, 'utf8') : '{"settings":{"fx":1400},"projects":[],"services":[]}';
      res.writeHead(200, { 'content-type': TYPES['.json'], 'x-ledger-version': ver(), 'cache-control': 'no-store' }); return res.end(body);
    }
    if (req.method === 'PUT'){
      if (req.headers['x-ledger-version'] && req.headers['x-ledger-version'] !== ver()){ res.writeHead(409); return res.end('conflict'); }
      let buf = ''; req.on('data', c => buf += c); req.on('end', () => {
        try { JSON.parse(buf); } catch { res.writeHead(400); return res.end('bad json'); }
        writeFileSync(DATA, buf); res.writeHead(200, { 'x-ledger-version': ver() }); res.end('ok');
      }); return;
    }
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p === '/' || p === '') p = '/index.html';
  const file = join(ROOT, 'docs', p);
  if (!file.startsWith(join(ROOT, 'docs')) || !existsSync(file) || statSync(file).isDirectory()){ res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT, '127.0.0.1', () => {
  const u = `http://localhost:${PORT}`;
  console.log(`데이터: ${u}  (끄려면 Ctrl+C)`);
  if (!process.env.NO_OPEN) execFile(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [u], () => {});
});
