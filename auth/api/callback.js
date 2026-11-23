// GitHub 로그인이 끝나면 여기로 온다 → 토큰으로 바꿔 대시보드로 돌려보낸다 (토큰은 주소의 # 뒤에만 실어서 서버에 남지 않게)
import { verify, exchange, allowedReturn } from '../lib.js';

export default async function handler(req, res){
  res.setHeader('Cache-Control', 'no-store');
  const code = String(req.query.code || ''), state = String(req.query.state || '');
  const st = verify(state);
  if (!st){
    // 앱 설치 화면에서 바로 온 경우(state 없음): 토큰은 넘기지 않고, 대시보드에서 다시 로그인하게 한다
    const back = process.env.DEFAULT_RETURN;
    if (back && allowedReturn(back)) return res.redirect(302, back + '#gh_installed=1');
    return res.status(400).send('로그인 요청이 만료됐어요. 대시보드에서 다시 눌러 주세요');
  }
  if (!allowedReturn(st.r)) return res.status(400).send('잘못된 요청이에요');
  if (!code) return res.redirect(302, st.r + '#gh_error=' + encodeURIComponent(String(req.query.error || 'cancelled')));
  try {
    const t = await exchange({ code });
    const payload = Buffer.from(JSON.stringify({ ...t, s: st.s })).toString('base64url');
    res.redirect(302, st.r + '#gh=' + payload);
  } catch (e){
    res.redirect(302, st.r + '#gh_error=' + encodeURIComponent(e.message));
  }
}
