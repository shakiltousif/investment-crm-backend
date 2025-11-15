import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import { Decimal } from '@prisma/client/runtime/library';

// Type alias for InvestmentType enum (used for type assertions only)
// Using string literal union matching Prisma InvestmentType enum
type InvestmentType =
  | 'STOCK'
  | 'BOND'
  | 'CORPORATE_BOND'
  | 'TERM_DEPOSIT'
  | 'FIXED_RATE_DEPOSIT'
  | 'HIGH_INTEREST_SAVINGS'
  | 'IPO'
  | 'MUTUAL_FUND'
  | 'OTHER';

// Import NotificationType enum properly from Prisma client
// Define enum values as const object matching Prisma NotificationType enum
const NotificationType = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED' as const,
  KYC_STATUS_CHANGE: 'KYC_STATUS_CHANGE' as const,
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED' as const,
  DEPOSIT_STATUS_CHANGE: 'DEPOSIT_STATUS_CHANGE' as const,
  WITHDRAWAL_STATUS_CHANGE: 'WITHDRAWAL_STATUS_CHANGE' as const,
  BALANCE_ADJUSTMENT: 'BALANCE_ADJUSTMENT' as const,
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED' as const,
  DOCUMENT_STATUS_CHANGE: 'DOCUMENT_STATUS_CHANGE' as const,
  PROBLEM_REPORT_STATUS_CHANGE: 'PROBLEM_REPORT_STATUS_CHANGE' as const,
  PROBLEM_REPORT_RESPONSE: 'PROBLEM_REPORT_RESPONSE' as const,
} as const;
import { emailService } from './email.service.js';
import { emailSettingsService } from './emailSettings.service.js';
import { notificationService } from './notification.service.js';
import type { UploadDocumentInput } from './document.service.js';
import { documentService } from './document.service.js';

// Type assertion for Prisma client to include problem report models
// These models exist in the generated Prisma client but TypeScript language server may not recognize them
type ProblemReportDelegate = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<unknown | null>;
  count: (args?: { where?: unknown }) => Promise<number>;
  update: (args: { where: { id: string }; data: unknown; include?: unknown }) => Promise<unknown>;
  create: (args: { data: unknown; include?: unknown }) => Promise<unknown>;
};

type ProblemReportResponseDelegate = {
  findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<unknown | null>;
  create: (args: { data: unknown; include?: unknown }) => Promise<unknown>;
};

type ProblemReportResponseAttachmentDelegate = {
  create: (args: { data: unknown }) => Promise<unknown>;
};

const prismaClient = prisma as typeof prisma & {
  problemReport: ProblemReportDelegate;
  problemReportResponse: ProblemReportResponseDelegate;
  problemReportResponseAttachment: ProblemReportResponseAttachmentDelegate;
};

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalPortfolioValue: number;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    status: string;
    userId: string;
    userName: string;
    createdAt: Date;
  }>;
}

export class AdminService {
  /**
   * Get admin dashboard statistics
   */
  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [
      totalUsers,
      activeUsers,
      pendingDeposits,
      pendingWithdrawals,
      portfolios,
      recentTransactions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.transaction.count({
        where: { type: 'DEPOSIT', status: 'PENDING' },
      }),
      prisma.transaction.count({
        where: { type: 'WITHDRAWAL', status: 'PENDING' },
      }),
      prisma.portfolio.findMany({
        select: { totalValue: true },
      }),
      prisma.transaction.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    const totalPortfolioValue = portfolios.reduce((sum, p) => sum + Number(p.totalValue), 0);

    return {
      totalUsers,
      activeUsers,
      pendingDeposits,
      pendingWithdrawals,
      totalPortfolioValue,
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        status: t.status,
        userId: t.userId,
        userName: `${t.user.firstName} ${t.user.lastName}`,
        createdAt: t.createdAt,
      })),
    };
  }

  /**
   * Get all users with pagination
   */
  async getUsers(filters: {
    search?: string;
    role?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    users: Array<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      phoneNumber: string | null;
      role: string;
      isActive: boolean;
      kycStatus: string;
      createdAt: Date;
      lastLoginAt: Date | null;
      lockedUntil: Date | null;
      failedLoginAttempts: number;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          role: true,
          isActive: true,
          kycStatus: true,
          createdAt: true,
          lastLoginAt: true,
          lockedUntil: true,
          failedLoginAttempts: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
    portfolios: Array<unknown>;
    bankAccounts: Array<unknown>;
    _count: {
      investments: number;
      transactions: number;
    };
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        portfolios: true,
        bankAccounts: true,
        _count: {
          select: {
            investments: true,
            transactions: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Generate a secure temporary password
   */
  private generateTemporaryPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Ensure at least one of each required character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  /**
   * Create new user (admin only)
   */
  async createUser(data: {
    email: string;
    password?: string; // Optional - will generate if not provided
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    role?: string;
    sendCredentialsEmail?: boolean; // Whether to send email with credentials
    dateOfBirth?: string | Date | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    country?: string | null;
    profilePicture?: string | null;
    kycStatus?: string;
    documentType?: string | null;
    documentNumber?: string | null;
    documentExpiryDate?: string | Date | null;
    isEmailVerified?: boolean;
  }): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
    role: string;
    isActive: boolean;
    createdAt: Date;
    temporaryPassword?: string;
    credentialsSent: boolean;
  }> {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Generate temporary password if not provided
    const tempPassword = data.password ?? this.generateTemporaryPassword();
    const isTemporaryPassword = !data.password;

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash(tempPassword, 10);

    const userData: Record<string, unknown> = {
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber ?? null,
      role: (data.role as 'CLIENT' | 'ADMIN') ?? 'CLIENT',
    };

    if (data.dateOfBirth !== undefined) {
      userData.dateOfBirth = data.dateOfBirth
        ? typeof data.dateOfBirth === 'string'
          ? new Date(data.dateOfBirth)
          : data.dateOfBirth
        : null;
    }
    if (data.address !== undefined) {
      userData.address = data.address ?? null;
    }
    if (data.city !== undefined) {
      userData.city = data.city ?? null;
    }
    if (data.state !== undefined) {
      userData.state = data.state ?? null;
    }
    if (data.zipCode !== undefined) {
      userData.zipCode = data.zipCode ?? null;
    }
    if (data.country !== undefined) {
      userData.country = data.country ?? null;
    }
    if (data.profilePicture !== undefined) {
      userData.profilePicture = data.profilePicture ?? null;
    }
    if (data.kycStatus !== undefined) {
      userData.kycStatus = data.kycStatus;
    }
    if (data.documentType !== undefined) {
      userData.documentType = data.documentType ?? null;
    }
    if (data.documentNumber !== undefined) {
      userData.documentNumber = data.documentNumber ?? null;
    }
    if (data.documentExpiryDate !== undefined) {
      userData.documentExpiryDate = data.documentExpiryDate
        ? typeof data.documentExpiryDate === 'string'
          ? new Date(data.documentExpiryDate)
          : data.documentExpiryDate
        : null;
    }
    if (data.isEmailVerified !== undefined) {
      userData.isEmailVerified = data.isEmailVerified;
      if (data.isEmailVerified) {
        userData.emailVerifiedAt = new Date();
      }
    }

    const user = await prisma.user.create({
      data: userData as Parameters<typeof prisma.user.create>[0]['data'],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Send welcome email with credentials if requested
    if (data.sendCredentialsEmail !== false) {
      // Check if account created emails are enabled (check global settings)
      const shouldSendEmail = await emailSettingsService.shouldSendNotification(
        null,
        'accountCreated'
      );

      if (shouldSendEmail) {
        emailService
          .sendAccountCreatedEmail(data.email, data.firstName, tempPassword, isTemporaryPassword)
          .then(() => {
            console.warn(`Account created email sent successfully to ${data.email}`);
          })
          .catch((error) => {
            console.error('Failed to send account created email:', error);
            // Log more details for debugging
            console.error('Email error details:', {
              message: error.message,
              code: error.code,
              response: error.response,
            });
            // Don't throw - email failure shouldn't break user creation
          });
      } else {
        console.warn(`Account created email skipped for ${data.email} (disabled in settings)`);
      }

      // Create notification (always create in-app notification regardless of email settings)
      notificationService
        .createNotification({
          userId: user.id,
          type: NotificationType.ACCOUNT_CREATED,
          title: 'Account Created',
          message: `Your account has been created. ${isTemporaryPassword ? 'Please change your temporary password after first login.' : ''}`,
          actionUrl: '/dashboard',
        })
        .catch((error) => {
          console.error('Failed to create account created notification:', error);
        });
    }

    return {
      ...user,
      temporaryPassword: isTemporaryPassword ? tempPassword : undefined,
      credentialsSent: data.sendCredentialsEmail !== false,
    };
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      role?: string;
      isActive?: boolean;
      email?: string;
      dateOfBirth?: string | Date | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zipCode?: string | null;
      country?: string | null;
      profilePicture?: string | null;
      kycStatus?: string;
      documentType?: string | null;
      documentNumber?: string | null;
      documentExpiryDate?: string | Date | null;
      isEmailVerified?: boolean;
    }
  ): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string | null;
    role: string;
    isActive: boolean;
    dateOfBirth: Date | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    country: string | null;
    profilePicture: string | null;
    kycStatus: string;
    documentType: string | null;
    documentNumber: string | null;
    documentExpiryDate: Date | null;
    isEmailVerified: boolean;
    updatedAt: Date;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if email is being changed and if it already exists
    if (data.email !== undefined && data.email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }
    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }
    if (data.phoneNumber !== undefined) {
      updateData.phoneNumber = data.phoneNumber ?? null;
    }
    if (data.role !== undefined) {
      updateData.role = data.role;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    if (data.email !== undefined) {
      updateData.email = data.email;
    }
    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth = data.dateOfBirth
        ? typeof data.dateOfBirth === 'string'
          ? new Date(data.dateOfBirth)
          : data.dateOfBirth
        : null;
    }
    if (data.address !== undefined) {
      updateData.address = data.address ?? null;
    }
    if (data.city !== undefined) {
      updateData.city = data.city ?? null;
    }
    if (data.state !== undefined) {
      updateData.state = data.state ?? null;
    }
    if (data.zipCode !== undefined) {
      updateData.zipCode = data.zipCode ?? null;
    }
    if (data.country !== undefined) {
      updateData.country = data.country ?? null;
    }
    if (data.profilePicture !== undefined) {
      updateData.profilePicture = data.profilePicture ?? null;
    }
    if (data.kycStatus !== undefined) {
      updateData.kycStatus = data.kycStatus;
    }
    if (data.documentType !== undefined) {
      updateData.documentType = data.documentType ?? null;
    }
    if (data.documentNumber !== undefined) {
      updateData.documentNumber = data.documentNumber ?? null;
    }
    if (data.documentExpiryDate !== undefined) {
      updateData.documentExpiryDate = data.documentExpiryDate
        ? typeof data.documentExpiryDate === 'string'
          ? new Date(data.documentExpiryDate)
          : data.documentExpiryDate
        : null;
    }
    if (data.isEmailVerified !== undefined) {
      updateData.isEmailVerified = data.isEmailVerified;
      if (data.isEmailVerified && !user.emailVerifiedAt) {
        updateData.emailVerifiedAt = new Date();
      } else if (!data.isEmailVerified) {
        updateData.emailVerifiedAt = null;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        dateOfBirth: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
        profilePicture: true,
        kycStatus: true,
        documentType: true,
        documentNumber: true,
        documentExpiryDate: true,
        isEmailVerified: true,
        updatedAt: true,
      },
    });

    // Send email notifications for status changes
    try {
      if (data.kycStatus !== undefined && data.kycStatus !== user.kycStatus) {
        const kycStatus = data.kycStatus as 'VERIFIED' | 'REJECTED' | 'EXPIRED';
        if (['VERIFIED', 'REJECTED', 'EXPIRED'].includes(kycStatus)) {
          // Check if KYC status change emails are enabled
          const shouldSend = await emailSettingsService.shouldSendNotification(
            updated.id,
            'kycStatusChange'
          );
          if (shouldSend) {
            await emailService
              .sendKYCStatusChangeEmail(updated.email, updated.firstName, kycStatus)
              .then(() => {
                console.warn(`KYC status change email sent successfully to ${updated.email}`);
              })
              .catch((error) => {
                console.error('Failed to send KYC status change email:', error);
              });
          } else {
            console.warn(
              `KYC status change email skipped for ${updated.email} (disabled in settings)`
            );
          }

          // Create notification
          notificationService
            .createNotification({
              userId: updated.id,
              type: NotificationType.KYC_STATUS_CHANGE,
              title: 'KYC Status Updated',
              message: `Your KYC status has been updated to ${kycStatus}.`,
              actionUrl: '/dashboard/profile',
              data: { kycStatus },
            })
            .catch((error) => {
              console.error('Failed to create KYC status change notification:', error);
            });
        }
      }

      if (data.isActive !== undefined && data.isActive !== user.isActive) {
        // Account activation/deactivation emails could be added here if needed
        // For now, we'll skip as it's not in the requirements
      }

      if (data.isEmailVerified !== undefined && data.isEmailVerified !== user.isEmailVerified) {
        // Email verification notification could be added here if needed
        // For now, we'll skip as it's not explicitly in the requirements
      }
    } catch (error) {
      console.error('Failed to send user update email notifications:', error);
      // Don't throw - email failure shouldn't break the user update
    }

    return updated;
  }

  /**
   * Unlock user account (reset failed login attempts and lock status)
   */
  async unlockAccount(userId: string): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    lockedUntil: Date | null;
    failedLoginAttempts: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        lockedUntil: true,
        failedLoginAttempts: true,
      },
    });

    // Send email notification
    try {
      // Check if account unlocked emails are enabled
      const shouldSend = await emailSettingsService.shouldSendNotification(
        updated.id,
        'accountUnlocked'
      );
      if (shouldSend) {
        await emailService
          .sendAccountUnlockedEmail(updated.email, updated.firstName)
          .then(() => {
            console.warn(`Account unlocked email sent successfully to ${updated.email}`);
          })
          .catch((error) => {
            console.error('Failed to send account unlocked email:', error);
          });
      } else {
        console.warn(`Account unlocked email skipped for ${updated.email} (disabled in settings)`);
      }

      // Create notification
      notificationService
        .createNotification({
          userId: updated.id,
          type: NotificationType.ACCOUNT_UNLOCKED,
          title: 'Account Unlocked',
          message: 'Your account has been unlocked. You can now log in again.',
          actionUrl: '/login',
        })
        .catch((error) => {
          console.error('Failed to create account unlocked notification:', error);
        });
    } catch (error) {
      console.error('Failed to send account unlocked email:', error);
      // Don't throw - email failure shouldn't break the unlock
    }

    return updated;
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'User deleted successfully' };
  }

  /**
   * Get pending deposits
   */
  async getPendingDeposits(filters: { limit?: number; offset?: number }): Promise<{
    deposits: Array<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const [deposits, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          type: 'DEPOSIT',
          status: 'PENDING',
        },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          bankAccount: true,
        },
      }),
      prisma.transaction.count({
        where: {
          type: 'DEPOSIT',
          status: 'PENDING',
        },
      }),
    ]);

    return {
      deposits,
      total,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
  }

  /**
   * Get pending withdrawals
   */
  async getPendingWithdrawals(filters: { limit?: number; offset?: number }): Promise<{
    withdrawals: Array<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const [withdrawals, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          type: 'WITHDRAWAL',
          status: 'PENDING',
        },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          bankAccount: true,
        },
      }),
      prisma.transaction.count({
        where: {
          type: 'WITHDRAWAL',
          status: 'PENDING',
        },
      }),
    ]);

    return {
      withdrawals,
      total,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
  }

  /**
   * Approve or reject transaction
   */
  async updateTransactionStatus(
    transactionId: string,
    status: 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'REJECTED',
    notes?: string
  ): Promise<{
    id: string;
    status: string;
    completedAt: Date | null;
    description: string | null;
  }> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        bankAccount: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    if (transaction.status !== 'PENDING') {
      throw new ValidationError('Transaction is not pending');
    }

    // Map REJECTED to FAILED for database consistency
    const dbStatus = status === 'REJECTED' ? 'FAILED' : status;

    // Update transaction status
    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: dbStatus,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        description: notes
          ? `${transaction.description ?? ''} - ${notes}`.trim()
          : transaction.description,
      },
    });

    // If approved deposit, update bank account balance
    if (status === 'COMPLETED' && transaction.type === 'DEPOSIT' && transaction.bankAccount) {
      await prisma.bankAccount.update({
        where: { id: transaction.bankAccount.id },
        data: {
          balance: {
            increment: transaction.amount,
          },
        },
      });
    }

    // If approved withdrawal, deduct from bank account balance
    if (status === 'COMPLETED' && transaction.type === 'WITHDRAWAL' && transaction.bankAccount) {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { id: transaction.bankAccount.id },
      });

      if (!bankAccount || bankAccount.balance.lessThan(transaction.amount)) {
        throw new ValidationError('Insufficient balance');
      }

      await prisma.bankAccount.update({
        where: { id: transaction.bankAccount.id },
        data: {
          balance: {
            decrement: transaction.amount,
          },
        },
      });
    }

    // Send email notification to user
    try {
      const user = await prisma.user.findUnique({
        where: { id: transaction.userId },
        select: { email: true, firstName: true },
      });

      if (user?.email) {
        const { emailService } = await import('./email.service.js');
        const emailStatus =
          status === 'REJECTED' ? 'REJECTED' : status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';

        if (transaction.type === 'DEPOSIT') {
          // Check if deposit status change emails are enabled
          const shouldSend = await emailSettingsService.shouldSendNotification(
            transaction.userId,
            'depositStatusChange'
          );
          if (shouldSend) {
            await emailService
              .sendDepositNotification(
                user.email,
                Number(transaction.amount),
                transaction.currency,
                emailStatus
              )
              .then(() => {
                console.warn(`Deposit status change email sent successfully to ${user.email}`);
              })
              .catch((error) => {
                console.error('Failed to send deposit notification email:', error);
              });
          } else {
            console.warn(
              `Deposit status change email skipped for ${user.email} (disabled in settings)`
            );
          }

          // Create notification
          notificationService
            .createNotification({
              userId: transaction.userId,
              type: NotificationType.DEPOSIT_STATUS_CHANGE,
              title: `Deposit ${emailStatus}`,
              message: `Your deposit of ${transaction.currency} ${Number(transaction.amount).toFixed(2)} has been ${emailStatus.toLowerCase()}.`,
              actionUrl: '/dashboard/transactions',
              data: { transactionId: transaction.id, status: emailStatus },
            })
            .catch((error) => {
              console.error('Failed to create deposit status change notification:', error);
            });
        } else if (transaction.type === 'WITHDRAWAL') {
          // Check if withdrawal status change emails are enabled
          const shouldSend = await emailSettingsService.shouldSendNotification(
            transaction.userId,
            'withdrawalStatusChange'
          );
          if (shouldSend) {
            await emailService
              .sendWithdrawalNotification(
                user.email,
                Number(transaction.amount),
                transaction.currency,
                emailStatus
              )
              .then(() => {
                console.warn(`Withdrawal status change email sent successfully to ${user.email}`);
              })
              .catch((error) => {
                console.error('Failed to send withdrawal notification email:', error);
              });
          } else {
            console.warn(
              `Withdrawal status change email skipped for ${user.email} (disabled in settings)`
            );
          }

          // Create notification
          notificationService
            .createNotification({
              userId: transaction.userId,
              type: NotificationType.WITHDRAWAL_STATUS_CHANGE,
              title: `Withdrawal ${emailStatus}`,
              message: `Your withdrawal of ${transaction.currency} ${Number(transaction.amount).toFixed(2)} has been ${emailStatus.toLowerCase()}.`,
              actionUrl: '/dashboard/transactions',
              data: { transactionId: transaction.id, status: emailStatus },
            })
            .catch((error) => {
              console.error('Failed to create withdrawal status change notification:', error);
            });
        }
      }
    } catch (error) {
      console.error('Failed to send transaction status email:', error);
      // Don't throw - email failure shouldn't break the transaction update
    }

    return updated;
  }

  /**
   * Get all transactions (admin only - across all users)
   */
  async getAllTransactions(filters: {
    type?: string;
    status?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    transactions: Array<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.startDate || filters.endDate) {
      const transactionDateFilter: { gte?: Date; lte?: Date } = {};
      if (filters.startDate) {
        transactionDateFilter.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        transactionDateFilter.lte = new Date(filters.endDate);
      }
      where.transactionDate = transactionDateFilter;
    }

    const limit = Math.min(filters.limit ?? 100, 500);
    const offset = filters.offset ?? 0;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          bankAccount: true,
          investment: true,
        },
        orderBy: { transactionDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      transactions,
      total,
      limit,
      offset,
    };
  }

  /**
   * Adjust user balance (admin only)
   */
  async adjustUserBalance(
    userId: string,
    bankAccountId: string,
    amount: number,
    description: string
  ): Promise<{
    id: string;
    userId: string;
    bankAccountId: string | null;
    type: string;
    amount: Decimal;
    currency: string;
    status: string;
    description: string | null;
    transactionDate: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId,
      },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    const adjustment = new Decimal(amount);
    const newBalance = bankAccount.balance.plus(adjustment);

    if (newBalance.lessThan(0)) {
      throw new ValidationError('Balance cannot be negative');
    }

    // Get user for email notification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true },
    });

    // Update balance
    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        balance: newBalance,
      },
    });

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        bankAccountId,
        type: amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: adjustment.abs(),
        currency: bankAccount.currency,
        status: 'COMPLETED',
        description: `Admin adjustment: ${description}`,
        transactionDate: new Date(),
        completedAt: new Date(),
      },
    });

    // Send email notification to user
    if (user?.email) {
      // Check if balance adjustment emails are enabled
      emailSettingsService
        .shouldSendNotification(user.id, 'balanceAdjustment')
        .then((shouldSend) => {
          if (shouldSend) {
            return emailService
              .sendBalanceAdjustmentEmail(
                user.email,
                user.firstName,
                amount,
                bankAccount.currency,
                description,
                newBalance.toNumber()
              )
              .then(() => {
                console.warn(`Balance adjustment email sent successfully to ${user.email}`);
              })
              .catch((error) => {
                console.error('Failed to send balance adjustment email:', error);
                // Don't throw - email failure shouldn't break the balance adjustment
              });
          } else {
            console.warn(
              `Balance adjustment email skipped for ${user.email} (disabled in settings)`
            );
          }
          return undefined;
        })
        .catch((error) => {
          console.error('Failed to check email settings:', error);
        });

      // Create notification
      notificationService
        .createNotification({
          userId: user.id,
          type: NotificationType.BALANCE_ADJUSTMENT,
          title: 'Balance Adjusted',
          message: `Your balance has been ${amount > 0 ? 'increased' : 'decreased'} by ${bankAccount.currency} ${Math.abs(amount).toFixed(2)}. New balance: ${bankAccount.currency} ${newBalance.toFixed(2)}.`,
          actionUrl: '/dashboard/transactions',
          data: { transactionId: transaction.id, amount, newBalance: newBalance.toNumber() },
        })
        .catch((error) => {
          console.error('Failed to create balance adjustment notification:', error);
        });
    }

    return transaction;
  }

  /**
   * Get all investments with pagination and optional filters (admin only)
   */
  async getAllInvestments(filters: {
    userId?: string;
    portfolioId?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    investments: Array<{
      id: string;
      userId: string;
      userName: string;
      userEmail: string;
      portfolioId: string;
      portfolioName: string;
      type: string;
      name: string;
      symbol: string | null;
      quantity: Decimal;
      purchasePrice: Decimal;
      currentPrice: Decimal;
      totalValue: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
      purchaseDate: Date;
      maturityDate: Date | null;
      interestRate: Decimal | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.portfolioId) {
      where.portfolioId = filters.portfolioId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    const [investments, total] = await Promise.all([
      prisma.investment.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          portfolio: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.investment.count({ where }),
    ]);

    return {
      investments: investments.map((inv) => ({
        id: inv.id,
        userId: inv.userId,
        userName: `${inv.user.firstName} ${inv.user.lastName}`,
        userEmail: inv.user.email,
        portfolioId: inv.portfolioId,
        portfolioName: inv.portfolio.name,
        type: inv.type,
        name: inv.name,
        symbol: inv.symbol,
        quantity: inv.quantity,
        purchasePrice: inv.purchasePrice,
        currentPrice: inv.currentPrice,
        totalValue: inv.totalValue,
        totalGain: inv.totalGain,
        gainPercentage: inv.gainPercentage,
        purchaseDate: inv.purchaseDate,
        maturityDate: inv.maturityDate,
        interestRate: inv.interestRate,
        status: inv.status,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
      })),
      total,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
  }

  /**
   * Get all investments for a user (admin only)
   */
  async getUserInvestments(userId: string): Promise<
    Array<{
      id: string;
      portfolioId: string;
      portfolioName: string;
      type: string;
      name: string;
      symbol: string | null;
      quantity: Decimal;
      purchasePrice: Decimal;
      currentPrice: Decimal;
      totalValue: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
      purchaseDate: Date;
      maturityDate: Date | null;
      interestRate: Decimal | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const investments = await prisma.investment.findMany({
      where: { userId },
      include: {
        portfolio: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ portfolio: { name: 'asc' } }, { createdAt: 'desc' }],
    });

    return investments.map((inv) => ({
      id: inv.id,
      portfolioId: inv.portfolioId,
      portfolioName: inv.portfolio.name,
      type: inv.type,
      name: inv.name,
      symbol: inv.symbol,
      quantity: inv.quantity,
      purchasePrice: inv.purchasePrice,
      currentPrice: inv.currentPrice,
      totalValue: inv.totalValue,
      totalGain: inv.totalGain,
      gainPercentage: inv.gainPercentage,
      purchaseDate: inv.purchaseDate,
      maturityDate: inv.maturityDate,
      interestRate: inv.interestRate,
      status: inv.status,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    }));
  }

  /**
   * Get all portfolios for a user with investment summaries (admin only)
   */
  async getUserPortfolios(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      description: string | null;
      totalValue: Decimal;
      totalInvested: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
      isActive: boolean;
      investmentCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            investments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return portfolios.map((portfolio) => ({
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      totalValue: portfolio.totalValue,
      totalInvested: portfolio.totalInvested,
      totalGain: portfolio.totalGain,
      gainPercentage: portfolio.gainPercentage,
      isActive: portfolio.isActive,
      investmentCount: portfolio._count.investments,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    }));
  }

  /**
   * Create investment for a user (admin only)
   */
  async createUserInvestment(
    userId: string,
    data: {
      portfolioId: string;
      type: string;
      name: string;
      symbol?: string;
      quantity: number;
      purchasePrice: number;
      currentPrice: number;
      purchaseDate: string | Date;
      maturityDate?: string | Date | null;
      interestRate?: number | null;
    }
  ): Promise<{
    id: string;
    userId: string;
    portfolioId: string;
    type: string;
    name: string;
    symbol: string | null;
    quantity: number;
    purchasePrice: number;
    currentPrice: number;
    totalValue: number;
    totalGain: number;
    gainPercentage: number;
    purchaseDate: Date;
    maturityDate: Date | null;
    interestRate: number | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    // Verify portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: data.portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    // Calculate total value and gain
    const totalValue = new Decimal(data.quantity).times(data.currentPrice);
    const totalInvested = new Decimal(data.quantity).times(data.purchasePrice);
    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.isZero()
      ? new Decimal(0)
      : totalGain.dividedBy(totalInvested).times(100);

    const investment = await prisma.investment.create({
      data: {
        userId,
        portfolioId: data.portfolioId,
        type: data.type as InvestmentType,
        name: data.name,
        symbol: data.symbol,
        quantity: new Decimal(data.quantity),
        purchasePrice: new Decimal(data.purchasePrice),
        currentPrice: new Decimal(data.currentPrice),
        totalValue,
        totalGain,
        gainPercentage,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
        maturityDate: data.maturityDate ? new Date(data.maturityDate) : null,
        interestRate:
          data.interestRate !== null && data.interestRate !== undefined
            ? new Decimal(data.interestRate)
            : null,
      },
      select: {
        id: true,
        userId: true,
        portfolioId: true,
        type: true,
        name: true,
        symbol: true,
        quantity: true,
        purchasePrice: true,
        currentPrice: true,
        totalValue: true,
        totalGain: true,
        gainPercentage: true,
        purchaseDate: true,
        maturityDate: true,
        interestRate: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auto-recalculate portfolio totals
    await this.recalculatePortfolioTotals(data.portfolioId);

    return {
      id: investment.id,
      userId: investment.userId,
      portfolioId: investment.portfolioId,
      type: investment.type,
      name: investment.name,
      symbol: investment.symbol,
      quantity: investment.quantity.toNumber(),
      purchasePrice: investment.purchasePrice.toNumber(),
      currentPrice: investment.currentPrice.toNumber(),
      totalValue: investment.totalValue.toNumber(),
      totalGain: investment.totalGain.toNumber(),
      gainPercentage: investment.gainPercentage.toNumber(),
      purchaseDate: investment.purchaseDate,
      maturityDate: investment.maturityDate,
      interestRate: investment.interestRate?.toNumber() ?? null,
      status: investment.status,
      createdAt: investment.createdAt,
      updatedAt: investment.updatedAt,
    };
  }

  /**
   * Update user investment (admin only)
   */
  async updateUserInvestment(
    userId: string,
    investmentId: string,
    data: {
      quantity?: number;
      purchasePrice?: number;
      currentPrice?: number;
      maturityDate?: Date | null;
      interestRate?: number | null;
    }
  ): Promise<{
    id: string;
    quantity: Decimal;
    purchasePrice: Decimal;
    currentPrice: Decimal;
    totalValue: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    maturityDate: Date | null;
    interestRate: Decimal | null;
    updatedAt: Date;
  }> {
    // Verify investment belongs to user
    const investment = await prisma.investment.findFirst({
      where: {
        id: investmentId,
        userId,
      },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    // Calculate new values
    const quantity = data.quantity !== undefined ? new Decimal(data.quantity) : investment.quantity;
    const purchasePrice =
      data.purchasePrice !== undefined ? new Decimal(data.purchasePrice) : investment.purchasePrice;
    const currentPrice =
      data.currentPrice !== undefined ? new Decimal(data.currentPrice) : investment.currentPrice;

    const totalValue = quantity.times(currentPrice);
    const totalInvested = quantity.times(purchasePrice);
    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.isZero()
      ? new Decimal(0)
      : totalGain.dividedBy(totalInvested).times(100);

    const updateData: Record<string, unknown> = {
      quantity,
      purchasePrice,
      currentPrice,
      totalValue,
      totalInvested,
      totalGain,
      gainPercentage,
    };

    if (data.maturityDate !== undefined) {
      updateData.maturityDate = data.maturityDate;
    }

    if (data.interestRate !== undefined) {
      updateData.interestRate = data.interestRate !== null ? new Decimal(data.interestRate) : null;
    }

    const updated = await prisma.investment.update({
      where: { id: investmentId },
      data: updateData,
      select: {
        id: true,
        quantity: true,
        purchasePrice: true,
        currentPrice: true,
        totalValue: true,
        totalGain: true,
        gainPercentage: true,
        maturityDate: true,
        interestRate: true,
        updatedAt: true,
      },
    });

    // Auto-recalculate portfolio totals
    await this.recalculatePortfolioTotals(investment.portfolioId);

    return updated;
  }

  /**
   * Delete user investment (admin only)
   */
  async deleteUserInvestment(userId: string, investmentId: string): Promise<{ message: string }> {
    // Verify investment belongs to user
    const investment = await prisma.investment.findFirst({
      where: {
        id: investmentId,
        userId,
      },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    const portfolioId = investment.portfolioId;

    await prisma.investment.delete({
      where: { id: investmentId },
    });

    // Auto-recalculate portfolio totals
    await this.recalculatePortfolioTotals(portfolioId);

    return { message: 'Investment deleted successfully' };
  }

  /**
   * Adjust portfolio totals manually or trigger auto-calculation (admin only)
   */
  async adjustPortfolioTotals(
    userId: string,
    portfolioId: string,
    data: {
      totalValue?: number;
      totalInvested?: number;
      totalGain?: number;
      manualAdjust: boolean;
    }
  ): Promise<{
    id: string;
    totalValue: Decimal;
    totalInvested: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    updatedAt: Date;
  }> {
    // Verify portfolio belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    let updateData: {
      totalValue: Decimal;
      totalInvested: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
    };

    if (data.manualAdjust) {
      // Manual adjustment
      const totalValue =
        data.totalValue !== undefined ? new Decimal(data.totalValue) : portfolio.totalValue;
      const totalInvested =
        data.totalInvested !== undefined
          ? new Decimal(data.totalInvested)
          : portfolio.totalInvested;
      const totalGain =
        data.totalGain !== undefined
          ? new Decimal(data.totalGain)
          : totalValue.minus(totalInvested);
      const gainPercentage = totalInvested.isZero()
        ? new Decimal(0)
        : totalGain.dividedBy(totalInvested).times(100);

      updateData = {
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
      };
    } else {
      // Auto-calculate from investments
      updateData = await this.recalculatePortfolioTotals(portfolioId);
    }

    const updated = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: updateData,
      select: {
        id: true,
        totalValue: true,
        totalInvested: true,
        totalGain: true,
        gainPercentage: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Recalculate portfolio totals from investments
   */
  private async recalculatePortfolioTotals(portfolioId: string): Promise<{
    totalValue: Decimal;
    totalInvested: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
  }> {
    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const investment of investments) {
      totalValue = totalValue.plus(investment.totalValue);
      totalInvested = totalInvested.plus(investment.quantity.times(investment.purchasePrice));
    }

    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.isZero()
      ? new Decimal(0)
      : totalGain.dividedBy(totalInvested).times(100);

    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
      },
    });

    return {
      totalValue,
      totalInvested,
      totalGain,
      gainPercentage,
    };
  }

  /**
   * Create a portfolio for a user (admin only)
   */
  async createUserPortfolio(
    userId: string,
    data: {
      name: string;
      description?: string;
      isActive?: boolean;
    }
  ): Promise<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    name: string;
    description: string | null;
    totalValue: Decimal;
    totalInvested: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: data.name,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
        totalValue: new Decimal(0),
        totalInvested: new Decimal(0),
        totalGain: new Decimal(0),
        gainPercentage: new Decimal(0),
      },
    });

    return {
      id: portfolio.id,
      userId: portfolio.userId,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      name: portfolio.name,
      description: portfolio.description,
      totalValue: portfolio.totalValue,
      totalInvested: portfolio.totalInvested,
      totalGain: portfolio.totalGain,
      gainPercentage: portfolio.gainPercentage,
      isActive: portfolio.isActive,
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    };
  }

  /**
   * Update a user's portfolio (admin only)
   */
  async updateUserPortfolio(
    userId: string,
    portfolioId: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      totalValue?: number;
      totalInvested?: number;
      totalGain?: number;
      gainPercentage?: number;
    }
  ): Promise<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    name: string;
    description: string | null;
    totalValue: Decimal;
    totalInvested: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    const updateData: {
      name?: string;
      description?: string | null;
      isActive?: boolean;
      totalValue?: Decimal;
      totalInvested?: Decimal;
      totalGain?: Decimal;
      gainPercentage?: Decimal;
    } = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description ?? null;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    if (data.totalValue !== undefined) {
      updateData.totalValue = new Decimal(data.totalValue);
    }
    if (data.totalInvested !== undefined) {
      updateData.totalInvested = new Decimal(data.totalInvested);
    }
    if (data.totalGain !== undefined) {
      updateData.totalGain = new Decimal(data.totalGain);
    }
    if (data.gainPercentage !== undefined) {
      updateData.gainPercentage = new Decimal(data.gainPercentage);
    }

    const updatedPortfolio = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: updateData,
    });

    return {
      id: updatedPortfolio.id,
      userId: updatedPortfolio.userId,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      name: updatedPortfolio.name,
      description: updatedPortfolio.description,
      totalValue: updatedPortfolio.totalValue,
      totalInvested: updatedPortfolio.totalInvested,
      totalGain: updatedPortfolio.totalGain,
      gainPercentage: updatedPortfolio.gainPercentage,
      isActive: updatedPortfolio.isActive,
      createdAt: updatedPortfolio.createdAt,
      updatedAt: updatedPortfolio.updatedAt,
    };
  }

  /**
   * Delete a user's portfolio (admin only)
   */
  async deleteUserPortfolio(
    userId: string,
    portfolioId: string
  ): Promise<{
    hasInvestments: boolean;
    investmentCount: number;
    deleted: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
      include: {
        investments: {
          select: { id: true },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    const investmentCount = portfolio.investments.length;
    const hasInvestments = investmentCount > 0;

    if (hasInvestments) {
      throw new ConflictError(
        `Cannot delete portfolio. It contains ${investmentCount} investment(s). Please remove all investments first.`
      );
    }

    await prisma.portfolio.delete({
      where: { id: portfolioId },
    });

    return {
      hasInvestments: false,
      investmentCount: 0,
      deleted: true,
    };
  }

  /**
   * Get all portfolios with optional filters (admin only)
   */
  async getAllPortfolios(filters: { userId?: string; limit?: number; offset?: number }): Promise<{
    portfolios: Array<{
      id: string;
      userId: string;
      userName: string;
      userEmail: string;
      name: string;
      description: string | null;
      totalValue: Decimal;
      totalInvested: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
      isActive: boolean;
      investmentCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    const [portfolios, total] = await Promise.all([
      prisma.portfolio.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          investments: {
            select: {
              id: true,
            },
          },
        },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.portfolio.count({ where }),
    ]);

    return {
      portfolios: portfolios.map((p) => ({
        id: p.id,
        userId: p.userId,
        userName: `${p.user.firstName} ${p.user.lastName}`,
        userEmail: p.user.email,
        name: p.name,
        description: p.description,
        totalValue: p.totalValue,
        totalInvested: p.totalInvested,
        totalGain: p.totalGain,
        gainPercentage: p.gainPercentage,
        isActive: p.isActive,
        investmentCount: p.investments.length,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
  }

  /**
   * Get all marketplace items with pagination and filters (admin only)
   */
  async getAllMarketplaceItems(filters: {
    type?: string;
    riskLevel?: string;
    category?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<{
      id: string;
      name: string;
      type: string;
      symbol: string | null;
      description: string | null;
      currentPrice: number;
      minimumInvestment: number;
      maximumInvestment: number | null;
      currency: string;
      riskLevel: string;
      expectedReturn: number | null;
      category: string | null;
      issuer: string | null;
      maturityDate: Date | null;
      isAvailable: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    // const { marketplaceService } = await import('./marketplace.service.js');
    const where: Record<string, unknown> = {};

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.riskLevel) {
      where.riskLevel = filters.riskLevel;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { symbol: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.minPrice !== undefined) {
      where.currentPrice = { gte: filters.minPrice };
    }

    if (filters.maxPrice !== undefined) {
      const currentPriceFilter = where.currentPrice as { gte?: number } | undefined;
      where.currentPrice = {
        ...(currentPriceFilter ?? {}),
        lte: filters.maxPrice,
      };
    }

    const [items, total] = await Promise.all([
      prisma.marketplaceItem.findMany({
        where,
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.marketplaceItem.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        symbol: item.symbol,
        description: item.description,
        currentPrice: item.currentPrice.toNumber(),
        minimumInvestment: item.minimumInvestment.toNumber(),
        maximumInvestment: item.maximumInvestment?.toNumber() ?? null,
        currency: item.currency,
        riskLevel: item.riskLevel,
        expectedReturn: item.expectedReturn?.toNumber() ?? null,
        category: item.category,
        issuer: item.issuer,
        maturityDate: item.maturityDate,
        isAvailable: item.isAvailable,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      total,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
  }

  /**
   * Get marketplace item by ID (admin only)
   */
  async getMarketplaceItemById(id: string): Promise<{
    id: string;
    name: string;
    type: string;
    symbol: string | null;
    description: string | null;
    currentPrice: number;
    minimumInvestment: number;
    maximumInvestment: number | null;
    currency: string;
    riskLevel: string;
    expectedReturn: number | null;
    category: string | null;
    issuer: string | null;
    maturityDate: Date | null;
    isAvailable: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const item = await prisma.marketplaceItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundError('Marketplace item not found');
    }

    return {
      id: item.id,
      name: item.name,
      type: item.type,
      symbol: item.symbol,
      description: item.description,
      currentPrice: item.currentPrice.toNumber(),
      minimumInvestment: item.minimumInvestment.toNumber(),
      maximumInvestment: item.maximumInvestment?.toNumber() ?? null,
      currency: item.currency,
      riskLevel: item.riskLevel,
      expectedReturn: item.expectedReturn?.toNumber() ?? null,
      category: item.category,
      issuer: item.issuer,
      maturityDate: item.maturityDate,
      isAvailable: item.isAvailable,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Create marketplace item (admin only)
   */
  async createMarketplaceItem(data: {
    name: string;
    type: string;
    symbol?: string;
    description?: string;
    currentPrice: number;
    minimumInvestment: number;
    maximumInvestment?: number;
    currency?: string;
    riskLevel: string;
    expectedReturn?: number;
    category?: string;
    issuer?: string;
    maturityDate?: string | Date;
    isAvailable?: boolean;
  }): Promise<{
    id: string;
    name: string;
    type: string;
    symbol: string | null;
    description: string | null;
    currentPrice: number;
    minimumInvestment: number;
    maximumInvestment: number | null;
    currency: string;
    riskLevel: string;
    expectedReturn: number | null;
    category: string | null;
    issuer: string | null;
    maturityDate: Date | null;
    isAvailable: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const { marketplaceService } = await import('./marketplace.service.js');
    const { createMarketplaceItemSchema } = await import('../lib/validators.js');

    const validatedData = createMarketplaceItemSchema.parse(data);
    const item = (await marketplaceService.createMarketplaceItem(validatedData)) as {
      id: string;
      name: string;
      type: string;
      symbol: string | null;
      description: string | null;
      currentPrice: Decimal;
      minimumInvestment: Decimal;
      maximumInvestment: Decimal | null;
      currency: string;
      riskLevel: string;
      expectedReturn: Decimal | null;
      category: string | null;
      issuer: string | null;
      maturityDate: Date | null;
      isAvailable: boolean;
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      ...item,
      currentPrice: item.currentPrice.toNumber(),
      minimumInvestment: item.minimumInvestment.toNumber(),
      maximumInvestment: item.maximumInvestment?.toNumber() ?? null,
      expectedReturn: item.expectedReturn?.toNumber() ?? null,
    };
  }

  /**
   * Update marketplace item (admin only)
   */
  async updateMarketplaceItem(
    id: string,
    data: {
      name?: string;
      type?: string;
      symbol?: string;
      description?: string;
      currentPrice?: number;
      minimumInvestment?: number;
      maximumInvestment?: number;
      currency?: string;
      riskLevel?: string;
      expectedReturn?: number;
      category?: string;
      issuer?: string;
      maturityDate?: string | Date | null;
      isAvailable?: boolean;
    }
  ): Promise<{
    id: string;
    name: string;
    type: string;
    symbol: string | null;
    description: string | null;
    currentPrice: number;
    minimumInvestment: number;
    maximumInvestment: number | null;
    currency: string;
    riskLevel: string;
    expectedReturn: number | null;
    category: string | null;
    issuer: string | null;
    maturityDate: Date | null;
    isAvailable: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const { marketplaceService } = await import('./marketplace.service.js');
    const { updateMarketplaceItemSchema } = await import('../lib/validators.js');

    const validatedData = updateMarketplaceItemSchema.parse(data);
    const item = (await marketplaceService.updateMarketplaceItem(id, validatedData)) as {
      id: string;
      name: string;
      type: string;
      symbol: string | null;
      description: string | null;
      currentPrice: Decimal;
      minimumInvestment: Decimal;
      maximumInvestment: Decimal | null;
      currency: string;
      riskLevel: string;
      expectedReturn: Decimal | null;
      category: string | null;
      issuer: string | null;
      maturityDate: Date | null;
      isAvailable: boolean;
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      ...item,
      currentPrice: item.currentPrice.toNumber(),
      minimumInvestment: item.minimumInvestment.toNumber(),
      maximumInvestment: item.maximumInvestment?.toNumber() ?? null,
      expectedReturn: item.expectedReturn?.toNumber() ?? null,
    };
  }

  /**
   * Delete marketplace item (admin only)
   */
  async deleteMarketplaceItem(id: string): Promise<{ success: boolean }> {
    const { marketplaceService } = await import('./marketplace.service.js');
    return await marketplaceService.deleteMarketplaceItem(id);
  }

  /**
   * Get all documents with optional filters (admin only)
   */
  async getAllDocuments(filters?: {
    userId?: string;
    type?: string;
    isImportant?: boolean;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    documents: Array<{
      id: string;
      userId: string;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
      };
      type: string;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      description: string | null;
      status: string;
      uploadedBy: string;
      uploadedByUser: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
      } | null;
      isImportant: boolean;
      createdAt: Date;
      updatedAt: Date;
      downloadUrl: string;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.isImportant !== undefined) {
      where.isImportant = filters.isImportant;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.document.count({ where }),
    ]);

    // Fetch uploadedBy users separately
    const uploadedByUserIds = [...new Set(documents.map((doc) => doc.uploadedBy))];
    const uploadedByUsers = await prisma.user.findMany({
      where: {
        id: { in: uploadedByUserIds },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    const uploadedByUserMap = new Map(uploadedByUsers.map((user) => [user.id, user]));

    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        userId: doc.userId,
        user: doc.user,
        type: doc.type,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl.startsWith('http') ? doc.fileUrl : `${apiBaseUrl}${doc.fileUrl}`,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        description: doc.description,
        status: (doc as unknown as { status: string }).status,
        uploadedBy: doc.uploadedBy,
        uploadedByUser: uploadedByUserMap.get(doc.uploadedBy) ?? null,
        isImportant: doc.isImportant,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        downloadUrl: `${apiBaseUrl}/api/documents/${doc.id}/download`,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Upload document for a user (admin only)
   */
  async uploadDocumentForUser(
    adminId: string,
    userId: string,
    data: UploadDocumentInput
  ): Promise<unknown> {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Use document service to upload
    const document = (await documentService.uploadDocument(userId, adminId, data)) as {
      id: string;
    };

    // Send email notification to user
    try {
      // Check if document uploaded emails are enabled
      const shouldSend = await emailSettingsService.shouldSendNotification(
        userId,
        'documentUploaded'
      );
      if (shouldSend) {
        await emailService
          .sendDocumentUploadedByAdminEmail(user.email, user.firstName, data.fileName, data.type)
          .then(() => {
            console.warn(`Document uploaded email sent successfully to ${user.email}`);
          })
          .catch((error) => {
            console.error('Failed to send document uploaded email:', error);
          });
      } else {
        console.warn(`Document uploaded email skipped for ${user.email} (disabled in settings)`);
      }

      // Create notification
      notificationService
        .createNotification({
          userId: user.id,
          type: NotificationType.DOCUMENT_UPLOADED,
          title: 'Document Uploaded',
          message: `A document (${data.fileName}) has been uploaded to your account by an administrator.`,
          actionUrl: '/dashboard/documents',
          data: { documentId: document.id, fileName: data.fileName, type: data.type },
        })
        .catch((error) => {
          console.error('Failed to create document uploaded notification:', error);
        });
    } catch (error) {
      console.error('Failed to send document uploaded email:', error);
      // Don't throw - email failure shouldn't break the document upload
    }

    return document;
  }

  /**
   * Update document metadata (admin only)
   */
  async updateDocument(
    documentId: string,
    data: {
      type?: string;
      description?: string;
      isImportant?: boolean;
      status?: string;
    }
  ): Promise<unknown> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    const updateData: Record<string, unknown> = {};

    if (data.type !== undefined) {
      updateData.type = data.type as
        | 'KYC'
        | 'IDENTIFICATION'
        | 'PROOF_OF_ADDRESS'
        | 'BANK_STATEMENT'
        | 'TAX_DOCUMENT'
        | 'AGREEMENT'
        | 'OTHER';
    }

    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    if (data.isImportant !== undefined) {
      updateData.isImportant = data.isImportant;
    }

    if (data.status !== undefined) {
      updateData.status = data.status as 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
    }

    const oldStatus = (document as unknown as { status: string }).status;
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Fetch uploadedBy user
    const uploadedByUser = await prisma.user.findUnique({
      where: { id: updated.uploadedBy },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    // Send email notification if status changed to VERIFIED or REJECTED
    if (
      data.status !== undefined &&
      data.status !== oldStatus &&
      ['VERIFIED', 'REJECTED'].includes(data.status)
    ) {
      try {
        // Check if document status change emails are enabled
        const shouldSend = await emailSettingsService.shouldSendNotification(
          updated.userId,
          'documentStatusChange'
        );
        if (shouldSend) {
          await emailService
            .sendDocumentStatusChangeEmail(
              updated.user.email,
              updated.user.firstName,
              updated.fileName,
              data.status as 'VERIFIED' | 'REJECTED',
              data.description
            )
            .then(() => {
              console.warn(
                `Document status change email sent successfully to ${updated.user.email}`
              );
            })
            .catch((error) => {
              console.error('Failed to send document status change email:', error);
            });
        } else {
          console.warn(
            `Document status change email skipped for ${updated.user.email} (disabled in settings)`
          );
        }

        // Create notification
        notificationService
          .createNotification({
            userId: updated.userId,
            type: NotificationType.DOCUMENT_STATUS_CHANGE,
            title: `Document ${data.status}`,
            message: `Your document "${updated.fileName}" has been ${data.status.toLowerCase()}.${data.description ? ` ${data.description}` : ''}`,
            actionUrl: '/dashboard/documents',
            data: { documentId: updated.id, status: data.status },
          })
          .catch((error) => {
            console.error('Failed to create document status change notification:', error);
          });
      } catch (error) {
        console.error('Failed to send document status change email:', error);
        // Don't throw - email failure shouldn't break the document update
      }
    }

    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

    return {
      ...updated,
      uploadedByUser: uploadedByUser ?? null,
      fileUrl: updated.fileUrl.startsWith('http')
        ? updated.fileUrl
        : `${apiBaseUrl}${updated.fileUrl}`,
      downloadUrl: `${apiBaseUrl}/api/documents/${updated.id}/download`,
    };
  }

  /**
   * Delete document (admin only)
   */
  async deleteDocument(documentId: string): Promise<{ message: string }> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Delete file from filesystem
    const filePath = await documentService.getDocumentFilePath(documentId);
    try {
      await import('fs/promises').then((fs) => fs.unlink(filePath));
    } catch (error) {
      console.error('Failed to delete file:', error);
      // Continue with database deletion even if file deletion fails
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId },
    });

    return { message: 'Document deleted successfully' };
  }

  /**
   * Get document by ID (admin only)
   */
  async getDocumentById(documentId: string): Promise<unknown> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Fetch uploadedBy user
    const uploadedByUser = await prisma.user.findUnique({
      where: { id: document.uploadedBy },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

    return {
      ...document,
      uploadedByUser: uploadedByUser ?? null,
      fileUrl: document.fileUrl.startsWith('http')
        ? document.fileUrl
        : `${apiBaseUrl}${document.fileUrl}`,
      downloadUrl: `${apiBaseUrl}/api/documents/${document.id}/download`,
    };
  }

  /**
   * Get all bank accounts with filters and pagination
   */
  async getAllBankAccounts(filters: {
    userId?: string;
    isVerified?: boolean;
    isPrimary?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    bankAccounts: Array<{
      id: string;
      userId: string;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
      };
      accountHolderName: string;
      accountNumber: string;
      bankName: string;
      bankCode: string | null;
      accountType: string;
      currency: string;
      balance: Decimal;
      isVerified: boolean;
      verifiedAt: Date | null;
      isPrimary: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.isVerified !== undefined) {
      where.isVerified = filters.isVerified;
    }

    if (filters.isPrimary !== undefined) {
      where.isPrimary = filters.isPrimary;
    }

    if (filters.search) {
      where.OR = [
        { bankName: { contains: filters.search, mode: 'insensitive' } },
        { accountNumber: { contains: filters.search, mode: 'insensitive' } },
        { accountHolderName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [bankAccounts, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.bankAccount.count({ where }),
    ]);

    return {
      bankAccounts: bankAccounts.map((account) => ({
        id: account.id,
        userId: account.userId,
        user: account.user,
        accountHolderName: account.accountHolderName,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        bankCode: account.bankCode,
        accountType: account.accountType,
        currency: account.currency,
        balance: account.balance,
        isVerified: account.isVerified,
        verifiedAt: account.verifiedAt,
        isPrimary: account.isPrimary,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get bank account by ID
   */
  async getBankAccountById(id: string): Promise<{
    id: string;
    userId: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    accountHolderName: string;
    accountNumber: string;
    bankName: string;
    bankCode: string | null;
    accountType: string;
    currency: string;
    balance: Decimal;
    isVerified: boolean;
    verifiedAt: Date | null;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    return {
      id: bankAccount.id,
      userId: bankAccount.userId,
      user: bankAccount.user,
      accountHolderName: bankAccount.accountHolderName,
      accountNumber: bankAccount.accountNumber,
      bankName: bankAccount.bankName,
      bankCode: bankAccount.bankCode,
      accountType: bankAccount.accountType,
      currency: bankAccount.currency,
      balance: bankAccount.balance,
      isVerified: bankAccount.isVerified,
      verifiedAt: bankAccount.verifiedAt,
      isPrimary: bankAccount.isPrimary,
      createdAt: bankAccount.createdAt,
      updatedAt: bankAccount.updatedAt,
    };
  }

  /**
   * Create bank account for a user
   */
  async createBankAccountForUser(
    userId: string,
    data: {
      accountHolderName: string;
      accountNumber: string;
      bankName: string;
      bankCode?: string | null;
      accountType: string;
      currency: string;
      balance?: number;
      isVerified?: boolean;
      isPrimary?: boolean;
    }
  ): Promise<unknown> {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check if account with same number already exists for this user
    const existingAccount = await prisma.bankAccount.findUnique({
      where: {
        userId_accountNumber: {
          userId,
          accountNumber: data.accountNumber,
        },
      },
    });

    if (existingAccount) {
      throw new ValidationError('Bank account with this number already exists for this user');
    }

    // If this is the first account or isPrimary is true, make it primary
    const accountCount = await prisma.bankAccount.count({
      where: { userId },
    });

    const isPrimary = data.isPrimary ?? accountCount === 0;

    // If setting as primary, remove primary from other accounts
    if (isPrimary) {
      await prisma.bankAccount.updateMany({
        where: {
          userId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId,
        accountHolderName: data.accountHolderName,
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        bankCode: data.bankCode ?? null,
        accountType: data.accountType,
        currency: data.currency,
        balance: data.balance ? new Decimal(data.balance) : new Decimal(0),
        isVerified: data.isVerified ?? false,
        verifiedAt: data.isVerified ? new Date() : null,
        isPrimary,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return bankAccount;
  }

  /**
   * Update bank account
   */
  async updateBankAccount(
    id: string,
    data: {
      accountHolderName?: string;
      accountNumber?: string;
      bankName?: string;
      bankCode?: string | null;
      accountType?: string;
      currency?: string;
      balance?: number;
      isVerified?: boolean;
      isPrimary?: boolean;
    }
  ): Promise<unknown> {
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    // Check if trying to change account number to one that already exists
    if (data.accountNumber && data.accountNumber !== bankAccount.accountNumber) {
      const existingAccount = await prisma.bankAccount.findUnique({
        where: {
          userId_accountNumber: {
            userId: bankAccount.userId,
            accountNumber: data.accountNumber,
          },
        },
      });

      if (existingAccount) {
        throw new ValidationError('Bank account with this number already exists for this user');
      }
    }

    // If setting as primary, remove primary from other accounts
    if (data.isPrimary === true) {
      await prisma.bankAccount.updateMany({
        where: {
          userId: bankAccount.userId,
          id: { not: id },
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }

    const updateData: Record<string, unknown> = {};

    if (data.accountHolderName !== undefined) {
      updateData.accountHolderName = data.accountHolderName;
    }
    if (data.accountNumber !== undefined) {
      updateData.accountNumber = data.accountNumber;
    }
    if (data.bankName !== undefined) {
      updateData.bankName = data.bankName;
    }
    if (data.bankCode !== undefined) {
      updateData.bankCode = data.bankCode;
    }
    if (data.accountType !== undefined) {
      updateData.accountType = data.accountType;
    }
    if (data.currency !== undefined) {
      updateData.currency = data.currency;
    }
    if (data.balance !== undefined) {
      updateData.balance = new Decimal(data.balance);
    }
    if (data.isVerified !== undefined) {
      updateData.isVerified = data.isVerified;
      if (data.isVerified && !bankAccount.verifiedAt) {
        updateData.verifiedAt = new Date();
      } else if (!data.isVerified) {
        updateData.verifiedAt = null;
      }
    }
    if (data.isPrimary !== undefined) {
      updateData.isPrimary = data.isPrimary;
    }

    const updatedAccount = await prisma.bankAccount.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedAccount;
  }

  /**
   * Delete bank account
   */
  async deleteBankAccount(id: string): Promise<{ message: string }> {
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    // Check if this is the only account
    const accountCount = await prisma.bankAccount.count({
      where: { userId: bankAccount.userId },
    });

    if (accountCount === 1) {
      throw new ValidationError('Cannot delete the only bank account');
    }

    // If this is the primary account, make another one primary
    if (bankAccount.isPrimary) {
      const nextAccount = await prisma.bankAccount.findFirst({
        where: {
          userId: bankAccount.userId,
          id: { not: id },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (nextAccount) {
        await prisma.bankAccount.update({
          where: { id: nextAccount.id },
          data: { isPrimary: true },
        });
      }
    }

    await prisma.bankAccount.delete({
      where: { id },
    });

    return { message: 'Bank account deleted successfully' };
  }

  /**
   * Verify bank account
   */
  async verifyBankAccount(id: string): Promise<unknown> {
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    const verifiedAccount = await prisma.bankAccount.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return verifiedAccount;
  }

  /**
   * Set primary bank account
   */
  async setPrimaryBankAccount(userId: string, bankAccountId: string): Promise<unknown> {
    // Verify bank account exists and belongs to user
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        userId,
      },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    // Remove primary from all other accounts
    await prisma.bankAccount.updateMany({
      where: {
        userId,
        id: { not: bankAccountId },
      },
      data: { isPrimary: false },
    });

    // Set this account as primary
    const updatedAccount = await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: { isPrimary: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedAccount;
  }

  /**
   * Get all problem reports with filters and pagination
   */
  async getAllProblemReports(filters: {
    userId?: string;
    status?: string;
    category?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    reports: Array<{
      id: string;
      userId: string;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
      };
      subject: string;
      description: string;
      category: string;
      priority: string;
      status: string;
      resolvedAt: Date | null;
      resolvedBy: string | null;
      resolvedByUser: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
      } | null;
      createdAt: Date;
      updatedAt: Date;
      attachmentCount: number;
      responseCount: number;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.search) {
      where.OR = [
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [reports, total] = await Promise.all([
      prismaClient.problemReport.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          resolvedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              attachments: true,
              responses: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prismaClient.problemReport.count({ where }),
    ]);

    return {
      reports: (reports as Array<Record<string, unknown>>).map((report) => ({
        id: report.id as string,
        userId: report.userId as string,
        user: report.user as { id: string; email: string; firstName: string; lastName: string },
        subject: report.subject as string,
        description: report.description as string,
        category: report.category as string,
        priority: report.priority as string,
        status: report.status as string,
        resolvedAt: report.resolvedAt as Date | null,
        resolvedBy: report.resolvedBy as string | null,
        resolvedByUser: report.resolvedByUser as {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
        } | null,
        createdAt: report.createdAt as Date,
        updatedAt: report.updatedAt as Date,
        attachmentCount: (report._count as { attachments: number; responses: number }).attachments,
        responseCount: (report._count as { attachments: number; responses: number }).responses,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Get problem report by ID (admin)
   */
  async getProblemReportById(id: string): Promise<unknown> {
    const report = await prismaClient.problemReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
        responses: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        resolvedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundError('Problem report not found');
    }

    return report;
  }

  /**
   * Update problem report status
   */
  async updateProblemReportStatus(
    id: string,
    status: string,
    resolvedBy: string
  ): Promise<unknown> {
    const report = await prismaClient.problemReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundError('Problem report not found');
    }

    const updateData: Record<string, unknown> = {
      status,
    };

    if (status === 'RESOLVED') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy;
    } else if (status === 'OPEN') {
      updateData.resolvedAt = null;
      updateData.resolvedBy = null;
    }

    const updatedReport = (await prismaClient.problemReport.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
        responses: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })) as Record<string, unknown>;

    // Send email notification to user
    try {
      const reportData = report as Record<string, unknown>;
      const reportUser = reportData.user as { email: string; firstName: string };
      await emailService
        .sendProblemReportStatusChangeEmail(
          reportUser.email,
          reportUser.firstName,
          reportData.id as string,
          status
        )
        .catch((error) => {
          console.error('Failed to send problem report status change email:', error);
        });

      // Create notification for user
      notificationService
        .createNotification({
          userId: reportData.userId as string,
          type: NotificationType.PROBLEM_REPORT_STATUS_CHANGE,
          title: `Problem Report ${status === 'RESOLVED' ? 'Resolved' : 'Reopened'}`,
          message: `Your problem report "${reportData.subject as string}" has been ${status === 'RESOLVED' ? 'resolved' : 'reopened'}.`,
          actionUrl: '/problem-reports',
          data: { problemReportId: reportData.id as string, status },
        })
        .catch((error) => {
          console.error('Failed to create problem report status change notification:', error);
        });
    } catch (error) {
      console.error('Failed to send problem report status change email:', error);
    }

    return updatedReport;
  }

  /**
   * Create admin response to problem report
   */
  async createProblemReportResponse(
    problemReportId: string,
    userId: string,
    data: {
      message: string;
      attachments?: Array<{
        fileName: string;
        fileSize: number;
        mimeType: string;
        fileBuffer: Buffer;
      }>;
    }
  ): Promise<unknown> {
    // Verify report exists
    const report = await prismaClient.problemReport.findUnique({
      where: { id: problemReportId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundError('Problem report not found');
    }

    // Create response
    const response = (await prismaClient.problemReportResponse.create({
      data: {
        problemReportId,
        userId,
        message: data.message,
        isAdminResponse: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })) as Record<string, unknown>;

    // Upload attachments if provided
    if (data.attachments && data.attachments.length > 0) {
      const { problemReportService } = await import('./problemReport.service.js');
      const attachmentPromises = data.attachments.map(async (attachment) => {
        const fileUrl = await problemReportService.uploadAttachment(userId, attachment);
        return prismaClient.problemReportResponseAttachment.create({
          data: {
            responseId: response.id as string,
            fileName: attachment.fileName,
            fileUrl,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
          },
        });
      });

      await Promise.all(attachmentPromises);
    }

    // Send email notification to user
    try {
      const reportData = report as Record<string, unknown>;
      const reportUser = reportData.user as { email: string; firstName: string };
      await emailService
        .sendProblemReportResponseEmail(
          reportUser.email,
          reportUser.firstName,
          reportData.id as string,
          data.message
        )
        .catch((error) => {
          console.error('Failed to send problem report response email:', error);
        });

      // Create notification for user
      notificationService
        .createNotification({
          userId: reportData.userId as string,
          type: NotificationType.PROBLEM_REPORT_RESPONSE,
          title: 'Response to Your Problem Report',
          message: `An admin has responded to your problem report "${reportData.subject as string}".`,
          actionUrl: '/problem-reports',
          data: { problemReportId: reportData.id as string },
        })
        .catch((error) => {
          console.error('Failed to create problem report response notification:', error);
        });
    } catch (error) {
      console.error('Failed to send problem report response email:', error);
    }

    // Fetch complete response with attachments
    return await prismaClient.problemReportResponse.findUnique({
      where: { id: response.id as string },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });
  }
}

export const adminService = new AdminService();
