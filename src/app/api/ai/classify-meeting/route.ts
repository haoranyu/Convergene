import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  buildClassifyMeetingPrompt,
  classifyMeetingInputSchema,
  classifyMeetingOutputSchema,
  meetingAIErrorResponse,
  meetingAIJson,
  runStructuredProviderCall,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = await readJsonInput(request, classifyMeetingInputSchema, 8_192);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 20, 60);
    const config = await service.resolve();
    const output = await runStructuredProviderCall({
      abortSignal: request.signal,
      config,
      prompt: buildClassifyMeetingPrompt(input),
      role: 'fast',
      schema: classifyMeetingOutputSchema,
      schemaName: 'ClassifyMeetingOutput',
    });
    return meetingAIJson({ ok: true, value: output });
  } catch (error) {
    return meetingAIErrorResponse(error);
  }
}
