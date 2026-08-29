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
  ProviderGatewayError,
  runStructuredProviderCall,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';
import {
  grillOutputSchema,
  grillMaximumRequestBodyBytes,
  grillRequestSchema,
  parseGrillOutput,
} from '@/features/preparation/ai-contract';
import {
  buildGrillPrompt,
  grillOutputGeneratedText,
} from '@/features/preparation/preparation-prompts';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(request, grillRequestSchema, grillMaximumRequestBodyBytes);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 20, 60, 'grill');
    const config = await service.resolve();
    const rawOutput = await runStructuredProviderCall({
      abortSignal: request.signal,
      config,
      maxOutputTokens: 3_072,
      prompt: buildGrillPrompt(envelope.input, envelope.outputLocale),
      role: 'grill',
      schema: grillOutputSchema,
      schemaName: 'GrillOutput',
    });
    let output;
    try {
      output = parseGrillOutput(envelope.input, rawOutput);
    } catch {
      throw new ProviderGatewayError('OUTPUT_INVALID');
    }
    if (!generatedTextMatchesLocale(grillOutputGeneratedText(output), envelope.outputLocale)) {
      throw new MeetingAIContractError();
    }
    return meetingAIJson({ output, requestId: envelope.requestId, task: envelope.task });
  } catch (error) {
    return meetingAIErrorResponse(error);
  }
}
