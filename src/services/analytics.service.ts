import { prisma } from '../lib/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

export interface PortfolioPerformance {
  portfolioId: string;
  portfolioName: string;
  totalValue: Decimal;
  totalInvested: Decimal;
  totalGain: Decimal;
  gainPercentage: Decimal;
  dayChange: Decimal;
  dayChangePercentage: Decimal;
  weekChange: Decimal;
  monthChange: Decimal;
  yearChange: Decimal;
}

export interface InvestmentPerformance {
  investmentId: string;
  name: string;
  symbol: string;
  quantity: number;
  currentPrice: Decimal;
  totalValue: Decimal;
  costBasis: Decimal;
  gain: Decimal;
  gainPercentage: Decimal;
  dayChange: Decimal;
  dayChangePercentage: Decimal;
}

export interface PortfolioAllocation {
  investmentId: string;
  name: string;
  symbol: string;
  type: string;
  value: Decimal;
  percentage: Decimal;
}

export class AnalyticsService {
  /**
   * Get portfolio performance
   */
  async getPortfolioPerformance(userId: string, portfolioId: string) {
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

    // Calculate totals
    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const investment of portfolio.investments) {
      const value = investment.quantity * investment.currentPrice;
      totalValue = totalValue.plus(value);
      totalInvested = totalInvested.plus(investment.costBasis);
    }

    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage =
      totalInvested.greaterThan(0) ? totalGain.dividedBy(totalInvested).times(100) : new Decimal(0);

    // Get historical data for day/week/month/year changes
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    // For now, calculate based on current data
    // In production, you'd have historical snapshots
    const dayChange = new Decimal(0);
    const dayChangePercentage = new Decimal(0);
    const weekChange = new Decimal(0);
    const monthChange = new Decimal(0);
    const yearChange = new Decimal(0);

    return {
      portfolioId,
      portfolioName: portfolio.name,
      totalValue,
      totalInvested,
      totalGain,
      gainPercentage,
      dayChange,
      dayChangePercentage,
      weekChange,
      monthChange,
      yearChange,
    };
  }

  /**
   * Get all portfolios performance
   */
  async getAllPortfoliosPerformance(userId: string) {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        investments: true,
      },
    });

    const performances: PortfolioPerformance[] = [];

    for (const portfolio of portfolios) {
      let totalValue = new Decimal(0);
      let totalInvested = new Decimal(0);

      for (const investment of portfolio.investments) {
        const value = investment.quantity * investment.currentPrice;
        totalValue = totalValue.plus(value);
        totalInvested = totalInvested.plus(investment.costBasis);
      }

      const totalGain = totalValue.minus(totalInvested);
      const gainPercentage =
        totalInvested.greaterThan(0)
          ? totalGain.dividedBy(totalInvested).times(100)
          : new Decimal(0);

      performances.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
        dayChange: new Decimal(0),
        dayChangePercentage: new Decimal(0),
        weekChange: new Decimal(0),
        monthChange: new Decimal(0),
        yearChange: new Decimal(0),
      });
    }

    return performances;
  }

  /**
   * Get portfolio allocation
   */
  async getPortfolioAllocation(userId: string, portfolioId: string) {
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

    // Calculate total value
    let totalValue = new Decimal(0);
    for (const investment of portfolio.investments) {
      const value = investment.quantity * investment.currentPrice;
      totalValue = totalValue.plus(value);
    }

    // Calculate allocation percentages
    const allocation: PortfolioAllocation[] = portfolio.investments.map((investment) => {
      const value = investment.quantity * investment.currentPrice;
      const percentage =
        totalValue.greaterThan(0) ? value.dividedBy(totalValue).times(100) : new Decimal(0);

      return {
        investmentId: investment.id,
        name: investment.name,
        symbol: investment.symbol,
        type: investment.type,
        value,
        percentage,
      };
    });

    return allocation;
  }

  /**
   * Get investment performance
   */
  async getInvestmentPerformance(userId: string, investmentId: string) {
    const investment = await prisma.investment.findFirst({
      where: {
        id: investmentId,
        portfolio: {
          userId,
        },
      },
      include: {
        portfolio: true,
      },
    });

    if (!investment) {
      throw new NotFoundError('Investment not found');
    }

    const totalValue = investment.quantity * investment.currentPrice;
    const gain = totalValue.minus(investment.costBasis);
    const gainPercentage =
      investment.costBasis.greaterThan(0)
        ? gain.dividedBy(investment.costBasis).times(100)
        : new Decimal(0);

    // For now, calculate based on current data
    const dayChange = new Decimal(0);
    const dayChangePercentage = new Decimal(0);

    return {
      investmentId,
      name: investment.name,
      symbol: investment.symbol,
      quantity: investment.quantity,
      currentPrice: investment.currentPrice,
      totalValue,
      costBasis: investment.costBasis,
      gain,
      gainPercentage,
      dayChange,
      dayChangePercentage,
    };
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(userId: string) {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        investments: true,
      },
    });

    let totalPortfolioValue = new Decimal(0);
    let totalInvested = new Decimal(0);
    let totalGain = new Decimal(0);

    for (const portfolio of portfolios) {
      for (const investment of portfolio.investments) {
        const value = investment.quantity * investment.currentPrice;
        totalPortfolioValue = totalPortfolioValue.plus(value);
        totalInvested = totalInvested.plus(investment.costBasis);
        totalGain = totalGain.plus(value.minus(investment.costBasis));
      }
    }

    const gainPercentage =
      totalInvested.greaterThan(0)
        ? totalGain.dividedBy(totalInvested).times(100)
        : new Decimal(0);

    return {
      totalPortfolios: portfolios.length,
      totalPortfolioValue,
      totalInvested,
      totalGain,
      gainPercentage,
      portfolios: portfolios.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        investmentCount: p.investments.length,
      })),
    };
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStatistics(userId: string) {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
    });

    const stats = {
      totalTransactions: transactions.length,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      totalBuys: new Decimal(0),
      totalSells: new Decimal(0),
      totalDeposits: new Decimal(0),
      totalWithdrawals: new Decimal(0),
    };

    for (const transaction of transactions) {
      // Count by type
      stats.byType[transaction.type] = (stats.byType[transaction.type] || 0) + 1;

      // Count by status
      stats.byStatus[transaction.status] = (stats.byStatus[transaction.status] || 0) + 1;

      // Sum by type
      if (transaction.type === 'BUY') {
        stats.totalBuys = stats.totalBuys.plus(transaction.amount);
      } else if (transaction.type === 'SELL') {
        stats.totalSells = stats.totalSells.plus(transaction.amount);
      } else if (transaction.type === 'DEPOSIT') {
        stats.totalDeposits = stats.totalDeposits.plus(transaction.amount);
      } else if (transaction.type === 'WITHDRAWAL') {
        stats.totalWithdrawals = stats.totalWithdrawals.plus(transaction.amount);
      }
    }

    return stats;
  }
}

export const analyticsService = new AnalyticsService();

