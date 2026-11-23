// 대시보드의 "GitHub로 로그인" → GitHub 로그인 화면으로 보낸다
import { allowedReturn, sign, selfOrigin } from '../lib.js';

export default function handler(req, res){
  const ret = String(req.query.return || ''), state = String(req.query.state || '');
  if (!process.env.GITHUB_CLIENT_ID) return res.status(503).send('로그인 서버가 아직 설정되지 않았어요');
  if (!allowedReturn(ret) || !/^[A-Za-z0-9_-]{16,64}$/.test(state)) return res.status(400).send('잘못된 요청이에요');
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  u.searchParams.set('redirect_uri', selfOrigin(req) + '/api/callback');
  u.searchParams.set('state', sign({ r: ret, s: state, t: Date.now() }));
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, u.toString());
}
