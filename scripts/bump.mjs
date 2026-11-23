#!/usr/bin/env node
// 템플릿 관리자용: 버전을 올린다. VERSION 파일과 페이지의 APP_VERSION을 함께 바꾸고, CHANGELOG에 빈 항목을 만든다.
// 사용: node scripts/bump.mjs 1.2.0 "바뀐 점 한 줄"
import { readFileSync, writeFileSync } from 'node:fs';
const [v, note] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(v || '')){ console.error('사용: node scripts/bump.mjs <x.y.z> "바뀐 점"'); process.exit(2); }
const r = p => new URL('../' + p, import.meta.url);
writeFileSync(r('VERSION'), v + '\n');
const page = readFileSync(r('docs/index.html'), 'utf8').replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${v}';`);
writeFileSync(r('docs/index.html'), page);
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const log = readFileSync(r('CHANGELOG.md'), 'utf8').replace(/\n## /, `\n## ${v} (${today})\n- ${note || '바뀐 점을 적어 주세요'}\n\n## `);
writeFileSync(r('CHANGELOG.md'), log);
console.log(`버전 ${v}`);
