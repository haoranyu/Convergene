export const strictMermaidConfiguration = {
  securityLevel: 'strict',
  startOnLoad: false,
} as const;

export type MermaidRenderResult =
  | {
      ok: true;
      svg: string;
    }
  | {
      definition: string;
      errorCode: 'MERMAID_RENDER_FAILED';
      fallbackMarkdown: string;
      ok: false;
    };

interface MermaidRenderer {
  initialize(config: typeof strictMermaidConfiguration): void;
  render(id: string, definition: string): Promise<{ svg: string }>;
}

export async function renderStrictMermaid(
  id: string,
  definition: string,
  fallbackMarkdown: string,
  renderer?: MermaidRenderer,
): Promise<MermaidRenderResult> {
  try {
    const activeRenderer = renderer ?? (await import('mermaid')).default;
    activeRenderer.initialize(strictMermaidConfiguration);
    const { svg } = await activeRenderer.render(id, definition);

    return { ok: true, svg };
  } catch {
    return {
      definition,
      errorCode: 'MERMAID_RENDER_FAILED',
      fallbackMarkdown,
      ok: false,
    };
  }
}
