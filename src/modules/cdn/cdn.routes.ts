import { Router } from 'express';
import { cdnController } from './cdn.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// CDN public routes (no auth)
router.get('/cdn/:slug', cdnController.servePublic.bind(cdnController));
router.get('/cdn/signed/:token', cdnController.serveSigned.bind(cdnController));

// CDN management routes (auth required)
router.post('/api/files/:id/publish', authMiddleware, cdnController.publish.bind(cdnController));
router.delete('/api/files/:id/publish', authMiddleware, cdnController.unpublish.bind(cdnController));
router.get('/api/files/:id/signed-url', authMiddleware, cdnController.getSignedUrl.bind(cdnController));

export default router;
