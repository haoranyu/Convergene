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

function decodeEncryptionSecret(encodedSecret: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSecret)) {
    throw new Error('APP_ENCRYPTION_SECRET must be canonical base64');
  }

  const secret = Buffer.from(encodedSecret, 'base64');
  const canonicalInput = encodedSecret.replace(/=+$/, '');
  const canonicalDecoded = secret.toString('base64').replace(/=+$/, '');

  if (secret.byteLength !== secretBytes || canonicalInput !== canonicalDecoded) {
    throw new Error('APP_ENCRYPTION_SECRET must decode to exactly 32 bytes');
  }

  return secret;
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
    Buffer.from(envelope.iv, 'base64'),
    { authTagLength: authenticationTagBytes },
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
