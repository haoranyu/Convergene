import 'server-only';

import { ApiSecurityError } from '@/modules/api-security';
import {
  ProviderConfigServiceError,
  ResolvedProviderConfigError,
} from '@/modules/provider-config/server';

import { MeetingAIContractError, type MeetingAIErrorCode } from './classify-meeting';
import { ProviderGatewayError } from './provider-adapter';

function statusForCode(code: MeetingAIErrorCode): number {
  switch (code) {
    case 'INPUT_INVALID':
      return 400;
    case 'ORIGIN_INVALID':
      return 403;
    case 'PROVIDER_AUTH_FAILED':
      return 401;
    case 'OUTPUT_INVALID':
    case 'OUTPUT_LANGUAGE_MISMATCH':
    case 'PROVIDER_CONFIG_INVALID':
    case 'PROVIDER_MODEL_NOT_FOUND':
      return 422;
    case 'PROVIDER_RATE_LIMITED':
    case 'RATE_LIMITED':
      return 429;
    case 'REQUEST_CANCELLED':
      return 408;
    case 'PROVIDER_CONFIG_UNAVAILABLE':
    case 'PROVIDER_NOT_CONFIGURED':
    case 'PROVIDER_UNAVAILABLE':
      return 503;
    case 'UNKNOWN':
      return 500;
  }
}

export function meetingAIJson<Body>(body: Body, status = 200): Response {
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' }, status });
}

export function meetingAIErrorResponse(error: unknown): Response {
  const code: MeetingAIErrorCode =
    error instanceof ApiSecurityError ||
    error instanceof MeetingAIContractError ||
    error instanceof ProviderGatewayError ||
    error instanceof ResolvedProviderConfigError ||
    error instanceof ProviderConfigServiceError
      ? error.code
      : 'UNKNOWN';
  return meetingAIJson({ error: { code }, ok: false }, statusForCode(code));
}
