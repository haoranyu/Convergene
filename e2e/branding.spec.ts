import { expect, test } from '@playwright/test';

test('uses the approved brand mark and application icons', async ({ page, request }) => {
  await page.goto('/en-US');

  const brand = page.locator('header strong').filter({ hasText: 'Convergene' });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveCSS('color', 'rgb(15, 23, 42)');
  const brandLink = brand.getByRole('link', { name: 'Convergene' });
  await expect(brandLink).toHaveCSS('gap', '8px');
  expect((await brandLink.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const mark = brandLink.locator('img');
  await expect(mark).toHaveAttribute('alt', '');
  await expect(mark).toHaveAttribute('src', '/brand/convergene-mark.svg');
  await expect(mark).toHaveCSS('width', '24px');
  await expect(mark).toHaveCSS('height', '24px');

  await expect(page.locator('link[rel="icon"][href="/brand/favicon-32.png"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"][href="/brand/favicon.ico"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/brand/apple-touch-icon-180.png',
  );

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifestResponse = await request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  expect(await manifestResponse.json()).toMatchObject({
    icons: expect.arrayContaining([
      {
        sizes: '192x192',
        src: '/brand/convergene-app-icon-192.png',
        type: 'image/png',
      },
      {
        sizes: '512x512',
        src: '/brand/convergene-app-icon-512.png',
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: 'any',
        src: '/brand/convergene-app-icon-maskable.svg',
        type: 'image/svg+xml',
      },
    ]),
  });

  for (const assetPath of [
    '/brand/convergene-mark.svg',
    '/brand/favicon-32.png',
    '/brand/favicon.ico',
    '/brand/apple-touch-icon-180.png',
    '/brand/convergene-app-icon-192.png',
    '/brand/convergene-app-icon-512.png',
    '/brand/convergene-app-icon-maskable.svg',
  ]) {
    expect((await request.get(assetPath)).ok()).toBe(true);
  }

  const missingBrandAsset = await request.get('/brand/missing.html');
  expect(missingBrandAsset.status()).toBe(404);
  expect(missingBrandAsset.headers()['content-security-policy']).toContain("default-src 'self'");
});
