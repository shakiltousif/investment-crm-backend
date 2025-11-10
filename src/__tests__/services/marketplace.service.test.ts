import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketplaceService } from '../../services/marketplace.service';
import { ValidationError } from '../../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

// Mock Prisma
const mockPrisma = {
  investment: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  portfolio: {
    findUnique: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  $disconnect: vi.fn(),
} as unknown as {
  investment: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  portfolio: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  transaction: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  $disconnect: ReturnType<typeof vi.fn>;
};

vi.mock('../../lib/prisma', () => ({
  prisma: mockPrisma,
}));

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    service = new MarketplaceService();
    vi.clearAllMocks();
  });

  describe('getAvailableInvestments', () => {
    it('should get available investments with filters', async () => {
      const mockInvestments = [
        {
          id: 'inv-1',
          name: 'Apple Inc',
          symbol: 'AAPL',
          type: 'STOCK',
          currentPrice: new Decimal('150.00'),
        },
      ];

      mockPrisma.investment.findMany.mockResolvedValue(mockInvestments);
      mockPrisma.investment.count.mockResolvedValue(1);

      const result = await service.getAvailableInvestments({
        type: 'STOCK',
        limit: 10,
        offset: 0,
      });

      expect(result.data).toEqual(mockInvestments);
      expect(result.pagination.total).toBe(1);
    });

    it('should filter by price range', async () => {
      mockPrisma.investment.findMany.mockResolvedValue([]);
      mockPrisma.investment.count.mockResolvedValue(0);

      await service.getAvailableInvestments({
        minPrice: 100,
        maxPrice: 200,
        limit: 10,
        offset: 0,
      });

      expect(mockPrisma.investment.findMany).toHaveBeenCalled();
    });
  });

  describe('previewBuyTransaction', () => {
    it('should preview buy transaction with correct calculations', async () => {
      const mockInvestment = {
        id: 'inv-1',
        currentPrice: new Decimal('100.00'),
      };

      mockPrisma.investment.findUnique.mockResolvedValue(mockInvestment);

      const result = await service.previewBuyTransaction('inv-1', 10);

      expect(result.quantity).toBe(10);
      expect(result.unitPrice).toEqual(new Decimal('100.00'));
      // Fee should be 1% of total cost
      expect(result.fee).toEqual(new Decimal('100.00')); // 1% of 10000
    });

    it('should throw error if investment not found', async () => {
      mockPrisma.investment.findUnique.mockResolvedValue(null);

      await expect(service.previewBuyTransaction('inv-1', 10)).rejects.toThrow(ValidationError);
    });
  });

  describe('buyInvestment', () => {
    it('should buy investment successfully', async () => {
      const mockInvestment = {
        id: 'inv-1',
        currentPrice: new Decimal('100.00'),
      };

      const mockPortfolio = {
        id: 'port-1',
        userId: 'user-1',
      };

      mockPrisma.investment.findUnique.mockResolvedValue(mockInvestment);
      mockPrisma.portfolio.findUnique.mockResolvedValue(mockPortfolio);
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'trans-1',
      });

      const result = await service.buyInvestment('user-1', 'port-1', 'inv-1', 10);

      expect(result).toHaveProperty('id');
      expect(mockPrisma.transaction.create).toHaveBeenCalled();
    });

    it('should throw error if portfolio not found', async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(service.buyInvestment('user-1', 'port-1', 'inv-1', 10)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('previewSellTransaction', () => {
    it('should preview sell transaction with gain/loss calculation', async () => {
      const mockTransaction = {
        id: 'trans-1',
        quantity: 10,
        totalCost: new Decimal('1000.00'),
      };

      const mockInvestment = {
        id: 'inv-1',
        currentPrice: new Decimal('150.00'),
      };

      mockPrisma.transaction.findUnique.mockResolvedValue(mockTransaction);
      mockPrisma.investment.findUnique.mockResolvedValue(mockInvestment);

      const result = await service.previewSellTransaction('trans-1', 10);

      expect(result.quantity).toBe(10);
      expect(result.unitPrice).toEqual(new Decimal('150.00'));
      // Gain should be positive (sold at 150 vs bought at 100)
      expect(result.gainLoss.toNumber()).toBeGreaterThan(0);
    });

    it('should throw error if transaction not found', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      await expect(service.previewSellTransaction('trans-1', 10)).rejects.toThrow(ValidationError);
    });
  });

  describe('sellInvestment', () => {
    it('should sell investment successfully', async () => {
      const mockTransaction = {
        id: 'trans-1',
        quantity: 10,
        totalCost: new Decimal('1000.00'),
      };

      mockPrisma.transaction.findUnique.mockResolvedValue(mockTransaction);
      mockPrisma.investment.findUnique.mockResolvedValue({
        currentPrice: new Decimal('150.00'),
      });
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'trans-2',
      });

      const result = await service.sellInvestment('user-1', 'trans-1', 10);

      expect(result).toHaveProperty('id');
      expect(mockPrisma.transaction.create).toHaveBeenCalled();
    });

    it('should throw error if trying to sell more than owned', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        quantity: 5,
      });

      await expect(service.sellInvestment('user-1', 'trans-1', 10)).rejects.toThrow(
        ValidationError
      );
    });
  });
});
