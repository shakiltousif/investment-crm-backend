import { prisma } from '../lib/prisma';
import { CreateBankAccountInput, UpdateBankAccountInput } from '../lib/validators';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';

export class BankAccountService {
  async createBankAccount(userId: string, data: CreateBankAccountInput) {
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
      throw new ValidationError('Bank account with this number already exists');
    }

    // If this is the first account, make it primary
    const accountCount = await prisma.bankAccount.count({
      where: { userId },
    });

    const bankAccount = await prisma.bankAccount.create({
      data: {
        userId,
        ...data,
        isPrimary: accountCount === 0,
      },
    });

    return bankAccount;
  }

  async getBankAccounts(userId: string) {
    const accounts = await prisma.bankAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    return accounts;
  }

  async getBankAccountById(userId: string, accountId: string) {
    const account = await prisma.bankAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      throw new NotFoundError('Bank account not found');
    }

    return account;
  }

  async updateBankAccount(
    userId: string,
    accountId: string,
    data: UpdateBankAccountInput,
  ) {
    const account = await this.getBankAccountById(userId, accountId);

    // Check if trying to change account number to one that already exists
    if (data.accountNumber && data.accountNumber !== account.accountNumber) {
      const existingAccount = await prisma.bankAccount.findUnique({
        where: {
          userId_accountNumber: {
            userId,
            accountNumber: data.accountNumber,
          },
        },
      });

      if (existingAccount) {
        throw new ValidationError('Bank account with this number already exists');
      }
    }

    const updatedAccount = await prisma.bankAccount.update({
      where: { id: accountId },
      data,
    });

    return updatedAccount;
  }

  async deleteBankAccount(userId: string, accountId: string) {
    const account = await this.getBankAccountById(userId, accountId);

    // Check if this is the only account
    const accountCount = await prisma.bankAccount.count({
      where: { userId },
    });

    if (accountCount === 1) {
      throw new ValidationError('Cannot delete the only bank account');
    }

    // If this is the primary account, make another one primary
    if (account.isPrimary) {
      const nextAccount = await prisma.bankAccount.findFirst({
        where: {
          userId,
          id: { not: accountId },
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
      where: { id: accountId },
    });

    return { message: 'Bank account deleted successfully' };
  }

  async setPrimaryAccount(userId: string, accountId: string) {
    const account = await this.getBankAccountById(userId, accountId);

    // Remove primary from all other accounts
    await prisma.bankAccount.updateMany({
      where: {
        userId,
        id: { not: accountId },
      },
      data: { isPrimary: false },
    });

    // Set this account as primary
    const updatedAccount = await prisma.bankAccount.update({
      where: { id: accountId },
      data: { isPrimary: true },
    });

    return updatedAccount;
  }

  async verifyBankAccount(userId: string, accountId: string) {
    const account = await this.getBankAccountById(userId, accountId);

    const verifiedAccount = await prisma.bankAccount.update({
      where: { id: accountId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    return verifiedAccount;
  }

  async getAccountBalance(userId: string, accountId: string) {
    const account = await this.getBankAccountById(userId, accountId);

    // Calculate balance from transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        bankAccountId: accountId,
        status: 'COMPLETED',
      },
    });

    let balance = account.balance;
    for (const transaction of transactions) {
      if (transaction.type === 'DEPOSIT') {
        balance = balance.plus(transaction.amount);
      } else if (transaction.type === 'WITHDRAWAL') {
        balance = balance.minus(transaction.amount);
      }
    }

    return {
      accountId,
      balance,
      lastUpdated: account.updatedAt,
    };
  }

  async getAccountTransactions(userId: string, accountId: string) {
    const account = await this.getBankAccountById(userId, accountId);

    const transactions = await prisma.transaction.findMany({
      where: {
        bankAccountId: accountId,
        userId,
      },
      orderBy: { transactionDate: 'desc' },
      take: 50,
    });

    return transactions;
  }
}

export const bankAccountService = new BankAccountService();

