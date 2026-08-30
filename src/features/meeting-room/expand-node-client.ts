import {
  expandNodeResponseSchema,
  meetingAIErrorResponseSchema,
  type ExpandNodeRequest,
  type ExpandNodeResponse,
  type MeetingAIResult,
} from '@/modules/meeting-ai/expand-node';

const maximumResponseBytes = 64 * 1_024;

interface RequestNodeExpansionOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error('OUTPUT_INVALID');
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
    throw new Error('OUTPUT_INVALID');
  }
  return JSON.parse(text) as unknown;
}

export async function requestNodeExpansion(
  request: ExpandNodeRequest,
  { fetch = globalThis.fetch, signal }: RequestNodeExpansionOptions = {},
): Promise<MeetingAIResult<ExpandNodeResponse>> {
  try {
    const response = await fetch('/api/ai/expand-node', {
      body: JSON.stringify(request),
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    });
    const body = await readBoundedJson(response);
    if (!response.ok) {
      const error = meetingAIErrorResponseSchema.safeParse(body);
      return error.success ? error.data : { error: { code: 'UNKNOWN' }, ok: false };
    }
    const parsed = expandNodeResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.requestId !== request.requestId) {
      return { error: { code: 'OUTPUT_INVALID' }, ok: false };
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { error: { code: 'REQUEST_CANCELLED' }, ok: false };
    }
    return {
      error: {
        code:
          error instanceof Error && error.message === 'OUTPUT_INVALID'
            ? 'OUTPUT_INVALID'
            : 'PROVIDER_UNAVAILABLE',
      },
      ok: false,
    };
  }
}
