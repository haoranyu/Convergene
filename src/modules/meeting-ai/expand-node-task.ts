import 'server-only';

import { MeetingAIContractError } from './classify-meeting';
import type { ConfiguredProviderCaller } from './configured-provider-call';
import {
  expandNodeOutputMatchesLocale,
  expandNodeOutputSchema,
  expandNodeProviderOutputSchema,
  expandNodeRequestSchema,
  type ExpandNodeOutput,
  type ExpandNodeRequest,
} from './expand-node';
import { buildExpandNodePrompt } from './expand-node-prompt';

export const expandNodeMaxOutputTokens = 1_024;
export const expandNodeTimeoutMs = 15_000;

export async function runExpandNodeProviderTask(
  callProvider: ConfiguredProviderCaller,
  rawRequest: ExpandNodeRequest,
  abortSignal?: AbortSignal,
): Promise<ExpandNodeOutput> {
  const request = expandNodeRequestSchema.parse(rawRequest);
  const rawOutput = await callProvider({
    abortSignal,
    maxOutputTokens: expandNodeMaxOutputTokens,
    prompt: buildExpandNodePrompt(request.input, request.outputLocale),
    role: 'fast',
    schema: expandNodeProviderOutputSchema,
    schemaName: 'ExpandNodeOutput',
    timeoutMs: expandNodeTimeoutMs,
  });
  const providerOutput = expandNodeProviderOutputSchema.safeParse(rawOutput);
  if (!providerOutput.success) {
    throw new MeetingAIContractError('OUTPUT_INVALID');
  }
  const domainOutput = expandNodeOutputSchema.safeParse(providerOutput.data);
  if (!domainOutput.success) {
    throw new MeetingAIContractError('OUTPUT_INVALID');
  }
  const output = domainOutput.data;

  if (!expandNodeOutputMatchesLocale(output, request.outputLocale)) {
    throw new MeetingAIContractError('OUTPUT_LANGUAGE_MISMATCH');
  }

  return output;
}
