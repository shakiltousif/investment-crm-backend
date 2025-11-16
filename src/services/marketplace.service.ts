import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { Decimal } from '@prisma/client/runtime/library';
import { InvestmentType } from '@prisma/client';
import { quotesService } from './quotes.service.js';
import { CreateMarketplaceItemInput, UpdateMarketplaceItemInput } from '../lib/validators.js';
import { emailService } from './email.service.js';
import { emailSettingsService } from './emailSettings.service.js';

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
  amount: number; // Investment amount in currency
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
        const currentPriceFilter = where.currentPrice as { gte?: number } | undefined;
        where.currentPrice = {
          ...(currentPriceFilter ?? {}),
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
  async getInvestmentDetails(investmentId: string): Promise<{
    id: string;
    name: string;
    type: string;
    symbol: string | null;
    description: string | null;
    currentPrice: number | Decimal;
    minimumInvestment: number | Decimal;
    maximumInvestment: number | Decimal | null;
    currency: string;
    riskLevel: string;
    expectedReturn: number | Decimal | null;
    category: string | null;
    issuer: string | null;
    maturityDate: Date | null;
    isAvailable: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
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
            maturityDate: null,
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
            maturityDate: null,
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
            maturityDate: null,
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
        maximumInvestment: investment.maximumInvestment?.toNumber() ?? null,
        expectedReturn: investment.expectedReturn?.toNumber() ?? null,
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
    // For amount-based investments, use amount directly as investment value
    const investmentAmount = new Decimal(input.amount);
    const totalCost = investmentAmount; // Amount is the investment value
    const estimatedFee = totalCost.times(new Decimal(0.001)); // 0.1% fee
    const totalAmount = totalCost.plus(estimatedFee);

    // Calculate quantity: for fixed investments, quantity = 1; for price-based, calculate from amount
    let quantity: Decimal;
    const currentPrice =
      typeof investment.currentPrice === 'number'
        ? new Decimal(investment.currentPrice)
        : investment.currentPrice;

    // For bonds and fixed investments, quantity is 1 (amount is the investment value)
    if (
      investment.type === 'BOND' ||
      investment.type === 'CORPORATE_BOND' ||
      investment.type === 'TERM_DEPOSIT' ||
      investment.type === 'FIXED_RATE_DEPOSIT'
    ) {
      quantity = new Decimal(1);
    } else if (currentPrice.gt(0)) {
      // For stocks and other price-based investments, calculate quantity
      quantity = investmentAmount.dividedBy(currentPrice);
    } else {
      // Default to 1 if no price
      quantity = new Decimal(1);
    }

    return {
      investment,
      quantity: quantity.toNumber(),
      unitPrice:
        typeof investment.currentPrice === 'number'
          ? investment.currentPrice
          : investment.currentPrice.toNumber(),
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
    // For amount-based investments, use amount directly as investment value
    const investmentAmount = new Decimal(input.amount);
    const totalCost = investmentAmount; // Amount is the investment value
    const estimatedFee = totalCost.times(new Decimal(0.001)); // 0.1% fee
    const totalAmount = totalCost.plus(estimatedFee);

    // Calculate quantity and purchase price
    let quantity: Decimal;
    let purchasePrice: Decimal;
    const currentPrice =
      typeof marketplaceInvestment.currentPrice === 'number'
        ? new Decimal(marketplaceInvestment.currentPrice)
        : marketplaceInvestment.currentPrice;

    // For bonds and fixed investments, quantity is 1 and purchasePrice is the amount
    if (
      marketplaceInvestment.type === 'BOND' ||
      marketplaceInvestment.type === 'CORPORATE_BOND' ||
      marketplaceInvestment.type === 'TERM_DEPOSIT' ||
      marketplaceInvestment.type === 'FIXED_RATE_DEPOSIT'
    ) {
      quantity = new Decimal(1);
      purchasePrice = investmentAmount; // Purchase price is the amount invested
    } else if (currentPrice.gt(0)) {
      // For stocks and other price-based investments, calculate quantity from amount
      quantity = investmentAmount.dividedBy(currentPrice);
      purchasePrice = currentPrice;
    } else {
      // Default to 1 if no price
      quantity = new Decimal(1);
      purchasePrice = investmentAmount;
    }
    const expectedReturn = marketplaceInvestment.expectedReturn
      ? typeof marketplaceInvestment.expectedReturn === 'number'
        ? new Decimal(marketplaceInvestment.expectedReturn)
        : marketplaceInvestment.expectedReturn
      : null;
    const userInvestment = await prisma.investment.create({
      data: {
        userId,
        portfolioId: input.portfolioId,
        type: marketplaceInvestment.type as InvestmentType,
        name: marketplaceInvestment.name,
        symbol: marketplaceInvestment.symbol,
        quantity,
        purchasePrice,
        currentPrice: purchasePrice,
        totalValue: totalCost,
        totalGain: new Decimal(0), // No gain on purchase
        gainPercentage: new Decimal(0),
        purchaseDate: new Date(),
        maturityDate: marketplaceInvestment.maturityDate,
        interestRate: expectedReturn,
        status: 'PENDING', // Investment requires admin approval
      },
    });

    // Create transaction record with PENDING status
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'BUY',
        amount: totalAmount,
        currency: 'GBP',
        status: 'PENDING', // Transaction pending until investment is approved
        description: `Buy £${input.amount} of ${marketplaceInvestment.name} (Pending Approval)`,
        investmentId: userInvestment.id,
        transactionDate: new Date(),
      },
    });

    // Do NOT update portfolio totals - only update when investment is approved
    // Portfolio totals will be updated in approveInvestment() method

    // Send purchase confirmation email asynchronously (non-blocking)
    // This ensures the response is sent immediately and email is sent in background
    void (async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true },
        });

        if (user?.email) {
          // Check if investment purchase emails are enabled
          const shouldSend = await emailSettingsService.shouldSendNotification(
            userId,
            'investmentPurchase'
          );
          if (shouldSend) {
            await emailService
              .sendInvestmentPurchaseConfirmationEmail(
                user.email,
                user.firstName,
                marketplaceInvestment.name,
                quantity.toNumber(),
                typeof marketplaceInvestment.currentPrice === 'number'
                  ? marketplaceInvestment.currentPrice
                  : marketplaceInvestment.currentPrice.toNumber(),
                totalAmount.toNumber(),
                marketplaceInvestment.currency
              )
              .then(() => {
                console.warn(
                  `Investment purchase confirmation email sent successfully to ${user.email}`
                );
              })
              .catch((error) => {
                console.error('Failed to send purchase confirmation email:', error);
              });
          } else {
            console.warn(
              `Investment purchase confirmation email skipped for ${user.email} (disabled in settings)`
            );
          }
        }
      } catch (error) {
        console.error('Failed to send purchase confirmation email:', error);
        // Don't throw - email failure shouldn't break the purchase
      }
    })();

    return {
      transaction,
      investment: userInvestment,
      details: {
        marketplaceInvestment,
        quantity: quantity.toNumber(),
        unitPrice: purchasePrice.toNumber(),
        totalCost,
        fee: estimatedFee,
        totalAmount,
      },
    };
  }

  /**
   * Update portfolio totals
   * Note: This method is no longer used as portfolio totals are updated in the admin service
   * It is kept here for reference/future use
   */
  /*
  private async _updatePortfolioTotals(portfolioId: string): Promise<void> {
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
    const estimatedFee = totalProceeds.times(new Decimal(0.001)); // 0.1% fee
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
    const estimatedFee = totalProceeds.times(new Decimal(0.001)); // 0.1% fee
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
        currentPrice: input.currentPrice ? new Decimal(input.currentPrice) : new Decimal(0),
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
