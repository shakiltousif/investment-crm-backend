import { prisma } from '../lib/prisma';
import { CreateInvestmentInput, UpdateInvestmentInput } from '../lib/validators';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';
import { Decimal } from '@prisma/client/runtime/library';

export class InvestmentService {
  async createInvestment(userId: string, data: CreateInvestmentInput) {
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

  async getInvestments(userId: string, portfolioId?: string) {
    const where: any = { userId };
    if (portfolioId) {
      where.portfolioId = portfolioId;
    }

    const investments = await prisma.investment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return investments;
  }

  async getInvestmentById(userId: string, investmentId: string) {
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
    data: UpdateInvestmentInput,
  ) {
    const investment = await this.getInvestmentById(userId, investmentId);

    // Recalculate totals if price or quantity changed
    let updateData: any = data;
    if (data.currentPrice || data.quantity) {
      const quantity = data.quantity || investment.quantity;
      const currentPrice = data.currentPrice || investment.currentPrice;

      const totalValue = quantity.times(currentPrice);
      const totalInvested = quantity.times(investment.purchasePrice);
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

  async deleteInvestment(userId: string, investmentId: string) {
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
    currentPrice: Decimal,
  ) {
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

  async getPortfolioPerformance(userId: string, portfolioId: string) {
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

  private async updatePortfolioTotals(portfolioId: string) {
    const investments = await prisma.investment.findMany({
      where: { portfolioId },
    });

    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const investment of investments) {
      totalValue = totalValue.plus(investment.totalValue);
      totalInvested = totalInvested.plus(
        investment.quantity.times(investment.purchasePrice),
      );
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

