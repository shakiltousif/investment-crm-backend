import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PortfolioService } from '../../services/portfolio.service';
import { NotFoundError } from '../../middleware/errorHandler';

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      portfolio: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      investment: {
        findMany: vi.fn(),
        aggregate: vi.fn(),
        count: vi.fn(),
      },
      $disconnect: vi.fn(),
    } as unknown as {
      portfolio: {
        findMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
      investment: {
        findMany: ReturnType<typeof vi.fn>;
        aggregate: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
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
        include: { investments: true },
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

      mockPrisma.portfolio.findFirst.mockResolvedValue(portfolio);

      const result = await portfolioService.getPortfolioById(userId, portfolioId);

      expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: portfolioId, userId },
        include: { investments: true },
      });
      expect(result).toEqual(portfolio);
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'non-existent';

      mockPrisma.portfolio.findFirst.mockResolvedValue(null);

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
          isActive: true,
          totalValue: expect.anything(),
          totalInvested: expect.anything(),
          totalGain: expect.anything(),
          gainPercentage: expect.anything(),
        },
      });
      expect(result).toEqual(createdPortfolio);
    });

    it('should create portfolio even with empty name (validation happens at route level)', async () => {
      const userId = 'user-1';
      const portfolioData = {
        name: '',
        description: 'A portfolio without a name',
      };

      const createdPortfolio = {
        id: 'portfolio-1',
        userId,
        ...portfolioData,
        isActive: true,
        totalValue: 0,
        totalInvested: 0,
        totalGain: 0,
        gainPercentage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.portfolio.create.mockResolvedValue(createdPortfolio);

      const result = await portfolioService.createPortfolio(userId, portfolioData);
      expect(result).toEqual(createdPortfolio);
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

      mockPrisma.portfolio.findFirst.mockResolvedValue({
        id: portfolioId,
        userId,
        investments: [],
      });
      mockPrisma.portfolio.update.mockResolvedValue(updatedPortfolio);

      const result = await portfolioService.updatePortfolio(userId, portfolioId, updateData);

      expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: portfolioId, userId },
        include: { investments: true },
      });
      expect(mockPrisma.portfolio.update).toHaveBeenCalled();
      expect(result).toEqual(updatedPortfolio);
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'non-existent';
      const updateData = {
        name: 'Updated Portfolio',
      };

      mockPrisma.portfolio.findFirst.mockResolvedValue(null);

      await expect(
        portfolioService.updatePortfolio(userId, portfolioId, updateData)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deletePortfolio', () => {
    it('should delete a portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'portfolio-1';

      mockPrisma.portfolio.findFirst.mockResolvedValue({
        id: portfolioId,
        userId,
        investments: [],
      });
      mockPrisma.portfolio.delete.mockResolvedValue({});

      await portfolioService.deletePortfolio(userId, portfolioId);

      expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: portfolioId, userId },
        include: { investments: true },
      });
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({
        where: { id: portfolioId },
      });
    });

    it('should throw NotFoundError for non-existent portfolio', async () => {
      const userId = 'user-1';
      const portfolioId = 'non-existent';

      mockPrisma.portfolio.findFirst.mockResolvedValue(null);

      await expect(portfolioService.deletePortfolio(userId, portfolioId)).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
