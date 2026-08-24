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
