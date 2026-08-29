import { enforceProviderConfigRateLimit } from '@/modules/api-security';
import {
  createProviderConfigRuntime,
  providerConfigErrorResponse,
  providerConfigJson,
} from '@/modules/provider-config/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const { service, store } = await createProviderConfigRuntime();
    await enforceProviderConfigRateLimit(request, store, 60);
    return providerConfigJson({ ok: true, value: await service.getStatus() });
  } catch (error) {
    return providerConfigErrorResponse(error);
  }
}
