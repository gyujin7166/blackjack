import { expect, test, type Page } from '@playwright/test';

const RESULT_DIALOG_NAME = '게임 결과';
const CHAT_MESSAGE = 'playwright-e2e-message';

async function expectMatched(page: Page) {
  await expect(page.getByText(/^Room: game:/)).toBeVisible();
  await expect(page.getByText(/^Seat: player[12]$/)).toBeVisible();
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
    const inputA = pageA.getByLabel('메시지');
    const inputB = pageB.getByLabel('메시지');

    if (await inputA.isVisible() && await inputB.isVisible()) return;

    await expect(
      pageA.getByRole('dialog', { name: RESULT_DIALOG_NAME }),
    ).toBeVisible();
    await expect(
      pageB.getByRole('dialog', { name: RESULT_DIALOG_NAME }),
    ).toBeVisible();
    await acceptRematch(pageA, pageB);
  }

  await expect(pageA.getByLabel('메시지')).toBeVisible();
  await expect(pageB.getByLabel('메시지')).toBeVisible();
}

async function finishRoundWithStand(pageA: Page, pageB: Page) {
  const dialogA = pageA.getByRole('dialog', { name: RESULT_DIALOG_NAME });
  const dialogB = pageB.getByRole('dialog', { name: RESULT_DIALOG_NAME });
  const standA = pageA.getByRole('button', { name: 'Stand' });
  const standB = pageB.getByRole('button', { name: 'Stand' });

  for (let turn = 0; turn < 2; turn += 1) {
    await expect.poll(async () => {
      if (await dialogA.isVisible() || await dialogB.isVisible()) {
        return 'finished';
      }
      if (await standA.isEnabled()) {
        await standA.click();
        return 'acted';
      }
      if (await standB.isEnabled()) {
        await standB.click();
        return 'acted';
      }
      return 'waiting';
    }, { timeout: 15_000 }).not.toBe('waiting');

    if (await dialogA.isVisible() || await dialogB.isVisible()) break;
  }

  await expect(dialogA).toBeVisible({ timeout: 20_000 });
  await expect(dialogB).toBeVisible({ timeout: 20_000 });
}

test('두 플레이어가 매칭, 채팅, 라운드 종료 후 같은 room에서 재대결한다', async ({
  browser,
}) => {
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

    const roomA = await pageA.getByText(/^Room: game:/).innerText();
    const roomB = await pageB.getByText(/^Room: game:/).innerText();
    const seatA = await pageA.getByText(/^Seat: player[12]$/).innerText();
    const seatB = await pageB.getByText(/^Seat: player[12]$/).innerText();

    expect(roomA).toBe(roomB);
    expect(new Set([seatA, seatB])).toEqual(
      new Set(['Seat: player1', 'Seat: player2']),
    );

    await ensureChatIsAvailable(pageA, pageB);
    await pageA.getByLabel('메시지').fill(CHAT_MESSAGE);
    await pageA.getByRole('button', { name: '전송' }).click();
    await expect(
      pageA.getByText(`Self: ${CHAT_MESSAGE}`, { exact: true }),
    ).toBeVisible();
    await expect(
      pageB.getByText(`Opponent: ${CHAT_MESSAGE}`, { exact: true }),
    ).toBeVisible();

    await finishRoundWithStand(pageA, pageB);
    await acceptRematch(pageA, pageB);

    await Promise.all([expectMatched(pageA), expectMatched(pageB)]);
    await expect(pageA.getByText(roomA, { exact: true })).toBeVisible();
    await expect(pageB.getByText(roomB, { exact: true })).toBeVisible();
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
