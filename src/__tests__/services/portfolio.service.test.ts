import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PortfolioService } from '../../services/portfolio.service';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler';

// Mock Prisma
const mockPrisma = {
  portfolio: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  investment: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  $disconnect: vi.fn(),
} as unknown as {
  portfolio: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  investment: {
    findMany: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  $disconnect: ReturnType<typeof vi.fn>;
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

describe('PortfolioService', () => {
  let portfolioService: PortfolioService;

  beforeEach(() => {
    portfolioService = new PortfolioService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPortfolios', () => {
    it('should return all portfolios for a user', async () => {
      const userId = 'user-1';
      const portfolios = [
        {
          id: 'portfolio-1',
          name: 'Growth Portfolio',
          description: 'High growth investments',
          totalValue: 10000,
          totalInvested: 8000,
          totalGain: 2000,
          gainPercentage: 25,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.portfolio.findMany.mockResolvedValue(portfolios);

      const result = await portfolioService.getPortfolios(userId);

      expect(mockPrisma.portfolio.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(portfolios);
    });

    it('should handle empty portfolio list', async () => {
      const userId = 'user-1';

      mockPrisma.portfolio.findMany.mockResolvedValue([]);

      const result = await portfolioService.getPortfolios(userId);

      expect(result).toEqual([]);
    });
  });

  describe('getPortfolioById', () => {
    it('should return a portfolio by ID', async () => {
      const userId = 'user-1';
      const portfolioId = 'portfolio-1';
      const portfolio = {
        id: portfolioId,
        name: 'Growth Portfolio',
        description: 'High growth investments',
        totalValue: 10000,
        totalInvested: 8000,
        totalGain: 2000,
        gainPercentage: 25,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);

      const result = await portfolioService.getPortfolioById(userId, portfolioId);

      expect(mockPrisma.portfolio.findUnique).toHaveBeenCalledWith({
        where: { id: portfolioId, userId },
      });
      expect(result).toEqual(portfolio);
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'non-existent';

      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(portfolioService.getPortfolioById(userId, portfolioId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('createPortfolio', () => {
    it('should create a new portfolio', async () => {
      const userId = 'user-1';
      const portfolioData = {
        name: 'New Portfolio',
        description: 'A new investment portfolio',
      };

      const createdPortfolio = {
        id: 'portfolio-1',
        userId,
        ...portfolioData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.portfolio.create.mockResolvedValue(createdPortfolio);

      const result = await portfolioService.createPortfolio(userId, portfolioData);

      expect(mockPrisma.portfolio.create).toHaveBeenCalledWith({
        data: {
          userId,
          name: portfolioData.name,
          description: portfolioData.description,
        },
      });
      expect(result).toEqual(createdPortfolio);
    });

    it('should validate required fields', async () => {
      const userId = 'user-1';
      const portfolioData = {
        name: '',
        description: 'A portfolio without a name',
      };

      await expect(portfolioService.createPortfolio(userId, portfolioData)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('updatePortfolio', () => {
    it('should update an existing portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'portfolio-1';
      const updateData = {
        name: 'Updated Portfolio',
        description: 'Updated description',
      };

      const updatedPortfolio = {
        id: portfolioId,
        userId,
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue({ id: portfolioId, userId });
      mockPrisma.portfolio.update.mockResolvedValue(updatedPortfolio);

      const result = await portfolioService.updatePortfolio(userId, portfolioId, updateData);

      expect(mockPrisma.portfolio.findUnique).toHaveBeenCalledWith({
        where: { id: portfolioId, userId },
      });
      expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
        where: { id: portfolioId },
        data: updateData,
      });
      expect(result).toEqual(updatedPortfolio);
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'non-existent';
      const updateData = {
        name: 'Updated Portfolio',
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(
        portfolioService.updatePortfolio(userId, portfolioId, updateData)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deletePortfolio', () => {
    it('should delete a portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'portfolio-1';

      mockPrisma.portfolio.findUnique.mockResolvedValue({ id: portfolioId, userId });
      mockPrisma.portfolio.delete.mockResolvedValue({});

      await portfolioService.deletePortfolio(userId, portfolioId);

      expect(mockPrisma.portfolio.findUnique).toHaveBeenCalledWith({
        where: { id: portfolioId, userId },
      });
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({
        where: { id: portfolioId },
      });
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'non-existent';

      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(portfolioService.deletePortfolio(userId, portfolioId)).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
