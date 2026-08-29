import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  buildClassifyMeetingPrompt,
  classifyMeetingMaximumRequestBodyBytes,
  classifyMeetingOutputMatchesLocale,
  classifyMeetingRequestSchema,
  classifyMeetingOutputSchema,
  meetingAIErrorResponse,
  meetingAIJson,
  MeetingAIContractError,
  runStructuredProviderCall,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(
      request,
      classifyMeetingRequestSchema,
      classifyMeetingMaximumRequestBodyBytes,
    );
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 20, 60, 'classify-meeting');
    const config = await service.resolve();
    const output = await runStructuredProviderCall({
      abortSignal: request.signal,
      config,
      prompt: buildClassifyMeetingPrompt(envelope.input, envelope.outputLocale),
      role: 'fast',
      schema: classifyMeetingOutputSchema,
      schemaName: 'ClassifyMeetingOutput',
    });
    if (!classifyMeetingOutputMatchesLocale(output, envelope.outputLocale)) {
      throw new MeetingAIContractError();
    }
    return meetingAIJson({
      output,
      requestId: envelope.requestId,
      task: envelope.task,
    });
  } catch (error) {
    return meetingAIErrorResponse(error);
  }
}
