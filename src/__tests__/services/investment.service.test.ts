import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InvestmentService } from '../../services/investment.service';
import {
  NotFoundError,
  ValidationError,
  InsufficientFundsError,
} from '../../middleware/errorHandler';

// Mock Prisma
const mockPrisma = {
  investment: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  portfolio: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  bankAccount: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
  },
  $disconnect: vi.fn(),
} as unknown as {
  investment: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  portfolio: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  bankAccount: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  transaction: {
    create: ReturnType<typeof vi.fn>;
  };
  $disconnect: ReturnType<typeof vi.fn>;
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

describe('InvestmentService', () => {
  let investmentService: InvestmentService;

  beforeEach(() => {
    investmentService = new InvestmentService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all investments for a user with filters', async () => {
      const userId = 'user-1';
      const filters = {
        portfolioId: 'portfolio-1',
        type: 'STOCK',
        search: 'Apple',
        limit: 10,
        offset: 0,
      };

      const investments = [
        {
          id: 'investment-1',
          userId,
          portfolioId: 'portfolio-1',
          name: 'Apple Inc.',
          symbol: 'AAPL',
          type: 'STOCK',
          quantity: 10,
          purchasePrice: 150,
          currentPrice: 160,
          totalValue: 1600,
          totalInvested: 1500,
          totalGain: 100,
          gainPercentage: 6.67,
          purchaseDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.investment.findMany.mockResolvedValue(investments);
      mockPrisma.investment.count.mockResolvedValue(1);

      const result = await investmentService.getAll(userId, filters);

      expect(mockPrisma.investment.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          portfolioId: filters.portfolioId,
          type: filters.type,
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { symbol: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      });
      expect(result).toEqual({
        data: investments,
        pagination: {
          total: 1,
          pages: 1,
          currentPage: 1,
          limit: filters.limit,
        },
      });
    });

    it('should handle empty investment list', async () => {
      const userId = 'user-1';
      const filters = {};

      mockPrisma.investment.findMany.mockResolvedValue([]);
      mockPrisma.investment.count.mockResolvedValue(0);

      const result = await investmentService.getAll(userId, filters);

      expect(result).toEqual({
        data: [],
        pagination: {
          total: 0,
          pages: 0,
          currentPage: 1,
          limit: 20,
        },
      });
    });
  });

  describe('getById', () => {
    it('should return an investment by ID', async () => {
      const userId = 'user-1';
      const investmentId = 'investment-1';
      const investment = {
        id: investmentId,
        userId,
        portfolioId: 'portfolio-1',
        name: 'Apple Inc.',
        symbol: 'AAPL',
        type: 'STOCK',
        quantity: 10,
        purchasePrice: 150,
        currentPrice: 160,
        totalValue: 1600,
        totalInvested: 1500,
        totalGain: 100,
        gainPercentage: 6.67,
        purchaseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.investment.findUnique.mockResolvedValue(investment);

      const result = await investmentService.getById(userId, investmentId);

      expect(mockPrisma.investment.findUnique).toHaveBeenCalledWith({
        where: { id: investmentId, userId },
      });
      expect(result).toEqual(investment);
    });

    it('should throw NotFoundError for non-existent investment', async () => {
      const userId = 'user-1';
      const investmentId = 'non-existent';

      mockPrisma.investment.findUnique.mockResolvedValue(null);

      await expect(investmentService.getById(userId, investmentId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('buy', () => {
    it('should successfully buy an investment', async () => {
      const userId = 'user-1';
      const buyData = {
        investmentId: 'investment-1',
        portfolioId: 'portfolio-1',
        quantity: 10,
        purchasePrice: 150,
        bankAccountId: 'account-1',
      };

      const portfolio = {
        id: 'portfolio-1',
        userId,
        totalValue: 1000,
        totalInvested: 800,
      };

      const bankAccount = {
        id: 'account-1',
        userId,
        balance: 2000,
        isVerified: true,
      };

      const investment = {
        id: 'investment-1',
        name: 'Apple Inc.',
        symbol: 'AAPL',
        type: 'STOCK',
      };

      const createdInvestment = {
        id: 'investment-1',
        userId,
        portfolioId: 'portfolio-1',
        investmentId: 'investment-1',
        quantity: 10,
        purchasePrice: 150,
        currentPrice: 150,
        totalValue: 1500,
        totalInvested: 1500,
        totalGain: 0,
        gainPercentage: 0,
        purchaseDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
      mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);
      mockPrisma.investment.findUnique.mockResolvedValue(investment);
      mockPrisma.investment.create.mockResolvedValue(createdInvestment);
      mockPrisma.transaction.create.mockResolvedValue({});
      mockPrisma.portfolio.update.mockResolvedValue({});
      mockPrisma.bankAccount.update.mockResolvedValue({});

      const result = await investmentService.buy(userId, buyData);

      expect(mockPrisma.portfolio.findUnique).toHaveBeenCalledWith({
        where: { id: buyData.portfolioId, userId },
      });
      expect(mockPrisma.bankAccount.findUnique).toHaveBeenCalledWith({
        where: { id: buyData.bankAccountId, userId },
      });
      expect(result).toEqual(createdInvestment);
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const buyData = {
        investmentId: 'investment-1',
        portfolioId: 'non-existent',
        quantity: 10,
        purchasePrice: 150,
        bankAccountId: 'account-1',
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(investmentService.buy(userId, buyData)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent bank account', async () => {
      const userId = 'user-1';
      const buyData = {
        investmentId: 'investment-1',
        portfolioId: 'portfolio-1',
        quantity: 10,
        purchasePrice: 150,
        bankAccountId: 'non-existent',
      };

      const portfolio = {
        id: 'portfolio-1',
        userId,
        totalValue: 1000,
        totalInvested: 800,
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
      mockPrisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(investmentService.buy(userId, buyData)).rejects.toThrow(NotFoundError);
    });

    it('should throw InsufficientFundsError for insufficient balance', async () => {
      const userId = 'user-1';
      const buyData = {
        investmentId: 'investment-1',
        portfolioId: 'portfolio-1',
        quantity: 10,
        purchasePrice: 150,
        bankAccountId: 'account-1',
      };

      const portfolio = {
        id: 'portfolio-1',
        userId,
        totalValue: 1000,
        totalInvested: 800,
      };

      const bankAccount = {
        id: 'account-1',
        userId,
        balance: 100, // Insufficient balance
        isVerified: true,
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
      mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);

      await expect(investmentService.buy(userId, buyData)).rejects.toThrow(InsufficientFundsError);
    });

    it('should throw ValidationError for unverified bank account', async () => {
      const userId = 'user-1';
      const buyData = {
        investmentId: 'investment-1',
        portfolioId: 'portfolio-1',
        quantity: 10,
        purchasePrice: 150,
        bankAccountId: 'account-1',
      };

      const portfolio = {
        id: 'portfolio-1',
        userId,
        totalValue: 1000,
        totalInvested: 800,
      };

      const bankAccount = {
        id: 'account-1',
        userId,
        balance: 2000,
        isVerified: false, // Unverified account
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
      mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);

      await expect(investmentService.buy(userId, buyData)).rejects.toThrow(ValidationError);
    });
  });

  describe('sell', () => {
    it('should successfully sell an investment', async () => {
      const userId = 'user-1';
      const sellData = {
        investmentId: 'investment-1',
        quantity: 5,
        sellPrice: 160,
        bankAccountId: 'account-1',
      };

      const investment = {
        id: 'investment-1',
        userId,
        portfolioId: 'portfolio-1',
        quantity: 10,
        purchasePrice: 150,
        currentPrice: 160,
        totalValue: 1600,
        totalInvested: 1500,
      };

      const bankAccount = {
        id: 'account-1',
        userId,
        balance: 1000,
        isVerified: true,
      };

      const updatedInvestment = {
        ...investment,
        quantity: 5,
        totalValue: 800,
        totalInvested: 750,
        totalGain: 50,
        gainPercentage: 6.67,
      };

      mockPrisma.investment.findUnique.mockResolvedValue(investment);
      mockPrisma.bankAccount.findUnique.mockResolvedValue(bankAccount);
      mockPrisma.investment.update.mockResolvedValue(updatedInvestment);
      mockPrisma.transaction.create.mockResolvedValue({});
      mockPrisma.bankAccount.update.mockResolvedValue({});

      const result = await investmentService.sell(userId, sellData);

      expect(mockPrisma.investment.findUnique).toHaveBeenCalledWith({
        where: { id: sellData.investmentId, userId },
      });
      expect(result).toEqual(updatedInvestment);
    });

    it('should throw NotFoundError for non-existent investment', async () => {
      const userId = 'user-1';
      const sellData = {
        investmentId: 'non-existent',
        quantity: 5,
        sellPrice: 160,
        bankAccountId: 'account-1',
      };

      mockPrisma.investment.findUnique.mockResolvedValue(null);

      await expect(investmentService.sell(userId, sellData)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError for insufficient quantity', async () => {
      const userId = 'user-1';
      const sellData = {
        investmentId: 'investment-1',
        quantity: 15, // More than available
        sellPrice: 160,
        bankAccountId: 'account-1',
      };

      const investment = {
        id: 'investment-1',
        userId,
        portfolioId: 'portfolio-1',
        quantity: 10, // Only 10 available
        purchasePrice: 150,
        currentPrice: 160,
        totalValue: 1600,
        totalInvested: 1500,
      };

      mockPrisma.investment.findUnique.mockResolvedValue(investment);

      await expect(investmentService.sell(userId, sellData)).rejects.toThrow(ValidationError);
    });
  });

  describe('updatePrice', () => {
    it('should update investment prices', async () => {
      const userId = 'user-1';
      const priceUpdates = [
        { investmentId: 'investment-1', currentPrice: 160 },
        { investmentId: 'investment-2', currentPrice: 200 },
      ];

      const investments = [
        {
          id: 'investment-1',
          userId,
          quantity: 10,
          purchasePrice: 150,
          currentPrice: 160,
          totalValue: 1600,
          totalInvested: 1500,
          totalGain: 100,
          gainPercentage: 6.67,
        },
        {
          id: 'investment-2',
          userId,
          quantity: 5,
          purchasePrice: 180,
          currentPrice: 200,
          totalValue: 1000,
          totalInvested: 900,
          totalGain: 100,
          gainPercentage: 11.11,
        },
      ];

      mockPrisma.investment.findMany.mockResolvedValue(investments);
      mockPrisma.investment.update.mockResolvedValue({});

      const result = await investmentService.updatePrice(userId, priceUpdates);

      expect(mockPrisma.investment.findMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(result).toEqual({
        updated: 2,
        totalValue: 2600,
        totalInvested: 2400,
        totalGain: 200,
        averageGainPercentage: 8.89,
      });
    });
  });
});
