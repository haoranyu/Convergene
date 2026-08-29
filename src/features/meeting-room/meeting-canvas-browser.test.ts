import { chromium, expect as pageExpect, type Browser, type Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

import type { MeetingCanvasBrowserProbe } from './meeting-canvas-browser-probe';

let browser: Browser;
let fixtureUrl: string;
let viteServer: ViteDevServer;

async function openFixture(width: number, height: number, reducedMotion = false): Promise<Page> {
  const page = await browser.newPage({ viewport: { height, width } });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(fixtureUrl);
  await page.getByLabel('Meeting discussion canvas').waitFor({ state: 'visible' });
  if (width >= 768) {
    await page.locator('.react-flow__node').first().waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.querySelectorAll('.react-flow__node').length === 12,
      undefined,
      { timeout: 10_000 },
    );
  }
  return page;
}

async function commandLog(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __convergeneMeetingCanvasProbe: MeetingCanvasBrowserProbe;
        }
      ).__convergeneMeetingCanvasProbe.commandLog,
  );
}

describe('meeting canvas browser acceptance', () => {
  beforeAll(async () => {
    viteServer = await createServer({
      cacheDir: `/tmp/convergene-meeting-canvas-vite-${process.pid}`,
      configFile: false,
      logLevel: 'silent',
      plugins: [react()],
      resolve: {
        alias: {
          'next/image': `${process.cwd()}/src/features/meeting-room/meeting-canvas-browser-image-shim.tsx`,
          '@': `${process.cwd()}/src`,
        },
      },
      root: process.cwd(),
      server: { host: '127.0.0.1', port: 0 },
    });
    await viteServer.listen();

    const address = viteServer.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('Meeting canvas browser fixture did not expose a TCP port');
    }
    fixtureUrl = `http://127.0.0.1:${address.port}/src/features/meeting-room/meeting-canvas-browser-fixture/index.html`;
    browser = await chromium.launch({ headless: true });
  }, 20_000);

  afterAll(async () => {
    await browser?.close();
    await viteServer?.close();
  });

  it.each([
    { height: 768, width: 1_024 },
    { height: 900, width: 1_440 },
  ])(
    'keeps the canvas and details usable at $width px',
    async ({ height, width }) => {
      const page = await openFixture(width, height);
      const canvasBox = await page.getByTestId('meeting-canvas-pane').boundingBox();
      const detailBox = await page.getByLabel('Node details').boundingBox();

      expect(canvasBox).not.toBeNull();
      expect(detailBox).not.toBeNull();
      expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(detailBox!.x);
      expect(detailBox!.x + detailBox!.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await pageExpect(page.getByTestId('brand-mark')).toHaveAttribute(
        'src',
        /\/brand\/convergene-mark\.svg/,
      );
      await page.close();
    },
    20_000,
  );

  it('separates selection from active topic and only focuses after an explicit topic action', async () => {
    const page = await openFixture(1_440, 900);
    const viewport = page.locator('.react-flow__viewport');
    const viewportBeforeSelection = await viewport.getAttribute('style');

    await page.locator('.react-flow__node[data-id="topic-criteria"]').click();
    await pageExpect(page.getByLabel('Node title')).toHaveValue(
      'Agree on measurable launch decision criteria',
    );
    await pageExpect(page.getByTestId('active-topic-title')).toHaveText(
      'Clarify the first customer group we must serve',
    );
    expect(await viewport.getAttribute('style')).toBe(viewportBeforeSelection);
    expect(await commandLog(page)).toEqual([]);

    await page
      .getByRole('button', { exact: true, name: 'Agree on measurable launch decision criteria' })
      .click();
    await pageExpect(page.getByTestId('active-topic-title')).toHaveText(
      'Agree on measurable launch decision criteria',
    );
    await pageExpect(
      page.locator('.react-flow__node[data-id="topic-criteria"] > div'),
    ).toHaveAttribute('data-active-topic', 'true');
    await pageExpect(
      page.locator('.react-flow__node[data-id="topic-audience"] > div'),
    ).toHaveAttribute('data-dimmed', 'true');
    await pageExpect.poll(() => viewport.getAttribute('style')).not.toBe(viewportBeforeSelection);
    expect(await commandLog(page)).toContainEqual({
      name: 'setActiveTopic',
      nodeId: 'topic-criteria',
    });
    await page.close();
  }, 20_000);

  it('supports keyboard topic navigation, text editing, escape, and persisted dragging', async () => {
    const page = await openFixture(1_440, 900);
    const optionsTopic = page.getByRole('button', {
      exact: true,
      name: 'Compare feasible launch paths and constraints',
    });
    await optionsTopic.focus();
    await page.keyboard.press('Enter');
    await pageExpect(page.getByTestId('active-topic-title')).toHaveText(
      'Compare feasible launch paths and constraints',
    );

    const guidedNode = page.locator('.react-flow__node[data-id="option-guided"]');
    await guidedNode.focus();
    await page.keyboard.press('Enter');
    await pageExpect(page.getByLabel('Node title')).toHaveValue(
      'Launch with guided workflow and fixed templates',
    );
    await page.getByLabel('Node title').fill('Launch with a guided workflow');
    await page.getByRole('button', { name: 'Save node' }).click();
    await pageExpect(page.getByText('Saved in this browser')).toBeVisible();
    expect(await commandLog(page)).toContainEqual({
      name: 'updateNodeText',
      nodeId: 'option-guided',
    });

    const nodeBox = await guidedNode.boundingBox();
    expect(nodeBox).not.toBeNull();
    await page.mouse.move(nodeBox!.x + 80, nodeBox!.y + 30);
    await page.mouse.down();
    await page.mouse.move(nodeBox!.x + 132, nodeBox!.y + 58, { steps: 4 });
    await page.mouse.up();
    await pageExpect
      .poll(async () => commandLog(page))
      .toContainEqual({
        name: 'persistPosition',
        nodeId: 'option-guided',
      });

    await page.keyboard.press('Escape');
    await pageExpect(page.getByText('Select a node to view and edit its details.')).toBeVisible();
    await page.close();
  }, 20_000);

  it('uses an immediate viewport update under reduced motion', async () => {
    const page = await openFixture(1_440, 900, true);
    await pageExpect(page.getByLabel('Meeting discussion canvas')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );
    await page
      .getByRole('button', { exact: true, name: 'Agree on measurable launch decision criteria' })
      .click();
    await pageExpect(page.getByTestId('active-topic-title')).toHaveText(
      'Agree on measurable launch decision criteria',
    );
    await page.close();
  }, 20_000);

  it('falls back to a non-scrolling topic tree on a phone', async () => {
    const page = await openFixture(375, 812);
    await pageExpect(page.getByText(/Use a computer for the full canvas/)).toBeVisible();
    await pageExpect(page.getByTestId('meeting-canvas-pane')).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .getByRole('button', { exact: true, name: 'Agree on measurable launch decision criteria' })
      .click();
    await pageExpect(page.getByTestId('active-topic-title')).toHaveText(
      'Agree on measurable launch decision criteria',
    );
    await page.close();
  }, 20_000);
});
