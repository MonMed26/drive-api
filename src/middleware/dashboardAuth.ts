import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

// Dashboard admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update('50223044')
  .digest('hex');

const SESSION_COOKIE = 'gdagg_session';
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a session token
 */
export function generateSessionToken(): string {
  const payload = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  const signature = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(payload)
    .digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/**
 * Verify a session token
 */
export function verifySessionToken(token: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payloadBase64, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(Buffer.from(payloadBase64, 'base64url').toString())
    .digest('hex');

  if (signature !== expectedSignature) return false;

  // Check expiry
  try {
    const payload = Buffer.from(payloadBase64, 'base64url').toString();
    const timestamp = parseInt(payload.split('_')[0], 10);
    if (Date.now() - timestamp > SESSION_MAX_AGE) return false;
  } catch {
    return false;
  }

  return true;
}

/**
 * Validate login credentials
 */
export function validateCredentials(username: string, password: string): boolean {
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  return username === ADMIN_USERNAME && passwordHash === ADMIN_PASSWORD_HASH;
}

/**
 * Middleware to protect dashboard routes
 */
export function dashboardAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];

  if (!token || !verifySessionToken(token)) {
    // If requesting a page, redirect to login
    if (req.accepts('html')) {
      res.redirect('/dashboard/login');
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export { SESSION_COOKIE };
