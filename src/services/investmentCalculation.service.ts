import { prisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';
import { marketplaceService } from './marketplace.service.js';
import { investmentService } from './investment.service.js';
import { logger } from '../config/logger.js';

export interface CalculationResult {
  success: boolean;
  marketplacePricesUpdated: number;
  investmentPricesSynced: number;
  fixedRateInvestmentsUpdated: number;
  portfoliosUpdated: number;
  errors: string[];
}

export class InvestmentCalculationService {
  /**
   * Calculate daily profits for all investments
   * This method:
   * 1. Updates marketplace prices with live quotes
   * 2. Syncs investment prices from marketplace
   * 3. Calculates interest accrual for fixed-rate investments
   * 4. Updates all portfolio totals
   */
  async calculateDailyProfits(): Promise<CalculationResult> {
    const result: CalculationResult = {
      success: true,
      marketplacePricesUpdated: 0,
      investmentPricesSynced: 0,
      fixedRateInvestmentsUpdated: 0,
      portfoliosUpdated: 0,
      errors: [],
    };

    try {
      logger.info('Starting daily profit calculation...');

      // Step 1: Update marketplace prices with live quotes
      try {
        logger.info('Updating marketplace prices with live quotes...');
        const marketplaceResult = await marketplaceService.updatePricesWithLiveQuotes();
        result.marketplacePricesUpdated = marketplaceResult.updated;
        result.errors.push(...marketplaceResult.errors);
        logger.info(`Updated ${marketplaceResult.updated} marketplace prices`);
      } catch (error) {
        const errorMsg = `Failed to update marketplace prices: ${error}`;
        logger.error(errorMsg);
        result.errors.push(errorMsg);
      }

      // Step 2: Sync investment prices from marketplace
      try {
        logger.info('Syncing investment prices from marketplace...');
        const syncResult = await investmentService.syncInvestmentPricesFromMarketplace();
        result.investmentPricesSynced = syncResult.updated;
        result.errors.push(...syncResult.errors);
        logger.info(`Synced ${syncResult.updated} investment prices`);
      } catch (error) {
        const errorMsg = `Failed to sync investment prices: ${error}`;
        logger.error(errorMsg);
        result.errors.push(errorMsg);
      }

      // Step 3: Calculate interest accrual for fixed-rate investments
      try {
        logger.info('Calculating interest accrual for fixed-rate investments...');
        const fixedRateResult = await this.calculateFixedRateInterest();
        result.fixedRateInvestmentsUpdated = fixedRateResult.updated;
        result.errors.push(...fixedRateResult.errors);
        logger.info(`Updated ${fixedRateResult.updated} fixed-rate investments`);
      } catch (error) {
        const errorMsg = `Failed to calculate fixed-rate interest: ${error}`;
        logger.error(errorMsg);
        result.errors.push(errorMsg);
      }

      // Step 4: Update all portfolio totals
      try {
        logger.info('Updating portfolio totals...');
        const portfolioResult = await this.updateAllPortfolioTotals();
        result.portfoliosUpdated = portfolioResult.updated;
        result.errors.push(...portfolioResult.errors);
        logger.info(`Updated ${portfolioResult.updated} portfolios`);
      } catch (error) {
        const errorMsg = `Failed to update portfolio totals: ${error}`;
        logger.error(errorMsg);
        result.errors.push(errorMsg);
      }

      if (result.errors.length > 0) {
        result.success = false;
        logger.warn(`Daily profit calculation completed with ${result.errors.length} errors`);
      } else {
        logger.info('Daily profit calculation completed successfully');
      }

      return result;
    } catch (error) {
      const errorMsg = `Fatal error in daily profit calculation: ${error}`;
      logger.error(errorMsg);
      result.success = false;
      result.errors.push(errorMsg);
      return result;
    }
  }

  /**
   * Calculate interest accrual for fixed-rate investments
   * Handles: BOND, CORPORATE_BOND, TERM_DEPOSIT, FIXED_RATE_DEPOSIT
   */
  private async calculateFixedRateInterest(): Promise<{
    updated: number;
    errors: string[];
  }> {
    const fixedRateTypes: Array<'BOND' | 'CORPORATE_BOND' | 'TERM_DEPOSIT' | 'FIXED_RATE_DEPOSIT'> = ['BOND', 'CORPORATE_BOND', 'TERM_DEPOSIT', 'FIXED_RATE_DEPOSIT'];
    const errors: string[] = [];
    let updated = 0;

    try {
      // Get all active fixed-rate investments
      const investments = await prisma.investment.findMany({
        where: {
          type: {
            in: fixedRateTypes as any,
          },
          status: 'ACTIVE',
          interestRate: { not: null },
        },
      });

      if (investments.length === 0) {
        logger.info('No fixed-rate investments found');
        return { updated: 0, errors: [] };
      }

      const today = new Date();
      const portfolioIdsToUpdate = new Set<string>();

      for (const investment of investments) {
        try {
          if (!investment.interestRate || !investment.purchaseDate) {
            continue;
          }

          // Calculate current price with accrued interest using helper method
          const purchaseDate = new Date(investment.purchaseDate);
          const currentPrice = investmentService.calculateFixedRateInterest(
            investment.purchasePrice,
            investment.interestRate,
            purchaseDate,
            today
          );

          // Recalculate total value, gain, and gain percentage
          const totalValue = investment.quantity.times(currentPrice);
          const totalInvested = investment.quantity.times(investment.purchasePrice);
          const totalGain = totalValue.minus(totalInvested);
          const gainPercentage = totalInvested.isZero()
            ? new Decimal(0)
            : totalGain.dividedBy(totalInvested).times(100);

          // Only update if price has changed (to avoid unnecessary database writes)
          if (!investment.currentPrice.equals(currentPrice)) {
            await prisma.investment.update({
              where: { id: investment.id },
              data: {
                currentPrice,
                totalValue,
                totalGain,
                gainPercentage,
              },
            });

            portfolioIdsToUpdate.add(investment.portfolioId);
            updated++;
          }
        } catch (error) {
          const errorMsg = `Failed to calculate interest for investment ${investment.id}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Update portfolio totals for affected portfolios
      for (const portfolioId of portfolioIdsToUpdate) {
        try {
          await investmentService.updatePortfolioTotals(portfolioId);
        } catch (error) {
          const errorMsg = `Failed to update portfolio ${portfolioId}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return { updated, errors };
    } catch (error) {
      const errorMsg = `Error calculating fixed-rate interest: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      return { updated, errors };
    }
  }

  /**
   * Update totals for all portfolios
   */
  private async updateAllPortfolioTotals(): Promise<{
    updated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let updated = 0;

    try {
      const portfolios = await prisma.portfolio.findMany({
        select: { id: true },
      });

      for (const portfolio of portfolios) {
        try {
          await investmentService.updatePortfolioTotals(portfolio.id);
          updated++;
        } catch (error) {
          const errorMsg = `Failed to update portfolio ${portfolio.id}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return { updated, errors };
    } catch (error) {
      const errorMsg = `Error updating portfolio totals: ${error}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
      return { updated, errors };
    }
  }
}

export const investmentCalculationService = new InvestmentCalculationService();

