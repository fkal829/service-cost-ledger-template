#!/usr/bin/env node
// 템플릿 레포의 최신 코드를 가져온다. 데이터(data/)는 건드리지 않는다. signatures.json 규칙만 합친다.
// 사용: node scripts/update-from-template.mjs          → 무엇이 바뀌는지만 보여 준다
//       node scripts/update-from-template.mjs --apply  → 실제로 적용한다 (커밋은 하지 않는다)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
// 템플릿에서 받아 올 코드 경로. README.md는 각자 고쳐 쓰는 경우가 많아 받지 않는다.
const PATHS = ['docs', 'scripts', '.github/workflows', '.claude/skills', 'CLAUDE.md', 'VERSION', 'CHANGELOG.md', '.ledger-removed'];

const upFile = join(ROOT, 'data/upstream.json');
const up = existsSync(upFile) ? JSON.parse(readFileSync(upFile, 'utf8')) : { repo: 'fkal829/service-cost-ledger-template', branch: 'main' };
const url = `https://github.com/${up.repo}.git`;
git('fetch', '--quiet', '--depth', '1', url, up.branch || 'main');
const head = git('rev-parse', 'FETCH_HEAD').trim();

const show = p => { try { return git('show', `FETCH_HEAD:${p}`); } catch { return null; } };
const mine = existsSync(join(ROOT, 'VERSION')) ? readFileSync(join(ROOT, 'VERSION'), 'utf8').trim() : '0.0.0';
const theirs = (show('VERSION') || '0.0.0').trim();

// 바뀐 파일: 템플릿에 있고 내 것과 다르거나 없는 파일만 (내 레포에만 있는 파일은 그대로 둔다)
const upFiles = git('ls-tree', '-r', '--name-only', 'FETCH_HEAD', '--', ...PATHS).split('\n').filter(Boolean);
const changed = [], added = [];
for (const f of upFiles){
  const p = join(ROOT, f);
  if (!existsSync(p)) added.push(f);
  else if (readFileSync(p, 'utf8') !== show(f)) changed.push(f);
}
// 템플릿에서 없앤 파일 (.ledger-removed 목록) 중 내 레포에 남아 있는 것
const removed = (show('.ledger-removed') || '').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('#') && existsSync(join(ROOT, x)));
const localOnly = git('ls-files', '--', ...PATHS).split('\n').filter(f => f && !upFiles.includes(f) && !removed.includes(f));

// signatures.json: 템플릿의 새 서비스·새 규칙만 더한다
const sigPath = join(ROOT, 'data/signatures.json');
const upSig = JSON.parse(show('data/signatures.json') || '{"services":{},"ignoreEnv":[]}');
const sig = existsSync(sigPath) ? JSON.parse(readFileSync(sigPath, 'utf8')) : { services: {}, ignoreEnv: [] };
const sigAdds = [];
for (const [id, u] of Object.entries(upSig.services || {})){
  const s = sig.services[id];
  if (!s){ sig.services[id] = u; sigAdds.push(`새 서비스 규칙 ${id}`); continue; }
  for (const k of ['env', 'deps', 'files', 'hosts']){
    const extra = (u[k] || []).filter(x => !(s[k] || []).includes(x));
    if (extra.length){ s[k] = [...(s[k] || []), ...extra]; sigAdds.push(`${id}.${k} + ${extra.join(', ')}`); }
  }
  for (const k of ['name', 'category', 'provider', 'billing']) if (u[k] && !s[k]){ s[k] = u[k]; sigAdds.push(`${id}.${k}`); }
}
const ign = (upSig.ignoreEnv || []).filter(x => !(sig.ignoreEnv || []).includes(x));
if (ign.length){ sig.ignoreEnv = [...(sig.ignoreEnv || []), ...ign]; sigAdds.push(`ignoreEnv + ${ign.join(', ')}`); }

const summary = { template: up.repo, templateCommit: head.slice(0, 7), versionNow: mine, versionTemplate: theirs,
  changed, added, removed, keptLocalOnly: localOnly, signatureAdds: sigAdds, applied: false };

if (APPLY && (changed.length || added.length || removed.length || sigAdds.length)){
  const files = [...changed, ...added];
  if (files.length) git('checkout', 'FETCH_HEAD', '--', ...files);
  if (removed.length) git('rm', '-q', '--', ...removed);
  if (sigAdds.length) writeFileSync(sigPath, JSON.stringify(sig, null, 2) + '\n');
  if (!existsSync(upFile)) writeFileSync(upFile, JSON.stringify({ repo: up.repo, branch: up.branch || 'main' }, null, 2) + '\n');
  summary.applied = true;
}
console.log(JSON.stringify(summary, null, 2));
