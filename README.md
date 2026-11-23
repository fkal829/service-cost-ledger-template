# 서비스 비용 장부

내 프로젝트들이 쓰는 외부 서비스(API, 서버, DB, SaaS…)와 그 비용을 한곳에서 보는 장부예요.

- 어떤 프로젝트가 어떤 서비스를 **무엇에** 쓰는지
- 이번 달 **실제로 나가는 돈**과 크레딧으로 덮이는 몫
- 선불·무료 체험 **크레딧이 언제 끝나는지**, 쓰기 전에 사라질 금액
- 프로젝트마다 자동으로 그려지는 구성도

데이터는 **내 GitHub 비공개 레포**에만 저장돼요. 특정 Claude 계정이나 서버에 묶이지 않아요.

## 시작하기 (5분 + Claude가 정리하는 시간)

필요한 것: GitHub 계정, [Claude Code](https://claude.com/claude-code)(Claude 앱의 Code 탭이나 터미널), [GitHub CLI](https://cli.github.com)(`gh auth login`으로 로그인), Node.js 18 이상.

1. 이 페이지 위의 **Use this template → Create a new repository**
   - 이름: `service-cost-ledger`, **Private**를 꼭 고르세요.
2. 만든 레포를 내 컴퓨터로 받아 Claude Code로 열어요.
   ```bash
   gh repo clone <내계정>/service-cost-ledger
   ```
3. Claude에게 말해요: **"장부 세팅해 줘"**

Claude가 내 GitHub 레포들을 읽고 프로젝트와 외부 서비스를 정리해 장부를 채운 뒤, 보는 방법과 자동 갱신을 안내해요. 어느 계정·조직을 넣을지 같은 것만 물어봐요.

## 보는 법

| 어디서 | 어떻게 | 토큰 |
|---|---|---|
| 이 컴퓨터 | `node scripts/serve.mjs` → http://localhost:4321 | 필요 없음 |
| 휴대폰·다른 기기 | 내 레포의 GitHub Pages 주소 (세팅 때 켜 줘요) | 처음 한 번 넣기 (페이지에 만드는 법이 있어요) |

공개 페이지에는 데이터가 없고, 페이지를 연 사람이 자기 토큰으로 자기 레포를 읽어요. 그래서 같은 페이지를 다른 GitHub 계정으로 열면 그 사람의 장부가 보여요.

## Claude에게 시킬 수 있는 것

| 말하기 | 하는 일 |
|---|---|
| "장부 세팅해 줘" | 처음 한 번. 레포를 읽어 장부를 만들고 자동화를 안내 |
| "장부 갱신해 줘" | Chrome에서 이미 로그인된 청구 화면(GCP, Claude Console, Vercel, OpenAI…)을 **읽기만** 해서 비용·크레딧을 갱신 |
| "장부 정리해 줘" | 새 레포·새 서비스를 찾아 장부에 넣고 용도 설명을 다듬음 |

어느 Claude 계정이든 이 레포를 열면 같은 스킬(`.claude/skills/`)을 써요.

## 자동 갱신

| 무엇 | 누가 | 언제 | 필요한 것 |
|---|---|---|---|
| 새 프로젝트·서비스 연결 | GitHub Actions `레포 스캔` | 매주 월요일 | 레포 시크릿 `LEDGER_SCAN_TOKEN` (없으면 건너뜀) |
| 비용·크레딧 | Claude 앱 예약 작업 | 평일 아침 | Claude 앱이 켜진 컴퓨터, Chrome에 각 서비스 로그인 |
| 페이지 배포 | GitHub Actions `장부 페이지 배포` | `docs/`가 바뀔 때 | Pages 켜기 |

`LEDGER_SCAN_TOKEN`: 레포 **Settings → Secrets and variables → Actions → New repository secret**. 내 레포와 회사 조직 레포를 한 번에 읽으려면 [classic token](https://github.com/settings/tokens/new?scopes=repo&description=cost-ledger-scan)(`repo` 범위)이 가장 간단해요. 넣기 싫으면 가끔 "장부 정리해 줘"라고 하면 같은 스캔을 토큰 없이 돌려요.

## 안전

- 키·토큰·비밀번호는 장부에 적지 않아요. 레포를 읽을 때도 환경변수 **이름**만 보고 `.env` 같은 실제 값 파일은 열지 않아요.
- 청구 화면은 읽기만 하고 결제·업그레이드·설정 버튼은 누르지 않아요.
- 장부 레포는 꼭 **Private**로 두세요.

## 파일

- `data/ledger.json` 장부 · `data/signatures.json` 서비스 알아보는 규칙 · `data/scan-config.json` 스캔 대상 · `data/cost-sources.json` 비용 읽을 곳
- `docs/index.html` 장부 페이지 · `scripts/` 스캔·갱신·로컬 서버 · `.claude/skills/` Claude 스킬
