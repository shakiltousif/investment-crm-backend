import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';
import { quotesService } from './quotes.service';
import { CreateMarketplaceItemInput, UpdateMarketplaceItemInput } from '../lib/validators';

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
  async getAvailableInvestments(filters: MarketplaceFilters): Promise<{
    success: boolean;
    data: Array<unknown>;
    total: number;
  }> {
    try {
      // Build where clause based on filters
      const where: Record<string, unknown> = {
        isAvailable: true,
      };

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.minPrice !== undefined) {
        where.currentPrice = { gte: filters.minPrice };
      }

      if (filters.maxPrice !== undefined) {
        where.currentPrice = {
          ...where.currentPrice,
          lte: filters.maxPrice,
        };
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { symbol: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // Build orderBy clause
      let orderBy: Record<string, string> = { createdAt: 'desc' };
      if (filters.sortBy) {
        switch (filters.sortBy) {
          case 'name':
            orderBy = { name: filters.sortOrder ?? 'asc' };
            break;
          case 'price':
            orderBy = { currentPrice: filters.sortOrder ?? 'asc' };
            break;
          case 'return':
            orderBy = { expectedReturn: filters.sortOrder ?? 'desc' };
            break;
          case 'popularity':
            orderBy = { createdAt: 'desc' };
            break;
        }
      }

      const items = await prisma.marketplaceItem.findMany({
        where,
        orderBy,
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
      });

      return {
        success: true,
        data: items,
        total: items.length,
      };
    } catch (error) {
      console.error('Error fetching marketplace investments:', error);

      // Return mock data when database is not available
      const mockInvestments = [
        {
          id: 'mock-aapl',
          name: 'Apple Inc. (AAPL)',
          type: 'STOCK',
          symbol: 'AAPL',
          description: 'Technology company focused on consumer electronics and software',
          currentPrice: 175.5,
          minimumInvestment: 100,
          maximumInvestment: 100000,
          currency: 'GBP',
          riskLevel: 'MEDIUM',
          expectedReturn: 8.5,
          category: 'Technology',
          issuer: 'Apple Inc.',
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mock-msft',
          name: 'Microsoft Corp. (MSFT)',
          type: 'STOCK',
          symbol: 'MSFT',
          description: 'Technology company focused on software and cloud services',
          currentPrice: 320.15,
          minimumInvestment: 100,
          maximumInvestment: 100000,
          currency: 'GBP',
          riskLevel: 'MEDIUM',
          expectedReturn: 9.2,
          category: 'Technology',
          issuer: 'Microsoft Corp.',
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mock-tsla',
          name: 'Tesla Inc. (TSLA)',
          type: 'STOCK',
          symbol: 'TSLA',
          description: 'Electric vehicle and clean energy company',
          currentPrice: 245.3,
          minimumInvestment: 100,
          maximumInvestment: 100000,
          currency: 'GBP',
          riskLevel: 'HIGH',
          expectedReturn: 12.0,
          category: 'Automotive',
          issuer: 'Tesla Inc.',
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mock-btc',
          name: 'Bitcoin (BTC)',
          type: 'CRYPTOCURRENCY',
          symbol: 'BTC-USD',
          description: "The world's first and largest cryptocurrency by market capitalization",
          currentPrice: 65000,
          minimumInvestment: 100,
          maximumInvestment: 1000000,
          currency: 'GBP',
          riskLevel: 'HIGH',
          expectedReturn: 15.0,
          category: 'Cryptocurrency',
          issuer: 'Bitcoin Network',
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mock-gld',
          name: 'Gold ETF (GLD)',
          type: 'ETF',
          symbol: 'GLD',
          description: 'SPDR Gold Trust ETF tracking gold prices',
          currentPrice: 185.75,
          minimumInvestment: 50,
          maximumInvestment: 500000,
          currency: 'GBP',
          riskLevel: 'MEDIUM',
          expectedReturn: 6.8,
          category: 'Commodities',
          issuer: 'State Street',
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'mock-bond',
          name: 'US Treasury Bond 10Y',
          type: 'BOND',
          symbol: 'US10Y',
          description: '10-year US Treasury bond with fixed interest rate',
          currentPrice: 98.5,
          minimumInvestment: 1000,
          maximumInvestment: 1000000,
          currency: 'GBP',
          riskLevel: 'LOW',
          expectedReturn: 4.2,
          category: 'Government',
          issuer: 'US Treasury',
          maturityDate: new Date('2034-01-01'),
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Apply filters to mock data
      let filteredData = mockInvestments;

      if (filters.type) {
        filteredData = filteredData.filter((item) => item.type === filters.type);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredData = filteredData.filter(
          (item) =>
            item.name.toLowerCase().includes(searchLower) ||
            item.symbol?.toLowerCase().includes(searchLower) ||
            item.description.toLowerCase().includes(searchLower)
        );
      }

      return {
        success: true,
        data: filteredData,
        total: filteredData.length,
      };
    }
  }

  /**
   * Get investment details
   */
  async getInvestmentDetails(investmentId: string): Promise<unknown> {
    try {
      const investment = await prisma.marketplaceItem.findUnique({
        where: { id: investmentId },
      });

      if (!investment) {
        // Return mock data if not found in database
        const mockInvestments = [
          {
            id: 'mock-aapl',
            name: 'Apple Inc. (AAPL)',
            type: 'STOCK',
            symbol: 'AAPL',
            description: 'Technology company focused on consumer electronics and software',
            currentPrice: 175.5,
            minimumInvestment: 100,
            maximumInvestment: 100000,
            currency: 'GBP',
            riskLevel: 'MEDIUM',
            expectedReturn: 8.5,
            category: 'Technology',
            issuer: 'Apple Inc.',
            isAvailable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'mock-msft',
            name: 'Microsoft Corp. (MSFT)',
            type: 'STOCK',
            symbol: 'MSFT',
            description: 'Technology company focused on software and cloud services',
            currentPrice: 320.15,
            minimumInvestment: 100,
            maximumInvestment: 100000,
            currency: 'GBP',
            riskLevel: 'MEDIUM',
            expectedReturn: 9.2,
            category: 'Technology',
            issuer: 'Microsoft Corp.',
            isAvailable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'mock-tsla',
            name: 'Tesla Inc. (TSLA)',
            type: 'STOCK',
            symbol: 'TSLA',
            description: 'Electric vehicle and clean energy company',
            currentPrice: 245.3,
            minimumInvestment: 100,
            maximumInvestment: 100000,
            currency: 'GBP',
            riskLevel: 'HIGH',
            expectedReturn: 12.0,
            category: 'Automotive',
            issuer: 'Tesla Inc.',
            isAvailable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        const mockInvestment = mockInvestments.find((inv) => inv.id === investmentId);
        if (mockInvestment) {
          return mockInvestment;
        }

        throw new NotFoundError('Investment not found');
      }

      return {
        ...investment,
        currentPrice: investment.currentPrice.toNumber(),
        minimumInvestment: investment.minimumInvestment.toNumber(),
        maximumInvestment: investment.maximumInvestment?.toNumber(),
        expectedReturn: investment.expectedReturn?.toNumber(),
      };
    } catch (error) {
      console.error('Database error in getInvestmentDetails:', error);
      throw new NotFoundError('Investment not found');
    }
  }

  /**
   * Search investments
   */
  async searchInvestments(query: string, limit: number = 10): Promise<Array<unknown>> {
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
  async compareInvestments(investmentIds: string[]): Promise<Array<unknown>> {
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
  async previewBuyTransaction(
    userId: string,
    input: BuyInvestmentInput
  ): Promise<{
    investment: unknown;
    quantity: number;
    unitPrice: number | Decimal;
    totalCost: Decimal;
    estimatedFee: Decimal;
    totalAmount: Decimal;
    portfolio: unknown;
  }> {
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
  async buyInvestment(
    userId: string,
    input: BuyInvestmentInput
  ): Promise<{
    transaction: unknown;
    investment: unknown;
    details: {
      marketplaceInvestment: unknown;
      quantity: number;
      unitPrice: number | Decimal;
      totalCost: Decimal;
      fee: Decimal;
      totalAmount: Decimal;
    };
  }> {
    // Verify investment exists
    const marketplaceInvestment = await this.getInvestmentDetails(input.investmentId);

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
    const totalCost = new Decimal(input.quantity).times(marketplaceInvestment.currentPrice);
    const estimatedFee = totalCost.times(new Decimal(0.01)); // 1% fee
    const totalAmount = totalCost.plus(estimatedFee);

    // Create the investment record in user's portfolio
    const userInvestment = await prisma.investment.create({
      data: {
        userId,
        portfolioId: input.portfolioId,
        type: marketplaceInvestment.type,
        name: marketplaceInvestment.name,
        symbol: marketplaceInvestment.symbol,
        quantity: new Decimal(input.quantity),
        purchasePrice: marketplaceInvestment.currentPrice,
        currentPrice: marketplaceInvestment.currentPrice,
        totalValue: totalCost,
        totalGain: new Decimal(0), // No gain on purchase
        gainPercentage: new Decimal(0),
        purchaseDate: new Date(),
        maturityDate: marketplaceInvestment.maturityDate,
        interestRate: marketplaceInvestment.expectedReturn,
      },
    });

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'BUY',
        amount: totalAmount,
        currency: 'GBP',
        status: 'COMPLETED',
        description: `Buy ${input.quantity} units of ${marketplaceInvestment.name}`,
        investmentId: userInvestment.id,
        transactionDate: new Date(),
      },
    });

    // Update portfolio totals
    await this.updatePortfolioTotals(input.portfolioId);

    return {
      transaction,
      investment: userInvestment,
      details: {
        marketplaceInvestment,
        quantity: input.quantity,
        unitPrice: marketplaceInvestment.currentPrice,
        totalCost,
        fee: estimatedFee,
        totalAmount,
      },
    };
  }

  /**
   * Update portfolio totals
   */
  private async updatePortfolioTotals(portfolioId: string): Promise<void> {
    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    const totalValue = investments.reduce((sum, inv) => sum.plus(inv.totalValue), new Decimal(0));
    const totalInvested = investments.reduce(
      (sum, inv) => sum.plus(inv.quantity.times(inv.purchasePrice)),
      new Decimal(0)
    );
    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.isZero()
      ? new Decimal(0)
      : totalGain.dividedBy(totalInvested).times(100);

    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
      },
    });
  }

  /**
   * Preview sell transaction
   */
  async previewSellTransaction(
    userId: string,
    input: SellInvestmentInput
  ): Promise<{
    investment: unknown;
    quantity: number;
    unitPrice: Decimal;
    totalProceeds: Decimal;
    estimatedFee: Decimal;
    netProceeds: Decimal;
    costBasis: Decimal;
    gainLoss: Decimal;
    gainLossPercentage: Decimal;
  }> {
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
  async sellInvestment(
    userId: string,
    input: SellInvestmentInput
  ): Promise<{
    transaction: unknown;
    details: {
      investment: unknown;
      quantity: number;
      unitPrice: Decimal;
      totalProceeds: Decimal;
      fee: Decimal;
      netProceeds: Decimal;
    };
  }> {
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
        currency: 'GBP',
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

  /**
   * Create a new marketplace item
   */
  async createMarketplaceItem(input: CreateMarketplaceItemInput): Promise<unknown> {
    const marketplaceItem = await prisma.marketplaceItem.create({
      data: {
        name: input.name,
        type: input.type,
        symbol: input.symbol,
        description: input.description,
        currentPrice: new Decimal(input.currentPrice),
        minimumInvestment: new Decimal(input.minimumInvestment),
        maximumInvestment: input.maximumInvestment ? new Decimal(input.maximumInvestment) : null,
        currency: input.currency ?? 'GBP',
        riskLevel: input.riskLevel,
        expectedReturn: input.expectedReturn ? new Decimal(input.expectedReturn) : null,
        category: input.category,
        issuer: input.issuer,
        maturityDate: input.maturityDate ? new Date(input.maturityDate) : null,
        isAvailable: input.isAvailable,
      },
    });

    return marketplaceItem;
  }

  /**
   * Update a marketplace item
   */
  async updateMarketplaceItem(id: string, input: UpdateMarketplaceItemInput): Promise<unknown> {
    const existingItem = await prisma.marketplaceItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      throw new NotFoundError('Marketplace item not found');
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.type !== undefined) {
      updateData.type = input.type;
    }
    if (input.symbol !== undefined) {
      updateData.symbol = input.symbol;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.currentPrice !== undefined) {
      updateData.currentPrice = new Decimal(input.currentPrice);
    }
    if (input.minimumInvestment !== undefined) {
      updateData.minimumInvestment = new Decimal(input.minimumInvestment);
    }
    if (input.maximumInvestment !== undefined) {
      updateData.maximumInvestment = input.maximumInvestment
        ? new Decimal(input.maximumInvestment)
        : null;
    }
    if (input.currency !== undefined) {
      updateData.currency = input.currency;
    }
    if (input.riskLevel !== undefined) {
      updateData.riskLevel = input.riskLevel;
    }
    if (input.expectedReturn !== undefined) {
      updateData.expectedReturn = input.expectedReturn ? new Decimal(input.expectedReturn) : null;
    }
    if (input.category !== undefined) {
      updateData.category = input.category;
    }
    if (input.issuer !== undefined) {
      updateData.issuer = input.issuer;
    }
    if (input.maturityDate !== undefined) {
      updateData.maturityDate = input.maturityDate ? new Date(input.maturityDate) : null;
    }
    if (input.isAvailable !== undefined) {
      updateData.isAvailable = input.isAvailable;
    }

    const updatedItem = await prisma.marketplaceItem.update({
      where: { id },
      data: updateData,
    });

    return updatedItem;
  }

  /**
   * Delete a marketplace item
   */
  async deleteMarketplaceItem(id: string): Promise<{ success: boolean }> {
    const existingItem = await prisma.marketplaceItem.findUnique({
      where: { id },
    });

    if (!existingItem) {
      throw new NotFoundError('Marketplace item not found');
    }

    await prisma.marketplaceItem.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Get marketplace item by ID
   */
  async getMarketplaceItemById(id: string): Promise<unknown> {
    const item = await prisma.marketplaceItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundError('Marketplace item not found');
    }

    return item;
  }

  /**
   * Update prices with live quotes
   */
  async updatePricesWithLiveQuotes(): Promise<{
    updated: number;
    errors: string[];
  }> {
    try {
      // Get all marketplace items with symbols
      const items = await prisma.marketplaceItem.findMany({
        where: {
          symbol: { not: null },
          isAvailable: true,
        },
      });

      if (items.length === 0) {
        return { updated: 0, errors: [] };
      }

      const symbols = items.map((item) => item.symbol!).filter(Boolean);
      const quotes = await quotesService.getQuotes(symbols);

      let updated = 0;
      const errors: string[] = [];

      for (const item of items) {
        if (item.symbol && quotes.has(item.symbol)) {
          const quote = quotes.get(item.symbol)!;
          try {
            await prisma.marketplaceItem.update({
              where: { id: item.id },
              data: {
                currentPrice: new Decimal(quote.price),
                lastPriceUpdate: new Date(),
              },
            });
            updated++;
          } catch (error) {
            errors.push(`Failed to update ${item.symbol}: ${error}`);
          }
        }
      }

      return { updated, errors };
    } catch (error) {
      console.error('Error updating prices with live quotes:', error);
      throw new Error('Failed to update prices with live quotes');
    }
  }
}

export const marketplaceService = new MarketplaceService();
