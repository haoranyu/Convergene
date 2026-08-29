import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decryptCredential, encryptCredential } from './aes-gcm';

const encryptionSecret = randomBytes(32).toString('base64');
const syntheticCredential = 'test-only-provider-credential';

function alterBase64(value: string): string {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] = bytes[0] ^ 1;
  return bytes.toString('base64');
}

describe('AES-256-GCM credential validation', () => {
  it('round-trips a credential with a fresh 96-bit IV', () => {
    const firstEnvelope = encryptCredential(syntheticCredential, encryptionSecret);
    const secondEnvelope = encryptCredential(syntheticCredential, encryptionSecret);

    expect(decryptCredential(firstEnvelope, encryptionSecret)).toBe(syntheticCredential);
    expect(Buffer.from(firstEnvelope.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(firstEnvelope.authTag, 'base64')).toHaveLength(16);
    expect(secondEnvelope.iv).not.toBe(firstEnvelope.iv);
    expect(firstEnvelope.ciphertext).not.toContain(syntheticCredential);
  });

  it('rejects the wrong encryption secret', () => {
    const envelope = encryptCredential(syntheticCredential, encryptionSecret);
    const wrongSecret = randomBytes(32).toString('base64');

    expect(() => decryptCredential(envelope, wrongSecret)).toThrow();
  });

  it.each(['ciphertext', 'authTag'] as const)('rejects a modified %s', (field) => {
    const envelope = encryptCredential(syntheticCredential, encryptionSecret);

    expect(() =>
      decryptCredential({ ...envelope, [field]: alterBase64(envelope[field]) }, encryptionSecret),
    ).toThrow();
  });

  it.each(['not-base64', Buffer.alloc(31).toString('base64')])(
    'rejects an invalid encryption secret without using it',
    (invalidSecret) => {
      expect(() => encryptCredential(syntheticCredential, invalidSecret)).toThrow();
    },
  );

  it.each([
    { field: 'iv', value: Buffer.alloc(11).toString('base64') },
    { field: 'iv', value: 'not-base64' },
    { field: 'authTag', value: Buffer.alloc(15).toString('base64') },
    { field: 'ciphertext', value: 'not-base64' },
  ] as const)('rejects malformed envelope field $field', ({ field, value }) => {
    const envelope = encryptCredential(syntheticCredential, encryptionSecret);

    expect(() => decryptCredential({ ...envelope, [field]: value }, encryptionSecret)).toThrow();
  });
});
