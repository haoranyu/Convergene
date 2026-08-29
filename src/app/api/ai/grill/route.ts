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
  grillMaximumRequestBodyBytes,
  grillRequestSchema,
  providerGrillOutputSchema,
} from '@/features/preparation/ai-contract';
import { runReliableGrillCall } from '@/features/preparation/preparation-reliability';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(request, grillRequestSchema, grillMaximumRequestBodyBytes);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 20, 60, 'grill');
    const config = await service.resolve();
    const output = await runReliableGrillCall({
      callProvider: (prompt) =>
        runStructuredProviderCall({
          abortSignal: request.signal,
          config,
          maxOutputTokens: 4_096,
          prompt,
          role: 'grill',
          schema: providerGrillOutputSchema,
          schemaName: 'GrillOutput',
          timeoutMs: 45_000,
        }),
      input: envelope.input,
      outputLocale: envelope.outputLocale,
    });
    return meetingAIJson({ output, requestId: envelope.requestId, task: envelope.task });
  } catch (error) {
    return meetingAIErrorResponse(error);
  }
}
