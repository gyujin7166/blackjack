# Blackjack

실시간 1:1 멀티플레이 3D 블랙잭 웹 게임 프로젝트입니다.

두 플레이어가 같은 딜러를 상대로 순차적으로 플레이하며, Socket.IO로 게임 상태와 채팅을 실시간 동기화합니다. 3D 테이블과 카드는 React Three Fiber(Three.js)로 표현하고, 카드 배분과 뒤집기 연출에는 GSAP을 사용합니다.

## 기술 스택

### Client

- Vite
- React
- TypeScript
- React Three Fiber / Three.js (3D 단계에서 추가)
- GSAP (애니메이션 단계에서 추가)
- Socket.IO Client

### Server

- Node.js
- TypeScript
- Socket.IO

### Test

- Vitest
- React Testing Library
- Playwright

## MVP 범위

- 2명 FIFO 자동 매칭
- 같은 딜러를 상대로 순차 턴 진행
- Hit / Stand
- Natural Blackjack / Bust / Win / Lose / Push
- 서버 권위형(server-authoritative) 게임 상태
- 실시간 채팅
- 재대결 / 새 상대 찾기
- 재대결 시 선공 교대
- 상대 연결 종료 처리

회원가입, 랭킹, MMR, 게임머니, 베팅, 상점, 영구 채팅 저장은 MVP 범위에 포함하지 않습니다.

## 구조

```text
blackjack/
├─ client/   # React 클라이언트. 기능이 늘어나면 FSD 레이어를 필요한 만큼 추가
├─ server/   # Socket.IO 및 블랙잭 게임 서버
└─ shared/   # Client ↔ Server 공용 계약과 타입
```

클라이언트는 필요한 기능이 생길 때 `pages`, `widgets`, `features`, `entities`, `shared` 레이어를 추가하는 가벼운 FSD 방식으로 확장합니다. 서버에는 FSD를 강제하지 않고 게임 규칙, 매칭, 게임 세션, Socket.IO 책임을 기준으로 분리합니다.

초기 개발은 Socket.IO 연결과 게임 로직을 먼저 완성한 뒤 React Three Fiber와 GSAP 연출을 적용합니다.

## 개발 환경

Node.js 24.x와 pnpm 11.x를 사용합니다.

```bash
pnpm install
```

터미널 1에서 Socket.IO 서버를 실행합니다.

```bash
pnpm dev:server
```

```text
http://localhost:3001
```

터미널 2에서 Vite 클라이언트를 실행합니다.

```bash
pnpm dev:client
```

```text
http://localhost:5173
```

브라우저에서 클라이언트를 열었을 때 `Socket Status: Connected`가 표시되면 초기 연결이 정상입니다. 브라우저 창을 두 개 열면 서버 콘솔에서 서로 다른 두 Socket.IO 연결 ID를 확인할 수 있습니다.

기본 개발 주소를 변경해야 하는 경우 클라이언트는 `VITE_SOCKET_URL`, 서버는 `PORT`와 `CLIENT_ORIGIN` 환경 변수를 사용할 수 있습니다.

## 확인 명령

```bash
pnpm typecheck
pnpm build
```

최초 한 번 Playwright용 Chromium을 설치합니다.

```bash
pnpm exec playwright install chromium
```

E2E smoke test는 전용 포트(client 5174, server 3101)에서 client/server를 자동 실행합니다.

```bash
pnpm test:e2e
```

## Production 배포

배포 순서는 Vercel production origin을 먼저 확보한 뒤 Render의 CORS origin을 설정하고, 마지막으로 Render URL을 Vercel에 연결한다.

1. PR의 CI `quality`, `e2e` job이 모두 성공한 뒤 `main`에 merge한다.
2. Vercel project를 생성해 `https://<project>.vercel.app` 주소를 확보한다. 이 최초 배포에서는 Socket.IO가 아직 연결되지 않아도 된다.
3. Render Web Service를 생성하고 Vercel production origin을 `CLIENT_ORIGIN`으로 설정한다.
4. Render의 `/health` 응답을 확인한 뒤 Vercel Production 환경에 `VITE_SOCKET_URL`을 설정하고 redeploy한다.
5. 실제 브라우저 두 개로 매칭, 게임, 채팅, 재대결 흐름을 확인한다.

### Render server

- Service Type: `Web Service`
- Repository / Branch: 이 repository의 `main`
- Root Directory: 비워둠(repository root)
- Instance: `Free`
- Node: repository에 선언된 Node.js 24
- Build Command:

  ```bash
  corepack enable && pnpm install --frozen-lockfile && pnpm --filter @blackjack/shared build && pnpm --filter server build
  ```

- Start Command: `pnpm --filter server start`
- Health Check Path: `/health`
- Environment Variable: `CLIENT_ORIGIN=https://<project>.vercel.app`

`PORT`는 Render가 제공하는 값을 사용하며 직접 고정하지 않는다. 서버는 해당 port를 `0.0.0.0`에 bind한다. Root Directory를 `server`로 지정하면 workspace 바깥의 `shared` package를 build/runtime에서 사용할 수 없으므로 repository root를 유지한다. Render Web Service는 HTTP와 WebSocket을 같은 public port로 제공한다([Render Web Services](https://render.com/docs/web-services), [Render WebSockets](https://render.com/docs/websocket)).

배포 후 다음 요청이 `200`, `text/plain`, `ok`를 반환해야 한다.

```text
GET https://<service>.onrender.com/health
```

### Vercel client

- Repository / Branch: Render와 동일한 repository의 `main`
- Root Directory: repository root
- Install Command: `corepack enable && pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @blackjack/shared build && pnpm --filter client build`
- Output Directory: `client/dist`
- Production Environment Variable: `VITE_SOCKET_URL=https://<service>.onrender.com`

Dashboard 설정으로 충분하므로 별도의 `vercel.json`은 사용하지 않는다. HTTPS Vercel 페이지에서 HTTPS Render endpoint를 사용해야 mixed-content 오류가 발생하지 않는다. Monorepo project 설정은 [Vercel Monorepos 문서](https://vercel.com/docs/monorepos)를 참고한다.

### Upstash QStash keep-alive

애플리케이션 dependency나 서버 cron을 추가하지 않고 Upstash Console에서 schedule 하나를 생성한다.

- Destination: `https://<service>.onrender.com/health`
- Method: `GET`
- Cron: `*/5 * * * *`

5분 간격은 시간당 12회, 하루 288회다. QStash Free의 현재 한도는 하루 1,000 messages이며 schedule trigger와 각 retry delivery가 각각 message로 계산된다([QStash Schedules](https://upstash.com/docs/qstash/features/schedules), [QStash Pricing](https://upstash.com/pricing/qstash)). Blackjack 사용자의 Socket.IO traffic은 이 quota에 포함되지 않는다. Console delivery log에서 `/health` 요청이 반복적으로 2xx를 반환하는지 확인한다.

### Render Free known limitations

Render Free Web Service는 inbound HTTP request나 WebSocket message를 15분 동안 받지 않으면 spin down할 수 있고, 필요에 따라 process를 restart할 수 있다([Render Free 문서](https://render.com/docs/free)). 5분 QStash request는 idle spin-down 가능성을 줄이기 위한 것이며 availability를 보장하지 않는다.

현재 `matchmakingQueue`, `activeMatches`, `gameSessions`, `rematchAcceptances`, `turnTimers`는 process memory에 저장된다. Render process가 restart되면 진행 중인 매칭과 게임은 사라질 수 있으며, 이 MVP 제한을 이번 구성에서는 Redis나 DB로 해결하지 않는다.
