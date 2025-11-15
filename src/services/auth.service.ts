import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { generateToken, generateRefreshToken } from '../middleware/auth.js';
import { ConflictError, AuthenticationError, ValidationError } from '../middleware/errorHandler.js';
import { RegisterInput, LoginInput } from '../lib/validators.js';
import { emailService } from './email.service.js';
import { emailSettingsService } from './emailSettings.service.js';
import { notificationService } from './notification.service.js';

// Import NotificationType enum properly from Prisma client
// Define enum values as const object matching Prisma NotificationType enum
const NotificationType = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED' as const,
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED' as const,
  ADMIN_NOTIFICATION: 'ADMIN_NOTIFICATION' as const,
} as const;

const prisma = new PrismaClient();

export class AuthService {
  async register(data: RegisterInput): Promise<{
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    accessToken: string;
    refreshToken: string;
  }> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    // Generate tokens
    const accessToken = generateToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    // Send welcome email (non-blocking)
    try {
      // Check if account created emails are enabled (check global settings)
      const shouldSend = await emailSettingsService.shouldSendNotification(null, 'accountCreated');
      if (shouldSend) {
        emailService
          .sendWelcomeEmail(user.email, user.firstName)
          .then(() => {
            console.warn(`Welcome email sent successfully to ${user.email}`);
          })
          .catch((error) => {
            console.error('Failed to send welcome email:', error);
            // Don't throw - email failure shouldn't break registration
          });
      } else {
        console.warn(`Welcome email skipped for ${user.email} (disabled in settings)`);
      }
    } catch (error) {
      console.error('Failed to check email settings for welcome email:', error);
      // Don't throw - continue with registration even if email check fails
    }

    // Create in-app notification for account creation (non-blocking)
    try {
      notificationService
        .createNotification({
          userId: user.id,
          type: NotificationType.ACCOUNT_CREATED,
          title: 'Welcome to FIL LIMITED!',
          message: `Your account has been created successfully. Welcome, ${user.firstName}!`,
          actionUrl: '/dashboard',
        })
        .catch((error) => {
          console.error('Failed to create account created notification:', error);
        });
    } catch (error) {
      console.error('Failed to create account created notification:', error);
      // Don't throw - notification failure shouldn't break registration
    }

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async login(data: LoginInput): Promise<{
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
    };
    accessToken: string;
    refreshToken: string;
  }> {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AuthenticationError('Account is locked. Please try again later.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      const failedAttempts = user.failedLoginAttempts + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '5', 10);

      if (failedAttempts >= maxAttempts) {
        const lockTimeMinutes = parseInt(process.env.LOCK_TIME_MINUTES ?? '15', 10);
        const lockedUntil = new Date(Date.now() + lockTimeMinutes * 60 * 1000);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: failedAttempts,
            lockedUntil,
          },
        });

        // Send account locked email notification
        // Check if account locked emails are enabled
        emailSettingsService
          .shouldSendNotification(user.id, 'accountLocked')
          .then((shouldSend) => {
            if (shouldSend) {
              return emailService
                .sendAccountLockedEmail(user.email, user.firstName, lockedUntil)
                .then(() => {
                  console.warn(`Account locked email sent successfully to ${user.email}`);
                })
                .catch((error) => {
                  console.error('Failed to send account locked email:', error);
                });
            } else {
              console.warn(`Account locked email skipped for ${user.email} (disabled in settings)`);
            }
            return undefined;
          })
          .catch((error) => {
            console.error('Failed to check email settings:', error);
          });

        // Create notification for user
        notificationService
          .createNotification({
            userId: user.id,
            type: NotificationType.ACCOUNT_LOCKED,
            title: 'Account Locked',
            message: `Your account has been locked due to multiple failed login attempts. It will be unlocked at ${lockedUntil.toLocaleString()}.`,
            actionUrl: '/login',
            data: { lockedUntil: lockedUntil.toISOString() },
          })
          .catch((error) => {
            console.error('Failed to create account locked notification:', error);
          });

        // Send admin notification
        // Check if admin notifications are enabled
        emailSettingsService
          .shouldSendNotification(null, 'adminNotifications')
          .then((shouldSend) => {
            if (shouldSend) {
              return emailService.getAdminEmails().then((adminEmails) => {
                if (adminEmails.length > 0) {
                  return emailService.sendAdminNotificationEmail(
                    adminEmails,
                    'Account Lockout',
                    'A user account has been locked due to multiple failed login attempts.',
                    {
                      User: `${user.firstName} ${user.email}`,
                      'Locked Until': lockedUntil.toLocaleString(),
                    }
                  );
                }
                return undefined;
              });
            } else {
              console.warn('Admin notification email skipped (disabled in settings)');
            }
            return undefined;
          })
          .then(() => {
            // Create admin notifications
            return prisma.user.findMany({
              where: { role: 'ADMIN', isActive: true },
              select: { id: true },
            });
          })
          .then((admins) => {
            return Promise.all(
              admins.map((admin) =>
                notificationService
                  .createNotification({
                    userId: admin.id,
                    type: NotificationType.ADMIN_NOTIFICATION,
                    title: 'Account Lockout',
                    message: `User ${user.firstName} (${user.email}) account has been locked due to multiple failed login attempts.`,
                    actionUrl: `/admin/users/${user.id}`,
                    data: { lockedUserId: user.id, lockedUntil: lockedUntil.toISOString() },
                  })
                  .catch((error) => {
                    console.error('Failed to create admin notification:', error);
                  })
              )
            );
          })
          .catch((error) => {
            console.error('Failed to send admin notification email:', error);
          });

        throw new AuthenticationError('Too many failed login attempts. Account locked.');
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: failedAttempts },
      });

      throw new AuthenticationError('Invalid email or password');
    }

    // Reset failed login attempts and update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Generate tokens
    const accessToken = generateToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role ?? 'CLIENT',
      },
      accessToken,
      refreshToken,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists
      return { message: 'If email exists, password reset link will be sent' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      // Don't throw - still return success to not reveal if email exists
    }

    return { message: 'If email exists, password reset link will be sent' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date(), // Token must not be expired
        },
      },
    });

    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0, // Reset failed attempts on password reset
        lockedUntil: null,
      },
    });

    return { message: 'Password reset successfully' };
  }
}

export const authService = new AuthService();
