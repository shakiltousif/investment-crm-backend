import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BankAccountService } from '../../services/bankAccount.service';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/errorHandler';

// Mock Prisma
const mockPrisma = {
  bankAccount: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
  $disconnect: vi.fn(),
} as any;

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

describe('BankAccountService', () => {
  let bankAccountService: BankAccountService;

  beforeEach(() => {
    bankAccountService = new BankAccountService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
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

      const result = await bankAccountService.getAll(userId);

      expect(mockPrisma.bankAccount.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(bankAccounts);
    });

    it('should handle empty bank account list', async () => {
      const userId = 'user-1';

      mockPrisma.bankAccount.findMany.mockResolvedValue([]);

      const result = await bankAccountService.getAll(userId);

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should return a bank account by ID', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';
      const bankAccount = {
        id: accountId,
        userId,
        accountHolderName: 'John Doe',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        accountType: 'Savings',
        currency: 'USD',
        balance: 10000,
        isVerified: true,
        isPrimary: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);

      const result = await bankAccountService.getById(userId, accountId);

      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(result).toEqual(bankAccount);
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';

      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(bankAccountService.getById(userId, accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
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
        isPrimary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.bankAccount.count.mockResolvedValue(0);
      mockPrisma.bankAccount.create.mockResolvedValue(createdAccount);

      const result = await bankAccountService.create(userId, accountData);

      expect(mockPrisma.bankAccount.count).toHaveBeenCalledWith({
        where: { userId, accountNumber: accountData.accountNumber },
      });
      expect(mockPrisma.bankAccount.create).toHaveBeenCalledWith({
        data: {
          userId,
          ...accountData,
          balance: 0,
          isVerified: false,
          isPrimary: false,
        },
      });
      expect(result).toEqual(createdAccount);
    });

    it('should throw ConflictError for duplicate account number', async () => {
      const userId = 'user-1';
      const accountData = {
        accountHolderName: 'John Doe',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        accountType: 'Savings',
        currency: 'USD',
      };

      mockPrisma.bankAccount.count.mockResolvedValue(1);

      await expect(bankAccountService.create(userId, accountData)).rejects.toThrow(ConflictError);
    });

    it('should validate required fields', async () => {
      const userId = 'user-1';
      const accountData = {
        accountHolderName: '',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
        accountType: 'Savings',
        currency: 'USD',
      };

      await expect(bankAccountService.create(userId, accountData)).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('should update an existing bank account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';
      const updateData = {
        accountHolderName: 'Jane Doe',
        bankName: 'Updated Bank',
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

      mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId });
      mockPrisma.bankAccount.update.mockResolvedValue(updatedAccount);

      const result = await bankAccountService.update(userId, accountId, updateData);

      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
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

      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(bankAccountService.update(userId, accountId, updateData)).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('should delete a bank account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId });
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.bankAccount.delete.mockResolvedValue({});

      await bankAccountService.delete(userId, accountId);

      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockPrisma.bankAccount.delete).toHaveBeenCalledWith({
        where: { id: accountId },
      });
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const accountId = 'non-existent';

      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(bankAccountService.delete(userId, accountId)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if account has transactions', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId });
      mockPrisma.transaction.findMany.mockResolvedValue([{ id: 'transaction-1' }]);

      await expect(bankAccountService.delete(userId, accountId)).rejects.toThrow(ValidationError);
    });
  });

  describe('verify', () => {
    it('should verify a bank account', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      const verifiedAccount = {
        id: accountId,
        userId,
        isVerified: true,
        verifiedAt: new Date(),
      };

      mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId });
      mockPrisma.bankAccount.update.mockResolvedValue(verifiedAccount);

      const result = await bankAccountService.verify(userId, accountId);

      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
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

      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(bankAccountService.verify(userId, accountId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('setPrimary', () => {
    it('should set a bank account as primary', async () => {
      const userId = 'user-1';
      const accountId = 'account-1';

      const primaryAccount = {
        id: accountId,
        userId,
        isPrimary: true,
      };

      mockPrisma.bankAccount.findUnique.mockResolvedValue({ id: accountId, userId });
      mockPrisma.bankAccount.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.bankAccount.update.mockResolvedValue(primaryAccount);

      const result = await bankAccountService.setPrimary(userId, accountId);

      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockPrisma.bankAccount.updateMany).toHaveBeenCalledWith({
        where: { userId },
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

      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(bankAccountService.setPrimary(userId, accountId)).rejects.toThrow(NotFoundError);
    });
  });
});