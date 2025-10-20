import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

export interface MarketplaceFilters {
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: 'name' | 'price' | 'return' | 'popularity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BuyInvestmentInput {
  investmentId: string;
  quantity: number;
  portfolioId: string;
}

export interface SellInvestmentInput {
  investmentId: string;
  quantity: number;
}

export class MarketplaceService {
  /**
   * Get available investments for marketplace
   */
  async getAvailableInvestments(filters: MarketplaceFilters) {
    const where: any = {
      status: 'ACTIVE',
    };

    // Type filter
    if (filters.type) {
      where.type = filters.type;
    }

    // Price range filter
    if (filters.minPrice || filters.maxPrice) {
      where.currentPrice = {};
      if (filters.minPrice) {
        where.currentPrice.gte = new Decimal(filters.minPrice);
      }
      if (filters.maxPrice) {
        where.currentPrice.lte = new Decimal(filters.maxPrice);
      }
    }

    // Search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { symbol: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Sorting
    const orderBy: any = {};
    const sortBy = filters.sortBy || 'name';
    const sortOrder = filters.sortOrder || 'asc';

    switch (sortBy) {
      case 'price':
        orderBy.currentPrice = sortOrder;
        break;
      case 'return':
        orderBy.gainPercentage = sortOrder;
        break;
      case 'popularity':
        orderBy.createdAt = sortOrder;
        break;
      default:
        orderBy.name = sortOrder;
    }

    // Pagination
    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const [investments, total] = await Promise.all([
      prisma.investment.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.investment.count({ where }),
    ]);

    return {
      data: investments,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get investment details
   */
  async getInvestmentDetails(investmentId: string) {
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    return investment;
  }

  /**
   * Search investments
   */
  async searchInvestments(query: string, limit: number = 10) {
    const investments = await prisma.investment.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { symbol: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });

    return investments;
  }

  /**
   * Get investment comparison
   */
  async compareInvestments(investmentIds: string[]) {
    const investments = await prisma.investment.findMany({
      where: {
        id: { in: investmentIds },
      },
    });

    if (investments.length === 0) {
      throw new NotFoundError('No investments found');
    }

    return investments;
  }

  /**
   * Preview buy transaction
   */
  async previewBuyTransaction(userId: string, input: BuyInvestmentInput) {
    // Verify investment exists
    const investment = await this.getInvestmentDetails(input.investmentId);

    // Verify portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: input.portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    // Calculate transaction details
    const totalCost = new Decimal(input.quantity).times(investment.currentPrice);
    const estimatedFee = totalCost.times(new Decimal(0.01)); // 1% fee
    const totalAmount = totalCost.plus(estimatedFee);

    return {
      investment,
      quantity: input.quantity,
      unitPrice: investment.currentPrice,
      totalCost,
      estimatedFee,
      totalAmount,
      portfolio,
    };
  }

  /**
   * Execute buy transaction
   */
  async buyInvestment(userId: string, input: BuyInvestmentInput) {
    // Verify investment exists
    const investment = await this.getInvestmentDetails(input.investmentId);

    // Verify portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: input.portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    // Calculate transaction details
    const totalCost = new Decimal(input.quantity).times(investment.currentPrice);
    const estimatedFee = totalCost.times(new Decimal(0.01)); // 1% fee
    const totalAmount = totalCost.plus(estimatedFee);

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'BUY',
        amount: totalAmount,
        currency: 'USD',
        status: 'COMPLETED',
        description: `Buy ${input.quantity} units of ${investment.name}`,
        investmentId: input.investmentId,
        transactionDate: new Date(),
      },
    });

    return {
      transaction,
      details: {
        investment,
        quantity: input.quantity,
        unitPrice: investment.currentPrice,
        totalCost,
        fee: estimatedFee,
        totalAmount,
      },
    };
  }

  /**
   * Preview sell transaction
   */
  async previewSellTransaction(userId: string, input: SellInvestmentInput) {
    // Verify investment exists and belongs to user
    const investment = await prisma.investment.findFirst({
      where: {
        id: input.investmentId,
        userId,
      },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    // Verify sufficient quantity
    if (investment.quantity.lessThan(input.quantity)) {
      throw new ValidationError('Insufficient quantity to sell');
    }

    // Calculate transaction details
    const totalProceeds = new Decimal(input.quantity).times(investment.currentPrice);
    const estimatedFee = totalProceeds.times(new Decimal(0.01)); // 1% fee
    const netProceeds = totalProceeds.minus(estimatedFee);

    // Calculate gain/loss
    const costBasis = new Decimal(input.quantity).times(investment.purchasePrice);
    const gainLoss = netProceeds.minus(costBasis);
    const gainLossPercentage = costBasis.isZero()
      ? new Decimal(0)
      : gainLoss.dividedBy(costBasis).times(100);

    return {
      investment,
      quantity: input.quantity,
      unitPrice: investment.currentPrice,
      totalProceeds,
      estimatedFee,
      netProceeds,
      costBasis,
      gainLoss,
      gainLossPercentage,
    };
  }

  /**
   * Execute sell transaction
   */
  async sellInvestment(userId: string, input: SellInvestmentInput) {
    // Verify investment exists and belongs to user
    const investment = await prisma.investment.findFirst({
      where: {
        id: input.investmentId,
        userId,
      },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    // Verify sufficient quantity
    if (investment.quantity.lessThan(input.quantity)) {
      throw new ValidationError('Insufficient quantity to sell');
    }

    // Calculate transaction details
    const totalProceeds = new Decimal(input.quantity).times(investment.currentPrice);
    const estimatedFee = totalProceeds.times(new Decimal(0.01)); // 1% fee
    const netProceeds = totalProceeds.minus(estimatedFee);

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'SELL',
        amount: netProceeds,
        currency: 'USD',
        status: 'COMPLETED',
        description: `Sell ${input.quantity} units of ${investment.name}`,
        investmentId: input.investmentId,
        transactionDate: new Date(),
      },
    });

    // Update investment quantity
    const newQuantity = investment.quantity.minus(input.quantity);
    await prisma.investment.update({
      where: { id: input.investmentId },
      data: {
        quantity: newQuantity,
      },
    });

    return {
      transaction,
      details: {
        investment,
        quantity: input.quantity,
        unitPrice: investment.currentPrice,
        totalProceeds,
        fee: estimatedFee,
        netProceeds,
      },
    };
  }
}

export const marketplaceService = new MarketplaceService();

