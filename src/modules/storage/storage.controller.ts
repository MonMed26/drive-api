import { Request, Response, NextFunction } from 'express';
import prisma from '../../database';
import { createError } from '../../middleware/errorHandler';

export class StorageController {
  /**
   * GET /api/storage - Get aggregated storage info
   */
  async getAggregated(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await prisma.account.findMany({
        where: { isActive: true },
        select: {
          totalStorage: true,
          usedStorage: true,
        },
      });

      const totalStorage = accounts.reduce((sum, a) => sum + a.totalStorage, BigInt(0));
      const usedStorage = accounts.reduce((sum, a) => sum + a.usedStorage, BigInt(0));
      const freeStorage = totalStorage - usedStorage;

      const totalFiles = await prisma.file.count();

      res.json({
        data: {
          totalStorage: totalStorage.toString(),
          usedStorage: usedStorage.toString(),
          freeStorage: freeStorage.toString(),
          usagePercentage: totalStorage > 0
            ? Number((usedStorage * BigInt(10000)) / totalStorage) / 100
            : 0,
          accountCount: accounts.length,
          totalFiles,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/storage/accounts - Get storage breakdown per account
   */
  async getPerAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await prisma.account.findMany({
        select: {
          id: true,
          email: true,
          totalStorage: true,
          usedStorage: true,
          isActive: true,
          _count: { select: { files: true } },
        },
      });

      const result = accounts.map((a) => ({
        id: a.id,
        email: a.email,
        totalStorage: a.totalStorage.toString(),
        usedStorage: a.usedStorage.toString(),
        freeStorage: (a.totalStorage - a.usedStorage).toString(),
        usagePercentage: a.totalStorage > BigInt(0)
          ? Number((a.usedStorage * BigInt(10000)) / a.totalStorage) / 100
          : 0,
        isActive: a.isActive,
        fileCount: a._count.files,
      }));

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const storageController = new StorageController();
