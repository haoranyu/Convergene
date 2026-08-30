import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { providerPresets, type ProviderConfigPreload } from '../provider-config/server';
import {
  resolveConfiguredProviderCaller,
  runConfiguredProviderCall,
} from './configured-provider-call';
import { ProviderGatewayError } from './provider-adapter';

const outputSchema = z.object({ status: z.literal('ok') }).strict();

describe('runConfiguredProviderCall', () => {
  it('attributes a confirmed authentication failure to the credential revision used', async () => {
    const markNeedsReconfiguration = vi.fn().mockResolvedValue(undefined);
    const service = {
      markNeedsReconfiguration,
      resolve: vi.fn().mockResolvedValue({
        apiKey: 'test-only-placeholder-key',
        credentialRevision: 'credential-revision-1',
        models: providerPresets.STEPFUN.models,
        provider: 'STEPFUN' as const,
      }),
    };

    await expect(
      runConfiguredProviderCall({
        fetch: () => Promise.resolve(new Response(null, { status: 401 })),
        prompt: 'Return status=ok.',
        role: 'fast',
        schema: outputSchema,
        schemaName: 'SafeTestOutput',
        service,
      }),
    ).rejects.toEqual(new ProviderGatewayError('PROVIDER_AUTH_FAILED'));

    expect(markNeedsReconfiguration).toHaveBeenCalledOnce();
    expect(markNeedsReconfiguration).toHaveBeenCalledWith('STEPFUN', 'credential-revision-1');
  });

  it('keeps one resolved credential across repeated provider attempts', async () => {
    const markNeedsReconfiguration = vi.fn().mockResolvedValue(undefined);
    const resolve = vi.fn().mockResolvedValue({
      apiKey: 'test-only-placeholder-key',
      credentialRevision: 'credential-revision-2',
      models: providerPresets.SILICONFLOW.models,
      provider: 'SILICONFLOW' as const,
    });
    const preload: ProviderConfigPreload = {
      key: `provider-config:${'a'.repeat(64)}`,
      record: { version: 2 },
    };
    const callProvider = await resolveConfiguredProviderCaller(
      {
        markNeedsReconfiguration,
        resolve,
      },
      preload,
    );
    const options = {
      fetch: () => Promise.resolve(new Response(null, { status: 401 })),
      prompt: 'Return status=ok.',
      role: 'fast' as const,
      schema: outputSchema,
      schemaName: 'SafeTestOutput',
    };

    await expect(callProvider(options)).rejects.toEqual(
      new ProviderGatewayError('PROVIDER_AUTH_FAILED'),
    );
    await expect(callProvider(options)).rejects.toEqual(
      new ProviderGatewayError('PROVIDER_AUTH_FAILED'),
    );

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(preload);
    expect(markNeedsReconfiguration).toHaveBeenCalledTimes(2);
    expect(markNeedsReconfiguration).toHaveBeenNthCalledWith(
      1,
      'SILICONFLOW',
      'credential-revision-2',
    );
    expect(markNeedsReconfiguration).toHaveBeenNthCalledWith(
      2,
      'SILICONFLOW',
      'credential-revision-2',
    );
  });
});
