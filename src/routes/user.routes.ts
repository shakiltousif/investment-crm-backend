import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import { updateProfileSchema } from '../lib/validators.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();

// Get current user profile
router.get(
  '/profile',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          profilePicture: true,
          dateOfBirth: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          role: true,
          kycStatus: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.status(200).json({
        message: 'User profile retrieved successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update user profile
router.put(
  '/profile',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const validatedData = updateProfileSchema.parse(req.body);

      const user = await prisma.user.update({
        where: { id: req.userId },
        data: validatedData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          profilePicture: true,
          dateOfBirth: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          kycStatus: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.status(200).json({
        message: 'User profile updated successfully',
        data: user,
      });
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        next(new ValidationError('Validation failed', error));
      } else {
        next(error);
      }
    }
  }
);

// Get security settings
router.get(
  '/security-settings',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          email: true,
          twoFactorEnabled: true,
          isEmailVerified: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.status(200).json({
        message: 'Security settings retrieved successfully',
        data: {
          twoFactorEnabled: user.twoFactorEnabled,
          isEmailVerified: user.isEmailVerified,
          lastLoginAt: user.lastLoginAt,
          accountCreatedAt: user.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update security settings
router.put(
  '/security-settings',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const { twoFactorEnabled } = req.body;

      const user = await prisma.user.update({
        where: { id: req.userId },
        data: { twoFactorEnabled },
        select: {
          id: true,
          email: true,
          twoFactorEnabled: true,
          isEmailVerified: true,
        },
      });

      res.status(200).json({
        message: 'Security settings updated successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Change password
router.post(
  '/change-password',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        throw new ValidationError('Current password and new password are required');
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, password: true },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const bcrypt = await import('bcryptjs');
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        throw new ValidationError('Current password is incorrect');
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: req.userId },
        data: { password: hashedNewPassword },
      });

      res.status(200).json({
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
