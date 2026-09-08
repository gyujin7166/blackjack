# Blackjack 개발 회고

두 사용자가 같은 게임 상태를 보면서 카드 배분과 뒤집기까지 자연스럽게 경험하게 만드는 것이 이 프로젝트의 핵심 과제였습니다. 서버 진행, React 상태 갱신, 3D 리소스 로딩, 애니메이션 완료 시점이 서로 다르기 때문에 각 책임을 구분하는 데 집중했습니다. 기능과 실행 방법은 [README](README.md)에서 확인할 수 있습니다.

## 1. 서버 상태와 클라이언트 상태의 책임 분리

멀티플레이에서 각 브라우저가 턴과 점수를 판단하면 서로 다른 결과를 보여줄 수 있고, 버튼 비활성화만으로 잘못된 요청을 막을 수도 없습니다.

게임의 덱·카드·턴·점수·결과는 서버가 결정합니다. 클라이언트는 `game:state`를 화면에 반영하고, 연결 상태·현재 턴·`actionPending`으로 입력 가능 여부를 관리합니다. 서버도 참여 여부와 턴을 다시 검사해 잘못된 요청을 거절합니다. 이 프로젝트에서는 **게임의 사실은 서버가, 요청 대기와 입력 가능 여부는 클라이언트가 관리하도록 구분했습니다.**

턴 제한시간도 서버가 책임집니다. 클라이언트는 서버가 보낸 `durationMs`를 표시할 뿐, 화면의 숫자가 0이 되었다고 Stand를 요청하지 않습니다. 서버의 30초 타이머가 자동 Stand를 수행하고, Hit 후 같은 플레이어의 턴이 계속되면 시간을 다시 시작합니다. 딜러의 비공개 카드 역시 공개 전에는 실제 값 대신 `{ hidden: true }`만 전달합니다.

공용 타입은 이벤트 계약을 맞추는 데 도움을 주지만 서버 검증을 대신하지는 않습니다. 테스트에서는 요청 대기와 잘못된 턴, 시간 초과, 비공개 카드 전달을 함께 확인했습니다.

관련 코드: [App](client/src/app/App.tsx), [공개 게임 상태](server/src/game/publicGameState.ts), [소켓 핸들러](server/src/socket/registerSocketHandlers.ts), [공용 계약](shared/src/index.ts)

## 2. 서버 게임 상태와 화면 연출 상태의 분리

서버는 딜러 진행과 결과 계산을 마친 뒤 `finished` 상태를 보냅니다. 이를 즉시 보여주면 숨겨진 카드가 공개되기 전에 승패부터 나타나고, 반대로 서버가 브라우저 애니메이션을 기다리면 화면 연출이 게임 규칙의 조건이 됩니다.

서버 결과는 그대로 유지하고 `GameTableScene`에서 화면에 보여줄 단계를 따로 관리했습니다.

```text
초기 배분
→ 딜러 hidden card 공개
→ 딜러 추가 카드
→ 결과 표시
```

`GameTableHud`는 연출이 끝날 때까지 최종 딜러 점수와 결과를 숨깁니다. 첫 상태부터 딜러 Blackjack으로 종료된 경우에도 초기 배분 뒤 공개 연출을 거치며, 재대결에서는 라운드 키를 바꿔 이전 연출 상태를 초기화합니다.

구현하면서 **서버 상태를 받은 시점과 사용자에게 보여줄 시점이 다를 수 있다**는 점을 확인했습니다. 애니메이션 완료 여부는 표현 순서만 제어하고 실제 승패나 턴을 결정하지 않습니다.

관련 코드: [딜러 연출 계획](client/src/widgets/game-table/lib/dealerPresentation.ts), [테이블 장면](client/src/widgets/game-table/ui/GameTableScene.tsx), [HUD](client/src/widgets/game-table/ui/GameTableHud.tsx)

## 3. 카드 리소스 로딩과 애니메이션

텍스처 로딩과 카드 이동은 서로 다른 비동기 작업이므로 이미지 준비 전에 애니메이션이 시작될 수 있었습니다. 같은 이미지를 여러 카드가 중복 요청하는 문제도 있었습니다.

URL별로 완성된 Texture와 로딩 중인 Promise를 캐시해 진행 중인 요청까지 공유했습니다. 초기 배분에 필요한 로딩 시도가 `Promise.allSettled()`로 모두 끝난 뒤 이동을 시작하며, 실패한 요청은 이후 다시 시도할 수 있습니다. 모든 이미지가 성공해야만 연출이 시작된다는 의미는 아닙니다.

브라우저에서 SVG를 실시간 변환하던 방식은 준비된 WebP를 `TextureLoader`로 읽는 구조로 바꿨습니다. 렌더링은 `frameloop="demand"`를 사용하고, GSAP이 Three.js 객체의 위치와 회전을 바꿀 때 `invalidate()`를 호출합니다. effect가 정리될 때 tween도 종료해 이전 연출이 남지 않게 했습니다.

중복 로딩 방지와 실패 후 재시도는 테스트했지만 실제 저사양 기기의 FPS나 메모리 개선 수치를 측정한 것은 아닙니다. 로딩 실패 시 대체 이미지나 안내를 보여주는 UX도 남아 있습니다.

관련 코드: [텍스처 캐시](client/src/entities/card/lib/cardTexture.ts), [Card3D](client/src/entities/card/ui/Card3D.tsx), [배분 애니메이션](client/src/widgets/game-table/ui/DealtCard3D.tsx)

## 4. 연결 상태와 반응형 UX

연결되지 않은 상태에서 게임 시작이 가능한 것처럼 보이면 사용자는 매칭을 기다려야 하는지 알기 어렵습니다. 클라이언트는 `connecting`, `connected`, `reconnecting`, `connection-error`, `disconnected`를 구분하고, 연결 전에는 시작 버튼을 비활성화합니다. 연결이 끊기면 게임·채팅·타이머·요청 상태를 정리합니다.

Socket.IO가 자동 재연결을 시도하더라도 현재 구현은 진행 중인 게임을 복구하지 않습니다. 연결이 돌아오면 새 게임을 시작하는 범위까지만 지원합니다.

화면은 컨테이너 크기와 비율에 따라 `wide`, `compact`, `portrait`로 나눠 카메라·카드·HUD 배치를 조정합니다. 넓은 화면에는 채팅 패널을 고정하고, 작은 화면에서는 drawer로 제공합니다. 내 카드는 확대 후 드래그해 회전할 수 있으며, 이 과정에서 3D 카드의 위치와 DOM UI·포인터 상호작용을 함께 고려했습니다.

레이아웃 경계값은 테스트했지만 실제 모바일의 터치 입력, 화면 회전, 저사양 기기 성능은 추가 검증이 필요합니다.

관련 코드: [연결 상태 UI](client/src/app/App.tsx), [레이아웃 판단](client/src/widgets/game-table/lib/hudLayout.ts), [카드 확대 보기](client/src/widgets/game-table/ui/CardInspectionOverlay.tsx)

## 5. 실시간 E2E에서 고정 순서를 가정하지 않기

두 브라우저 게임에서는 버튼 상태를 확인한 직후에도 턴이 바뀔 수 있습니다. 첫 패로 라운드가 바로 끝나거나, 서버 종료 뒤 카드 연출이 계속되는 경우도 있어 고정된 진행 순서와 시간 대기에 의존한 E2E가 불안정했습니다.

고정 시간 대신 두 화면의 버튼과 결과 상태를 확인하고 현재 가능한 행동을 선택하도록 바꿨습니다. 채팅 전에 라운드가 끝나면 재대결 후 다시 시도합니다. 이 테스트는 핵심 사용자 흐름을 확인하는 smoke test이며, 실제 포인터 위치나 모바일 터치 동작까지 완전히 검증하지는 않습니다.

| 검증 영역                    | 확인하는 내용                                                  |
| ---------------------------- | -------------------------------------------------------------- |
| Vitest 게임 규칙             | Ace 점수, Natural Blackjack, Bust, 딜러 진행, 승패와 선공 교대 |
| Vitest + 실제 Socket.IO 연결 | 상태 전달, 잘못된 행동 거절, 방 격리, 시간 초과와 이탈 처리    |
| React Testing Library        | 연결 안내, 행동 대기, 재대결·채팅 상태, 연출 중 결과 숨김      |
| 클라이언트 로직 테스트       | 텍스처 캐시, 딜러 연출 계획, 사운드 재사용, 레이아웃 경계      |
| Playwright                   | 두 브라우저의 매칭·채팅·종료·재대결 흐름                       |

GitHub Actions는 타입 검사·테스트·프로덕션 빌드가 성공한 뒤 E2E를 실행합니다. 테스트 수보다 각 테스트의 전제와 검증 범위를 구분하는 것이 중요했습니다.

관련 코드: [E2E](e2e/blackjack.spec.ts), [Playwright 설정](playwright.config.ts), [소켓 통합 테스트](server/tests/socketGame.test.ts), [CI](.github/workflows/ci.yml)

## 6. 사운드 원본과 배포 산출물의 분리

카드 효과음 MP3를 GitHub에 포함하지 않으면서 배포 환경에서는 기존 `/sound/*.mp3` URL을 유지해야 했습니다.

```text
MP3
→ Base64
→ Vercel Secret
→ restore-sound-assets.mjs
→ client/public/sound/*.mp3
→ Vite build
```

두 파일의 Base64 값을 빌드 환경변수에 두고, Vite 빌드 전에 스크립트로 MP3를 복원합니다. 두 개의 작은 고정 에셋을 위해 별도 스토리지와 URL 설정을 추가하지 않고 기존 재생 코드를 유지한 선택입니다. 오디오 준비나 재생이 실패해도 게임 진행에는 영향을 주지 않습니다.

다만 Base64는 암호화가 아니며 최종 MP3는 브라우저에서 접근할 수 있습니다. 환경변수가 없으면 복원을 건너뛰기 때문에 빌드 성공만으로 사운드 제공을 보장할 수도 없습니다. 파일 수나 크기가 커지면 외부 스토리지 등 다른 공급 방식을 검토해야 합니다.

관련 코드: [.gitignore](.gitignore), [사운드 복원](scripts/restore-sound-assets.mjs), [사운드 재생](client/src/widgets/game-table/lib/gameSounds.ts)

## 7. 현재 구조의 한계와 다음 개선

클라이언트는 Vercel, Socket.IO 서버는 Render에 배포하며 `VITE_SOCKET_URL`과 `CLIENT_ORIGIN`으로 연결합니다. `/health`는 서버 프로세스의 HTTP 응답만 확인하며 실제 매칭과 게임 흐름을 보장하지 않습니다. 세션과 매칭 상태도 프로세스 메모리에 있어 서버 재시작이나 연결 종료 뒤에는 게임을 이어갈 수 없습니다.

다음 개선은 현재 구현의 경계를 중심으로 정했습니다.

- **실제 기기 검증:** 모바일 카드 선택·회전·채팅 입력과 저사양 기기의 프레임·메모리 확인
- **에셋 실패 UX:** 텍스처 대체 표시와 배포 사운드 누락 감지
- **연결 예외 E2E:** 게임 중 단절, 재연결 후 새 매칭, 대기 중 상대 이탈 검증

게임 기록 저장이나 여러 서버 인스턴스가 필요해지면 process memory 대신 상태 저장과 복구 방식을 다시 설계해야 합니다.

관련 코드: [서버 진입점](server/src/index.ts), [health 응답](server/src/http/health.ts), [게임 세션 관리](server/src/socket/registerSocketHandlers.ts)
