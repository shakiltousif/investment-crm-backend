import { prisma } from '../lib/prisma';
import { CreateTransactionInput } from '../lib/validators';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

export interface TransactionFilters {
  type?: string;
  status?: string;
  bankAccountId?: string;
  investmentId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export class TransactionService {
  async createTransaction(userId: string, data: CreateTransactionInput): Promise<unknown> {
    // Verify bank account exists if provided
    if (data.bankAccountId) {
      const bankAccount = await prisma.bankAccount.findFirst({
        where: {
          id: data.bankAccountId,
          userId,
        },
      });

      if (!bankAccount) {
        throw new NotFoundError('Bank account not found');
      }
    }

    // Verify investment exists if provided
    if (data.investmentId) {
      const investment = await prisma.investment.findFirst({
        where: {
          id: data.investmentId,
          userId,
        },
      });

      if (!investment) {
        throw new NotFoundError('Investment not found');
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: data.bankAccountId,
        investmentId: data.investmentId,
        type: data.type,
        amount: data.amount,
        currency: data.currency || 'GBP',
        status: 'PENDING',
        description: data.description,
      },
    });

    return transaction;
  }

  async getTransactions(userId: string, filters?: TransactionFilters): Promise<unknown[]> {
    const where: Record<string, unknown> = { userId };

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.bankAccountId) {
      where.bankAccountId = filters.bankAccountId;
    }

    if (filters?.investmentId) {
      where.investmentId = filters.investmentId;
    }

    if (filters?.startDate || filters?.endDate) {
      const transactionDateFilter: { gte?: Date; lte?: Date } = {};
      if (filters.startDate) {
        transactionDateFilter.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        transactionDateFilter.lte = new Date(filters.endDate);
      }
      where.transactionDate = transactionDateFilter;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        bankAccount: true,
        investment: true,
      },
      orderBy: { transactionDate: 'desc' },
      take: filters?.limit ?? 100,
    });

    return transactions;
  }

  async getTransactionById(
    userId: string,
    transactionId: string
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
    investment?: unknown;
  }> {
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId,
      },
      include: {
        bankAccount: true,
        investment: true,
      },
    });

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    return transaction;
  }

  async approveTransaction(userId: string, transactionId: string): Promise<unknown> {
    const transaction = await this.getTransactionById(userId, transactionId);

    if ((transaction.status as string) !== 'PENDING') {
      throw new ValidationError('Only pending transactions can be approved');
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'PROCESSING',
      },
    });

    return updatedTransaction;
  }

  async completeTransaction(userId: string, transactionId: string): Promise<unknown> {
    const transaction = await this.getTransactionById(userId, transactionId);

    if ((transaction.status as string) !== 'PROCESSING') {
      throw new ValidationError('Only processing transactions can be completed');
    }

    // Update bank account balance if applicable
    if (transaction.bankAccountId) {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { id: transaction.bankAccountId },
      });

      if (bankAccount) {
        let newBalance = bankAccount.balance;

        if ((transaction.type as string) === 'DEPOSIT') {
          newBalance = newBalance.plus(transaction.amount);
        } else if ((transaction.type as string) === 'WITHDRAWAL') {
          newBalance = newBalance.minus(transaction.amount);
        }

        await prisma.bankAccount.update({
          where: { id: transaction.bankAccountId },
          data: { balance: newBalance },
        });
      }
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return updatedTransaction;
  }

  async rejectTransaction(userId: string, transactionId: string): Promise<unknown> {
    const transaction = await this.getTransactionById(userId, transactionId);

    if (!['PENDING', 'PROCESSING'].includes(transaction.status as string)) {
      throw new ValidationError('Cannot reject completed or failed transactions');
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'FAILED',
      },
    });

    return updatedTransaction;
  }

  async getTransactionSummary(userId: string): Promise<unknown> {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
    });

    const summary = {
      totalTransactions: transactions.length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      totalAmount: new Decimal(0),
    };

    for (const transaction of transactions) {
      summary.byType[transaction.type] = (summary.byType[transaction.type] || 0) + 1;
      summary.byStatus[transaction.status] = (summary.byStatus[transaction.status] || 0) + 1;

      if (transaction.status === 'COMPLETED') {
        summary.totalAmount = summary.totalAmount.plus(transaction.amount);
      }
    }

    return summary;
  }
}

export const transactionService = new TransactionService();
