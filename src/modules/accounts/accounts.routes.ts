import { Router } from 'express';
import { accountsController } from './accounts.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// OAuth routes (no auth required for callback)
router.get('/oauth/url', authMiddleware, accountsController.getOAuthUrl.bind(accountsController));
router.get('/oauth/callback', accountsController.oauthCallback.bind(accountsController));

// CRUD routes (auth required)
router.get('/', authMiddleware, accountsController.list.bind(accountsController));
router.get('/:id', authMiddleware, accountsController.getById.bind(accountsController));
router.delete('/:id', authMiddleware, accountsController.delete.bind(accountsController));
router.post('/:id/refresh', authMiddleware, accountsController.refresh.bind(accountsController));

export default router;
