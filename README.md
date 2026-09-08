# Blackjack

두 명의 플레이어가 실시간으로 매칭되어 같은 딜러를 상대로 순차적으로 플레이하는 **3D 블랙잭 웹 게임**입니다. 카드를 더 받거나 멈추며 21에 가까운 점수를 만들고, 라운드가 끝나면 같은 상대와 재대결하거나 새 상대를 찾을 수 있습니다.

실시간으로 바뀌는 턴과 결과를 화면에 반영하면서, 카드 배분·뒤집기 연출이 자연스럽게 이어지도록 구현했습니다. 설계 판단과 문제 해결 과정은 [개발 회고](RETROSPECTIVE.md)에 정리했습니다.

## 플레이 기능

- 대기 순서에 따른 2인 자동 매칭, Hit / Stand, Blackjack / Bust 및 Win / Lose / Push 판정
- 행동 제한시간 표시와 시간 초과 시 서버의 자동 Stand 처리
- 양쪽 동의 후 재대결 및 선공 교대, 새 상대 찾기
- 같은 게임방 안의 실시간 채팅과 상대 이탈 안내
- 3D 테이블, 카드 배분·이동·뒤집기 애니메이션, 카드 효과음
- 내 카드의 마우스 hover 효과와 클릭 후 확대·드래그 회전, 화면 비율에 따른 테이블·채팅 배치 전환

두 플레이어의 승패는 각각 딜러와 비교해 결정됩니다. 회원가입, 베팅·게임머니, 랭킹, 전적 저장은 구현 범위에 포함하지 않습니다.

## 주요 구현

### 서버 상태를 기준으로 만드는 UI

서버가 덱, 카드 배분, 턴, 점수와 결과를 결정하고, 클라이언트는 Socket.IO의 `game:state`를 받아 화면에 반영합니다. 내 차례와 연결 상태, 요청 대기 여부에 따라 Hit / Stand를 제어하며, 서버에서도 잘못된 순서의 요청을 거절합니다. 딜러의 비공개 카드는 공개 전까지 실제 카드 값 대신 `{ hidden: true }`로 전달합니다.

연결 중·재연결 중·연결 실패를 안내하고 연결 전에는 게임 시작을 제한합니다. 연결이 끊기면 기존 게임 UI를 초기화합니다. **자동 재연결은 지원하지만 이전 게임을 이어서 복구하는 기능은 없습니다.**

### 게임 진행과 카드 연출의 분리

서버의 라운드가 끝난 뒤에도 화면에서는 딜러 카드 공개 → 추가 카드 배분 → 결과 표시가 순서대로 진행됩니다. `GameTableScene`에서 연출 단계와 표시할 카드 수를 별도로 관리하고, GSAP은 카드 위치와 회전을 변경합니다. 애니메이션 완료는 화면 표시 시점을 제어하며, 실제 승패나 턴을 결정하지 않습니다.

### React UI와 3D 화면의 역할 구분

React Three Fiber로 테이블과 카드를 구성하고, 버튼·상태 안내·채팅·결과 창은 DOM UI로 제공합니다. 카드 텍스처와 로딩 중인 Promise를 URL별로 공유하고, 필요한 텍스처의 로딩 시도가 모두 끝난 뒤 배분 연출을 시작합니다. `frameloop="demand"`와 GSAP의 `invalidate()` 호출을 함께 사용해 화면 갱신이 필요한 시점에 렌더링합니다.

## 기술 스택 및 구조

| 영역        | 사용 기술                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ |
| Client      | React, TypeScript, Vite, Tailwind CSS, React Three Fiber, Three.js, GSAP, Socket.IO Client |
| Server      | Node.js, TypeScript, Socket.IO                                                             |
| 검증        | Vitest, React Testing Library, Playwright, GitHub Actions                                  |
| 배포 구성   | Vercel(Client), Render(Server)                                                             |
| 패키지 관리 | pnpm workspace                                                                             |

```text
blackjack/
├─ client/src/
│  ├─ app/                 # 소켓 이벤트 수신, 게임 화면 연결
│  ├─ entities/card/       # 카드 모델 표현, 텍스처 로딩
│  ├─ widgets/game-table/  # 3D 테이블, 애니메이션, HUD, 채팅
│  └─ shared/              # 소켓 클라이언트 설정
├─ server/src/             # 게임 규칙·세션, 매칭, 소켓, HTTP health
├─ shared/src/             # 공용 타입과 Socket.IO 이벤트 계약
├─ e2e/                    # 두 브라우저의 플레이 흐름 검증
└─ scripts/                # 배포 시 사운드 파일 복원
```

`shared`에서 이벤트 이름과 payload 타입을 함께 관리해 클라이언트와 서버가 같은 통신 계약을 사용하도록 했습니다.

## 로컬 실행

Node.js **24.x**, pnpm **11.22.0**을 사용합니다. 저장소 루트에서 의존성을 설치하고 공용 패키지를 빌드합니다. `shared`는 타입뿐 아니라 채팅 길이 상수도 런타임에 제공합니다.

```bash
pnpm install
pnpm --filter @blackjack/shared build
```

각각 다른 터미널에서 실행합니다.

```bash
pnpm dev:server
```

```bash
pnpm dev:client
```

서버 기본 주소는 `http://localhost:3001`, 클라이언트는 `http://localhost:5173`입니다. 브라우저 창 두 개에서 클라이언트를 열고, 각 창의 **게임 시작**을 누르면 매칭됩니다. 공용 런타임 코드를 변경했다면 `shared`를 다시 빌드합니다.

사운드 MP3는 저장소에 포함하지 않습니다. 효과음까지 확인하려면 사용 가능한 파일을 아래 두 경로에 준비합니다. 파일이 없거나 재생이 거절되어도 게임 로직은 계속 동작합니다.

```text
client/public/sound/placing-playing-card.mp3
client/public/sound/taking-playing-card.mp3
```

기본 개발 주소를 바꾸려면 클라이언트의 `VITE_SOCKET_URL`, 서버의 `PORT`와 `CLIENT_ORIGIN`을 설정합니다.

## 테스트

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test`는 서버의 게임 규칙·Socket.IO 통합 테스트와 클라이언트의 UI·연출 로직 테스트를 실행합니다. E2E는 최초 한 번 Chromium을 설치한 뒤 실행합니다.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright가 전용 포트(client `5174`, server `3101`)에서 서버와 클라이언트를 자동 실행하고, 두 브라우저의 매칭 → 채팅 → 라운드 종료 → 재대결 흐름을 확인합니다. [GitHub Actions](.github/workflows/ci.yml)는 타입 검사·테스트·빌드가 성공한 뒤 E2E를 실행하며, 실패 시 진단 자료를 보관합니다.

## 배포 구성

클라이언트 정적 파일은 Vercel, Socket.IO 서버는 Render에 배포하는 구성입니다. 두 서비스 모두 저장소 루트를 기준으로 설치·빌드합니다.

| 설정        | Vercel                                              | Render                                                                                                                     |
| ----------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 설치        | `corepack enable && pnpm install --frozen-lockfile` | 아래 빌드 명령에 포함                                                                                                      |
| 빌드        | 아래 사운드 복원 포함 명령                          | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @blackjack/shared build && pnpm --filter server build` |
| 출력 / 실행 | `client/dist`                                       | `pnpm --filter server start`                                                                                               |
| 환경변수    | `VITE_SOCKET_URL`: 서버의 HTTPS URL                 | `CLIENT_ORIGIN`: 클라이언트의 HTTPS origin. `PORT`는 Render가 제공하는 값을 사용하며 직접 고정하지 않음                    |

서버의 `GET /health`는 `200`과 `ok`를 반환합니다. 매칭·게임·타이머 상태는 서버 프로세스 메모리에 있으므로 재시작 시 유지되지 않습니다.

### 사운드 파일 복원

`client/public/sound/*.mp3`는 `.gitignore` 대상입니다. Vercel 빌드 환경에 `CARD_PLACING_SOUND_BASE64`, `CARD_TAKING_SOUND_BASE64`를 비밀 환경변수로 설정하고, 각 MP3의 Base64 값을 넣습니다. Build Command는 다음과 같습니다.

```bash
node scripts/restore-sound-assets.mjs && pnpm --filter @blackjack/shared build && pnpm --filter client build
```

[복원 스크립트](scripts/restore-sound-assets.mjs)가 빌드 전에 MP3를 생성하므로 기존 `/sound/placing-playing-card.mp3`, `/sound/taking-playing-card.mp3` 경로를 그대로 사용합니다. 환경변수가 없으면 해당 파일 복원을 건너뜁니다. 기본 `pnpm build`에는 이 복원 단계가 포함되어 있지 않습니다.

이 방식은 저장소에 원본을 추가하지 않기 위한 것으로, 배포된 사운드 파일은 브라우저에서 접근할 수 있습니다. 카드 이미지는 저장소에 포함된 OpenDecks 에셋을 사용하며 [동봉 라이선스](client/public/cards/opendecks/LICENSE)를 확인할 수 있습니다.
