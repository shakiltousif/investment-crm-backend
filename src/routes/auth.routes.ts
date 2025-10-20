import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { registerSchema, loginSchema, passwordChangeSchema } from '../lib/validators';
import { ValidationError } from '../middleware/errorHandler';

const router = Router();

// Register endpoint
router.post('/register', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const result = await authService.register(validatedData);

    res.status(201).json({
      message: 'User registered successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      next(new ValidationError('Validation failed', error));
    } else {
      next(error);
    }
  }
});

// Login endpoint
router.post('/login', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await authService.login(validatedData);

    res.status(200).json({
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      next(new ValidationError('Validation failed', error));
    } else {
      next(error);
    }
  }
});

// Change password endpoint
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new Error('User ID not found');
    }

    const validatedData = passwordChangeSchema.parse(req.body);
    const result = await authService.changePassword(
      req.userId,
      validatedData.currentPassword,
      validatedData.newPassword,
    );

    res.status(200).json({
      message: 'Password changed successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      next(new ValidationError('Validation failed', error));
    } else {
      next(error);
    }
  }
});

// Request password reset endpoint
router.post('/request-password-reset', authRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('Email is required');
    }

    const result = await authService.requestPasswordReset(email);

    res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

