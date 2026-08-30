import { z } from 'zod';

export const providerOutputFailureKinds = [
  'UPSTREAM_REJECTED',
  'NO_OUTPUT',
  'TRUNCATED',
  'CONTENT_FILTERED',
  'JSON_PARSE',
  'SCHEMA_MISMATCH',
  'UNKNOWN',
] as const;

export const providerOutputFailureSchema = z.enum(providerOutputFailureKinds);

export type ProviderOutputFailure = z.infer<typeof providerOutputFailureSchema>;
