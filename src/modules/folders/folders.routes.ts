import { Router } from 'express';
import { foldersController } from './folders.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Tree view
router.get('/tree', foldersController.getTree.bind(foldersController));

// CRUD
router.post('/', foldersController.create.bind(foldersController));
router.get('/', foldersController.list.bind(foldersController));
router.get('/:id', foldersController.getById.bind(foldersController));
router.get('/:id/contents', foldersController.getContents.bind(foldersController));
router.patch('/:id', foldersController.rename.bind(foldersController));
router.patch('/:id/move', foldersController.move.bind(foldersController));
router.delete('/:id', foldersController.delete.bind(foldersController));

export default router;
