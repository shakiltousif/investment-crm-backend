import { BankAccountService } from '../../services/bankAccount.service';
import { prisma } from '../../lib/prisma';
import { ValidationError } from '../../middleware/errorHandler';

jest.mock('../../lib/prisma');

describe('BankAccountService', () => {
  let service: BankAccountService;

  beforeEach(() => {
    service = new BankAccountService();
    jest.clearAllMocks();
  });

  describe('createBankAccount', () => {
    it('should create a bank account successfully', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        accountName: 'Main Account',
        accountNumber: '12345678',
        sortCode: '123456',
        balance: 1000,
        isPrimary: true,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.bankAccount.create as jest.Mock).mockResolvedValue(mockAccount);

      const result = await service.createBankAccount('user-1', {
        accountName: 'Main Account',
        accountNumber: '12345678',
        sortCode: '123456',
      });

      expect(result).toEqual(mockAccount);
      expect(prisma.bankAccount.create).toHaveBeenCalled();
    });

    it('should throw error if account already exists', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'account-1',
      });

      await expect(
        service.createBankAccount('user-1', {
          accountName: 'Main Account',
          accountNumber: '12345678',
          sortCode: '123456',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getBankAccounts', () => {
    it('should get all bank accounts for a user', async () => {
      const mockAccounts = [
        {
          id: 'account-1',
          userId: 'user-1',
          accountName: 'Main Account',
          balance: 1000,
        },
        {
          id: 'account-2',
          userId: 'user-1',
          accountName: 'Savings Account',
          balance: 5000,
        },
      ];

      (prisma.bankAccount.findMany as jest.Mock).mockResolvedValue(mockAccounts);

      const result = await service.getBankAccounts('user-1');

      expect(result).toEqual(mockAccounts);
      expect(prisma.bankAccount.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('should return empty array if user has no accounts', async () => {
      (prisma.bankAccount.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getBankAccounts('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateBankAccount', () => {
    it('should update a bank account successfully', async () => {
      const mockAccount = {
        id: 'account-1',
        userId: 'user-1',
        accountName: 'Updated Account',
      };

      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue(mockAccount);
      (prisma.bankAccount.update as jest.Mock).mockResolvedValue(mockAccount);

      const result = await service.updateBankAccount('user-1', 'account-1', {
        accountName: 'Updated Account',
      });

      expect(result).toEqual(mockAccount);
    });

    it('should throw error if account not found', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateBankAccount('user-1', 'account-1', {
          accountName: 'Updated Account',
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw error if user does not own the account', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'account-1',
        userId: 'other-user',
      });

      await expect(
        service.updateBankAccount('user-1', 'account-1', {
          accountName: 'Updated Account',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteBankAccount', () => {
    it('should delete a bank account successfully', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
      });
      (prisma.bankAccount.delete as jest.Mock).mockResolvedValue({
        id: 'account-1',
      });

      const result = await service.deleteBankAccount('user-1', 'account-1');

      expect(result).toEqual({ success: true });
      expect(prisma.bankAccount.delete).toHaveBeenCalled();
    });

    it('should throw error if account not found', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.deleteBankAccount('user-1', 'account-1')).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe('setPrimaryAccount', () => {
    it('should set primary account successfully', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
      });

      await service.setPrimaryAccount('user-1', 'account-1');

      expect(prisma.bankAccount.update).toHaveBeenCalled();
    });
  });

  describe('verifyAccount', () => {
    it('should verify account successfully', async () => {
      (prisma.bankAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'account-1',
        userId: 'user-1',
      });

      await service.verifyAccount('user-1', 'account-1');

      expect(prisma.bankAccount.update).toHaveBeenCalled();
    });
  });
});

