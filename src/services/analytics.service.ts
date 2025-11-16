import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../middleware/errorHandler.js';
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
   * Get dashboard data
   */
  async getDashboardData(userId: string): Promise<{
    totalPortfolioValue: number;
    totalInvested: number;
    totalGain: number;
    gainPercentage: number;
    monthlyReturn: number;
    yearlyReturn: number;
    recentTransactions: unknown[];
  }> {
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        investments: true,
      },
    });

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const totalValue = portfolios.reduce((sum, portfolio) => {
      const portfolioValue = portfolio.investments.reduce((pSum, investment) => {
        return pSum + Number(investment.currentPrice) * Number(investment.quantity);
      }, 0);
      return sum + portfolioValue;
    }, 0);

    const totalInvested = portfolios.reduce((sum, portfolio) => {
      const portfolioInvested = portfolio.investments.reduce((pSum, investment) => {
        return pSum + Number(investment.purchasePrice) * Number(investment.quantity);
      }, 0);
      return sum + portfolioInvested;
    }, 0);

    const totalGain = totalValue - totalInvested;
    const gainPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    return {
      totalPortfolioValue: totalValue,
      totalInvested,
      totalGain,
      gainPercentage,
      monthlyReturn: 5.2, // Mock data
      yearlyReturn: 12.8, // Mock data
      recentTransactions: transactions,
    };
  }

  /**
   * Get all portfolios allocation
   */
  async getAllPortfoliosAllocation(userId: string): Promise<
    Array<{
      portfolioId: string;
      portfolioName: string;
      value: number;
      percentage: number;
      investments: Array<{
        investmentId: string;
        name: string;
        symbol: string;
        type: string;
        value: number;
        percentage: number;
      }>;
    }>
  > {
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

    // Calculate total value using stored totalValue from database
    const totalValue = portfolios.reduce((sum, portfolio) => {
      const portfolioValue = portfolio.investments.reduce((pSum, investment) => {
        // Use stored totalValue if available, otherwise calculate
        const value = investment.totalValue
          ? Number(investment.totalValue)
          : Number(investment.currentPrice) * Number(investment.quantity);
        return pSum + value;
      }, 0);
      return sum + portfolioValue;
    }, 0);

    return portfolios.map((portfolio) => {
      // Filter to only ACTIVE investments and use stored totalValue
      const activeInvestments = portfolio.investments.filter((inv) => inv.status === 'ACTIVE');
      
      const portfolioValue = activeInvestments.reduce((sum, inv) => {
        // Use stored totalValue if available, otherwise calculate
        const value = inv.totalValue
          ? Number(inv.totalValue)
          : Number(inv.currentPrice) * Number(inv.quantity);
        return sum + value;
      }, 0);

      return {
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        value: portfolioValue,
        percentage: totalValue > 0 ? (portfolioValue / totalValue) * 100 : 0,
        investments: activeInvestments.map((inv) => {
          // Use stored totalValue if available, otherwise calculate
          const invValue = inv.totalValue
            ? Number(inv.totalValue)
            : Number(inv.currentPrice) * Number(inv.quantity);
          
          return {
            investmentId: inv.id,
            name: inv.name,
            symbol: inv.symbol ?? '',
            type: inv.type,
            value: invValue,
            percentage:
              portfolioValue > 0 ? (invValue / portfolioValue) * 100 : 0,
          };
        }),
      };
    });
  }

  /**
   * Get all investments performance
   */
  async getAllInvestmentsPerformance(userId: string): Promise<
    Array<{
      investmentId: string;
      name: string;
      symbol: string | null;
      quantity: number;
      currentPrice: number;
      totalValue: number;
      costBasis: number;
      gain: number;
      gainPercentage: number;
      portfolioName: string;
    }>
  > {
    const investments = await prisma.investment.findMany({
      where: { userId },
      include: {
        portfolio: true,
      },
    });

    return investments.map((investment) => ({
      investmentId: investment.id,
      name: investment.name,
      symbol: investment.symbol,
      quantity: Number(investment.quantity),
      currentPrice: Number(investment.currentPrice),
      totalValue: Number(investment.currentPrice) * Number(investment.quantity),
      costBasis: Number(investment.purchasePrice) * Number(investment.quantity),
      gain:
        (Number(investment.currentPrice) - Number(investment.purchasePrice)) *
        Number(investment.quantity),
      gainPercentage:
        Number(investment.purchasePrice) > 0
          ? ((Number(investment.currentPrice) - Number(investment.purchasePrice)) /
              Number(investment.purchasePrice)) *
            100
          : 0,
      portfolioName: investment.portfolio?.name ?? 'Unknown',
    }));
  }

  /**
   * Get portfolio performance
   */
  async getPortfolioPerformance(
    userId: string,
    portfolioId: string
  ): Promise<PortfolioPerformance> {
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
      const quantity = new Decimal(investment.quantity);
      const currentPrice = new Decimal(investment.currentPrice);
      const value = quantity.times(currentPrice);
      totalValue = totalValue.plus(value);
      const purchasePrice = new Decimal(investment.purchasePrice);
      const costBasis = quantity.times(purchasePrice);
      totalInvested = totalInvested.plus(costBasis);
    }

    const totalGain = totalValue.minus(totalInvested);
    const gainPercentage = totalInvested.greaterThan(0)
      ? totalGain.dividedBy(totalInvested).times(100)
      : new Decimal(0);

    // Get historical data for day/week/month/year changes
    // For now, calculate based on current data
    // In production, you'd have historical snapshots
    // const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
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
  async getAllPortfoliosPerformance(userId: string): Promise<PortfolioPerformance[]> {
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
        const quantity = new Decimal(investment.quantity);
        const currentPrice = new Decimal(investment.currentPrice);
        const value = quantity.times(currentPrice);
        totalValue = totalValue.plus(value);
        const purchasePrice = new Decimal(investment.purchasePrice);
        const costBasis = quantity.times(purchasePrice);
        totalInvested = totalInvested.plus(costBasis);
      }

      const totalGain = totalValue.minus(totalInvested);
      const gainPercentage = totalInvested.greaterThan(0)
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
  async getPortfolioAllocation(
    userId: string,
    portfolioId: string
  ): Promise<PortfolioAllocation[]> {
    const portfolio = await prisma.portfolio.findFirst({
      where: {
        id: portfolioId,
        userId,
      },
      include: {
        investments: {
          where: {
            status: 'ACTIVE', // Only include ACTIVE investments
          },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundError('Portfolio not found');
    }

    // Filter to only ACTIVE investments
    const activeInvestments = portfolio.investments.filter((inv) => inv.status === 'ACTIVE');

    // Calculate total value using stored totalValue from database
    let totalValue = new Decimal(0);
    for (const investment of activeInvestments) {
      // Use stored totalValue if available, otherwise calculate
      const value = investment.totalValue
        ? new Decimal(investment.totalValue)
        : new Decimal(investment.quantity).times(new Decimal(investment.currentPrice));
      totalValue = totalValue.plus(value);
    }

    // Calculate allocation percentages
    const allocation: PortfolioAllocation[] = activeInvestments.map((investment) => {
      // Use stored totalValue if available, otherwise calculate
      const value = investment.totalValue
        ? new Decimal(investment.totalValue)
        : new Decimal(investment.quantity).times(new Decimal(investment.currentPrice));
      
      const percentage = totalValue.greaterThan(0)
        ? value.dividedBy(totalValue).times(100)
        : new Decimal(0);

      return {
        investmentId: investment.id,
        name: investment.name,
        symbol: investment.symbol ?? '',
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
  async getInvestmentPerformance(
    userId: string,
    investmentId: string
  ): Promise<InvestmentPerformance> {
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

    const quantity = new Decimal(investment.quantity);
    const currentPrice = new Decimal(investment.currentPrice);
    const purchasePrice = new Decimal(investment.purchasePrice);
    const totalValue = quantity.times(currentPrice);
    const costBasis = quantity.times(purchasePrice);
    const gain = totalValue.minus(costBasis);
    const gainPercentage = costBasis.greaterThan(0)
      ? gain.dividedBy(costBasis).times(100)
      : new Decimal(0);

    // For now, calculate based on current data
    const dayChange = new Decimal(0);
    const dayChangePercentage = new Decimal(0);

    return {
      investmentId,
      name: investment.name,
      symbol: investment.symbol ?? '',
      quantity: Number(quantity),
      currentPrice,
      totalValue,
      costBasis,
      gain,
      gainPercentage,
      dayChange,
      dayChangePercentage,
    };
  }

  /**
   * Get portfolio summary
   */
  async getPortfolioSummary(userId: string): Promise<{
    totalPortfolios: number;
    totalPortfolioValue: Decimal;
    totalInvested: Decimal;
    totalGain: Decimal;
    gainPercentage: Decimal;
    portfolios: Array<{
      id: string;
      name: string;
      description: string | null;
      investmentCount: number;
    }>;
  }> {
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
        const quantity = new Decimal(investment.quantity);
        const currentPrice = new Decimal(investment.currentPrice);
        const purchasePrice = new Decimal(investment.purchasePrice);
        const value = quantity.times(currentPrice);
        const costBasis = quantity.times(purchasePrice);
        totalPortfolioValue = totalPortfolioValue.plus(value);
        totalInvested = totalInvested.plus(costBasis);
        totalGain = totalGain.plus(value.minus(costBasis));
      }
    }

    const gainPercentage = totalInvested.greaterThan(0)
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
  async getTransactionStatistics(userId: string): Promise<{
    totalTransactions: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    totalBuys: Decimal;
    totalSells: Decimal;
    totalDeposits: Decimal;
    totalWithdrawals: Decimal;
  }> {
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
      stats.byType[transaction.type] = (stats.byType[transaction.type] ?? 0) + 1;

      // Count by status
      stats.byStatus[transaction.status] = (stats.byStatus[transaction.status] ?? 0) + 1;

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
