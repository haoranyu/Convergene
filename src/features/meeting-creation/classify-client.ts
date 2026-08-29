import {
  classifyMeetingRequestSchema,
  classifyMeetingResponseSchema,
  classifyMeetingOutputSchema,
  classifyMeetingTask,
  meetingAIErrorResponseSchema,
  type ClassifyMeetingInput,
  type ClassifyMeetingOutput,
  type MeetingAIResult,
} from '@/modules/meeting-ai';
import type { SupportedLocale } from '@/modules/meeting-domain';

export interface ClassifyMeetingClient {
  classify(
    input: ClassifyMeetingInput,
    outputLocale: SupportedLocale,
    signal?: AbortSignal,
  ): Promise<MeetingAIResult<ClassifyMeetingOutput>>;
}

export function createClassifyMeetingClient(
  fetchImplementation: typeof fetch = globalThis.fetch,
  createRequestId: () => string = () => crypto.randomUUID(),
): ClassifyMeetingClient {
  return {
    async classify(input, outputLocale, signal) {
      try {
        const request = classifyMeetingRequestSchema.parse({
          input,
          outputLocale,
          requestId: createRequestId(),
          task: classifyMeetingTask,
        });
        const response = await fetchImplementation('/api/ai/classify-meeting', {
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal,
        });
        const body: unknown = await response.json();
        const failure = meetingAIErrorResponseSchema.safeParse(body);
        if (failure.success) return failure.data;

        const success = classifyMeetingResponseSchema.safeParse(body);
        if (!success.success) return { error: { code: 'UNKNOWN' }, ok: false };
        if (success.data.requestId !== request.requestId || success.data.task !== request.task) {
          return { error: { code: 'REQUEST_CANCELLED' }, ok: false };
        }
        return {
          ok: true,
          value: classifyMeetingOutputSchema.parse(success.data.output),
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return { error: { code: 'REQUEST_CANCELLED' }, ok: false };
        }
        return { error: { code: 'PROVIDER_UNAVAILABLE' }, ok: false };
      }
    },
  };
}

export const classifyMeetingClient = createClassifyMeetingClient();
