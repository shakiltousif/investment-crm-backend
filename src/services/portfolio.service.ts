import { prisma } from '../lib/prisma';
import { CreatePortfolioInput, UpdatePortfolioInput } from '../lib/validators';
import { NotFoundError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

export class PortfolioService {
  async createPortfolio(userId: string, data: CreatePortfolioInput) {
    const portfolio = await prisma.portfolio.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        isActive: data.isActive ?? true,
        totalValue: data.totalValue ? new Decimal(data.totalValue) : new Decimal(0),
        totalInvested: data.totalInvested ? new Decimal(data.totalInvested) : new Decimal(0),
        totalGain: data.totalGain ? new Decimal(data.totalGain) : new Decimal(0),
        gainPercentage: data.gainPercentage ? new Decimal(data.gainPercentage) : new Decimal(0),
      },
    });

    return portfolio;
  }

  async getPortfolios(userId: string) {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        investments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return portfolios.map((portfolio) => ({
      ...portfolio,
      totalValue: Number(portfolio.totalValue || 0),
      totalInvested: Number(portfolio.totalInvested || 0),
      totalGain: Number(portfolio.totalGain || 0),
      gainPercentage: Number(portfolio.gainPercentage || 0),
    }));
  }

  async getPortfolioOverview(userId: string) {
    try {
      const portfolios = await prisma.portfolio.findMany({
        where: { userId },
        include: {
          investments: true,
        },
      });

      const totalValue = portfolios.reduce((sum, portfolio) => {
        const portfolioValue = portfolio.investments.reduce((pSum, investment) => {
          const price = Number(investment.currentPrice) || 0;
          const qty = Number(investment.quantity) || 0;
          return pSum + price * qty;
        }, 0);
        return sum + portfolioValue;
      }, 0);

      const totalInvested = portfolios.reduce((sum, portfolio) => {
        const portfolioInvested = portfolio.investments.reduce((pSum, investment) => {
          const price = Number(investment.purchasePrice) || 0;
          const qty = Number(investment.quantity) || 0;
          return pSum + price * qty;
        }, 0);
        return sum + portfolioInvested;
      }, 0);

      const totalGain = totalValue - totalInvested;
      const gainPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

      return {
        totalPortfolios: portfolios.length,
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
        portfolios: portfolios.map((portfolio) => ({
          id: portfolio.id,
          name: portfolio.name,
          value: portfolio.investments.reduce((sum, inv) => {
            const price = Number(inv.currentPrice) || 0;
            const qty = Number(inv.quantity) || 0;
            return sum + price * qty;
          }, 0),
          invested: portfolio.investments.reduce((sum, inv) => {
            const price = Number(inv.purchasePrice) || 0;
            const qty = Number(inv.quantity) || 0;
            return sum + price * qty;
          }, 0),
          gain: portfolio.investments.reduce((sum, inv) => {
            const currentPrice = Number(inv.currentPrice) || 0;
            const purchasePrice = Number(inv.purchasePrice) || 0;
            const qty = Number(inv.quantity) || 0;
            return sum + (currentPrice - purchasePrice) * qty;
          }, 0),
        })),
      };
    } catch (error: any) {
      // Check if it's a database connection error
      if (error.message?.includes("Can't reach database server")) {
        throw new Error(
          'Database connection failed. Please ensure PostgreSQL is running on localhost:5432'
        );
      }
      throw error;
    }
  }

  async getPortfolioById(userId: string, portfolioId: string) {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
      include: {
        investments: true,
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    return portfolio;
  }

  async updatePortfolio(userId: string, portfolioId: string, data: UpdatePortfolioInput) {
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    // Prepare update data with proper Decimal conversion
    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    if (data.totalValue !== undefined) {
      updateData.totalValue = new Decimal(data.totalValue);
    }
    if (data.totalInvested !== undefined) {
      updateData.totalInvested = new Decimal(data.totalInvested);
    }
    if (data.totalGain !== undefined) {
      updateData.totalGain = new Decimal(data.totalGain);
    }
    if (data.gainPercentage !== undefined) {
      updateData.gainPercentage = new Decimal(data.gainPercentage);
    }

    const updatedPortfolio = await prisma.portfolio.update({
      where: { id: portfolioId },
      data: updateData,
      include: {
        investments: true,
      },
    });

    return updatedPortfolio;
  }

  async deletePortfolio(userId: string, portfolioId: string) {
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    // Check if portfolio has investments
    const investmentCount = await prisma.investment.count({
      where: { portfolioId },
    });

    if (investmentCount > 0) {
      throw new Error('Cannot delete portfolio with active investments');
    }

    await prisma.portfolio.delete({
      where: { id: portfolioId },
    });

    return { message: 'Portfolio deleted successfully' };
  }

  async getPortfolioAllocation(userId: string, portfolioId: string) {
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    const allocation = investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      value: inv.totalValue,
      percentage: portfolio.totalValue.isZero()
        ? new Decimal(0)
        : inv.totalValue.dividedBy(portfolio.totalValue).times(100),
    }));

    return {
      portfolioId,
      totalValue: portfolio.totalValue,
      allocation,
    };
  }

  async getPortfolioPerformance(userId: string, portfolioId: string) {
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    const performanceByType: any = {};

    for (const investment of investments) {
      if (!performanceByType[investment.type]) {
        performanceByType[investment.type] = {
          count: 0,
          totalValue: new Decimal(0),
          totalGain: new Decimal(0),
        };
      }

      performanceByType[investment.type].count += 1;
      performanceByType[investment.type].totalValue = performanceByType[
        investment.type
      ].totalValue.plus(investment.totalValue);
      performanceByType[investment.type].totalGain = performanceByType[
        investment.type
      ].totalGain.plus(investment.totalGain);
    }

    return {
      portfolio,
      performanceByType,
      summary: {
        totalValue: portfolio.totalValue,
        totalInvested: portfolio.totalInvested,
        totalGain: portfolio.totalGain,
        gainPercentage: portfolio.gainPercentage,
        investmentCount: investments.length,
      },
    };
  }

  async rebalancePortfolio(
    userId: string,
    portfolioId: string,
    targetAllocation: Record<string, number>
  ) {
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    const rebalancingPlan = [];

    for (const [type, targetPercentage] of Object.entries(targetAllocation)) {
      const currentInvestments = investments.filter((inv) => inv.type === type);
      const currentValue = currentInvestments.reduce(
        (sum, inv) => sum.plus(inv.totalValue),
        new Decimal(0)
      );

      const targetValue = portfolio.totalValue.times(targetPercentage).dividedBy(100);
      const difference = targetValue.minus(currentValue);

      rebalancingPlan.push({
        type,
        currentValue,
        targetValue,
        difference,
        action: difference.isPositive() ? 'BUY' : 'SELL',
      });
    }

    return rebalancingPlan;
  }
}

export const portfolioService = new PortfolioService();
