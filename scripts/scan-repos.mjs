#!/usr/bin/env node
// GitHub 레포를 훑어 장부(data/ledger.json)의 프로젝트·서비스 연결을 채운다.
// - 장부에 없는 레포 → 새 프로젝트로 추가 (autoAdded 표시)
// - 레포 코드에서 알아본 서비스 → 그 서비스의 usedBy에 프로젝트 연결 (없을 때만 추가)
// - 지우거나 바꾸는 일은 하지 않고 data/scan-report.md에 적기만 한다
// 필요한 환경변수: GH_TOKEN (레포 읽기 권한), 선택: GH_TOKEN_<OWNER 대문자, - 는 _> (그 소유자 전용 토큰)
// 사용: node scripts/scan-repos.mjs [--dry]
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync, existsSync, appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const LEDGER = join(ROOT, 'data/ledger.json');
const SIGS = JSON.parse(readFileSync(join(ROOT, 'data/signatures.json'), 'utf8'));
const CONF = JSON.parse(readFileSync(join(ROOT, 'data/scan-config.json'), 'utf8'));
const DRY = process.argv.includes('--dry');
const TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 서울 날짜

const tokenFor = owner => process.env['GH_TOKEN_' + owner.toUpperCase().replace(/-/g, '_')]
  || (owner.toLowerCase() === (CONF.companyOwner || '').toLowerCase() && process.env.GH_TOKEN_ORG) || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
async function gh(path, owner, raw){
  const r = await fetch('https://api.github.com' + path, { headers: {
    Authorization: 'Bearer ' + tokenFor(owner), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'service-cost-ledger-scan' } });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}

async function listRepos(owner){
  const isOrg = (await gh(`/users/${owner}`, owner)).type === 'Organization';
  const base = isOrg ? `/orgs/${owner}/repos?type=all` : `/user/repos?affiliation=owner`;
  const out = [];
  for (let page = 1; page < 20; page++){
    const batch = await gh(`${base}&per_page=100&page=${page}`, owner);
    out.push(...batch.filter(r => r.owner.login.toLowerCase() === owner.toLowerCase()));
    if (batch.length < 100) break;
  }
  return out;
}

const TEXT_EXT = /\.(m?[jt]sx?|cjs|py|json|toml|ya?ml|sh|gs|txt|md|example|sample|cfg|ini|env)$/i;
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|out|venv|\.venv|__pycache__|vendor|coverage)(\/|$)/;
function walk(dir, base = dir, acc = []){
  for (const name of readdirSync(dir)){
    const p = join(dir, name), rel = relative(base, p);
    if (SKIP_DIR.test(rel)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, base, acc);
    else acc.push({ rel, size: st.size, path: p });
  }
  return acc;
}

const ENV_CTX = [
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g, /process\.env\[['"]([A-Z][A-Z0-9_]{2,})['"]\]/g,
  /os\.environ(?:\.get)?\(?\[?['"]([A-Z][A-Z0-9_]{2,})['"]/g, /getenv\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]{2,})/g, /Deno\.env\.get\(['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  /^\s*([A-Z][A-Z0-9_]{2,})\s*=/gm, /secrets\.([A-Z][A-Z0-9_]{2,})/g
];
const SECRETY = /(_API_KEY|_API_SECRET|_ACCESS_TOKEN|_TOKEN|_SECRET|_CLIENT_ID|_CLIENT_SECRET|_WEBHOOK_URL|_KEY)$/;
const knownEnv = new Set(Object.values(SIGS.services).flatMap(s => s.env || []));
const ignoreEnv = new Set(SIGS.ignoreEnv || []);

function scanTree(dir){
  const files = walk(dir);
  const texts = [];
  for (const f of files){
    if (f.size > 400_000 || !TEXT_EXT.test(f.rel) || /lock\.(json|ya?ml)$|\.lock$/.test(f.rel) || /(^|\/)data\/signatures\.json$/.test(f.rel)) continue;
    try { texts.push({ rel: f.rel, t: readFileSync(f.path, 'utf8') }); } catch {}
  }
  const deps = new Set();
  for (const { rel, t } of texts){
    if (/(^|\/)package\.json$/.test(rel)){ try { const j = JSON.parse(t); for (const k of Object.keys({ ...j.dependencies, ...j.devDependencies, ...j.optionalDependencies })) deps.add(k.toLowerCase()); } catch {} }
    if (/(^|\/)requirements[^/]*\.txt$/.test(rel)) t.split('\n').forEach(l => { const m = l.trim().match(/^([A-Za-z0-9_.\-]+)/); if (m) deps.add(m[1].toLowerCase()); });
    if (/(^|\/)pyproject\.toml$/.test(rel)) for (const m of t.matchAll(/["']([A-Za-z0-9_.\-]+)\s*(?:[<>=~!\[;].*?)?["']/g)) deps.add(m[1].toLowerCase());
  }
  const envSeen = new Map();
  for (const { rel, t } of texts) for (const re of ENV_CTX) for (const m of t.matchAll(re)){
    if (re.source.startsWith('^') && !/\.(env|example|sample)$|\.env\./i.test(rel)) continue;
    if (!envSeen.has(m[1])) envSeen.set(m[1], rel);
  }
  const hits = {};
  for (const [id, sig] of Object.entries(SIGS.services)){
    let ev = null;
    for (const e of sig.env || []){ const re = new RegExp('\\b' + e + '\\b'); const f = texts.find(x => re.test(x.t)); if (f){ ev = `${e} (${f.rel})`; break; } }
    if (!ev) for (const d of sig.deps || []) if (deps.has(d.toLowerCase())){ ev = `패키지 ${d}`; break; }
    if (!ev) for (const p of sig.files || []){ const f = files.find(x => x.rel === p || x.rel.startsWith(p) || x.rel.endsWith('/' + p) || x.rel.includes('/' + p)); if (f){ ev = `파일 ${f.rel}`; break; } }
    if (!ev) for (const h of sig.hosts || []){ const f = texts.find(x => x.t.includes(h)); if (f){ ev = `${h} (${f.rel})`; break; } }
    if (ev) hits[id] = ev;
  }
  const unknown = [...envSeen].filter(([n]) => SECRETY.test(n) && !knownEnv.has(n) && !ignoreEnv.has(n)).map(([n, rel]) => `${n} (${rel})`);
  return { hits, unknown };
}

function repoKeys(p){
  if (Array.isArray(p.repos) && p.repos.length) return p.repos.map(r => r.toLowerCase());
  const raw = String(p.repo || '').replace(/\(.*?\)/g, '');
  const parts = raw.split(/[·,]/).map(x => x.trim()).filter(Boolean);
  const owner = parts[0]?.includes('/') ? parts[0].split('/')[0] : '';
  return parts.map(x => (x.includes('/') ? x : owner + '/' + x).toLowerCase());
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function main(){
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const before = JSON.stringify(ledger);
  const ignore = new Set((CONF.ignoreRepos || []).map(x => x.toLowerCase()));
  const rep = { added: [], newServices: [], linked: [], unknown: [], archived: [], errors: [], gone: [] };
  // 장부 레포 자신은 훑지 않는다
  const self = process.env.GITHUB_REPOSITORY || (() => { try { return execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin']).toString().trim().replace(/^.*github\.com[:/]/, '').replace(/\.git$/, ''); } catch { return ''; } })();
  if (self) ignore.add(self.toLowerCase());
  const byRepo = new Map();
  ledger.projects.forEach(p => repoKeys(p).forEach(k => byRepo.set(k, p)));
  const seen = new Set();

  for (const owner of CONF.owners){
    let repos;
    try { repos = await listRepos(owner); } catch (e){ rep.errors.push(`${owner}: 레포 목록을 못 읽음 (${e.message})`); continue; }
    for (const r of repos){
      const full = r.full_name, key = full.toLowerCase();
      seen.add(key);
      if (ignore.has(key) || (CONF.skipForks && r.fork && !byRepo.has(key))) continue;
      let proj = byRepo.get(key);
      if (!proj){
        let id = 'p-' + slug(r.name), n = 2; while (ledger.projects.some(p => p.id === id)) id = 'p-' + slug(r.name) + '-' + n++;
        const used = ledger.projects.map(p => p.color || 1);
        proj = { id, name: r.name, kind: owner.toLowerCase() === (CONF.companyOwner || '').toLowerCase() ? 'company' : 'personal', status: 'dev',
          desc: r.description || '', runsOn: '', repo: full, repos: [full], url: r.homepage || '',
          color: [1, 2, 3, 4, 5, 6].find(c => !used.includes(c)) || (ledger.projects.length % 6) + 1,
          order: Math.max(0, ...ledger.projects.map(p => p.order || 0)) + 1,
          note: `GitHub 스캔으로 ${TODAY}에 자동 추가했어요. 설명·상태·실행 위치를 확인해 주세요.`, autoAdded: TODAY };
        ledger.projects.push(proj); byRepo.set(key, proj);
        rep.added.push(`${proj.name} (${full})`);
      }
      if (r.pushed_at) proj.lastPush = r.pushed_at.slice(0, 10);
      if (r.archived) rep.archived.push(`${full} → ${proj.name}`);

      // 코드 받아서 훑기
      const tmp = mkdtempSync(join(tmpdir(), 'scan-'));
      try {
        const tgz = await gh(`/repos/${full}/tarball`, owner, true);
        writeFileSync(join(tmp, 'r.tgz'), tgz);
        execFileSync('tar', ['-xzf', join(tmp, 'r.tgz'), '-C', tmp]);
        const top = readdirSync(tmp).find(n => n !== 'r.tgz' && statSync(join(tmp, n)).isDirectory());
        if (!top) continue;
        if (existsSync(join(tmp, top, 'data/signatures.json')) && existsSync(join(tmp, top, 'data/ledger.json'))) continue;   // 다른 장부 레포는 건너뛴다
        const { hits, unknown } = scanTree(join(tmp, top));
        for (const [sid, ev] of Object.entries(hits)){
          let s = ledger.services.find(x => x.id === sid);
          if (!s){
            const sig = SIGS.services[sid];
            if (!sig?.name) continue;
            s = { id: sid, name: sig.name, provider: sig.provider || '', category: sig.category || 'other', billing: sig.billing || 'free',
              currency: 'USD', status: 'active', projectId: '', usedBy: [], note: `레포 스캔으로 ${TODAY}에 자동 추가했어요. 플랜과 금액을 확인해 주세요.`, autoAdded: TODAY };
            ledger.services.push(s); ledger.services.sort((x, y) => x.id.localeCompare(y.id));
            rep.newServices.push(`${s.name} (${sid})`);
          }
          s.usedBy = Array.isArray(s.usedBy) ? s.usedBy : [];
          if (!s.usedBy.some(u => u.p === proj.id) && s.projectId !== proj.id){
            s.usedBy.push({ p: proj.id, why: `자동 감지: ${ev}` });
            rep.linked.push(`${s.name} ← ${proj.name} (${ev})`);
          }
        }
        if (unknown.length) rep.unknown.push(`${full}: ${unknown.slice(0, 12).join(', ')}${unknown.length > 12 ? ` 외 ${unknown.length - 12}개` : ''}`);
      } catch (e){ if (/HTTP 404/.test(e.message) && !r.size) {} else rep.errors.push(`${full}: ${e.message}`); }
      finally { rmSync(tmp, { recursive: true, force: true }); }
    }
  }
  for (const p of ledger.projects){
    const ks = repoKeys(p).filter(k => CONF.owners.some(o => k.startsWith(o.toLowerCase() + '/')));
    if (ks.length && ks.every(k => !seen.has(k))) rep.gone.push(`${p.name} (${ks.join(', ')})`);
  }

  const changed = JSON.stringify(ledger) !== before;
  const sec = (t, a, empty) => `\n## ${t}\n` + (a.length ? a.map(x => `- ${x}`).join('\n') : `- ${empty}`) + '\n';
  const md = `# 레포 스캔 결과 (${TODAY})\n\n대상: ${CONF.owners.join(', ')} · 장부 ${changed ? '갱신함' : '변경 없음'}\n`
    + sec('새로 추가한 프로젝트', rep.added, '없음')
    + sec('새로 만든 서비스', rep.newServices, '없음')
    + sec('새로 연결한 서비스', rep.linked, '없음')
    + sec('규칙에 없는 키 이름 (새 서비스일 수 있음)', rep.unknown, '없음')
    + sec('보관(archived)된 레포', rep.archived, '없음')
    + sec('레포가 안 보이는 프로젝트', rep.gone, '없음')
    + sec('오류', rep.errors, '없음');
  if (!DRY){
    if (changed) writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
    writeFileSync(join(ROOT, 'data/scan-report.md'), md);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
}
main().catch(e => { console.error(e); process.exit(1); });
