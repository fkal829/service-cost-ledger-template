// 서비스 비용 대시보드 로그인 서버 — 공용 함수
// 필요한 환경변수: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (GitHub App), ALLOWED_ORIGINS (쉼표로 구분, 예: https://fkal829.github.io),
//                DEFAULT_RETURN (앱 설치 직후 돌아갈 대시보드 주소)
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = buf => Buffer.from(buf).toString('base64url');
const key = () => process.env.GITHUB_CLIENT_SECRET || '';

export const allowedOrigins = () => (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// 토큰을 돌려보낼 주소는 허락된 대시보드 주소만 (다른 곳으로 토큰이 새지 않게)
export function allowedReturn(url){
  try { const u = new URL(url); return allowedOrigins().includes(u.origin) && !u.hash; } catch { return false; }
}

export function sign(obj){
  const body = b64u(JSON.stringify(obj));
  return body + '.' + b64u(createHmac('sha256', key()).update(body).digest());
}
export function verify(token, maxAgeMs = 10 * 60 * 1000){
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', key()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const obj = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!obj.t || Date.now() - obj.t > maxAgeMs) return null;
  return obj;
}

export function selfOrigin(req){
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}`;
}

// GitHub에 code 또는 refresh_token을 주고 사용자 토큰을 받는다
export async function exchange(params){
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, ...params })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(j.error || 'exchange_failed');
  const now = Date.now();
  return { a: j.access_token, rf: j.refresh_token || '', e: j.expires_in ? now + j.expires_in * 1000 : 0 };
}

export function cors(req, res){
  const o = req.headers.origin;
  if (o && allowedOrigins().includes(o)){
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return true;
  }
  return false;
}
