import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  expandNodeMaximumRequestBodyBytes,
  expandNodeRequestSchema,
  meetingAIErrorResponse,
  meetingAIJson,
  resolveConfiguredProviderCaller,
  runExpandNodeProviderTask,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';

export const runtime = 'nodejs';

function withServerTiming(response: Response, startedAt: number): Response {
  response.headers.set('Server-Timing', `expand;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();

  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(
      request,
      expandNodeRequestSchema,
      expandNodeMaximumRequestBodyBytes,
    );
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 20, 60, 'expand-node');
    const callProvider = await resolveConfiguredProviderCaller(service);
    const output = await runExpandNodeProviderTask(callProvider, envelope, request.signal);
    return withServerTiming(
      meetingAIJson({
        output,
        requestId: envelope.requestId,
        task: envelope.task,
      }),
      startedAt,
    );
  } catch (error) {
    return withServerTiming(meetingAIErrorResponse(error), startedAt);
  }
}
