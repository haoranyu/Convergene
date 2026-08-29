import { expect, test } from '@playwright/test';

test('redirects the root route to the default locale', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/zh-CN$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('让下一场会');
});

test('renders the English locale directly', async ({ page }) => {
  await page.goto('/en-US');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Make the next meeting');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});
