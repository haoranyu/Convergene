import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

const notConfigured = { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } };
const available = {
  ok: true,
  value: {
    configured: true,
    lastUsedAt: '2026-08-29T00:00:00.000Z',
    models: {
      fast: 'step-3.7-flash',
      grill: 'step-3.7-flash',
      report: 'step-3.7-flash',
    },
    provider: 'STEPFUN',
    state: 'AVAILABLE',
  },
} as const;

async function mockStatus(page: Page, configured = false) {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({ json: configured ? available : notConfigured });
  });
}

async function readMeetings(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = indexedDB.open('convergene');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('meetings', 'readonly');
          const getAll = transaction.objectStore('meetings').getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            database.close();
            resolve(getAll.result as Array<Record<string, unknown>>);
          };
        };
      }),
  );
}

test('runs all three in-memory tour fixtures without AI or IndexedDB writes', async ({ page }) => {
  await mockStatus(page);
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/ai/')) aiRequests.push(request.url());
  });

  await page.goto('/en-US/guide');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Brainstorm together' }).click();
  await expect(page.getByText('Find a memorable launch angle')).toBeVisible();
  await page.getByRole('tab', { name: 'Reflect and improve' }).click();
  await expect(page.getByText('Reduce repeat release incidents')).toBeVisible();

  for (let step = 1; step < 5; step += 1) {
    await page.getByRole('button', { name: 'Next step' }).click();
  }
  await expect(page.getByText('Portable report')).toBeVisible();
  await expect(page.getByText(/Release incident retro/)).toBeVisible();

  expect(aiRequests).toEqual([]);
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).some((database) => database.name === 'convergene'),
    ),
  ).toBe(false);
});

test('copies a tour fixture only after confirmation and keeps it independent', async ({ page }) => {
  await mockStatus(page);
  await page.goto('/en-US/guide');
  await page.getByRole('tab', { name: 'Brainstorm together' }).click();
  await page.getByRole('button', { name: 'Start from this example' }).click();
  await page.locator('.arco-popconfirm').getByRole('button', { name: 'OK' }).click();

  await expect(page).toHaveURL(/\/en-US\/meetings\/[^/]+\/prepare$/u);
  await expect(page.getByText('Script confirmed')).toBeVisible();
  const meetings = await readMeetings(page);
  expect(meetings).toHaveLength(1);
  expect(meetings[0]).toMatchObject({
    mode: 'BRAINSTORM',
    preparationStage: 'GRILLING',
    title: 'Launch angle brainstorm',
  });
});

test('opens BYOK configuration on the first real AI action and preserves the form', async ({
  page,
}) => {
  await mockStatus(page);
  await page.route('**/api/ai/classify-meeting', async (route) => {
    await route.fulfill({
      json: { error: { code: 'PROVIDER_NOT_CONFIGURED' }, ok: false },
      status: 503,
    });
  });

  await page.goto('/en-US/meetings/new');
  const rawRequest = page.getByLabel('The original meeting request');
  await rawRequest.fill('Choose one launch plan for the September release.');
  await page.getByRole('button', { name: 'Recommend a meeting script' }).click();

  await expect(page.getByRole('dialog', { name: 'Connect a model provider' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rawRequest).toHaveValue('Choose one launch plan for the September release.');
});

test('applies an AI recommendation only after user confirmation and allows override', async ({
  page,
}) => {
  await mockStatus(page, true);
  let classifyBody: unknown;
  await page.route('**/api/ai/classify-meeting', async (route) => {
    classifyBody = route.request().postDataJSON();
    const request = classifyBody as { requestId: string };
    await route.fulfill({
      json: {
        output: {
          confidence: 'HIGH',
          reason: 'The request requires a concrete choice.',
          recommendedMode: 'DECISION',
          suggestedTitle: 'Choose the launch plan',
        },
        requestId: request.requestId,
        task: 'classify-meeting',
      },
    });
  });

  await page.goto('/en-US/meetings/new');
  await page
    .getByLabel('The original meeting request')
    .fill('Choose one launch plan for the September release.');
  await page.getByLabel('Title · optional').fill('September launch choice');
  await page.getByRole('button', { name: 'Recommend a meeting script' }).click();

  await expect(page.getByRole('heading', { name: /Align on a decision/u })).toBeVisible();
  await page.getByRole('button', { name: 'Edit meeting details' }).click();
  await expect(page.getByLabel('The original meeting request')).toHaveValue(
    'Choose one launch plan for the September release.',
  );
  await expect(page.getByLabel('Title · optional')).toHaveValue('September launch choice');
  await page.getByRole('button', { name: 'Recommend a meeting script' }).click();
  await page.getByRole('button', { name: /Brainstorm together/u }).click();
  await page.getByRole('button', { name: 'Confirm and start Grill' }).click();

  await expect(page).toHaveURL(/\/en-US\/meetings\/[^/]+\/prepare$/u);
  expect(classifyBody).toEqual({
    input: {
      rawRequest: 'Choose one launch plan for the September release.',
      userTitle: 'September launch choice',
    },
    outputLocale: 'en-US',
    requestId: expect.any(String),
    task: 'classify-meeting',
  });
  expect(await readMeetings(page)).toEqual([
    expect.objectContaining({
      mode: 'BRAINSTORM',
      modeReason: undefined,
      title: 'September launch choice',
    }),
  ]);
});

test('exports and clears meetings without deleting provider configuration', async ({ page }) => {
  await mockStatus(page, true);
  let providerDeleteCalls = 0;
  await page.route('**/api/provider-config', async (route) => {
    if (route.request().method() === 'DELETE') providerDeleteCalls += 1;
    await route.fallback();
  });

  await page.goto('/en-US/guide');
  await page.getByRole('button', { name: 'Start from this example' }).click();
  await page.locator('.arco-popconfirm').getByRole('button', { name: 'OK' }).click();
  await page.getByRole('link', { name: 'Back to meetings' }).click();

  await expect(page.getByRole('heading', { name: 'Preparing' })).toBeVisible();
  await page.getByRole('button', { name: 'Saved locally' }).click();
  const drawer = page.getByRole('dialog', { name: 'Local data and portability' });
  await expect(drawer).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    drawer.getByRole('button', { name: 'Export all as JSON' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>;
  expect(exported).toMatchObject({ format: 'convergene-export', version: 1 });
  expect(JSON.stringify(exported)).not.toContain('step-3.7-flash');
  expect(JSON.stringify(exported).toLowerCase()).not.toContain('apikey');

  await page.getByRole('button', { name: 'Clear local meetings' }).click();
  await page.locator('.arco-popconfirm').getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Local meeting data cleared.')).toBeVisible();
  expect(await readMeetings(page)).toEqual([]);
  expect(providerDeleteCalls).toBe(0);
});

test('keeps the first-use flow operable at a 375px viewport', async ({ page }) => {
  await mockStatus(page);
  await page.setViewportSize({ height: 812, width: 375 });

  for (const path of ['/en-US', '/en-US/guide', '/en-US/meetings/new']) {
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }

  await expect(page.getByLabel('The original meeting request')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recommend a meeting script' })).toBeVisible();
});

test('preserves query state when switching locale and flags model reconfiguration', async ({
  page,
}) => {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        value: { ...available.value, state: 'NEEDS_RECONFIGURATION' },
      },
    });
  });

  await page.goto('/en-US?focus=meeting-1&panel=notes');
  await expect(page.getByRole('button', { name: 'Model needs a new key' })).toBeVisible();
  await expect(page.getByRole('link', { name: '繁體中文' })).toHaveAttribute(
    'href',
    '/zh-TW?focus=meeting-1&panel=notes',
  );
  await page.getByRole('link', { name: '繁體中文' }).click();
  await expect(page).toHaveURL('/zh-TW?focus=meeting-1&panel=notes');
  await expect(page.getByRole('heading', { name: '讓下一場會配得上佔用的時間' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
});
