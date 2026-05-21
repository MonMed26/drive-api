import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../database';
import { googleDriveService, DriveCredentials } from '../../services/googleDrive';
import { generateSignedToken, verifySignedToken } from '../../utils/signedUrl';
import { createError } from '../../middleware/errorHandler';

export class CdnController {
  /**
   * POST /api/files/:id/publish - Make a file public
   */
  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findUnique({ where: { id } });
      if (!file) {
        throw createError('File not found', 404);
      }

      if (file.isPublic && file.publicSlug) {
        res.json({
          data: {
            message: 'File is already public',
            slug: file.publicSlug,
            url: `/cdn/${file.publicSlug}`,
          },
        });
        return;
      }

      // Generate unique slug
      const slug = uuidv4().replace(/-/g, '').substring(0, 12);

      await prisma.file.update({
        where: { id },
        data: { isPublic: true, publicSlug: slug },
      });

      res.json({
        data: {
          message: 'File published successfully',
          slug,
          url: `/cdn/${slug}`,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/files/:id/publish - Revoke public access
   */
  async unpublish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findUnique({ where: { id } });
      if (!file) {
        throw createError('File not found', 404);
      }

      await prisma.file.update({
        where: { id },
        data: { isPublic: false, publicSlug: null },
      });

      res.json({ data: { message: 'Public access revoked' } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/files/:id/signed-url - Generate signed URL
   */
  async getSignedUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const expiry = req.query.expiry ? parseInt(req.query.expiry as string) : undefined;

      const file = await prisma.file.findUnique({ where: { id } });
      if (!file) {
        throw createError('File not found', 404);
      }

      const token = generateSignedToken(file.id, expiry);

      res.json({
        data: {
          url: `/cdn/signed/${token}`,
          expiresIn: expiry || 3600,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /cdn/:slug - Public file access (no auth)
   */
  async servePublic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;

      const file = await prisma.file.findUnique({
        where: { publicSlug: slug },
        include: { account: true },
      });

      if (!file || !file.isPublic) {
        throw createError('File not found or not public', 404);
      }

      const credentials: DriveCredentials = JSON.parse(file.account.credentials);
      const stream = await googleDriveService.downloadFile(credentials, file.driveFileId);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (file.size > 0) {
        res.setHeader('Content-Length', file.size.toString());
      }

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /cdn/signed/:token - Signed URL file access (no auth)
   */
  async serveSigned(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;

      const payload = verifySignedToken(token);
      if (!payload) {
        throw createError('Invalid or expired signed URL', 403);
      }

      const file = await prisma.file.findUnique({
        where: { id: payload.fileId },
        include: { account: true },
      });

      if (!file) {
        throw createError('File not found', 404);
      }

      const credentials: DriveCredentials = JSON.parse(file.account.credentials);
      const stream = await googleDriveService.downloadFile(credentials, file.driveFileId);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (file.size > 0) {
        res.setHeader('Content-Length', file.size.toString());
      }

      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
}

export const cdnController = new CdnController();
