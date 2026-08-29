import { expect, test, type Page } from '@playwright/test';

const dimensions = [
  'objective',
  'desired_outcome',
  'participants_and_authority',
  'inputs',
  'constraints',
  'minimum_outcome',
  'decision_owner',
  'options',
  'criteria',
  'decision_deadline',
];

async function seedPendingGrill(page: Page) {
  await page.evaluate(
    ({ readinessKeys }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('convergene');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction(['meetings', 'grillTurns'], 'readwrite');
          transaction.objectStore('meetings').put({
            contentLocale: 'en-US',
            createdAt: '2026-08-29T09:00:00.000Z',
            expectedAttendeeCount: 4,
            id: 'meeting-1',
            mode: 'DECISION',
            modeReason: 'A choice is required',
            preparationStage: 'GRILLING',
            rawRequest: 'Choose a launch plan',
            scheduledEndAt: '2026-08-29T11:00:00.000Z',
            scheduledStartAt: '2026-08-29T10:00:00.000Z',
            status: 'PREPARING',
            title: 'Launch decision',
            updatedAt: '2026-08-29T09:06:00.000Z',
          });
          transaction.objectStore('grillTurns').put({
            createdAt: '2026-08-29T09:06:00.000Z',
            disposition: 'PENDING',
            id: 'turn-1',
            index: 0,
            knownState: { assumptions: [], confirmed: [], unknowns: ['decision owner'] },
            meetingId: 'meeting-1',
            phase: 'DEFAULT',
            question: 'Who owns the final decision?',
            readiness: {
              dimensions: readinessKeys.map((key) => ({
                key,
                status: key === 'objective' ? 'READY' : 'MISSING',
              })),
              level: 'INSUFFICIENT',
            },
            reason: 'Without an owner, this meeting cannot make a decision.',
          });
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            request.result.close();
            resolve();
          };
        };
      }),
    { readinessKeys: dimensions },
  );
}

test('restores one Grill question with responsive, branded, keyboard-ready controls', async ({
  page,
}) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto('/en-US/meetings/meeting-1/prepare');
  await expect(page.getByText('This local meeting was not found.')).toBeVisible();
  await seedPendingGrill(page);
  await page.reload();

  await expect(
    page.getByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Meeting readiness' })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
  await expect(page.locator('img[src="/brand/convergene-mark.svg"]')).toHaveAttribute('alt', '');
  expect(await page.locator('h1').count()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  for (const [locale, readiness] of [
    ['zh-CN', '开会准备度'],
    ['zh-TW', '開會準備度'],
  ] as const) {
    await page.goto(`/${locale}/meetings/meeting-1/prepare`);
    await expect(page.getByRole('complementary', { name: readiness })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
    ).toBeVisible();
  }
});
