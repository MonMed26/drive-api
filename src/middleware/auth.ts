import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../database';
import { config } from '../config';

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key. Provide X-API-Key header.' });
    return;
  }

  const keyHash = crypto
    .createHmac('sha256', config.apiKeySecret)
    .update(apiKey)
    .digest('hex');

  const keyRecord = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!keyRecord || !keyRecord.isActive) {
    res.status(401).json({ error: 'Invalid or inactive API key.' });
    return;
  }

  // Update last used timestamp
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  // Attach permissions to request
  (req as any).apiKeyPermissions = JSON.parse(keyRecord.permissions);
  (req as any).apiKeyId = keyRecord.id;

  next();
}
