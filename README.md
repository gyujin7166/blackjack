# Blackjack

실시간 1:1 멀티플레이 3D 블랙잭 웹 게임 프로젝트입니다.

두 플레이어가 같은 딜러를 상대로 순차적으로 플레이하며, Socket.IO로 게임 상태와 채팅을 실시간 동기화합니다. 3D 테이블과 카드는 React Three Fiber(Three.js)로 표현하고, 카드 배분과 뒤집기 연출에는 GSAP을 사용합니다.

## 기술 스택

### Client

- Vite
- React
- TypeScript
- React Three Fiber / Three.js
- GSAP
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

초기 개발은 Socket.IO 연결과 게임 로직을 먼저 완성한 뒤 React Three Fiber와 GSAP 연출을 적용합니다.
