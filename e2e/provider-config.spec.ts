import { expect, test } from '@playwright/test';

const availableSummary = {
  activeProvider: 'STEPFUN',
  configured: true,
  providers: {
    SILICONFLOW: null,
    STEPFUN: {
      createdAt: '2026-08-29T00:00:00.000Z',
      keyHint: '••••••••',
      lastUsedAt: '2026-08-29T00:00:00.000Z',
      models: {
        fast: 'step-3.7-flash',
        grill: 'step-3.5-flash-2603',
        report: 'step-3.5-flash-2603',
      },
      provider: 'STEPFUN',
      state: 'AVAILABLE',
    },
  },
} as const;

test('tests and saves a key without echoing or retaining it in the form', async ({ page }) => {
  let configured = false;
  let testedBody: unknown;
  let savedBody: unknown;

  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        value: configured ? availableSummary : { configured: false, state: 'NOT_CONFIGURED' },
      },
    });
  });
  await page.route('**/api/provider-config/test', async (route) => {
    testedBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        ok: true,
        value: { models: availableSummary.providers.STEPFUN.models, provider: 'STEPFUN' },
      },
    });
  });
  await page.route('**/api/provider-config', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }

    savedBody = route.request().postDataJSON();
    configured = true;
    await route.fulfill({ json: { ok: true, value: availableSummary } });
  });

  await page.goto('/en-US/settings/model');

  await expect(page.getByRole('heading', { level: 1, name: 'Model connection' })).toBeVisible();
  const apiKey = page.getByLabel('API key');
  await apiKey.fill('sk-browser-only-secret');
  await page.getByRole('button', { name: 'Test connection' }).click();

  await expect(
    page.getByText('Connection verified. You can save this configuration.'),
  ).toBeVisible();
  await expect(apiKey).toHaveValue('');
  expect(testedBody).toEqual({ apiKey: 'sk-browser-only-secret', provider: 'STEPFUN' });

  await page.getByRole('button', { name: 'Save configuration' }).click();

  await expect(page.getByText('••••••••')).toBeVisible();
  await expect(page.getByText('StepFun is selected for AI actions')).toBeVisible();
  await expect(page.getByText('step-3.7-flash').first()).toBeVisible();
  await expect(
    page.getByText('Model configuration saved. The API key is hidden from now on.'),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('sk-browser-only-secret');
  expect(savedBody).toEqual({ apiKey: 'sk-browser-only-secret', provider: 'STEPFUN' });
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test('restores both providers and switches repeatedly without requesting either key', async ({
  page,
}) => {
  await page.goto('/en-US/settings/model');
  await page.getByLabel('API key').fill('e2e-stepfun-placeholder');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(
    page.getByText('Connection verified. You can save this configuration.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('StepFun is selected for AI actions')).toBeVisible();

  await page.getByRole('button', { name: 'Add another provider' }).click();
  await page.getByLabel('API key').fill('e2e-siliconflow-placeholder');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(
    page.getByText('Connection verified. You can save this configuration.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(page.getByText('SiliconFlow is selected for AI actions')).toBeVisible();
  await expect(page.getByText('StepFun is saved and ready to select')).toBeVisible();
  await expect(page.getByLabel('API key')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use StepFun' }).click();
  await expect(page.getByText('StepFun is selected for AI actions')).toBeVisible();
  await page.getByRole('button', { name: 'Use SiliconFlow' }).click();
  await page.reload();

  await expect(page.getByText('SiliconFlow is selected for AI actions')).toBeVisible();
  await expect(page.getByText('StepFun is saved and ready to select')).toBeVisible();
  await expect(page.getByLabel('API key')).toHaveCount(0);
});

test('validates locally and renders only safe provider error copy', async ({ page }) => {
  let testRequests = 0;

  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({
      json: { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } },
    });
  });
  await page.route('**/api/provider-config/test', async (route) => {
    testRequests += 1;
    await route.fulfill({
      json: { error: { code: 'PROVIDER_AUTH_FAILED' }, ok: false },
      status: 401,
    });
  });

  await page.goto('/en-US/settings/model');

  const provider = page.getByRole('combobox', { name: 'Provider' });
  await expect(provider).toContainText('StepFun');
  await provider.click();
  await page.getByRole('option', { name: 'SiliconFlow' }).click();
  await expect(page.getByText('Pro/Qwen/Qwen2.5-7B-Instruct').first()).toBeVisible();
  await expect(page.getByText('deepseek-ai/DeepSeek-V4-Flash').first()).toBeVisible();

  const apiKey = page.getByLabel('API key');
  await apiKey.fill('contains whitespace');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('The API key cannot contain spaces or line breaks.')).toBeVisible();
  expect(testRequests).toBe(0);

  await apiKey.fill('rejected-plaintext-key');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(
    page.getByText('Authentication failed. Check the API key and try again.'),
  ).toBeVisible();
  await expect(apiKey).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('rejected-plaintext-key');
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
});

test('clears model configuration without touching browser meeting data', async ({ page }) => {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({ json: { ok: true, value: availableSummary } });
  });
  await page.route('**/api/provider-config', async (route) => {
    if (route.request().method() !== 'DELETE') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } },
    });
  });

  await page.goto('/en-US/settings/model');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('convergene-e2e-local-meetings', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('meetings');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('meetings', 'readwrite');
          transaction.objectStore('meetings').put('still-local', 'meeting-fixture');
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            request.result.close();
            resolve();
          };
        };
      }),
  );

  await page.getByRole('button', { name: 'Clear model configuration' }).click();
  await page.getByRole('button', { name: 'Clear configuration' }).click();

  await expect(
    page.getByText('Model configuration cleared. Local meetings were not changed.'),
  ).toBeVisible();
  await expect(page.getByLabel('API key')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        new Promise<string | undefined>((resolve, reject) => {
          const request = indexedDB.open('convergene-e2e-local-meetings', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const transaction = request.result.transaction('meetings', 'readonly');
            const getRequest = transaction.objectStore('meetings').get('meeting-fixture');
            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => {
              request.result.close();
              resolve(getRequest.result as string | undefined);
            };
          };
        }),
    ),
  ).toBe('still-local');
});

test('opens the reusable configuration gate and returns focus on Escape', async ({ page }) => {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({
      json: { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } },
    });
  });

  await page.goto('/en-US');
  const trigger = page.getByRole('button', { name: 'Configure a model' });
  await trigger.click();

  await expect(page.getByRole('dialog', { name: 'Connect a model provider' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('keeps the settings page usable at a 375px viewport', async ({ page }) => {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({
      json: { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } },
    });
  });
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto('/en-US/settings/model');

  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('serves the BYOK page with a restrictive content security policy', async ({ page }) => {
  await page.route('**/api/provider-config/status', async (route) => {
    await route.fulfill({
      json: { ok: true, value: { configured: false, state: 'NOT_CONFIGURED' } },
    });
  });
  await page.route(
    '**/en-US/settings/model',
    async (route) => {
      const original = await route.fetch();
      const html = await original.text();
      await route.fulfill({
        body: html.replace(
          '</head>',
          '<script>window.__convergeneUnsafeInlineProbe = true</script></head>',
        ),
        response: original,
      });
    },
    { times: 1 },
  );

  const response = await page.goto('/en-US/settings/model');
  const policy = response?.headers()['content-security-policy'];
  const scriptPolicy = policy
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src '));

  expect(scriptPolicy).toContain("script-src 'self'");
  expect(scriptPolicy).toContain("'strict-dynamic'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain('api.stepfun.com');
  expect(policy).not.toContain('api.siliconflow.cn');
  expect(scriptPolicy).not.toContain("'unsafe-inline'");

  expect(
    await page.evaluate(
      () =>
        (window as Window & { __convergeneUnsafeInlineProbe?: boolean })
          .__convergeneUnsafeInlineProbe,
    ),
  ).toBeUndefined();
});

test('protects dotted unknown HTML routes with the same nonce policy', async ({ page }) => {
  await page.route(
    '**/en-US/agenda.v2',
    async (route) => {
      const original = await route.fetch();
      const html = await original.text();
      await route.fulfill({
        body: html.replace(
          '</head>',
          '<script>window.__convergeneDottedPathProbe = true</script></head>',
        ),
        response: original,
      });
    },
    { times: 1 },
  );

  const response = await page.goto('/en-US/agenda.v2');
  const policy = response?.headers()['content-security-policy'];
  const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];

  expect(response?.status()).toBe(404);
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("'strict-dynamic'");
  expect(nonce).toBeTruthy();
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __convergeneDottedPathProbe?: boolean }).__convergeneDottedPathProbe,
    ),
  ).toBeUndefined();
});
