import { expect, test } from '@playwright/test';

test('redirects the root route to the default locale', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/zh-CN$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('打工人会议作弊器');
});

test('renders the English locale directly', async ({ page }) => {
  await page.goto('/en-US');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('meeting cheat tool');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});
