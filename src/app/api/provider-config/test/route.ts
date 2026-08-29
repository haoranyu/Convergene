import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readProviderConfigInput,
} from '@/modules/api-security';
import {
  createProviderConfigRuntime,
  providerConfigErrorResponse,
  providerConfigJson,
} from '@/modules/provider-config/http-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = await readProviderConfigInput(request);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store);
    return providerConfigJson({ ok: true, value: await service.test(input, request.signal) });
  } catch (error) {
    return providerConfigErrorResponse(error);
  }
}
