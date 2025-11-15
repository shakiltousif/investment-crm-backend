import { prisma } from '../lib/prisma.js';
import { CreateInvestmentInput, UpdateInvestmentInput } from '../lib/validators.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { Decimal } from '@prisma/client/runtime/library';

export class InvestmentService {
  async createInvestment(userId: string, data: CreateInvestmentInput): Promise<unknown> {
    // Verify portfolio exists and belongs to user
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: data.portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    // Calculate total value and gain
    const totalValue = new Decimal(data.quantity).times(data.currentPrice);
    const totalInvested = new Decimal(data.quantity).times(data.purchasePrice);
    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.isZero()
      ? new Decimal(0)
      : totalGain.dividedBy(totalInvested).times(100);

    const investment = await prisma.investment.create({
      data: {
        userId,
        portfolioId: data.portfolioId,
        type: data.type,
        name: data.name,
        symbol: data.symbol,
        quantity: data.quantity,
        purchasePrice: data.purchasePrice,
        currentPrice: data.currentPrice,
        totalValue,
        totalGain,
        gainPercentage,
        purchaseDate: data.purchaseDate,
        maturityDate: data.maturityDate,
        interestRate: data.interestRate,
      },
    });

    // Update portfolio totals
    await this.updatePortfolioTotals(data.portfolioId);

    return investment;
  }

  async getInvestments(userId: string, portfolioId?: string): Promise<Array<unknown>> {
    const where: Record<string, unknown> = { userId };
    if (portfolioId) {
      where.portfolioId = portfolioId;
    }

    const investments = await prisma.investment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return investments;
  }

  async getInvestmentById(
    userId: string,
    investmentId: string
  ): Promise<{
    id: string;
    userId: string;
    portfolioId: string;
    type: string;
    name: string;
    symbol: string | null;
    quantity: Decimal;
    purchasePrice: Decimal;
    currentPrice: Decimal;
    totalValue: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    purchaseDate: Date;
    maturityDate: Date | null;
    interestRate: Decimal | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const investment = await prisma.investment.findFirst({
      where: {
        id: investmentId,
        userId,
      },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    return investment;
  }

  async updateInvestment(
    userId: string,
    investmentId: string,
    data: UpdateInvestmentInput
  ): Promise<unknown> {
    const investment = await this.getInvestmentById(userId, investmentId);

    // Recalculate totals if price or quantity changed
    let updateData: Record<string, unknown> = data;
    if (data.currentPrice || data.quantity) {
      const quantity = data.quantity ?? investment.quantity;
      const currentPrice = data.currentPrice ?? investment.currentPrice;

      const totalValue = new Decimal(quantity).times(currentPrice);
      const totalInvested = new Decimal(quantity).times(investment.purchasePrice);
      const totalGain = totalValue.minus(totalInvested);
      const gainPercentage = totalInvested.isZero()
        ? new Decimal(0)
        : totalGain.dividedBy(totalInvested).times(100);

      updateData = {
        ...data,
        totalValue,
        totalGain,
        gainPercentage,
      };
    }

    const updatedInvestment = await prisma.investment.update({
      where: { id: investmentId },
      data: updateData,
    });

    // Update portfolio totals
    await this.updatePortfolioTotals(investment.portfolioId);

    return updatedInvestment;
  }

  async deleteInvestment(userId: string, investmentId: string): Promise<{ message: string }> {
    const investment = await this.getInvestmentById(userId, investmentId);

    await prisma.investment.delete({
      where: { id: investmentId },
    });

    // Update portfolio totals
    await this.updatePortfolioTotals(investment.portfolioId);

    return { message: 'Investment deleted successfully' };
  }

  async updateInvestmentPrice(
    userId: string,
    investmentId: string,
    currentPrice: Decimal
  ): Promise<unknown> {
    const investment = await this.getInvestmentById(userId, investmentId);

    const totalValue = investment.quantity.times(currentPrice);
    const totalInvested = investment.quantity.times(investment.purchasePrice);
    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.isZero()
      ? new Decimal(0)
      : totalGain.dividedBy(totalInvested).times(100);

    const updatedInvestment = await prisma.investment.update({
      where: { id: investmentId },
      data: {
        currentPrice,
        totalValue,
        totalGain,
        gainPercentage,
      },
    });

    // Update portfolio totals
    await this.updatePortfolioTotals(investment.portfolioId);

    return updatedInvestment;
  }

  async getPortfolioPerformance(
    userId: string,
    portfolioId: string
  ): Promise<{
    portfolio: unknown;
    investments: Array<unknown>;
    summary: {
      totalValue: Decimal;
      totalInvested: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
      investmentCount: number;
    };
  }> {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    const investments = await prisma.investment.findMany({
      where: {
        portfolioId,
        userId,
      },
    });

    return {
      portfolio,
      investments,
      summary: {
        totalValue: portfolio.totalValue,
        totalInvested: portfolio.totalInvested,
        totalGain: portfolio.totalGain,
        gainPercentage: portfolio.gainPercentage,
        investmentCount: investments.length,
      },
    };
  }

  /**
   * Sync investment prices from marketplace and recalculate gains
   * This updates all user investments that have symbols matching marketplace items
   */
  async syncInvestmentPricesFromMarketplace(): Promise<{
    updated: number;
    errors: string[];
  }> {
    try {
      // Get all investments with symbols
      const investments = await prisma.investment.findMany({
        where: {
          symbol: { not: null },
          status: 'ACTIVE',
        },
        include: {
          portfolio: true,
        },
      });

      if (investments.length === 0) {
        return { updated: 0, errors: [] };
      }

      // Get unique symbols
      const symbols = [
        ...new Set(investments.map((inv) => inv.symbol).filter((s): s is string => s !== null)),
      ];

      // Get marketplace prices for these symbols
      const marketplaceItems = await prisma.marketplaceItem.findMany({
        where: {
          symbol: { in: symbols },
          isAvailable: true,
        },
      });

      // Create a map of symbol to marketplace price
      const priceMap = new Map<string, Decimal>();
      for (const item of marketplaceItems) {
        if (item.symbol) {
          priceMap.set(item.symbol, item.currentPrice);
        }
      }

      let updated = 0;
      const errors: string[] = [];
      const portfolioIdsToUpdate = new Set<string>();

      // Update each investment with matching marketplace price
      for (const investment of investments) {
        if (!investment.symbol) {
          continue;
        }

        const newPrice = priceMap.get(investment.symbol);
        if (!newPrice) {
          continue; // No marketplace price available
        }

        // Only update if price has changed
        if (investment.currentPrice.equals(newPrice)) {
          continue;
        }

        try {
          // Recalculate gains
          const totalValue = investment.quantity.times(newPrice);
          const totalInvested = investment.quantity.times(investment.purchasePrice);
          const totalGain = totalValue.minus(totalInvested);
          const gainPercentage = totalInvested.isZero()
            ? new Decimal(0)
            : totalGain.dividedBy(totalInvested).times(100);

          await prisma.investment.update({
            where: { id: investment.id },
            data: {
              currentPrice: newPrice,
              totalValue,
              totalGain,
              gainPercentage,
            },
          });

          portfolioIdsToUpdate.add(investment.portfolioId);
          updated++;
        } catch (error) {
          errors.push(`Failed to update investment ${investment.id}: ${error}`);
        }
      }

      // Update portfolio totals for all affected portfolios
      for (const portfolioId of portfolioIdsToUpdate) {
        try {
          await this.updatePortfolioTotals(portfolioId);
        } catch (error) {
          errors.push(`Failed to update portfolio ${portfolioId}: ${error}`);
        }
      }

      return { updated, errors };
    } catch (error) {
      console.error('Error syncing investment prices:', error);
      throw new Error('Failed to sync investment prices');
    }
  }

  private async updatePortfolioTotals(portfolioId: string): Promise<void> {
    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const investment of investments) {
      totalValue = totalValue.plus(investment.totalValue);
      totalInvested = totalInvested.plus(investment.quantity.times(investment.purchasePrice));
    }

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
}

export const investmentService = new InvestmentService();
