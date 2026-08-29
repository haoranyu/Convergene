import { chromium, type Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

import type { CanvasBrowserProbeResult } from './canvas-browser-probe';

let browser: Browser;
let fixtureUrl: string;
let viteServer: ViteDevServer;

describe('test-only React Flow browser validation', () => {
  beforeAll(async () => {
    viteServer = await createServer({
      configFile: false,
      logLevel: 'silent',
      plugins: [react()],
      resolve: { alias: { '@': `${process.cwd()}/src` } },
      root: process.cwd(),
      server: { host: '127.0.0.1', port: 0 },
    });
    await viteServer.listen();

    const address = viteServer.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Vite browser fixture did not expose a TCP port');
    }

    fixtureUrl = `http://127.0.0.1:${address.port}/src/modules/integration-validation/canvas-browser-fixture/index.html`;
    browser = await chromium.launch({ headless: true });
  }, 20_000);

  afterAll(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  it('measures wrapped long-English nodes and explicitly fits only the selected subtree', async () => {
    const page = await browser.newPage({ viewport: { height: 720, width: 1_280 } });
    await page.goto(fixtureUrl);
    await page.waitForFunction(() => '__convergeneCanvasProbe' in window, undefined, {
      timeout: 10_000,
    });

    const result = await page.evaluate(
      () =>
        (
          window as Window & {
            __convergeneCanvasProbe: CanvasBrowserProbeResult;
          }
        ).__convergeneCanvasProbe,
    );
    await page.close();

    expect(result.nodeMeasurements).toHaveLength(12);
    expect(result.nodeMeasurements.every((node) => node.width === 288)).toBe(true);
    expect(result.nodeMeasurements.every((node) => node.height >= 80)).toBe(true);
    expect(result.nodeMeasurements.every((node) => !node.textOverflowed)).toBe(true);
    expect(result.nodeMeasurements.some((node) => node.titleLineCount >= 2)).toBe(true);
    expect(result.focusedNodeIds).toEqual(['topic-criteria', 'criteria-speed', 'criteria-safety']);
    expect(result.fitViewInvoked).toBe(true);
    expect(result.fitViewResult).toBe(true);
    expect(result.viewportAfter.zoom).toBeGreaterThanOrEqual(0.5);
    expect(result.viewportAfter.zoom).toBeLessThanOrEqual(1.5);
    expect(result.viewportAfter).not.toEqual(result.viewportBefore);
  }, 20_000);
});
