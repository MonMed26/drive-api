import { Request, Response, NextFunction } from 'express';
import { googleDriveService, DriveCredentials } from '../../services/googleDrive';
import prisma from '../../database';
import { createError } from '../../middleware/errorHandler';

export class AccountsController {
  /**
   * GET /api/accounts - List all accounts
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await prisma.account.findMany({
        select: {
          id: true,
          email: true,
          totalStorage: true,
          usedStorage: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const result = accounts.map((a) => ({
        ...a,
        totalStorage: a.totalStorage.toString(),
        usedStorage: a.usedStorage.toString(),
        freeStorage: (a.totalStorage - a.usedStorage).toString(),
      }));

      res.json({ data: result, count: result.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/accounts/:id - Get account details
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const account = await prisma.account.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          totalStorage: true,
          usedStorage: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { files: true } },
        },
      });

      if (!account) {
        throw createError('Account not found', 404);
      }

      res.json({
        data: {
          ...account,
          totalStorage: account.totalStorage.toString(),
          usedStorage: account.usedStorage.toString(),
          freeStorage: (account.totalStorage - account.usedStorage).toString(),
          fileCount: account._count.files,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/accounts/oauth/url - Get OAuth2 authorization URL
   */
  async getOAuthUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = googleDriveService.getAuthUrl();
      res.json({ data: { url } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/accounts/oauth/callback - OAuth2 callback
   */
  async oauthCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        throw createError('Missing authorization code', 400);
      }

      // Exchange code for tokens
      const credentials = await googleDriveService.getTokensFromCode(code);

      // Get user email
      const email = await googleDriveService.getUserEmail(credentials);

      if (!email) {
        throw createError('Could not retrieve user email', 400);
      }

      // Check if account already exists
      const existing = await prisma.account.findUnique({ where: { email } });
      if (existing) {
        // Update credentials
        await prisma.account.update({
          where: { email },
          data: { credentials: JSON.stringify(credentials), isActive: true },
        });
        res.json({ data: { message: 'Account updated successfully', email } });
        return;
      }

      // Get storage quota
      const quota = await googleDriveService.getStorageQuota(credentials);

      // Create account
      const account = await prisma.account.create({
        data: {
          email,
          credentials: JSON.stringify(credentials),
          totalStorage: quota.total,
          usedStorage: quota.used,
          isActive: true,
        },
      });

      res.status(201).json({
        data: {
          id: account.id,
          email: account.email,
          totalStorage: account.totalStorage.toString(),
          usedStorage: account.usedStorage.toString(),
          message: 'Account added successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/accounts/:id - Delete an account
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const account = await prisma.account.findUnique({ where: { id } });
      if (!account) {
        throw createError('Account not found', 404);
      }

      await prisma.account.delete({ where: { id } });

      res.json({ data: { message: 'Account deleted successfully' } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/accounts/:id/refresh - Refresh OAuth token and storage info
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const account = await prisma.account.findUnique({ where: { id } });
      if (!account) {
        throw createError('Account not found', 404);
      }

      const credentials: DriveCredentials = JSON.parse(account.credentials);

      // Refresh token
      const newCredentials = await googleDriveService.refreshCredentials(credentials);

      // Get updated storage quota
      const quota = await googleDriveService.getStorageQuota(newCredentials);

      // Update account
      await prisma.account.update({
        where: { id },
        data: {
          credentials: JSON.stringify(newCredentials),
          totalStorage: quota.total,
          usedStorage: quota.used,
        },
      });

      res.json({
        data: {
          message: 'Account refreshed successfully',
          totalStorage: quota.total.toString(),
          usedStorage: quota.used.toString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const accountsController = new AccountsController();
