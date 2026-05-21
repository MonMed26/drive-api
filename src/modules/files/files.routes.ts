import { Router } from 'express';
import multer from 'multer';
import { filesController } from './files.controller';
import { authMiddleware } from '../../middleware/auth';
import { uploadRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Multer config - store in memory buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
});

// All routes require auth
router.use(authMiddleware);

// File operations
router.post('/upload', uploadRateLimiter, upload.single('file'), filesController.upload.bind(filesController));
router.get('/', filesController.list.bind(filesController));
router.get('/search', filesController.search.bind(filesController));
router.get('/:id', filesController.getById.bind(filesController));
router.get('/:id/download', filesController.download.bind(filesController));
router.patch('/:id/move', filesController.move.bind(filesController));
router.patch('/:id/rename', filesController.rename.bind(filesController));
router.delete('/:id', filesController.delete.bind(filesController));

export default router;
