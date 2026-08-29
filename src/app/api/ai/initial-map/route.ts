import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  generatedTextMatchesLocale,
  meetingAIErrorResponse,
  meetingAIJson,
  MeetingAIContractError,
  runStructuredProviderCall,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';
import {
  initialMapOutputSchema,
  initialMapMaximumRequestBodyBytes,
  initialMapRequestSchema,
} from '@/features/preparation/ai-contract';
import {
  buildInitialMapPrompt,
  initialMapOutputGeneratedText,
} from '@/features/preparation/preparation-prompts';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(
      request,
      initialMapRequestSchema,
      initialMapMaximumRequestBodyBytes,
    );
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 12, 60, 'initial-map');
    const config = await service.resolve();
    const output = await runStructuredProviderCall({
      abortSignal: request.signal,
      config,
      maxOutputTokens: 3_072,
      prompt: buildInitialMapPrompt(envelope.input, envelope.outputLocale),
      role: 'grill',
      schema: initialMapOutputSchema,
      schemaName: 'InitialMapOutput',
      timeoutMs: 30_000,
    });
    if (!generatedTextMatchesLocale(initialMapOutputGeneratedText(output), envelope.outputLocale)) {
      throw new MeetingAIContractError();
    }
    return meetingAIJson({ output, requestId: envelope.requestId, task: envelope.task });
  } catch (error) {
    return meetingAIErrorResponse(error);
  }
}
