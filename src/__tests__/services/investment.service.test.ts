import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InvestmentService } from '../../services/investment.service.js';
import { NotFoundError } from '../../middleware/errorHandler.js';
import { Decimal } from '@prisma/client/runtime/library';

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      investment: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      portfolio: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
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
        findFirst: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
        aggregate: ReturnType<typeof vi.fn>;
      };
      portfolio: {
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
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
    },
  };
});

vi.mock('../../lib/prisma', () => {
  return {
    prisma: mockPrisma,
  };
});

describe('InvestmentService', () => {
  let investmentService: InvestmentService;

  beforeEach(() => {
    investmentService = new InvestmentService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInvestments', () => {
    it('should return all investments for a user', async () => {
      const userId = 'user-1';
      const investments = [
        {
          id: 'investment-1',
          userId,
          portfolioId: 'portfolio-1',
          name: 'Apple Inc.',
          symbol: 'AAPL',
          type: 'STOCK',
          quantity: new Decimal(10),
          purchasePrice: new Decimal(150),
          currentPrice: new Decimal(160),
          totalValue: new Decimal(1600),
          totalInvested: new Decimal(1500),
          totalGain: new Decimal(100),
          gainPercentage: new Decimal(6.67),
          purchaseDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.investment.findMany.mockResolvedValue(investments);

      const result = await investmentService.getInvestments(userId);

      expect(mockPrisma.investment.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(investments);
    });

    it('should return investments filtered by portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'portfolio-1';
      const investments = [
        {
          id: 'investment-1',
          userId,
          portfolioId,
          name: 'Apple Inc.',
          symbol: 'AAPL',
          type: 'STOCK',
          quantity: new Decimal(10),
          purchasePrice: new Decimal(150),
          currentPrice: new Decimal(160),
          totalValue: new Decimal(1600),
          totalInvested: new Decimal(1500),
          totalGain: new Decimal(100),
          gainPercentage: new Decimal(6.67),
          purchaseDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.investment.findMany.mockResolvedValue(investments);

      const result = await investmentService.getInvestments(userId, portfolioId);

      expect(mockPrisma.investment.findMany).toHaveBeenCalledWith({
        where: { userId, portfolioId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(investments);
    });

    it('should handle empty investment list', async () => {
      const userId = 'user-1';

      mockPrisma.investment.findMany.mockResolvedValue([]);

      const result = await investmentService.getInvestments(userId);

      expect(result).toEqual([]);
    });
  });

  describe('getInvestmentById', () => {
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
        quantity: new Decimal(10),
        purchasePrice: new Decimal(150),
        currentPrice: new Decimal(160),
        totalValue: new Decimal(1600),
        totalInvested: new Decimal(1500),
        totalGain: new Decimal(100),
        gainPercentage: new Decimal(6.67),
        purchaseDate: new Date(),
        maturityDate: null,
        interestRate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.investment.findFirst.mockResolvedValue(investment);

      const result = await investmentService.getInvestmentById(userId, investmentId);

      expect(mockPrisma.investment.findFirst).toHaveBeenCalledWith({
        where: { id: investmentId, userId },
      });
      expect(result).toEqual(investment);
    });

    it('should throw NotFoundError for non-existent investment', async () => {
      const userId = 'user-1';
      const investmentId = 'non-existent';

      mockPrisma.investment.findFirst.mockResolvedValue(null);

      await expect(investmentService.getInvestmentById(userId, investmentId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('createInvestment', () => {
    it('should successfully create an investment', async () => {
      const userId = 'user-1';
      const investmentData = {
        portfolioId: 'portfolio-1',
        type: 'STOCK' as const,
        name: 'Apple Inc.',
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 150,
        currentPrice: 150,
        purchaseDate: new Date().toISOString(),
      };

      const portfolio = {
        id: 'portfolio-1',
        userId,
      };

      const createdInvestment = {
        id: 'investment-1',
        userId,
        portfolioId: 'portfolio-1',
        type: 'STOCK',
        name: 'Apple Inc.',
        symbol: 'AAPL',
        quantity: new Decimal(10),
        purchasePrice: new Decimal(150),
        currentPrice: new Decimal(150),
        totalValue: new Decimal(1500),
        totalInvested: new Decimal(1500),
        totalGain: new Decimal(0),
        gainPercentage: new Decimal(0),
        purchaseDate: new Date(),
        maturityDate: null,
        interestRate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.portfolio.findFirst.mockResolvedValue(portfolio);
      mockPrisma.investment.create.mockResolvedValue(createdInvestment);
      mockPrisma.portfolio.update.mockResolvedValue({});

      const result = await investmentService.createInvestment(userId, investmentData);

      expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: investmentData.portfolioId, userId },
      });
      expect(result).toEqual(createdInvestment);
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const investmentData = {
        portfolioId: 'non-existent',
        type: 'STOCK' as const,
        name: 'Apple Inc.',
        symbol: 'AAPL',
        quantity: 10,
        purchasePrice: 150,
        currentPrice: 150,
        purchaseDate: new Date().toISOString(),
      };

      mockPrisma.portfolio.findFirst.mockResolvedValue(null);

      await expect(investmentService.createInvestment(userId, investmentData)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('updateInvestment', () => {
    it('should successfully update an investment', async () => {
      const userId = 'user-1';
      const investmentId = 'investment-1';
      const updateData = {
        currentPrice: 170,
      };

      const existingInvestment = {
        id: investmentId,
        userId,
        portfolioId: 'portfolio-1',
        quantity: new Decimal(10),
        purchasePrice: new Decimal(150),
        currentPrice: new Decimal(160),
        totalValue: new Decimal(1600),
        totalInvested: new Decimal(1500),
        totalGain: new Decimal(100),
        gainPercentage: new Decimal(6.67),
        purchaseDate: new Date(),
        maturityDate: null,
        interestRate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedInvestment = {
        ...existingInvestment,
        currentPrice: new Decimal(170),
        totalValue: new Decimal(1700),
        totalGain: new Decimal(200),
        gainPercentage: new Decimal(13.33),
      };

      mockPrisma.investment.findFirst.mockResolvedValue(existingInvestment);
      mockPrisma.investment.update.mockResolvedValue(updatedInvestment);
      mockPrisma.portfolio.update.mockResolvedValue({});

      const result = await investmentService.updateInvestment(userId, investmentId, updateData);

      expect(mockPrisma.investment.findFirst).toHaveBeenCalledWith({
        where: { id: investmentId, userId },
      });
      expect(result).toEqual(updatedInvestment);
    });

    it('should throw NotFoundError for non-existent investment', async () => {
      const userId = 'user-1';
      const investmentId = 'non-existent';
      const updateData = {
        currentPrice: 170,
      };

      mockPrisma.investment.findFirst.mockResolvedValue(null);

      await expect(
        investmentService.updateInvestment(userId, investmentId, updateData)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateInvestmentPrice', () => {
    it('should update investment price', async () => {
      const userId = 'user-1';
      const investmentId = 'investment-1';
      const newPrice = new Decimal(170);

      const existingInvestment = {
        id: investmentId,
        userId,
        portfolioId: 'portfolio-1',
        quantity: new Decimal(10),
        purchasePrice: new Decimal(150),
        currentPrice: new Decimal(160),
        totalValue: new Decimal(1600),
        totalInvested: new Decimal(1500),
        totalGain: new Decimal(100),
        gainPercentage: new Decimal(6.67),
        purchaseDate: new Date(),
        maturityDate: null,
        interestRate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedInvestment = {
        ...existingInvestment,
        currentPrice: newPrice,
        totalValue: new Decimal(1700),
        totalGain: new Decimal(200),
        gainPercentage: new Decimal(13.33),
      };

      mockPrisma.investment.findFirst.mockResolvedValue(existingInvestment);
      mockPrisma.investment.update.mockResolvedValue(updatedInvestment);
      mockPrisma.portfolio.update.mockResolvedValue({});

      const result = await investmentService.updateInvestmentPrice(userId, investmentId, newPrice);

      expect(mockPrisma.investment.findFirst).toHaveBeenCalledWith({
        where: { id: investmentId, userId },
      });
      expect(result).toEqual(updatedInvestment);
    });

    it('should throw NotFoundError for non-existent investment', async () => {
      const userId = 'user-1';
      const investmentId = 'non-existent';
      const newPrice = new Decimal(170);

      mockPrisma.investment.findFirst.mockResolvedValue(null);

      await expect(
        investmentService.updateInvestmentPrice(userId, investmentId, newPrice)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
