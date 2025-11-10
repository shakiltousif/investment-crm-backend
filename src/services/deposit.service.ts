import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';
import { emailService } from './email.service';

export interface CreateDepositInput {
  amount: number;
  currency: string;
  bankAccountId: string;
  transferMethod: 'CHAPS' | 'FPS' | 'SWIFT';
  description?: string;
}

export interface DepositFilters {
  status?: string;
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class DepositService {
  /**
   * Create deposit request
   */
  async createDeposit(userId: string, data: CreateDepositInput) {
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

    // Get user email for notification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    // Create deposit request
    const deposit = await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount: new Decimal(data.amount),
        currency: data.currency,
        status: 'PENDING',
        description: data.description || `Deposit via ${data.transferMethod}`,
        bankAccountId: data.bankAccountId,
        transactionDate: new Date(),
      },
      include: {
        bankAccount: true,
      },
    });

    // Send email notification (non-blocking)
    if (user?.email) {
      emailService.sendDepositNotification(
        user.email,
        Number(deposit.amount),
        deposit.currency,
        'PENDING'
      ).catch((error) => {
        console.error('Failed to send deposit notification email:', error);
        // Don't throw - email failure shouldn't break the deposit creation
      });
    }

    return {
      deposit,
      details: {
        bankAccount,
        transferMethod: data.transferMethod,
        estimatedTime: this.getEstimatedTime(data.transferMethod),
      },
    };
  }

  /**
   * Get deposits
   */
  async getDeposits(userId: string, filters: DepositFilters) {
    const where: any = {
      userId,
      type: 'DEPOSIT',
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
      where.amount = {};
      if (filters.minAmount) {
        where.amount.gte = new Decimal(filters.minAmount);
      }
      if (filters.maxAmount) {
        where.amount.lte = new Decimal(filters.maxAmount);
      }
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      where.transactionDate = {};
      if (filters.startDate) {
        where.transactionDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.transactionDate.lte = new Date(filters.endDate);
      }
    }

    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const [deposits, total] = await Promise.all([
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
      data: deposits,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get deposit by ID
   */
  async getDepositById(userId: string, depositId: string) {
    const deposit = await prisma.transaction.findFirst({
      where: {
        id: depositId,
        userId,
        type: 'DEPOSIT',
      },
      include: {
        bankAccount: true,
      },
    });

    if (!deposit) {
      throw new NotFoundError('Deposit not found');
    }

    return deposit;
  }

  /**
   * Approve deposit
   */
  async approveDeposit(userId: string, depositId: string) {
    const deposit = await this.getDepositById(userId, depositId);

    if (deposit.status !== 'PENDING') {
      throw new ValidationError('Only pending deposits can be approved');
    }

    const updated = await prisma.transaction.update({
      where: { id: depositId },
      data: { status: 'PROCESSING' },
      include: {
        bankAccount: true,
      },
    });

    return updated;
  }

  /**
   * Complete deposit
   */
  async completeDeposit(userId: string, depositId: string) {
    const deposit = await this.getDepositById(userId, depositId);

    if (deposit.status !== 'PROCESSING') {
      throw new ValidationError('Only processing deposits can be completed');
    }

    // Update bank account balance
    if (deposit.bankAccountId) {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { id: deposit.bankAccountId },
      });

      if (bankAccount) {
        const newBalance = bankAccount.balance.plus(deposit.amount);
        await prisma.bankAccount.update({
          where: { id: deposit.bankAccountId },
          data: { balance: newBalance },
        });
      }
    }

    const updated = await prisma.transaction.update({
      where: { id: depositId },
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
   * Reject deposit
   */
  async rejectDeposit(userId: string, depositId: string, reason?: string) {
    const deposit = await this.getDepositById(userId, depositId);

    if (!['PENDING', 'PROCESSING'].includes(deposit.status)) {
      throw new ValidationError('Only pending or processing deposits can be rejected');
    }

    const updated = await prisma.transaction.update({
      where: { id: depositId },
      data: {
        status: 'FAILED',
        description: reason ? `${deposit.description} - Rejected: ${reason}` : deposit.description,
      },
      include: {
        bankAccount: true,
      },
    });

    return updated;
  }

  /**
   * Cancel deposit (user-initiated)
   */
  async cancelDeposit(userId: string, depositId: string) {
    const deposit = await this.getDepositById(userId, depositId);

    if (!['PENDING'].includes(deposit.status)) {
      throw new ValidationError('Only pending deposits can be cancelled');
    }

    const updated = await prisma.transaction.update({
      where: { id: depositId },
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
      emailService.sendDepositNotification(
        user.email,
        Number(deposit.amount),
        deposit.currency,
        'CANCELLED'
      ).catch((error) => {
        console.error('Failed to send cancellation email:', error);
      });
    }

    return updated;
  }

  /**
   * Get deposit summary
   */
  async getDepositSummary(userId: string) {
    const deposits = await prisma.transaction.findMany({
      where: {
        userId,
        type: 'DEPOSIT',
      },
    });

    const summary = {
      totalDeposits: deposits.length,
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

    for (const deposit of deposits) {
      summary.totalAmount = summary.totalAmount.plus(deposit.amount);
      summary.byStatus[deposit.status as keyof typeof summary.byStatus]++;

      if (!summary.byCurrency[deposit.currency]) {
        summary.byCurrency[deposit.currency] = new Decimal(0);
      }
      summary.byCurrency[deposit.currency] = summary.byCurrency[deposit.currency].plus(
        deposit.amount,
      );
    }

    return summary;
  }

  /**
   * Get estimated time for transfer method
   */
  private getEstimatedTime(method: string): string {
    switch (method) {
      case 'FPS':
        return '1-2 hours';
      case 'CHAPS':
        return '2-4 hours';
      case 'SWIFT':
        return '1-3 business days';
      default:
        return 'Unknown';
    }
  }
}

export const depositService = new DepositService();

