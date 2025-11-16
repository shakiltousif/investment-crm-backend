import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../middleware/errorHandler.js';

export interface PortfolioReportData {
  userId: string;
  userName: string;
  userEmail: string;
  reportDate: Date;
  startDate?: Date;
  endDate?: Date;
  portfolios: Array<{
    id: string;
    name: string;
    totalValue: number;
    totalInvested: number;
    totalGain: number;
    gainPercentage: number;
    investments: Array<{
      id: string;
      name: string;
      symbol?: string;
      type: string;
      quantity: number;
      purchasePrice: number;
      currentPrice: number;
      totalValue: number;
      totalGain: number;
      gainPercentage: number;
      purchaseDate: Date;
      maturityDate?: Date;
    }>;
  }>;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: Date;
  }>;
  summary: {
    totalPortfolioValue: number;
    totalInvested: number;
    totalGain: number;
    gainPercentage: number;
    totalDeposits: number;
    totalWithdrawals: number;
    netCashFlow: number;
  };
}

export class ReportService {
  /**
   * Generate portfolio report data
   */
  async generatePortfolioReportData(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<PortfolioReportData> {
    // Get user information
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get portfolios with investments
    const portfolios = await prisma.portfolio.findMany({
      where: { userId },
      include: {
        investments: {
          orderBy: { purchaseDate: 'desc' },
        },
      },
    });

    // Get transactions within date range
    const transactionWhere: Record<string, unknown> = { userId };
    if (startDate || endDate) {
      const createdAtFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        createdAtFilter.gte = startDate;
      }
      if (endDate) {
        createdAtFilter.lte = endDate;
      }
      transactionWhere.createdAt = createdAtFilter;
    }

    const transactions = await prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to recent transactions
    });

    // Calculate portfolio data using stored values from database
    const portfolioData = portfolios.map((portfolio) => {
      const investments = portfolio.investments.map((inv) => {
        // Use stored values from database (more accurate, especially for fixed-rate investments)
        // Fallback to manual calculation if stored values are missing
        const storedTotalValue = inv.totalValue ? Number(inv.totalValue) : null;
        const storedTotalGain = inv.totalGain ? Number(inv.totalGain) : null;
        const storedGainPercentage = inv.gainPercentage ? Number(inv.gainPercentage) : null;

        // Manual calculation as fallback
        const calculatedTotalValue = Number(inv.currentPrice) * Number(inv.quantity);
        const calculatedTotalGain = (Number(inv.currentPrice) - Number(inv.purchasePrice)) * Number(inv.quantity);
        const calculatedGainPercentage =
          Number(inv.purchasePrice) > 0
            ? ((Number(inv.currentPrice) - Number(inv.purchasePrice)) / Number(inv.purchasePrice)) * 100
            : 0;

        return {
          id: inv.id,
          name: inv.name,
          symbol: inv.symbol,
          type: inv.type,
          quantity: Number(inv.quantity),
          purchasePrice: Number(inv.purchasePrice),
          currentPrice: Number(inv.currentPrice),
          totalValue: storedTotalValue ?? calculatedTotalValue,
          totalGain: storedTotalGain ?? calculatedTotalGain,
          gainPercentage: storedGainPercentage ?? calculatedGainPercentage,
          purchaseDate: inv.purchaseDate,
          maturityDate: inv.maturityDate ?? undefined,
        };
      });

      // Calculate portfolio totals from investment values
      const totalValue = investments.reduce((sum, inv) => sum + inv.totalValue, 0);
      const totalInvested = investments.reduce(
        (sum, inv) => sum + inv.purchasePrice * inv.quantity,
        0
      );
      const totalGain = investments.reduce((sum, inv) => sum + inv.totalGain, 0);
      const gainPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

      return {
        id: portfolio.id,
        name: portfolio.name,
        totalValue,
        totalInvested,
        totalGain,
        gainPercentage,
        investments,
      };
    });

    // Calculate summary
    const totalPortfolioValue = portfolioData.reduce((sum, p) => sum + p.totalValue, 0);
    const totalInvested = portfolioData.reduce((sum, p) => sum + p.totalInvested, 0);
    const totalGain = totalPortfolioValue - totalInvested;
    const gainPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    // Include only COMPLETED transactions (APPROVED is not a valid TransactionStatus)
    const deposits = transactions.filter(
      (t) => t.type === 'DEPOSIT' && t.status === 'COMPLETED'
    );
    const withdrawals = transactions.filter(
      (t) => t.type === 'WITHDRAWAL' && t.status === 'COMPLETED'
    );
    const totalDeposits = deposits.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, t) => sum + Number(t.amount), 0);

    // Log calculation values for debugging
    console.log('[Report Service] Calculation Summary:', {
      portfoliosCount: portfolioData.length,
      totalPortfolioValue,
      totalInvested,
      totalGain,
      gainPercentage: `${gainPercentage.toFixed(2)}%`,
      depositsCount: deposits.length,
      withdrawalsCount: withdrawals.length,
      totalDeposits,
      totalWithdrawals,
      netCashFlow: totalDeposits - totalWithdrawals,
    });

    // Validate values are not null/undefined
    const validatedSummary = {
      totalPortfolioValue: totalPortfolioValue || 0,
      totalInvested: totalInvested || 0,
      totalGain: totalGain || 0,
      gainPercentage: gainPercentage || 0,
      totalDeposits: totalDeposits || 0,
      totalWithdrawals: totalWithdrawals || 0,
      netCashFlow: (totalDeposits || 0) - (totalWithdrawals || 0),
    };

    return {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      reportDate: new Date(),
      startDate,
      endDate,
      portfolios: (portfolioData as any[]).map((p: any) => ({
          ...p,
          investments: (p.investments || []).map((i: any) => ({
            id: i.id,
            name: i.name,
            symbol: i.symbol ?? undefined,
            type: i.type,
            quantity: Number(i.quantity),
            purchasePrice: i.purchasePrice,
            currentPrice: i.currentPrice,
            totalValue: i.totalValue,
            totalGain: i.totalGain,
            gainPercentage: i.gainPercentage,
            purchaseDate: i.purchaseDate,
            maturityDate: i.maturityDate,
          })),
        })
      ),
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency: t.currency,
        status: t.status,
        createdAt: t.createdAt,
      })),
      summary: validatedSummary,
    };
  }

  /**
   * Generate CSV report
   */
  generateCSVReport(data: PortfolioReportData): string {
    const lines: string[] = [];

    // Header
    lines.push('FIL LIMITED - Portfolio Report');
    lines.push(`Generated: ${data.reportDate.toLocaleDateString()}`);
    lines.push(`Client: ${data.userName} (${data.userEmail})`);
    if (data.startDate && data.endDate) {
      lines.push(
        `Period: ${data.startDate.toLocaleDateString()} to ${data.endDate.toLocaleDateString()}`
      );
    }
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push(`Total Portfolio Value,${data.summary.totalPortfolioValue.toFixed(2)}`);
    lines.push(`Total Invested,${data.summary.totalInvested.toFixed(2)}`);
    lines.push(`Total Gain/Loss,${data.summary.totalGain.toFixed(2)}`);
    lines.push(`Gain Percentage,${data.summary.gainPercentage.toFixed(2)}%`);
    lines.push(`Total Deposits,${data.summary.totalDeposits.toFixed(2)}`);
    lines.push(`Total Withdrawals,${data.summary.totalWithdrawals.toFixed(2)}`);
    lines.push(`Net Cash Flow,${data.summary.netCashFlow.toFixed(2)}`);
    lines.push('');

    // Portfolios
    data.portfolios.forEach((portfolio) => {
      lines.push(`PORTFOLIO: ${portfolio.name}`);
      lines.push(
        'Investment Name,Symbol,Type,Quantity,Purchase Price,Current Price,Total Value,Total Gain,Gain %'
      );
      portfolio.investments.forEach((inv) => {
        lines.push(
          `${inv.name},${inv.symbol ?? ''},${inv.type},${inv.quantity},${inv.purchasePrice.toFixed(2)},${inv.currentPrice.toFixed(2)},${inv.totalValue.toFixed(2)},${inv.totalGain.toFixed(2)},${inv.gainPercentage.toFixed(2)}%`
        );
      });
      lines.push(
        `Portfolio Total,,,${portfolio.totalInvested.toFixed(2)},,${portfolio.totalValue.toFixed(2)},${portfolio.totalGain.toFixed(2)},${portfolio.gainPercentage.toFixed(2)}%`
      );
      lines.push('');
    });

    // Recent Transactions
    if (data.transactions.length > 0) {
      lines.push('RECENT TRANSACTIONS');
      lines.push('Date,Type,Amount,Currency,Status');
      data.transactions.forEach((t) => {
        lines.push(
          `${t.createdAt.toLocaleDateString()},${t.type},${t.amount.toFixed(2)},${t.currency},${t.status}`
        );
      });
    }

    return lines.join('\n');
  }
}

export const reportService = new ReportService();
