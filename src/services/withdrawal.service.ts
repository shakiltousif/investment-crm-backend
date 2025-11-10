import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';
import { emailService } from './email.service';

export interface CreateWithdrawalInput {
  amount: number;
  currency: string;
  bankAccountId: string;
  description?: string;
}

export interface WithdrawalFilters {
  status?: string;
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class WithdrawalService {
  /**
   * Create withdrawal request
   */
  async createWithdrawal(
    userId: string,
    data: CreateWithdrawalInput
  ): Promise<{
    withdrawal: unknown;
    details: {
      bankAccount: unknown;
      availableBalance: Decimal;
      balanceAfterWithdrawal: Decimal;
    };
  }> {
    // Verify bank account exists and belongs to user
    const bankAccount = await prisma.bankAccount.findFirst({
      where: {
        id: data.bankAccountId,
        userId,
      },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank account not found');
    }

    // Validate amount
    if (data.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    // Check available balance
    if (bankAccount.balance.lessThan(data.amount)) {
      throw new ValidationError('Insufficient balance for withdrawal');
    }

    // Get user email for notification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    // Create withdrawal request
    const withdrawal = await prisma.transaction.create({
      data: {
        userId,
        type: 'WITHDRAWAL',
        amount: new Decimal(data.amount),
        currency: data.currency,
        status: 'PENDING',
        description: data.description ?? 'Withdrawal request',
        bankAccountId: data.bankAccountId,
        transactionDate: new Date(),
      },
      include: {
        bankAccount: true,
      },
    });

    // Send email notification (non-blocking)
    if (user?.email) {
      emailService
        .sendWithdrawalNotification(
          user.email,
          Number(withdrawal.amount),
          withdrawal.currency,
          'PENDING'
        )
        .catch((error) => {
          console.error('Failed to send withdrawal notification email:', error);
          // Don't throw - email failure shouldn't break the withdrawal creation
        });
    }

    return {
      withdrawal,
      details: {
        bankAccount,
        availableBalance: bankAccount.balance,
        balanceAfterWithdrawal: bankAccount.balance.minus(data.amount),
      },
    };
  }

  /**
   * Get withdrawals
   */
  async getWithdrawals(
    userId: string,
    filters: WithdrawalFilters
  ): Promise<{
    data: unknown[];
    pagination: { total: number; limit: number; offset: number; pages: number };
  }> {
    const where: Record<string, unknown> = {
      userId,
      type: 'WITHDRAWAL',
    };

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Currency filter
    if (filters.currency) {
      where.currency = filters.currency;
    }

    // Amount range filter
    if (filters.minAmount || filters.maxAmount) {
      const amountFilter: { gte?: Decimal; lte?: Decimal } = {};
      if (filters.minAmount) {
        amountFilter.gte = new Decimal(filters.minAmount);
      }
      if (filters.maxAmount) {
        amountFilter.lte = new Decimal(filters.maxAmount);
      }
      where.amount = amountFilter;
    }

    // Date range filter
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

    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = filters.offset ?? 0;

    const [withdrawals, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          bankAccount: true,
        },
        orderBy: { transactionDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      data: withdrawals,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get withdrawal by ID
   */
  async getWithdrawalById(
    userId: string,
    withdrawalId: string
  ): Promise<{
    id: string;
    userId: string;
    bankAccountId: string | null;
    investmentId: string | null;
    type: string;
    amount: Decimal;
    currency: string;
    status: string;
    description: string | null;
    transactionDate: Date;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    bankAccount?: unknown;
  }> {
    const withdrawal = await prisma.transaction.findFirst({
      where: {
        id: withdrawalId,
        userId,
        type: 'WITHDRAWAL',
      },
      include: {
        bankAccount: true,
      },
    });

    if (!withdrawal) {
      throw new NotFoundError('Withdrawal not found');
    }

    return withdrawal;
  }

  /**
   * Approve withdrawal
   */
  async approveWithdrawal(userId: string, withdrawalId: string): Promise<unknown> {
    const withdrawal = await this.getWithdrawalById(userId, withdrawalId);

    if ((withdrawal.status as string) !== 'PENDING') {
      throw new ValidationError('Only pending withdrawals can be approved');
    }

    // Verify balance is still available
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: withdrawal.bankAccountId! },
    });

    if (bankAccount && bankAccount.balance.lessThan(withdrawal.amount)) {
      throw new ValidationError('Insufficient balance for withdrawal');
    }

    const updated = await prisma.transaction.update({
      where: { id: withdrawalId },
      data: { status: 'PROCESSING' },
      include: {
        bankAccount: true,
      },
    });

    return updated;
  }

  /**
   * Complete withdrawal
   */
  async completeWithdrawal(userId: string, withdrawalId: string): Promise<unknown> {
    const withdrawal = await this.getWithdrawalById(userId, withdrawalId);

    if ((withdrawal.status as string) !== 'PROCESSING') {
      throw new ValidationError('Only processing withdrawals can be completed');
    }

    // Update bank account balance
    if (withdrawal.bankAccountId) {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { id: withdrawal.bankAccountId },
      });

      if (bankAccount) {
        const newBalance = bankAccount.balance.minus(withdrawal.amount);
        await prisma.bankAccount.update({
          where: { id: withdrawal.bankAccountId },
          data: { balance: newBalance },
        });
      }
    }

    const updated = await prisma.transaction.update({
      where: { id: withdrawalId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: {
        bankAccount: true,
      },
    });

    return updated;
  }

  /**
   * Reject withdrawal
   */
  async rejectWithdrawal(userId: string, withdrawalId: string, reason?: string): Promise<unknown> {
    const withdrawal = await this.getWithdrawalById(userId, withdrawalId);

    if (!['PENDING', 'PROCESSING'].includes(withdrawal.status as string)) {
      throw new ValidationError('Only pending or processing withdrawals can be rejected');
    }

    const updated = await prisma.transaction.update({
      where: { id: withdrawalId },
      data: {
        status: 'FAILED',
        description: reason
          ? `${withdrawal.description ?? ''} - Rejected: ${reason}`
          : withdrawal.description,
      },
      include: {
        bankAccount: true,
      },
    });

    return updated;
  }

  /**
   * Cancel withdrawal (user-initiated)
   */
  async cancelWithdrawal(userId: string, withdrawalId: string): Promise<unknown> {
    const withdrawal = await this.getWithdrawalById(userId, withdrawalId);

    if (!['PENDING'].includes(withdrawal.status as string)) {
      throw new ValidationError('Only pending withdrawals can be cancelled');
    }

    const updated = await prisma.transaction.update({
      where: { id: withdrawalId },
      data: {
        status: 'CANCELLED',
      },
      include: {
        bankAccount: true,
      },
    });

    // Send email notification (non-blocking)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (user?.email) {
      emailService
        .sendWithdrawalNotification(
          user.email,
          Number(withdrawal.amount),
          withdrawal.currency,
          'CANCELLED'
        )
        .catch((error) => {
          console.error('Failed to send cancellation email:', error);
        });
    }

    return updated;
  }

  /**
   * Get withdrawal summary
   */
  async getWithdrawalSummary(userId: string): Promise<{
    totalWithdrawals: number;
    totalAmount: Decimal;
    byStatus: Record<string, number>;
    byCurrency: Record<string, Decimal>;
  }> {
    const withdrawals = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'WITHDRAWAL',
      },
    });

    const summary = {
      totalWithdrawals: withdrawals.length,
      totalAmount: new Decimal(0),
      byStatus: {
        PENDING: 0,
        PROCESSING: 0,
        COMPLETED: 0,
        FAILED: 0,
        CANCELLED: 0,
      },
      byCurrency: {} as Record<string, Decimal>,
    };

    for (const withdrawal of withdrawals) {
      summary.totalAmount = summary.totalAmount.plus(withdrawal.amount);
      summary.byStatus[withdrawal.status as keyof typeof summary.byStatus]++;

      if (!summary.byCurrency[withdrawal.currency]) {
        summary.byCurrency[withdrawal.currency] = new Decimal(0);
      }
      summary.byCurrency[withdrawal.currency] = summary.byCurrency[withdrawal.currency].plus(
        withdrawal.amount
      );
    }

    return summary;
  }
}

export const withdrawalService = new WithdrawalService();
