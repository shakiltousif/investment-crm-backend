import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';
import { emailService } from './email.service';

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

    const totalPortfolioValue = portfolios.reduce(
      (sum, p) => sum + Number(p.totalValue),
      0,
    );

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
  }) {
    const where: any = {};

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
        take: filters.limit || 50,
        skip: filters.offset || 0,
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
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string) {
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
    return password.split('').sort(() => Math.random() - 0.5).join('');
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
  }) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Generate temporary password if not provided
    const tempPassword = data.password || this.generateTemporaryPassword();
    const isTemporaryPassword = !data.password;

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.default.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        role: (data.role as any) || 'CLIENT',
      },
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
      const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
      
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .credentials { background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { margin-top: 30px; font-size: 12px; color: #666; }
              .warning { background-color: #FEF3C7; color: #92400E; padding: 10px; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Welcome to FIL LIMITED, ${data.firstName}!</h2>
              <p>Your account has been created. You can now access the investment management portal using the credentials below:</p>
              
              <div class="credentials">
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Password:</strong> ${tempPassword}</p>
                ${isTemporaryPassword ? '<p class="warning"><strong>Important:</strong> This is a temporary password. Please change it after your first login.</p>' : ''}
              </div>
              
              <p>Click the button below to log in:</p>
              <a href="${loginUrl}" class="button">Log In to Portal</a>
              
              <p>Or copy and paste this link into your browser:</p>
              <p>${loginUrl}</p>
              
              <div class="footer">
                <p>FIL LIMITED Investment Management</p>
                <p>If you did not expect this email, please contact support immediately.</p>
              </div>
            </div>
          </body>
        </html>
      `;

      emailService.sendEmail({
        to: data.email,
        subject: 'Welcome to FIL LIMITED - Your Account Credentials',
        html,
      }).catch((error) => {
        console.error('Failed to send welcome email:', error);
        // Don't throw - email failure shouldn't break user creation
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
  async updateUser(userId: string, data: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    role?: string;
    isActive?: boolean;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

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
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string) {
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
  async getPendingDeposits(filters: {
    limit?: number;
    offset?: number;
  }) {
    const [deposits, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          type: 'DEPOSIT',
          status: 'PENDING',
        },
        take: filters.limit || 50,
        skip: filters.offset || 0,
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
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  /**
   * Get pending withdrawals
   */
  async getPendingWithdrawals(filters: {
    limit?: number;
    offset?: number;
  }) {
    const [withdrawals, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          type: 'WITHDRAWAL',
          status: 'PENDING',
        },
        take: filters.limit || 50,
        skip: filters.offset || 0,
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
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }

  /**
   * Approve or reject transaction
   */
  async updateTransactionStatus(
    transactionId: string,
    status: 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'REJECTED',
    notes?: string,
  ) {
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
        description: notes ? `${transaction.description || ''} - ${notes}`.trim() : transaction.description,
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
  }) {
    const where: any = {};

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
      where.transactionDate = {};
      if (filters.startDate) {
        where.transactionDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.transactionDate.lte = new Date(filters.endDate);
      }
    }

    const limit = Math.min(filters.limit || 100, 500);
    const offset = filters.offset || 0;

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
    description: string,
  ) {
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

    return transaction;
  }
}

export const adminService = new AdminService();

