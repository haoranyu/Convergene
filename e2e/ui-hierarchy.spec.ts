import { expect, test, type Page } from '@playwright/test';

const notConfigured = { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } };

const guideActions = {
  'en-US': { copy: 'Start from this example', next: 'Next step' },
  'zh-CN': { copy: '以这个示例开始', next: '下一步' },
  'zh-TW': { copy: '以這個範例開始', next: '下一步' },
} as const;

const dashboardEmpty = {
  'en-US': 'No meetings yet. Start with a real request or explore a no-key guided example.',
  'zh-CN': '还没有会议。可以从真实需求开始，也可以先体验不需要 Key 的示例。',
  'zh-TW': '還沒有會議。可以從真實需求開始，也可以先體驗不需要 Key 的範例。',
} as const;

const viewports = [
  { height: 812, locale: 'en-US', width: 375 },
  { height: 768, locale: 'zh-CN', width: 1_024 },
  { height: 900, locale: 'zh-TW', width: 1_440 },
  { height: 812, locale: 'zh-CN', width: 375 },
  { height: 768, locale: 'zh-TW', width: 1_024 },
  { height: 900, locale: 'en-US', width: 1_440 },
  { height: 812, locale: 'zh-TW', width: 375 },
  { height: 768, locale: 'en-US', width: 1_024 },
  { height: 900, locale: 'zh-CN', width: 1_440 },
] as const;

async function mockProviderStatus(page: Page) {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({ json: notConfigured });
  });
}

async function expectStablePageHierarchy(page: Page, mobile: boolean) {
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).not.toHaveText('');
  await expect(page.getByRole('link', { name: 'Convergene' })).toHaveCount(1);
  await expect(page.locator('img[src="/brand/convergene-mark.svg"]')).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  if (mobile) {
    const header = await page.getByRole('banner').boundingBox();
    expect(header).not.toBeNull();
    expect(header!.height).toBeLessThanOrEqual(72);
  }
}

for (const { height, locale, width } of viewports) {
  test(`keeps ${locale} core tasks stable at ${width}px`, async ({ page }) => {
    await mockProviderStatus(page);
    await page.setViewportSize({ height, width });

    await page.goto(`/${locale}`);
    await expect(page.getByText(dashboardEmpty[locale])).toBeVisible();
    await expectStablePageHierarchy(page, width === 375);
    const newMeeting = page.locator('a[href$="/meetings/new"]');
    await expect(newMeeting).toBeVisible();
    await expect(newMeeting).toBeInViewport({ ratio: 0.9 });
    expect((await newMeeting.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.goto(`/${locale}/meetings/new`);
    await expect(page.locator('form')).toBeVisible();
    await expectStablePageHierarchy(page, width === 375);

    await page.goto(`/${locale}/settings/model`);
    await expect(page.locator('form')).toBeVisible();
    await expectStablePageHierarchy(page, width === 375);
    const settingsPrimary = page.locator('form button.arco-btn-primary');
    await expect(settingsPrimary).toHaveCount(1);
    await expect(settingsPrimary).toBeInViewport({ ratio: 0.9 });
    expect((await settingsPrimary.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.goto(`/${locale}/guide`);
    await expectStablePageHierarchy(page, width === 375);
    const tourFrame = page.locator('section[aria-labelledby="guide-step-title"]');
    expect(await tourFrame.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    for (const tab of await page.getByRole('tab').all()) {
      await expect(tab).toBeInViewport({ ratio: 0.9 });
      expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    for (let step = 0; step < 4; step += 1) {
      const nextAction = page.getByRole('button', { name: guideActions[locale].next });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(nextAction).toBeInViewport({ ratio: 0.9 });
      expect((await nextAction.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await nextAction.click();
    }
    await expect(page.getByRole('button', { name: guideActions[locale].next })).toHaveCount(0);
    const finalAction = page.getByRole('button', { name: guideActions[locale].copy });
    await expect(finalAction).toHaveClass(/arco-btn-primary/u);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(finalAction).toBeInViewport({ ratio: 0.9 });
    expect((await finalAction.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
}

test('keeps missing meeting states labeled by one page heading', async ({ page }) => {
  await mockProviderStatus(page);

  for (const path of ['/en-US/meetings/missing', '/en-US/meetings/missing/prepare']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).not.toHaveText('');
  }
});

test('keeps the 375px header stable while model status is loading', async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.route('**/api/provider-config/status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ json: notConfigured });
  });

  await page.goto('/en-US');
  const brand = page.getByRole('link', { name: 'Convergene' });
  const modelLoading = page.getByLabel('Checking model connection');
  const navigation = page.getByRole('navigation');
  await expect(brand).toBeVisible();
  await expect(modelLoading).toBeVisible();
  await expect(navigation).toBeVisible();
  const brandBox = await brand.boundingBox();
  const modelLoadingBox = await modelLoading.boundingBox();
  const navigationBox = await navigation.boundingBox();
  expect(brandBox).not.toBeNull();
  expect(modelLoadingBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(modelLoadingBox!.height).toBeGreaterThanOrEqual(44);
  expect(modelLoadingBox!.width).toBe(44);
  expect(brandBox!.x + brandBox!.width).toBeLessThanOrEqual(navigationBox!.x);
  expect(
    await page.evaluate(
      () =>
        Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
