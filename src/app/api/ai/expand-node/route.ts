import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
} from '@/modules/api-security';
import {
  formatExpandServerTiming,
  expandNodeMaximumRequestBodyBytes,
  expandNodeRequestSchema,
  meetingAIErrorResponse,
  meetingAIJson,
  resolveConfiguredProviderCaller,
  runExpandNodeProviderTask,
  type ExpandTimingStage,
} from '@/modules/meeting-ai/server';
import { createProviderConfigRuntime } from '@/modules/provider-config/server';

export const runtime = 'nodejs';

async function measure<Output>(
  stage: ExpandTimingStage,
  timings: Partial<Record<ExpandTimingStage, number>>,
  operation: () => Promise<Output>,
): Promise<Output> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    timings[stage] = performance.now() - startedAt;
  }
}

function withServerTiming(
  response: Response,
  startedAt: number,
  timings: Partial<Record<ExpandTimingStage, number>>,
): Response {
  response.headers.set('Server-Timing', formatExpandServerTiming(startedAt, timings));
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const timings: Partial<Record<ExpandTimingStage, number>> = {};

  try {
    assertSameOrigin(request);
    const envelope = await readJsonInput(
      request,
      expandNodeRequestSchema,
      expandNodeMaximumRequestBodyBytes,
    );
    const { service, store } = await createProviderConfigRuntime();
    const rateLimitGrant = await measure('rate', timings, () =>
      enforceProviderConfigRateLimit(request, store, 20, 60, 'expand-node'),
    );
    const callProvider = await measure('config', timings, () =>
      resolveConfiguredProviderCaller(service, 'fast', rateLimitGrant.config),
    );
    const output = await measure('provider', timings, () =>
      runExpandNodeProviderTask(callProvider, envelope, request.signal),
    );
    return withServerTiming(
      meetingAIJson({
        output,
        requestId: envelope.requestId,
        task: envelope.task,
      }),
      startedAt,
      timings,
    );
  } catch (error) {
    return withServerTiming(meetingAIErrorResponse(error), startedAt, timings);
  }
}
