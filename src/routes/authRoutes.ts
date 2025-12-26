import { Router } from 'express';
import * as authController from '../controllers/authController';

const router = Router();

// POST /auth/register - Register a new user
router.post('/register', authController.register);

// POST /auth/login - Login
router.post('/login', authController.login);

export default router;