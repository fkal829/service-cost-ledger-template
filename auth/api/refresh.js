// 로그인 토큰은 8시간이면 끝난다 → 대시보드가 refresh_token을 보내면 새 토큰으로 바꿔 준다
import { exchange, cors } from '../lib.js';

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  const ok = cors(req, res);
  if (req.method === 'OPTIONS') return res.status(ok ? 204 : 403).end();
  if (!ok || req.method !== 'POST') return res.status(403).json({ error: 'forbidden' });
  const rf = String((req.body && req.body.refresh_token) || '');
  if (!rf) return res.status(400).json({ error: 'missing_refresh_token' });
  try { res.status(200).json(await exchange({ grant_type: 'refresh_token', refresh_token: rf })); }
  catch (e){ res.status(401).json({ error: e.message }); }
}
