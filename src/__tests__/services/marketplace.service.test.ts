import { MarketplaceService } from '../../services/marketplace.service';
import { prisma } from '../../lib/prisma';
import { ValidationError } from '../../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

jest.mock('../../lib/prisma');

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    service = new MarketplaceService();
    jest.clearAllMocks();
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

      (prisma.investment.findMany as jest.Mock).mockResolvedValue(mockInvestments);
      (prisma.investment.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getAvailableInvestments({
        type: 'STOCK',
        limit: 10,
        offset: 0,
      });

      expect(result.data).toEqual(mockInvestments);
      expect(result.pagination.total).toBe(1);
    });

    it('should filter by price range', async () => {
      (prisma.investment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.investment.count as jest.Mock).mockResolvedValue(0);

      await service.getAvailableInvestments({
        minPrice: 100,
        maxPrice: 200,
        limit: 10,
        offset: 0,
      });

      expect(prisma.investment.findMany).toHaveBeenCalled();
    });
  });

  describe('previewBuyTransaction', () => {
    it('should preview buy transaction with correct calculations', async () => {
      const mockInvestment = {
        id: 'inv-1',
        currentPrice: new Decimal('100.00'),
      };

      (prisma.investment.findUnique as jest.Mock).mockResolvedValue(mockInvestment);

      const result = await service.previewBuyTransaction('inv-1', 10);

      expect(result.quantity).toBe(10);
      expect(result.unitPrice).toEqual(new Decimal('100.00'));
      // Fee should be 1% of total cost
      expect(result.fee).toEqual(new Decimal('100.00')); // 1% of 10000
    });

    it('should throw error if investment not found', async () => {
      (prisma.investment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.previewBuyTransaction('inv-1', 10)).rejects.toThrow(
        ValidationError,
      );
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

      (prisma.investment.findUnique as jest.Mock).mockResolvedValue(mockInvestment);
      (prisma.portfolio.findUnique as jest.Mock).mockResolvedValue(mockPortfolio);
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'trans-1',
      });

      const result = await service.buyInvestment('user-1', 'port-1', 'inv-1', 10);

      expect(result).toHaveProperty('id');
      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it('should throw error if portfolio not found', async () => {
      (prisma.portfolio.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.buyInvestment('user-1', 'port-1', 'inv-1', 10)).rejects.toThrow(
        ValidationError,
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

      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(mockTransaction);
      (prisma.investment.findUnique as jest.Mock).mockResolvedValue(mockInvestment);

      const result = await service.previewSellTransaction('trans-1', 10);

      expect(result.quantity).toBe(10);
      expect(result.unitPrice).toEqual(new Decimal('150.00'));
      // Gain should be positive (sold at 150 vs bought at 100)
      expect(result.gainLoss.toNumber()).toBeGreaterThan(0);
    });

    it('should throw error if transaction not found', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.previewSellTransaction('trans-1', 10)).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe('sellInvestment', () => {
    it('should sell investment successfully', async () => {
      const mockTransaction = {
        id: 'trans-1',
        quantity: 10,
        totalCost: new Decimal('1000.00'),
      };

      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(mockTransaction);
      (prisma.investment.findUnique as jest.Mock).mockResolvedValue({
        currentPrice: new Decimal('150.00'),
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'trans-2',
      });

      const result = await service.sellInvestment('user-1', 'trans-1', 10);

      expect(result).toHaveProperty('id');
      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it('should throw error if trying to sell more than owned', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
        quantity: 5,
      });

      await expect(service.sellInvestment('user-1', 'trans-1', 10)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});

