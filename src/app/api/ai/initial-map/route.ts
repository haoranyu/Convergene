import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  meetingAIErrorResponse,
  meetingAIJson,
  runStructuredProviderCall,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';
import {
  initialMapMaximumRequestBodyBytes,
  initialMapRequestSchema,
  providerInitialMapOutputSchema,
} from '@/features/preparation/ai-contract';
import { runReliableInitialMapCall } from '@/features/preparation/preparation-reliability';

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
    const output = await runReliableInitialMapCall({
      callProvider: (prompt) =>
        runStructuredProviderCall({
          abortSignal: request.signal,
          config,
          maxOutputTokens: 8_192,
          prompt,
          role: 'grill',
          schema: providerInitialMapOutputSchema,
          schemaName: 'InitialMapContent',
          timeoutMs: 60_000,
        }),
      input: envelope.input,
      outputLocale: envelope.outputLocale,
    });
    return meetingAIJson({ output, requestId: envelope.requestId, task: envelope.task });
  } catch (error) {
    return meetingAIErrorResponse(error);
  }
}
