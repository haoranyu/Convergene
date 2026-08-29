import {
  classifyMeetingOutputSchema,
  meetingAIApiResponseSchema,
  type ClassifyMeetingInput,
  type ClassifyMeetingOutput,
  type MeetingAIApiResponse,
} from '@/modules/meeting-ai/classify-meeting';

export interface ClassifyMeetingClient {
  classify(
    input: ClassifyMeetingInput,
    signal?: AbortSignal,
  ): Promise<MeetingAIApiResponse<ClassifyMeetingOutput>>;
}

export function createClassifyMeetingClient(
  fetchImplementation: typeof fetch = globalThis.fetch,
): ClassifyMeetingClient {
  return {
    async classify(input, signal) {
      try {
        const response = await fetchImplementation('/api/ai/classify-meeting', {
          body: JSON.stringify(input),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal,
        });
        return meetingAIApiResponseSchema(classifyMeetingOutputSchema).parse(await response.json());
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
