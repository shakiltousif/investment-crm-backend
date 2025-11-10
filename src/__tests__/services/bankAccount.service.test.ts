import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BankAccountService } from '../../services/bankAccount.service';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler';

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      bankAccount: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
      },
      $disconnect: vi.fn(),
    } as unknown as {
      bankAccount: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
      transaction: {
        findMany: ReturnType<typeof vi.fn>;
      };
      $disconnect: ReturnType<typeof vi.fn>;
    },
  };
});

vi.mock('../../lib/prisma', () => {
  return {
    prisma: mockPrisma,
  };
});

describe('BankAccountService', () => {
  let bankAccountService: BankAccountService;

  beforeEach(() => {
    bankAccountService = new BankAccountService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getBankAccounts', () => {
    it('should return all bank accounts for a user', async () => {
      const userId = 'user-1';
      const bankAccounts = [
        {
          id: 'account-1',
          userId,
          accountHolderName: 'John Doe',
          accountNumber: '1234567890',
          bankName: 'Test Bank',
          bankCode: 'TB001',
          accountType: 'Savings',
          currency: 'USD',
          balance: 10000,
          isVerified: true,
          verifiedAt: new Date(),
          isPrimary: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.bankAccount.findMany.mockResolvedValue(bankAccounts);

      const result = await bankAccountService.getBankAccounts(userId);

      expect(mockPrisma.bankAccount.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual(bankAccounts);
    });

    it('should handle empty bank account list', async () => {
      const userId = 'user-1';

      mockPrisma.bankAccount.findMany.mockResolvedValue([]);

      const result = await bankAccountService.getBankAccounts(userId);

      expect(result).toEqual([]);
    });
  });

  describe('getBankAccountById', () => {
    it('should return a bank account by ID', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';
      const bankAccount = {
        id: accountId,
        userId,
        accountHolderName: 'John Doe',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        bankCode: 'TB001',
        accountType: 'Savings',
        currency: 'USD',
        balance: 10000,
        isVerified: true,
        verifiedAt: new Date(),
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue(bankAccount);

      const result = await bankAccountService.getBankAccountById(userId, accountId);

      expect(mockPrisma.bankAccount.findFirst).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(result).toEqual(bankAccount);
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';

      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(bankAccountService.getBankAccountById(userId, accountId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('createBankAccount', () => {
    it('should create a new bank account', async () => {
      const userId = 'user-1';
      const accountData = {
        accountHolderName: 'John Doe',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        bankCode: 'TB001',
        accountType: 'Savings',
        currency: 'USD',
      };

      const createdAccount = {
        id: 'account-1',
        userId,
        ...accountData,
        balance: 0,
        isVerified: false,
        verifiedAt: null,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);
      mockPrisma.bankAccount.count.mockResolvedValue(0);
      mockPrisma.bankAccount.create.mockResolvedValue(createdAccount);

      const result = await bankAccountService.createBankAccount(userId, accountData);

      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
        where: {
          userId_accountNumber: {
            userId,
            accountNumber: accountData.accountNumber,
          },
        },
      });
      expect(mockPrisma.bankAccount.count).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(mockPrisma.bankAccount.create).toHaveBeenCalledWith({
        data: {
          userId,
          ...accountData,
          isPrimary: true,
        },
      });
      expect(result).toEqual(createdAccount);
    });

    it('should throw ValidationError for duplicate account number', async () => {
      const userId = 'user-1';
      const accountData = {
        accountHolderName: 'John Doe',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        accountType: 'Savings',
        currency: 'USD',
      };

      mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: 'existing-account' });

      await expect(bankAccountService.createBankAccount(userId, accountData)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('updateBankAccount', () => {
    it('should update an existing bank account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';
      const updateData = {
        accountHolderName: 'Jane Doe',
        bankName: 'Updated Bank',
      };

      const existingAccount = {
        id: accountId,
        userId,
        accountNumber: '1234567890',
        accountHolderName: 'John Doe',
      };

      const updatedAccount = {
        id: accountId,
        userId,
        ...updateData,
        accountNumber: '1234567890',
        accountType: 'Savings',
        currency: 'USD',
        balance: 10000,
        isVerified: true,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue(existingAccount);
      mockPrisma.bankAccount.update.mockResolvedValue(updatedAccount);

      const result = await bankAccountService.updateBankAccount(userId, accountId, updateData);

      expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: updateData,
      });
      expect(result).toEqual(updatedAccount);
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';
      const updateData = {
        accountHolderName: 'Jane Doe',
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(
        bankAccountService.updateBankAccount(userId, accountId, updateData)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteBankAccount', () => {
    it('should delete a bank account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      const account = {
        id: accountId,
        userId,
        isPrimary: false,
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue(account);
      mockPrisma.bankAccount.count.mockResolvedValue(2);
      mockPrisma.bankAccount.delete.mockResolvedValue({});

      await bankAccountService.deleteBankAccount(userId, accountId);

      expect(mockPrisma.bankAccount.findFirst).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockPrisma.bankAccount.delete).toHaveBeenCalledWith({
        where: { id: accountId },
      });
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';

      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(bankAccountService.deleteBankAccount(userId, accountId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ValidationError if it is the only account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      const account = {
        id: accountId,
        userId,
        isPrimary: true,
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue(account);
      mockPrisma.bankAccount.count.mockResolvedValue(1);

      await expect(bankAccountService.deleteBankAccount(userId, accountId)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('verifyBankAccount', () => {
    it('should verify a bank account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      const verifiedAccount = {
        id: accountId,
        userId,
        isVerified: true,
        verifiedAt: new Date(),
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue({ id: accountId, userId });
      mockPrisma.bankAccount.update.mockResolvedValue(verifiedAccount);

      const result = await bankAccountService.verifyBankAccount(userId, accountId);

      expect(mockPrisma.bankAccount.findFirst).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: {
          isVerified: true,
          verifiedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(verifiedAccount);
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';

      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(bankAccountService.verifyBankAccount(userId, accountId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('setPrimaryAccount', () => {
    it('should set a bank account as primary', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      const primaryAccount = {
        id: accountId,
        userId,
        isPrimary: true,
      };

      mockPrisma.bankAccount.findFirst.mockResolvedValue({ id: accountId, userId });
      mockPrisma.bankAccount.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bankAccount.update.mockResolvedValue(primaryAccount);

      const result = await bankAccountService.setPrimaryAccount(userId, accountId);

      expect(mockPrisma.bankAccount.findFirst).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockPrisma.bankAccount.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          id: { not: accountId },
        },
        data: { isPrimary: false },
      });
      expect(mockPrisma.bankAccount.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { isPrimary: true },
      });
      expect(result).toEqual(primaryAccount);
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';

      mockPrisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(bankAccountService.setPrimaryAccount(userId, accountId)).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
