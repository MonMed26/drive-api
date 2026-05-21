import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../database';
import { googleDriveService, DriveCredentials } from '../../services/googleDrive';
import { selectAccountForUpload } from '../../utils/storageStrategy';
import { createError } from '../../middleware/errorHandler';
import { generateSignedToken } from '../../utils/signedUrl';

export class FilesController {
  /**
   * POST /api/files/upload - Upload a file
   * Body fields (multipart):
   *   - file: the file to upload
   *   - path: virtual path (default: "/")
   *   - folderId: folder ID to upload into (optional, null = root)
   *   - cdn: "true" or "false" - whether to make file publicly accessible via CDN
   *   - cdnExpiry: number (seconds) - if set, generates a signed URL instead of public slug
   */
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        throw createError('No file provided', 400);
      }

      const { path: virtualPath, cdn, cdnExpiry, folderId } = req.body;
      const fileSize = BigInt(file.size);
      const enableCdn = cdn === 'true' || cdn === '1';
      const expirySeconds = cdnExpiry ? parseInt(cdnExpiry, 10) : undefined;

      // Validate folder exists if provided
      if (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) {
          throw createError('Folder not found', 404);
        }
      }

      // Select best account based on storage strategy
      const account = await selectAccountForUpload(fileSize);
      if (!account) {
        throw createError('No available storage account with enough free space', 507);
      }

      const credentials: DriveCredentials = JSON.parse(account.credentials);

      // Upload to Google Drive
      const driveResult = await googleDriveService.uploadFile(
        credentials,
        file.originalname,
        file.mimetype,
        file.buffer
      );

      // Determine CDN settings
      let isPublic = false;
      let publicSlug: string | null = null;

      if (enableCdn && !expirySeconds) {
        // Permanent public CDN link
        isPublic = true;
        publicSlug = uuidv4().replace(/-/g, '').substring(0, 12);
      }

      // Save metadata to database
      const fileRecord = await prisma.file.create({
        data: {
          id: uuidv4(),
          driveFileId: driveResult.id,
          accountId: account.id,
          folderId: folderId || null,
          name: file.originalname,
          mimeType: file.mimetype,
          size: fileSize,
          path: virtualPath || '/',
          isPublic,
          publicSlug,
        },
      });

      // Update account used storage
      await prisma.account.update({
        where: { id: account.id },
        data: { usedStorage: account.usedStorage + fileSize },
      });

      // Build CDN URLs in response
      let cdnUrl: string | null = null;
      let signedUrl: string | null = null;

      if (enableCdn) {
        if (expirySeconds) {
          // Generate signed URL with expiry
          const token = generateSignedToken(fileRecord.id, expirySeconds);
          signedUrl = `/cdn/signed/${token}`;
        } else {
          // Permanent public URL
          cdnUrl = `/cdn/${publicSlug}`;
        }
      }

      res.status(201).json({
        data: {
          id: fileRecord.id,
          name: fileRecord.name,
          mimeType: fileRecord.mimeType,
          size: fileRecord.size.toString(),
          path: fileRecord.path,
          folderId: fileRecord.folderId,
          accountId: fileRecord.accountId,
          isPublic: fileRecord.isPublic,
          cdnUrl,
          signedUrl,
          signedUrlExpiresIn: expirySeconds || null,
          createdAt: fileRecord.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files - List all files (paginated)
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const skip = (page - 1) * limit;

      const [files, total] = await Promise.all([
        prisma.file.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            path: true,
            isPublic: true,
            publicSlug: true,
            accountId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.file.count(),
      ]);

      const result = files.map((f) => ({
        ...f,
        size: f.size.toString(),
      }));

      res.json({
        data: result,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/search - Search files
   */
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, mimeType, path: filePath } = req.query;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const skip = (page - 1) * limit;

      const where: any = {};

      if (q && typeof q === 'string') {
        where.name = { contains: q };
      }
      if (mimeType && typeof mimeType === 'string') {
        where.mimeType = mimeType;
      }
      if (filePath && typeof filePath === 'string') {
        where.path = { startsWith: filePath };
      }

      const [files, total] = await Promise.all([
        prisma.file.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            path: true,
            isPublic: true,
            publicSlug: true,
            accountId: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.file.count({ where }),
      ]);

      const result = files.map((f) => ({
        ...f,
        size: f.size.toString(),
      }));

      res.json({
        data: result,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/:id - Get file metadata
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findUnique({
        where: { id },
        include: { account: { select: { email: true } } },
      });

      if (!file) {
        throw createError('File not found', 404);
      }

      res.json({
        data: {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size.toString(),
          path: file.path,
          isPublic: file.isPublic,
          publicSlug: file.publicSlug,
          accountEmail: file.account.email,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/:id/download - Download a file
   */
  async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findUnique({
        where: { id },
        include: { account: true },
      });

      if (!file) {
        throw createError('File not found', 404);
      }

      const credentials: DriveCredentials = JSON.parse(file.account.credentials);
      const stream = await googleDriveService.downloadFile(credentials, file.driveFileId);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      if (file.size > 0) {
        res.setHeader('Content-Length', file.size.toString());
      }

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/files/:id - Delete a file
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findUnique({
        where: { id },
        include: { account: true },
      });

      if (!file) {
        throw createError('File not found', 404);
      }

      const credentials: DriveCredentials = JSON.parse(file.account.credentials);

      // Delete from Google Drive
      await googleDriveService.deleteFile(credentials, file.driveFileId);

      // Update account used storage
      await prisma.account.update({
        where: { id: file.accountId },
        data: { usedStorage: { decrement: file.size } },
      });

      // Delete from database
      await prisma.file.delete({ where: { id } });

      res.json({ data: { message: 'File deleted successfully' } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/files/:id/move - Move file to a different folder
   */
  async move(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { folderId } = req.body;

      const file = await prisma.file.findUnique({ where: { id } });
      if (!file) {
        throw createError('File not found', 404);
      }

      // Validate target folder exists (null = move to root)
      if (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) {
          throw createError('Target folder not found', 404);
        }
      }

      const updated = await prisma.file.update({
        where: { id },
        data: { folderId: folderId || null },
      });

      res.json({
        data: {
          id: updated.id,
          name: updated.name,
          folderId: updated.folderId,
          message: 'File moved successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/files/:id/rename - Rename a file
   */
  async rename(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw createError('New file name is required', 400);
      }

      const file = await prisma.file.findUnique({ where: { id } });
      if (!file) {
        throw createError('File not found', 404);
      }

      const updated = await prisma.file.update({
        where: { id },
        data: { name: name.trim() },
      });

      res.json({ data: { id: updated.id, name: updated.name, message: 'File renamed successfully' } });
    } catch (error) {
      next(error);
    }
  }
}

export const filesController = new FilesController();
