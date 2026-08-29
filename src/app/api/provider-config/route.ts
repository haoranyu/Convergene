import {
  assertSameOrigin,
  enforceProviderConfigRateLimit,
  readJsonInput,
  readProviderConfigInput,
} from '@/modules/api-security';
import { providerSelectionInputSchema } from '@/modules/provider-config';
import {
  createProviderConfigRuntime,
  providerConfigErrorResponse,
  providerConfigJson,
} from '@/modules/provider-config/server';

export const runtime = 'nodejs';

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = await readProviderConfigInput(request);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store);
    return providerConfigJson({ ok: true, value: await service.save(input, request.signal) });
  } catch (error) {
    return providerConfigErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store);
    return providerConfigJson({ ok: true, value: await service.delete() });
  } catch (error) {
    return providerConfigErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = await readJsonInput(request, providerSelectionInputSchema);
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store);
    return providerConfigJson({
      ok: true,
      value: await service.setActiveProvider(input.activeProvider),
    });
  } catch (error) {
    return providerConfigErrorResponse(error);
  }
}
