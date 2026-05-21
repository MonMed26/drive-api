import crypto from 'crypto';
import { config } from '../config';
import { SignedUrlPayload } from '../types';

/**
 * Generate a signed URL token for a file
 */
export function generateSignedToken(fileId: string, expirySeconds?: number): string {
  const expiry = Math.floor(Date.now() / 1000) + (expirySeconds || config.signedUrlExpiry);

  const payload: SignedUrlPayload = {
    fileId,
    exp: expiry,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', config.signedUrlSecret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verify and decode a signed URL token
 */
export function verifySignedToken(token: string): SignedUrlPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signature] = parts;

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', config.signedUrlSecret)
    .update(payloadBase64)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  // Decode payload
  try {
    const payload: SignedUrlPayload = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf-8')
    );

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
