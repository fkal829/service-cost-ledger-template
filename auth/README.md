# 로그인 서버 (공용 대시보드용)

공용 대시보드의 "GitHub로 로그인"을 처리하는 작은 서버예요. Vercel 함수 3개뿐이고 데이터는 거치지 않아요.

- `api/login` → GitHub 로그인 화면으로 보냄
- `api/callback` → 로그인 결과를 토큰으로 바꿔 대시보드 주소의 `#` 뒤에 실어 돌려보냄
- `api/refresh` → 8시간마다 끝나는 토큰을 새로 바꿔 줌

환경변수: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`(GitHub App), `ALLOWED_ORIGINS`(대시보드 주소의 origin, 쉼표 구분), `DEFAULT_RETURN`(앱 설치 직후 돌아갈 대시보드 주소).

GitHub App 권한: Repository contents 읽기·쓰기(그 외 없음), "Request user authorization (OAuth) during installation" 켜기, 사용자 토큰 만료 켜기.
