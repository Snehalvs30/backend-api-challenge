import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { Role } from '../models/User';
import * as reportController from '../controllers/reportController';

const router = Router();

router.get(
  '/:id',
  authenticate,
  reportController.getReport
);

router.post(
  '/',
  authenticate,
  authorize(Role.EDITOR, Role.ADMIN),
  reportController.createReport
);

router.put(
  '/:id',
  authenticate,
  authorize(Role.EDITOR, Role.ADMIN),
  reportController.updateReport
);

router.post(
  '/:id/attachment',
  authenticate,
  authorize(Role.EDITOR, Role.ADMIN),
  reportController.uploadMiddleware,
  reportController.uploadAttachment
);

export default router;