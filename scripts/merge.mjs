#!/usr/bin/env node
// 데이터 항목 하나에 필드를 합친다. 갱신 작업(Claude든 사람이든)이 JSON을 손으로 고치지 않게 하려고 쓴다.
// 사용: node scripts/merge.mjs services s-claude '{"remaining":286.9,"burn":111.98}'
//       node scripts/merge.mjs settings main '{"lastRefresh":1795400000000}'
//       객체 필드(history, usageHistory)는 기존 값에 합쳐지고, 나머지는 덮어쓴다. 값이 null이면 필드를 지운다.
import { readFileSync, writeFileSync } from 'node:fs';
const [col, id, json] = process.argv.slice(2);
if (!['projects', 'services', 'settings'].includes(col) || !id || !json){ console.error('사용: node scripts/merge.mjs <projects|services|settings> <id> <json>'); process.exit(2); }
const path = new URL('../data/ledger.json', import.meta.url);
const L = JSON.parse(readFileSync(path, 'utf8'));
const patch = JSON.parse(json);
if (col === 'settings'){   // settings 는 객체 하나 (id 는 무시)
  L.settings = L.settings || {};
  for (const [k, v] of Object.entries(patch)){ if (v === null) delete L.settings[k]; else L.settings[k] = v; }
  writeFileSync(path, JSON.stringify(L, null, 2) + '\n');
  console.log(`settings 갱신: ${Object.keys(patch).join(', ')}`);
  process.exit(0);
}
let row = L[col].find(x => x.id === id);
if (!row){ row = { id }; L[col].push(row); L[col].sort((a, b) => a.id.localeCompare(b.id)); console.log(`새 항목 ${id}`); }
for (const [k, v] of Object.entries(patch)){
  if (v === null) delete row[k];
  else if (['history', 'usageHistory'].includes(k) && typeof v === 'object') row[k] = { ...(row[k] || {}), ...v };
  else row[k] = v;
}
writeFileSync(path, JSON.stringify(L, null, 2) + '\n');
console.log(`${col}/${id} 갱신: ${Object.keys(patch).join(', ')}`);
