import { prisma } from '../lib/prisma.js';
import { CreatePortfolioInput, UpdatePortfolioInput } from '../lib/validators.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { Decimal } from '@prisma/client/runtime/library';
import { investmentService } from './investment.service.js';

export class PortfolioService {
  async createPortfolio(userId: string, data: CreatePortfolioInput): Promise<unknown> {
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

  async getPortfolios(userId: string): Promise<Array<unknown>> {
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

  async getPortfolioOverview(userId: string): Promise<{
    totalPortfolios: number;
    totalValue: number;
    totalInvested: number;
    totalGain: number;
    gainPercentage: number;
    portfolios: Array<{
      id: string;
      name: string;
      value: number;
      invested: number;
      gain: number;
    }>;
  }> {
    try {
      const portfolios = await prisma.portfolio.findMany({
        where: { userId },
        include: {
          investments: {
            where: {
              status: 'ACTIVE', // Only include ACTIVE investments
            },
          },
        },
      });

      // Calculate values on-demand for real-time accuracy
      // This ensures dashboard shows current values even if daily cron job hasn't run yet
      const totalValue = portfolios.reduce((sum, portfolio) => {
        const portfolioValue = portfolio.investments.reduce((pSum, investment) => {
          // Use on-demand calculation for fixed-rate investments to get real-time values
          const fixedRateTypes: Array<'BOND' | 'CORPORATE_BOND' | 'TERM_DEPOSIT' | 'FIXED_RATE_DEPOSIT'> = [
            'BOND',
            'CORPORATE_BOND',
            'TERM_DEPOSIT',
            'FIXED_RATE_DEPOSIT',
          ];
          
          if (
            fixedRateTypes.includes(investment.type as any) &&
            investment.interestRate &&
            investment.purchaseDate
          ) {
            // Calculate on-demand for real-time accuracy
            const calculated = investmentService.calculateInvestmentValueOnDemand(investment);
            return pSum + Number(calculated.totalValue);
          } else {
            // For other investments, use stored totalValue or calculate
            const value = investment.totalValue
              ? Number(investment.totalValue)
              : Number(investment.currentPrice || 0) * Number(investment.quantity || 0);
            return pSum + value;
          }
        }, 0);
        return sum + portfolioValue;
      }, 0);

      const totalInvested = portfolios.reduce((sum, portfolio) => {
        const portfolioInvested = portfolio.investments.reduce((pSum, investment) => {
          // Calculate invested amount from purchase price
          const price = Number(investment.purchasePrice) || 0;
          const qty = Number(investment.quantity) || 0;
          return pSum + price * qty;
        }, 0);
        return sum + portfolioInvested;
      }, 0);

      // Calculate total gain using on-demand calculation for accuracy
      const totalGain = portfolios.reduce((sum, portfolio) => {
        const portfolioGain = portfolio.investments.reduce((pSum, investment) => {
          const fixedRateTypes: Array<'BOND' | 'CORPORATE_BOND' | 'TERM_DEPOSIT' | 'FIXED_RATE_DEPOSIT'> = [
            'BOND',
            'CORPORATE_BOND',
            'TERM_DEPOSIT',
            'FIXED_RATE_DEPOSIT',
          ];
          
          if (
            fixedRateTypes.includes(investment.type as any) &&
            investment.interestRate &&
            investment.purchaseDate
          ) {
            // Calculate on-demand for real-time accuracy
            const calculated = investmentService.calculateInvestmentValueOnDemand(investment);
            return pSum + Number(calculated.totalGain);
          } else {
            // For other investments, use stored totalGain or calculate
            const gain = investment.totalGain
              ? Number(investment.totalGain)
              : (Number(investment.currentPrice || 0) - Number(investment.purchasePrice || 0)) * Number(investment.quantity || 0);
            return pSum + gain;
          }
        }, 0);
        return sum + portfolioGain;
      }, 0);

      const gainPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

      return {
        totalPortfolios: portfolios.length,
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
        portfolios: portfolios.map((portfolio) => {
          // Filter to only ACTIVE investments
          const activeInvestments = portfolio.investments.filter((inv) => inv.status === 'ACTIVE');
          
          const fixedRateTypes: Array<'BOND' | 'CORPORATE_BOND' | 'TERM_DEPOSIT' | 'FIXED_RATE_DEPOSIT'> = [
            'BOND',
            'CORPORATE_BOND',
            'TERM_DEPOSIT',
            'FIXED_RATE_DEPOSIT',
          ];
          
          // Calculate portfolio value using on-demand calculation for real-time accuracy
          const portfolioValue = activeInvestments.reduce((sum, inv) => {
            if (
              fixedRateTypes.includes(inv.type as any) &&
              inv.interestRate &&
              inv.purchaseDate
            ) {
              // Calculate on-demand for fixed-rate investments
              const calculated = investmentService.calculateInvestmentValueOnDemand(inv);
              return sum + Number(calculated.totalValue);
            } else {
              // For other investments, use stored totalValue or calculate
              const value = inv.totalValue
                ? Number(inv.totalValue)
                : Number(inv.currentPrice || 0) * Number(inv.quantity || 0);
              return sum + value;
            }
          }, 0);
          
          const portfolioInvested = activeInvestments.reduce((sum, inv) => {
            const price = Number(inv.purchasePrice) || 0;
            const qty = Number(inv.quantity) || 0;
            return sum + price * qty;
          }, 0);
          
          // Calculate portfolio gain using on-demand calculation
          const portfolioGain = activeInvestments.reduce((sum, inv) => {
            if (
              fixedRateTypes.includes(inv.type as any) &&
              inv.interestRate &&
              inv.purchaseDate
            ) {
              // Calculate on-demand for fixed-rate investments
              const calculated = investmentService.calculateInvestmentValueOnDemand(inv);
              return sum + Number(calculated.totalGain);
            } else {
              // For other investments, use stored totalGain or calculate
              const gain = inv.totalGain
                ? Number(inv.totalGain)
                : (Number(inv.currentPrice || 0) - Number(inv.purchasePrice || 0)) * Number(inv.quantity || 0);
              return sum + gain;
            }
          }, 0);
          
          return {
            id: portfolio.id,
            name: portfolio.name,
            value: portfolioValue,
            invested: portfolioInvested,
            gain: portfolioGain,
          };
        }),
      };
    } catch (error: unknown) {
      // Check if it's a database connection error
      if (error instanceof Error && error.message?.includes("Can't reach database server")) {
        throw new Error(
          'Database connection failed. Please ensure PostgreSQL is running on localhost:5432'
        );
      }
      throw error;
    }
  }

  async getPortfolioById(
    userId: string,
    portfolioId: string
  ): Promise<{
    id: string;
    userId: string;
    name: string;
    description: string | null;
    totalValue: Decimal;
    totalInvested: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    investments: Array<unknown>;
  }> {
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

  async updatePortfolio(
    userId: string,
    portfolioId: string,
    data: UpdatePortfolioInput
  ): Promise<unknown> {
    await this.getPortfolioById(userId, portfolioId);

    // Prepare update data with proper Decimal conversion
    const updateData: Record<string, unknown> = {};

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

  async deletePortfolio(userId: string, portfolioId: string): Promise<{ message: string }> {
    await this.getPortfolioById(userId, portfolioId);

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

  async getPortfolioAllocation(
    userId: string,
    portfolioId: string
  ): Promise<{
    portfolioId: string;
    totalValue: Decimal;
    allocation: Array<{
      id: string;
      name: string;
      type: string;
      value: Decimal;
      percentage: Decimal;
    }>;
  }> {
    await this.getPortfolioById(userId, portfolioId);

    // Only get ACTIVE investments
    const investments = await prisma.investment.findMany({
      where: {
        portfolioId,
        status: 'ACTIVE', // Only include ACTIVE investments
      },
    });

    // Calculate total value from ACTIVE investments only
    const activeTotalValue = investments.reduce((sum, inv) => {
      return sum.plus(inv.totalValue);
    }, new Decimal(0));

    const allocation = investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      value: inv.totalValue,
      percentage: activeTotalValue.isZero()
        ? new Decimal(0)
        : inv.totalValue.dividedBy(activeTotalValue).times(100),
    }));

    return {
      portfolioId,
      totalValue: activeTotalValue, // Use calculated total from ACTIVE investments
      allocation,
    };
  }

  async getPortfolioPerformance(
    userId: string,
    portfolioId: string
  ): Promise<{
    portfolio: unknown;
    performanceByType: Record<
      string,
      {
        count: number;
        totalValue: Decimal;
        totalGain: Decimal;
      }
    >;
    summary: {
      totalValue: Decimal;
      totalInvested: Decimal;
      totalGain: Decimal;
      gainPercentage: Decimal;
      investmentCount: number;
    };
  }> {
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    const performanceByType: Record<
      string,
      {
        count: number;
        totalValue: Decimal;
        totalGain: Decimal;
      }
    > = {};

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
  ): Promise<
    Array<{
      type: string;
      currentValue: Decimal;
      targetValue: Decimal;
      difference: Decimal;
      action: string;
    }>
  > {
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
