import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  buildExpandNodePrompt,
  expandNodeMaximumRequestBodyBytes,
  expandNodeOutputMatchesLocale,
  expandNodeOutputSchema,
  expandNodeRequestSchema,
  meetingAIErrorResponse,
  meetingAIJson,
  MeetingAIContractError,
  runConfiguredProviderCall,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(
      request,
      expandNodeRequestSchema,
      expandNodeMaximumRequestBodyBytes,
    );
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 20, 60, 'expand-node');
    const output = await runConfiguredProviderCall({
      abortSignal: request.signal,
      prompt: buildExpandNodePrompt(envelope.input, envelope.outputLocale),
      role: 'fast',
      schema: expandNodeOutputSchema,
      schemaName: 'ExpandNodeOutput',
      service,
    });
    if (!expandNodeOutputMatchesLocale(output, envelope.outputLocale)) {
      throw new MeetingAIContractError('OUTPUT_LANGUAGE_MISMATCH');
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
