import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const algorithm = 'aes-256-gcm';
const authenticationTagBytes = 16;
const initializationVectorBytes = 12;
const secretBytes = 32;

export interface AesGcmEnvelope {
  authTag: string;
  ciphertext: string;
  iv: string;
  version: 1;
}

function decodeCanonicalBase64(value: string, label: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(`${label} must be canonical base64`);
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`${label} must be canonical base64`);
  }

  return decoded;
}

function decodeEncryptionSecret(encodedSecret: string): Buffer {
  const secret = decodeCanonicalBase64(encodedSecret, 'APP_ENCRYPTION_SECRET');

  if (secret.byteLength !== secretBytes) {
    throw new Error('APP_ENCRYPTION_SECRET must decode to exactly 32 bytes');
  }

  return secret;
}

function decodeEnvelopePart(value: string, label: string, expectedBytes?: number): Buffer {
  const decoded = decodeCanonicalBase64(value, label);

  if (expectedBytes !== undefined && decoded.byteLength !== expectedBytes) {
    throw new Error(`${label} has an invalid length`);
  }

  return decoded;
}

export function encryptCredential(plaintext: string, encodedSecret: string): AesGcmEnvelope {
  const iv = randomBytes(initializationVectorBytes);
  const cipher = createCipheriv(algorithm, decodeEncryptionSecret(encodedSecret), iv, {
    authTagLength: authenticationTagBytes,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    version: 1,
  };
}

export function decryptCredential(envelope: AesGcmEnvelope, encodedSecret: string): string {
  if (envelope.version !== 1) {
    throw new Error('Unsupported encrypted credential version');
  }

  const decipher = createDecipheriv(
    algorithm,
    decodeEncryptionSecret(encodedSecret),
    decodeEnvelopePart(envelope.iv, 'Encrypted credential IV', initializationVectorBytes),
    { authTagLength: authenticationTagBytes },
  );
  decipher.setAuthTag(
    decodeEnvelopePart(
      envelope.authTag,
      'Encrypted credential authentication tag',
      authenticationTagBytes,
    ),
  );

  return Buffer.concat([
    decipher.update(decodeEnvelopePart(envelope.ciphertext, 'Encrypted credential ciphertext')),
    decipher.final(),
  ]).toString('utf8');
}
