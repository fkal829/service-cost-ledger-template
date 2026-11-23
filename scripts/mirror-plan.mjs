#!/usr/bin/env node
// claude.ai 사본(artifact)을 GitHub 원본에 맞추기 위한 차이 목록을 만든다.
// 사용: ArtifactData list 를 out_dir 로 받아 둔 폴더를 넘긴다 → node scripts/mirror-plan.mjs <dump폴더>
// 출력: [{op:'set'|'delete', collection, doc_id, data?}] — 각 항목에 artifact 목록의 version 을 if_version 으로 붙여 batch 로 보낸다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const dump = process.argv[2];
if (!dump){ console.error('사용: node scripts/mirror-plan.mjs <dump폴더>'); process.exit(2); }
const L = JSON.parse(readFileSync(new URL('../data/ledger.json', import.meta.url), 'utf8'));
const out = [];
const same = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());
for (const col of ['projects', 'services']){
  const dir = join(dump, col);
  const have = new Map(existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8'))]) : []);
  for (const { id, ...data } of L[col]){
    const cur = have.get(id);
    if (!cur || !same(cur, data)) out.push({ op: 'set', collection: col, doc_id: id, data });
    have.delete(id);
  }
  for (const id of have.keys()) out.push({ op: 'delete', collection: col, doc_id: id });
}
console.log(JSON.stringify(out));
console.error(`${out.length}개 차이`);
