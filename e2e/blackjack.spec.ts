import { expect, test, type Locator, type Page } from '@playwright/test';

const RESULT_DIALOG_NAME = '게임 결과';
const CHAT_MESSAGE = 'playwright-e2e-message';

type RoundControlState =
  'waiting' | 'stand-a' | 'stand-b' | 'settling' | 'finished';

type ButtonActionResult = 'clicked' | 'not-actionable';

interface StandSnapshot {
  enabled: boolean;
  visible: boolean;
}

async function getStandSnapshot(stand: Locator): Promise<StandSnapshot> {
  return stand.evaluateAll((elements) => {
    const button = elements[0];

    if (!(button instanceof HTMLButtonElement)) {
      return { enabled: false, visible: false };
    }

    const style = window.getComputedStyle(button);
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      button.getClientRects().length > 0;

    return { enabled: visible && !button.disabled, visible };
  });
}

async function triggerButtonIfActionable(
  buttonLocator: Locator,
): Promise<ButtonActionResult> {
  return buttonLocator.evaluateAll((elements) => {
    const button = elements[0];

    if (!(button instanceof HTMLButtonElement)) {
      return 'not-actionable';
    }

    const style = window.getComputedStyle(button);
    const visible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      button.getClientRects().length > 0;

    if (!visible || button.disabled) {
      return 'not-actionable';
    }

    button.click();
    return 'clicked';
  });
}

async function expectMatched(page: Page) {
  await expect(
    page.getByRole('region', { name: '블랙잭 게임 테이블' }),
  ).toBeVisible();
}

async function acceptRematch(pageA: Page, pageB: Page) {
  await pageA.getByRole('button', { name: '재대결' }).click();
  await expect(pageA.getByText('재대결 요청 완료')).toBeVisible();
  await expect(
    pageB.getByText('상대 플레이어가 재대결을 요청했습니다.'),
  ).toBeVisible();

  await pageB.getByRole('button', { name: '재대결' }).click();
  await expect(pageA.getByText('재대결 요청 완료')).toBeHidden();
  await expect(
    pageB.getByText('상대 플레이어가 재대결을 요청했습니다.'),
  ).toBeHidden();
}

async function ensureChatIsAvailable(pageA: Page, pageB: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await Promise.all(
      [pageA, pageB].map(async (page) => {
        if (await page.getByLabel('메시지').isVisible()) return;
        const chatToggle = page.getByRole('button', { name: '채팅 열기' });
        await triggerButtonIfActionable(chatToggle);
      }),
    );
    const inputA = pageA.getByLabel('메시지');
    const inputB = pageB.getByLabel('메시지');
    const dialogA = pageA.getByRole('dialog', { name: RESULT_DIALOG_NAME });
    const dialogB = pageB.getByRole('dialog', { name: RESULT_DIALOG_NAME });
    const ready = { state: 'waiting' as 'chat' | 'finished' | 'waiting' };

    await expect
      .poll(
        async () => {
          if ((await inputA.isVisible()) && (await inputB.isVisible())) {
            ready.state = 'chat';
            return ready.state;
          }
          if ((await dialogA.isVisible()) && (await dialogB.isVisible())) {
            ready.state = 'finished';
            return ready.state;
          }
          ready.state = 'waiting';
          return ready.state;
        },
        { timeout: 20_000 },
      )
      .not.toBe('waiting');

    if (ready.state === 'chat') return;
    if (ready.state === 'finished') await acceptRematch(pageA, pageB);
  }

  await expect(pageA.getByLabel('메시지')).toBeVisible();
  await expect(pageB.getByLabel('메시지')).toBeVisible();
}

async function sendChatMessage(pageA: Page, pageB: Page) {
  const selfMessage = pageA.getByText(`Self: ${CHAT_MESSAGE}`, {
    exact: true,
  });
  const opponentMessage = pageB.getByText(`Opponent: ${CHAT_MESSAGE}`, {
    exact: true,
  });
  const dialogA = pageA.getByRole('dialog', { name: RESULT_DIALOG_NAME });
  const dialogB = pageB.getByRole('dialog', { name: RESULT_DIALOG_NAME });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureChatIsAvailable(pageA, pageB);
    await pageA.getByLabel('메시지').fill(CHAT_MESSAGE);

    const actionResult = await triggerButtonIfActionable(
      pageA.getByRole('button', { name: '전송' }),
    );
    if (actionResult === 'not-actionable') continue;

    const delivery = {
      state: 'waiting' as 'delivered' | 'finished' | 'waiting',
    };
    await expect
      .poll(
        async () => {
          if (
            (await selfMessage.isVisible()) &&
            (await opponentMessage.isVisible())
          ) {
            delivery.state = 'delivered';
            return delivery.state;
          }
          if ((await dialogA.isVisible()) && (await dialogB.isVisible())) {
            delivery.state = 'finished';
            return delivery.state;
          }
          delivery.state = 'waiting';
          return delivery.state;
        },
        { timeout: 20_000 },
      )
      .not.toBe('waiting');

    if (delivery.state === 'delivered') return;

    await ensureChatIsAvailable(pageA, pageB);
    if (
      (await selfMessage.isVisible()) &&
      (await opponentMessage.isVisible())
    ) {
      return;
    }
  }

  throw new Error('채팅 메시지를 3회 안에 전송하지 못했습니다.');
}

async function finishRoundWithStand(pageA: Page, pageB: Page) {
  const dialogA = pageA.getByRole('dialog', { name: RESULT_DIALOG_NAME });
  const dialogB = pageB.getByRole('dialog', { name: RESULT_DIALOG_NAME });
  const standA = pageA.getByRole('button', { name: 'Stand' });
  const standB = pageB.getByRole('button', { name: 'Stand' });

  const getRoundControlState = async (): Promise<RoundControlState> => {
    if ((await dialogA.isVisible()) || (await dialogB.isVisible())) {
      return 'finished';
    }

    const [standAState, standBState] = await Promise.all([
      getStandSnapshot(standA),
      getStandSnapshot(standB),
    ]);

    if (!standAState.visible && !standBState.visible) return 'settling';
    if (standAState.enabled) return 'stand-a';
    if (standBState.enabled) return 'stand-b';
    return 'waiting';
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ready = { state: 'waiting' as RoundControlState };

    await expect
      .poll(
        async () => {
          ready.state = await getRoundControlState();
          return ready.state;
        },
        { timeout: 40_000 },
      )
      .not.toBe('waiting');

    if (ready.state === 'finished' || ready.state === 'settling') break;

    const stand = ready.state === 'stand-a' ? standA : standB;
    const actionState = ready.state;
    const actionResult = await triggerButtonIfActionable(stand);

    if (actionResult === 'not-actionable') continue;

    await expect
      .poll(getRoundControlState, { timeout: 40_000 })
      .not.toBe(actionState);
  }

  await expect(dialogA).toBeVisible({ timeout: 20_000 });
  await expect(dialogB).toBeVisible({ timeout: 20_000 });
}

test('두 플레이어가 매칭, 채팅, 라운드 종료 후 같은 room에서 재대결한다', async ({
  browser,
}) => {
  test.setTimeout(150_000);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([
      expect(
        pageA.getByText('서버에 연결되었습니다.', { exact: true }),
      ).toBeVisible(),
      expect(
        pageB.getByText('서버에 연결되었습니다.', { exact: true }),
      ).toBeVisible(),
    ]);

    await pageA.getByRole('button', { name: '게임 시작' }).click();
    await expect(
      pageA.getByText('다른 플레이어를 기다리고 있습니다.'),
    ).toBeVisible();

    await pageB.getByRole('button', { name: '게임 시작' }).click();
    await Promise.all([expectMatched(pageA), expectMatched(pageB)]);

    await sendChatMessage(pageA, pageB);
    await expect(
      pageA.getByText(`Self: ${CHAT_MESSAGE}`, { exact: true }),
    ).toBeVisible();
    await expect(
      pageB.getByText(`Opponent: ${CHAT_MESSAGE}`, { exact: true }),
    ).toBeVisible();

    await finishRoundWithStand(pageA, pageB);
    await acceptRematch(pageA, pageB);

    await Promise.all([expectMatched(pageA), expectMatched(pageB)]);
    await Promise.all([
      expect(pageA.getByRole('heading', { name: 'Self' })).toBeVisible(),
      expect(pageB.getByRole('heading', { name: 'Self' })).toBeVisible(),
    ]);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
