import { Request, Response, NextFunction } from 'express';
import prisma from '../../database';
import { createError } from '../../middleware/errorHandler';

export class FoldersController {
  /**
   * POST /api/folders - Create a new folder
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, parentId } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw createError('Folder name is required', 400);
      }

      // Validate parent exists if provided
      if (parentId) {
        const parent = await prisma.folder.findUnique({ where: { id: parentId } });
        if (!parent) {
          throw createError('Parent folder not found', 404);
        }
      }

      // Check duplicate name in same parent
      const existing = await prisma.folder.findFirst({
        where: { name: name.trim(), parentId: parentId || null },
      });
      if (existing) {
        throw createError('A folder with this name already exists in this location', 409);
      }

      const folder = await prisma.folder.create({
        data: {
          name: name.trim(),
          parentId: parentId || null,
        },
      });

      res.status(201).json({ data: folder });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/folders - List folders (root level or by parentId)
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { parentId } = req.query;

      const folders = await prisma.folder.findMany({
        where: { parentId: (parentId as string) || null },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { children: true, files: true } },
        },
      });

      res.json({ data: folders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/folders/:id - Get folder details with breadcrumb
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const folder = await prisma.folder.findUnique({
        where: { id },
        include: {
          children: {
            orderBy: { name: 'asc' },
            include: { _count: { select: { children: true, files: true } } },
          },
          files: {
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              mimeType: true,
              size: true,
              isPublic: true,
              publicSlug: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!folder) {
        throw createError('Folder not found', 404);
      }

      // Build breadcrumb
      const breadcrumb = await this.buildBreadcrumb(id);

      res.json({
        data: {
          ...folder,
          files: folder.files.map(f => ({ ...f, size: f.size.toString() })),
          breadcrumb,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/folders/:id/contents - Get folder contents (subfolders + files)
   */
  async getContents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const folder = await prisma.folder.findUnique({ where: { id } });
      if (!folder) {
        throw createError('Folder not found', 404);
      }

      const [subfolders, files] = await Promise.all([
        prisma.folder.findMany({
          where: { parentId: id },
          orderBy: { name: 'asc' },
          include: { _count: { select: { children: true, files: true } } },
        }),
        prisma.file.findMany({
          where: { folderId: id },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            mimeType: true,
            size: true,
            isPublic: true,
            publicSlug: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      const breadcrumb = await this.buildBreadcrumb(id);

      res.json({
        data: {
          folder,
          subfolders,
          files: files.map(f => ({ ...f, size: f.size.toString() })),
          breadcrumb,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/folders/:id - Rename folder
   */
  async rename(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw createError('New folder name is required', 400);
      }

      const folder = await prisma.folder.findUnique({ where: { id } });
      if (!folder) {
        throw createError('Folder not found', 404);
      }

      // Check duplicate name in same parent
      const existing = await prisma.folder.findFirst({
        where: { name: name.trim(), parentId: folder.parentId, id: { not: id } },
      });
      if (existing) {
        throw createError('A folder with this name already exists in this location', 409);
      }

      const updated = await prisma.folder.update({
        where: { id },
        data: { name: name.trim() },
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/folders/:id/move - Move folder to another parent
   */
  async move(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { parentId } = req.body;

      const folder = await prisma.folder.findUnique({ where: { id } });
      if (!folder) {
        throw createError('Folder not found', 404);
      }

      // Cannot move to itself
      if (parentId === id) {
        throw createError('Cannot move folder into itself', 400);
      }

      // Validate target parent exists (null = root)
      if (parentId) {
        const parent = await prisma.folder.findUnique({ where: { id: parentId } });
        if (!parent) {
          throw createError('Target parent folder not found', 404);
        }

        // Prevent circular reference - check if target is a descendant
        const isDescendant = await this.isDescendantOf(parentId, id);
        if (isDescendant) {
          throw createError('Cannot move folder into its own descendant', 400);
        }
      }

      // Check duplicate name in target
      const existing = await prisma.folder.findFirst({
        where: { name: folder.name, parentId: parentId || null, id: { not: id } },
      });
      if (existing) {
        throw createError('A folder with this name already exists in the target location', 409);
      }

      const updated = await prisma.folder.update({
        where: { id },
        data: { parentId: parentId || null },
      });

      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/folders/:id - Delete folder and all contents
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const folder = await prisma.folder.findUnique({ where: { id } });
      if (!folder) {
        throw createError('Folder not found', 404);
      }

      // Cascade delete handled by Prisma (onDelete: Cascade for children)
      // Files will have folderId set to null (onDelete: SetNull)
      await prisma.folder.delete({ where: { id } });

      res.json({ data: { message: 'Folder deleted successfully' } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/folders/tree - Get full folder tree
   */
  async getTree(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const allFolders = await prisma.folder.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { children: true, files: true } } },
      });

      // Build tree structure
      const tree = this.buildTree(allFolders, null);

      res.json({ data: tree });
    } catch (error) {
      next(error);
    }
  }

  // Helper: Build breadcrumb path from folder to root
  private async buildBreadcrumb(folderId: string): Promise<{ id: string; name: string }[]> {
    const breadcrumb: { id: string; name: string }[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const found: { id: string; name: string; parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
      if (!found) break;
      breadcrumb.unshift({ id: found.id, name: found.name });
      currentId = found.parentId;
    }

    return breadcrumb;
  }

  // Helper: Check if targetId is a descendant of ancestorId
  private async isDescendantOf(targetId: string, ancestorId: string): Promise<boolean> {
    let currentId: string | null = targetId;
    while (currentId) {
      if (currentId === ancestorId) return true;
      const found: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
      if (!found) break;
      currentId = found.parentId;
    }
    return false;
  }

  // Helper: Build tree from flat list
  private buildTree(folders: any[], parentId: string | null): any[] {
    return folders
      .filter(f => f.parentId === parentId)
      .map(f => ({
        id: f.id,
        name: f.name,
        childrenCount: f._count.children,
        filesCount: f._count.files,
        children: this.buildTree(folders, f.id),
      }));
  }
}

export const foldersController = new FoldersController();
