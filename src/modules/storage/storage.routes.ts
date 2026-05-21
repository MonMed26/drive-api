import { Router } from 'express';
import { storageController } from './storage.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', storageController.getAggregated.bind(storageController));
router.get('/accounts', storageController.getPerAccount.bind(storageController));

export default router;
