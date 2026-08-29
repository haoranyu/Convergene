/** @vitest-environment jsdom */

import { beforeAll, describe, expect, it } from 'vitest';

import { mermaidValidationDiagrams } from '@/fixtures/integration-validation/mermaid-diagrams';

import { renderStrictMermaid, strictMermaidConfiguration } from './mermaid-renderer';

class TestCSSStyleSheet {
  cssRules: Array<{ cssText: string }> = [];

  insertRule(rule: string, index = this.cssRules.length): number {
    this.cssRules.splice(index, 0, { cssText: rule });
    return index;
  }

  replaceSync(css: string): void {
    this.cssRules = [{ cssText: css }];
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'CSSStyleSheet', {
    configurable: true,
    value: TestCSSStyleSheet,
  });
  const measurableSvgPrototype = SVGElement.prototype as unknown as {
    getBBox(): DOMRect;
    getComputedTextLength(): number;
    textContent?: string | null;
  };
  measurableSvgPrototype.getBBox = () => ({ height: 36, width: 160, x: 0, y: 0 }) as DOMRect;
  measurableSvgPrototype.getComputedTextLength = function getComputedTextLength() {
    return (this.textContent?.length ?? 0) * 8;
  };
});

describe('Mermaid strict-mode rendering validation', () => {
  it.each(Object.entries(mermaidValidationDiagrams))(
    'renders the %s fixture as SVG',
    async (diagramType, definition) => {
      const result = await renderStrictMermaid(
        `integration-validation-${diagramType}`,
        definition,
        '| Event | Value |\n| --- | --- |\n| Fallback | Available |',
      );

      expect(strictMermaidConfiguration.securityLevel).toBe('strict');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.svg).toContain('<svg');
        expect(result.svg).toContain(`id="integration-validation-${diagramType}"`);
      }
    },
  );

  it('returns the source and readable Markdown fallback without a raw renderer error', async () => {
    const fallbackMarkdown = '| Outcome | Time |\n| --- | --- |\n| Decision | Minute 15 |';
    const result = await renderStrictMermaid(
      'invalid-diagram',
      'not a valid diagram',
      fallbackMarkdown,
      {
        initialize: () => undefined,
        render: () => Promise.reject(new Error('raw renderer detail')),
      },
    );

    expect(result).toEqual({
      definition: 'not a valid diagram',
      errorCode: 'MERMAID_RENDER_FAILED',
      fallbackMarkdown,
      ok: false,
    });
  });

  it('falls back when a timeline period contains an unescaped clock colon', async () => {
    const definition = `timeline
      title Outcome formation
      10:00 : Decision recorded`;
    const result = await renderStrictMermaid(
      'clock-label-timeline',
      definition,
      '| Time | Outcome |\n| --- | --- |\n| 10:00 | Decision recorded |',
    );

    expect(result).toMatchObject({
      definition,
      errorCode: 'MERMAID_RENDER_FAILED',
      ok: false,
    });
  });
});
