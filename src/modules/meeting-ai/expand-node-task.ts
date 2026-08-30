import 'server-only';

import { MeetingAIContractError } from './classify-meeting';
import type { ConfiguredProviderCaller } from './configured-provider-call';
import {
  expandNodeOutputMatchesLocale,
  expandNodeOutputSchema,
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
  const output = await callProvider({
    abortSignal,
    maxOutputTokens: expandNodeMaxOutputTokens,
    prompt: buildExpandNodePrompt(request.input, request.outputLocale),
    role: 'fast',
    schema: expandNodeOutputSchema,
    schemaName: 'ExpandNodeOutput',
    timeoutMs: expandNodeTimeoutMs,
  });

  if (!expandNodeOutputMatchesLocale(output, request.outputLocale)) {
    throw new MeetingAIContractError('OUTPUT_LANGUAGE_MISMATCH');
  }

  return output;
}
