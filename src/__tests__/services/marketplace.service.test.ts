import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketplaceService } from '../../services/marketplace.service';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      marketplaceItem: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      investment: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      portfolio: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      bankAccount: {
        findFirst: vi.fn(),
      },
      transaction: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      $disconnect: vi.fn(),
    } as unknown as {
      marketplaceItem: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      investment: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
      portfolio: {
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
      bankAccount: {
        findFirst: ReturnType<typeof vi.fn>;
      };
      transaction: {
        create: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
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

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    service = new MarketplaceService();
    vi.clearAllMocks();
  });

  describe('getAvailableInvestments', () => {
    it('should get available investments with filters', async () => {
      // Mock returning actual data
      const mockInvestments = [
        {
          id: 'inv-1',
          name: 'Apple Inc',
          symbol: 'AAPL',
          type: 'STOCK',
          currentPrice: new Decimal('150.00'),
          minimumInvestment: new Decimal('100'),
          maximumInvestment: new Decimal('100000'),
          currency: 'GBP',
          riskLevel: 'MEDIUM',
          expectedReturn: new Decimal('8.5'),
          category: 'Technology',
          issuer: 'Apple Inc.',
          description: 'Technology company',
          maturityDate: null,
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.marketplaceItem.findMany.mockResolvedValue(mockInvestments);

      const result = await service.getAvailableInvestments({
        type: 'STOCK',
        limit: 10,
        offset: 0,
      });

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBe(1);
      expect(result).toHaveProperty('total');
      expect(result.total).toBe(1);
    });

    it('should filter by price range', async () => {
      mockPrisma.marketplaceItem.findMany.mockResolvedValue([]);

      await service.getAvailableInvestments({
        minPrice: 100,
        maxPrice: 200,
        limit: 10,
        offset: 0,
      });

      expect(mockPrisma.marketplaceItem.findMany).toHaveBeenCalled();
    });
  });

  describe('previewBuyTransaction', () => {
    it('should preview buy transaction with correct calculations', async () => {
      const mockInvestment = {
        id: 'mock-aapl',
        name: 'Apple Inc. (AAPL)',
        type: 'STOCK',
        symbol: 'AAPL',
        description: 'Technology company',
        currentPrice: new Decimal('100.00'),
        minimumInvestment: new Decimal('100'),
        maximumInvestment: new Decimal('100000'),
        currency: 'GBP',
        riskLevel: 'MEDIUM',
        expectedReturn: new Decimal('8.5'),
        category: 'Technology',
        issuer: 'Apple Inc.',
        maturityDate: null,
        isAvailable: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPortfolio = {
        id: 'port-1',
        userId: 'user-1',
      };

      mockPrisma.marketplaceItem.findUnique.mockResolvedValue(mockInvestment);
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolio);

      const result = await service.previewBuyTransaction('user-1', {
        investmentId: 'mock-aapl',
        portfolioId: 'port-1',
        quantity: 10,
      });

      expect(result.quantity).toBe(10);
      expect(result.unitPrice).toEqual(100.0);
      // Fee should be 1% of total cost (1000 * 0.01 = 10)
      expect(result.estimatedFee).toEqual(new Decimal('10.00'));
      expect(result.totalCost).toEqual(new Decimal('1000.00'));
      expect(result.totalAmount).toEqual(new Decimal('1010.00'));
    });

    it('should throw error if investment not found', async () => {
      mockPrisma.marketplaceItem.findUnique.mockResolvedValue(null);

      await expect(
        service.previewBuyTransaction('user-1', {
          investmentId: 'inv-1',
          portfolioId: 'port-1',
          quantity: 10,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('buyInvestment', () => {
    it('should buy investment successfully', async () => {
      const mockInvestment = {
        id: 'mock-aapl',
        name: 'Apple Inc. (AAPL)',
        type: 'STOCK',
        symbol: 'AAPL',
        description: 'Technology company',
        currentPrice: new Decimal('100.00'),
        minimumInvestment: new Decimal('100'),
        maximumInvestment: new Decimal('100000'),
        currency: 'GBP',
        riskLevel: 'MEDIUM',
        expectedReturn: new Decimal('8.5'),
        category: 'Technology',
        issuer: 'Apple Inc.',
        maturityDate: null,
        isAvailable: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPortfolio = {
        id: 'port-1',
        userId: 'user-1',
      };

      mockPrisma.marketplaceItem.findUnique.mockResolvedValue(mockInvestment);
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolio);
      mockPrisma.investment.findFirst.mockResolvedValue(null);
      mockPrisma.investment.create.mockResolvedValue({
        id: 'inv-created',
      });
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'trans-1',
      });
      mockPrisma.investment.findMany.mockResolvedValue([]);
      mockPrisma.portfolio.update.mockResolvedValue({});

      const result = await service.buyInvestment('user-1', {
        portfolioId: 'port-1',
        investmentId: 'mock-aapl',
        quantity: 10,
      });

      expect(result).toHaveProperty('transaction');
      expect(result).toHaveProperty('investment');
      expect(result).toHaveProperty('details');
      expect(mockPrisma.transaction.create).toHaveBeenCalled();
    });

    it('should throw error if portfolio not found', async () => {
      mockPrisma.marketplaceItem.findUnique.mockResolvedValue({
        id: 'inv-1',
        currentPrice: new Decimal('100.00'),
      });
      mockPrisma.portfolio.findFirst.mockResolvedValue(null);

      await expect(
        service.buyInvestment('user-1', {
          portfolioId: 'port-1',
          investmentId: 'inv-1',
          quantity: 10,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('previewSellTransaction', () => {
    it('should preview sell transaction with gain/loss calculation', async () => {
      const mockInvestment = {
        id: 'inv-1',
        currentPrice: new Decimal('150.00'),
        quantity: new Decimal('20'),
        purchasePrice: new Decimal('100.00'),
      };

      mockPrisma.investment.findFirst.mockResolvedValue(mockInvestment);

      const result = await service.previewSellTransaction('user-1', {
        investmentId: 'inv-1',
        quantity: 10,
      });

      expect(result.quantity).toBe(10);
      expect(result.unitPrice).toEqual(new Decimal('150.00'));
      // Gain should be positive (sold at 150 vs bought at 100)
      expect(result.gainLoss.toNumber()).toBeGreaterThan(0);
    });

    it('should throw error if investment not found', async () => {
      mockPrisma.investment.findFirst.mockResolvedValue(null);

      await expect(
        service.previewSellTransaction('user-1', {
          investmentId: 'inv-1',
          quantity: 10,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('sellInvestment', () => {
    it('should sell investment successfully', async () => {
      const mockInvestment = {
        id: 'inv-1',
        userId: 'user-1',
        portfolioId: 'port-1',
        name: 'Apple Inc.',
        currentPrice: new Decimal('150.00'),
        quantity: new Decimal('20'),
        purchasePrice: new Decimal('100.00'),
      };

      mockPrisma.investment.findFirst.mockResolvedValue(mockInvestment);
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'trans-2',
      });
      mockPrisma.investment.update.mockResolvedValue({
        ...mockInvestment,
        quantity: new Decimal('10'),
      });
      mockPrisma.investment.findMany.mockResolvedValue([]);
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        id: 'port-1',
      });
      mockPrisma.portfolio.update.mockResolvedValue({});

      const result = await service.sellInvestment('user-1', {
        investmentId: 'inv-1',
        quantity: 10,
      });

      expect(result).toHaveProperty('transaction');
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('quantity', 10);
      expect(result.details).toHaveProperty('unitPrice');
      expect(result.details).toHaveProperty('totalProceeds');
      expect(result.details).toHaveProperty('fee');
      expect(result.details).toHaveProperty('netProceeds');
      expect(mockPrisma.transaction.create).toHaveBeenCalled();
      expect(mockPrisma.investment.update).toHaveBeenCalled();
    });

    it('should throw error if trying to sell more than owned', async () => {
      const mockInvestment = {
        id: 'inv-1',
        currentPrice: new Decimal('150.00'),
        quantity: new Decimal('5'), // Only 5 owned
        purchasePrice: new Decimal('100.00'),
      };

      mockPrisma.investment.findFirst.mockResolvedValue(mockInvestment);

      await expect(
        service.sellInvestment('user-1', {
          investmentId: 'inv-1',
          quantity: 10, // Trying to sell 10
        })
      ).rejects.toThrow(ValidationError);
    });
  });
});
