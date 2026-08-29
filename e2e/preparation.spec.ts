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
            options: [
              { label: 'One named decision maker', value: 'named_decision_maker' },
              { label: 'The group decides by consensus', value: 'group_consensus' },
              { label: 'No decision owner yet', value: 'not_decided' },
            ],
            question: 'Who owns the final decision?',
            questionType: 'SINGLE_CHOICE',
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

async function seedMapReadyMeeting(page: Page) {
  await page.evaluate(
    ({ readinessKeys }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('convergene');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const now = Date.now();
          const createdAt = new Date(now - 2 * 60 * 60 * 1000).toISOString();
          const preparedAt = new Date(now - 60 * 60 * 1000).toISOString();
          const transaction = request.result.transaction(
            ['meetings', 'nodes', 'edges', 'outcomes', 'appState'],
            'readwrite',
          );
          transaction.objectStore('appState').delete('activeMeetingId');
          transaction.objectStore('outcomes').clear();
          transaction.objectStore('meetings').put({
            brief: {
              assumptions: ['The decision can be made in one meeting.'],
              confirmed: ['The sponsor is present.'],
              confirmedAt: preparedAt,
              desiredOutcome: 'Choose one launch plan and record the decision.',
              facilitation: {
                closingChecklist: ['Confirm the decision and owner.'],
                openingLine: 'We are here to choose one launch plan.',
              },
              objective: 'Choose the launch plan.',
              readiness: {
                dimensions: readinessKeys.map((key) => ({ key, status: 'READY' })),
                level: 'READY',
              },
              unknowns: ['Final channel budget.'],
            },
            contentLocale: 'en-US',
            createdAt,
            expectedAttendeeCount: 4,
            id: 'demo-lifecycle',
            mode: 'DECISION',
            modeReason: 'A choice is required.',
            preparationStage: 'MAP_READY',
            rawRequest: 'Choose one launch plan.',
            scheduledEndAt: new Date(now + 60 * 60 * 1000).toISOString(),
            scheduledStartAt: new Date(now - 10 * 60 * 1000).toISOString(),
            status: 'PREPARING',
            title: 'Demo lifecycle',
            updatedAt: preparedAt,
          });
          const nodes = [
            {
              id: 'demo-root',
              kind: 'OBJECTIVE',
              position: { x: 0, y: 120 },
              title: 'Choose the launch plan',
            },
            {
              id: 'demo-topic-options',
              kind: 'TOPIC',
              position: { x: 300, y: 0 },
              title: 'Compare options',
              topicPrompt: 'Which option best fits the goal?',
              transitionHint: 'Move to decision criteria.',
            },
            {
              id: 'demo-topic-criteria',
              kind: 'TOPIC',
              position: { x: 300, y: 140 },
              title: 'Agree on criteria',
              topicPrompt: 'What must the winning option achieve?',
              transitionHint: 'Use the criteria to make the call.',
            },
            {
              id: 'demo-topic-risks',
              kind: 'TOPIC',
              position: { x: 300, y: 280 },
              title: 'Surface risks',
              topicPrompt: 'What could make this decision fail?',
              transitionHint: 'Close with owners and next steps.',
            },
          ];
          for (const node of nodes) {
            transaction.objectStore('nodes').put({
              ...node,
              createdAt: preparedAt,
              meetingId: 'demo-lifecycle',
              source: 'INITIAL_AI',
              updatedAt: preparedAt,
            });
          }
          for (const [index, targetNodeId] of [
            'demo-topic-options',
            'demo-topic-criteria',
            'demo-topic-risks',
          ].entries()) {
            transaction.objectStore('edges').put({
              id: `demo-edge-${index}`,
              kind: 'CONTAINS',
              meetingId: 'demo-lifecycle',
              order: index,
              sourceNodeId: 'demo-root',
              targetNodeId,
            });
          }
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

test('rejects malformed preparation AI envelopes before provider execution', async ({
  request,
}) => {
  const response = await request.post('/api/ai/grill', {
    data: {
      input: { rawRequest: 'missing bounded Grill fields' },
      outputLocale: 'en-US',
      requestId: '00000000-0000-4000-8000-000000000007',
      task: 'grill',
    },
    headers: { Origin: 'http://127.0.0.1:3100' },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: { code: 'INPUT_INVALID' }, ok: false });
});

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
  await expect(page.getByText('Choose one answer')).toBeVisible();
  const selectedOption = page.getByRole('radio', { name: 'One named decision maker' });
  await expect(page.getByText('One named decision maker', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
  await page.getByText('One named decision maker', { exact: true }).click();
  await expect(selectedOption).toBeChecked();
  await expect(page.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
  await page.getByRole('button', { name: 'None of these — write another answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeVisible();
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

test('resumes a browser-local Grill meeting from the Dashboard and direct links', async ({
  page,
}) => {
  await page.goto('/en-US');
  await expect(page.getByText('No meetings yet. Start with a real request')).toBeVisible();
  await seedPendingGrill(page);
  await page.reload();

  await page.getByRole('link', { name: /Launch decision/u }).click();
  await expect(page).toHaveURL('/en-US/meetings/meeting-1/prepare');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
  ).toBeVisible();

  await page.goto('/zh-CN/meetings/meeting-1');
  await expect(page).toHaveURL('/zh-CN/meetings/meeting-1/prepare');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Who owns the final decision?' }),
  ).toBeVisible();
});

test('runs the canvas lifecycle through one outcome and a persisted Markdown report', async ({
  page,
}) => {
  await page.goto('/en-US/meetings/demo-lifecycle');
  await expect(page.getByText('This meeting is not stored in the current browser.')).toBeVisible();
  await seedMapReadyMeeting(page);
  await page.reload();

  await expect(page.getByRole('region', { name: 'Meeting discussion canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Start meeting' }).click();
  const startDialog = page.getByRole('dialog', { name: 'Start this meeting?' });
  await expect(startDialog).toBeVisible();
  await startDialog.getByRole('button', { name: 'Start meeting' }).click();

  await expect(page.getByRole('region', { name: 'Live meeting status' })).toBeVisible();
  await page.locator('.react-flow__node[data-id="demo-topic-options"]').click();
  await expect(page.getByRole('heading', { name: 'Meeting outcome' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to meeting outcomes' }).click();
  await expect(page.getByRole('button', { name: 'Remove from outcomes' })).toBeVisible();

  await page.getByRole('button', { name: 'End meeting' }).click();
  const endDialog = page.getByRole('dialog', { name: 'Ready to end the meeting?' });
  await expect(endDialog).toBeVisible();
  await endDialog.getByRole('button', { name: 'Continue to confirmation' }).click();
  await page
    .getByRole('dialog', { name: 'Confirm meeting end' })
    .getByRole('button', {
      name: 'Confirm and end meeting',
    })
    .click();

  await expect(page.getByRole('region', { name: 'Meeting report' })).toBeVisible();
  await page.getByRole('button', { name: 'Generate report' }).click();
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeVisible();
  await page.getByText('View source', { exact: true }).click();
  await expect(page.getByLabel('Markdown source')).toContainText(
    '# Meeting report: Demo lifecycle',
  );
  await expect(page.getByLabel('Markdown source')).toContainText('```mermaid');
});

test('keeps the Traditional Chinese lifecycle and report path usable on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto('/zh-TW/meetings/demo-lifecycle');
  await expect(page.getByText('目前瀏覽器裡沒有這場會議。')).toBeVisible();
  await seedMapReadyMeeting(page);
  await page.reload();

  await expect(
    page.getByText('完整畫布和結構編輯建議在電腦上使用；你仍可在這裡查看並切換議題。'),
  ).toBeVisible();
  await expect(page.getByTestId('meeting-canvas-pane')).toBeHidden();
  await page.getByRole('button', { name: '開始會議' }).click();
  const startDialog = page.getByRole('dialog', { name: '開始這場會議？' });
  await startDialog.getByRole('button', { name: '開始會議' }).click();

  await expect(page.getByRole('region', { name: '會中狀態列' })).toBeVisible();
  await page.getByRole('button', { exact: true, name: 'Compare options' }).click();
  await expect(page.getByRole('heading', { name: '會議產出' })).toBeVisible();
  await page.getByRole('button', { name: '收進會議產出' }).click();
  await expect(page.getByRole('button', { name: '移出會議產出' })).toBeVisible();

  await page.getByRole('button', { name: '結束會議' }).click();
  const endDialog = page.getByRole('dialog', { name: '準備散會？' });
  await endDialog.getByRole('button', { name: '繼續確認' }).click();
  await page
    .getByRole('dialog', { name: '確認結束會議' })
    .getByRole('button', { name: '確認並結束會議' })
    .click();

  await expect(page.getByRole('region', { name: '會議報告' })).toBeVisible();
  await page.getByRole('button', { name: '產生報告' }).click();
  await expect(page.getByRole('button', { name: '重新產生' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
