import cron from 'node-cron';
import { investmentCalculationService } from '../services/investmentCalculation.service.js';
import { logger } from '../config/logger.js';

/**
 * Initialize the daily profit calculation cron job
 * Default schedule: Daily at 4:30 PM (16:30) - configurable via PROFIT_CALCULATION_SCHEDULE env var
 * Cron format: "minute hour day month weekday"
 * Example: "30 16 * * *" = 4:30 PM every day
 */
export function initializeInvestmentCalculationJob(): void {
  // Get schedule from environment variable or use default (4:30 PM daily)
  const schedule = process.env.PROFIT_CALCULATION_SCHEDULE || '30 16 * * *';

  logger.info(`Initializing investment calculation job with schedule: ${schedule}`);

  // Validate cron expression
  if (!cron.validate(schedule)) {
    logger.error(`Invalid cron schedule: ${schedule}. Using default: 30 16 * * *`);
    return;
  }

  // Create and start the cron job
  const job = cron.schedule(
    schedule,
    async () => {
      try {
        logger.info('Starting scheduled daily profit calculation...');
        const startTime = Date.now();

        const result = await investmentCalculationService.calculateDailyProfits();

        const duration = Date.now() - startTime;
        logger.info(
          `Scheduled profit calculation completed in ${duration}ms. ` +
            `Marketplace: ${result.marketplacePricesUpdated}, ` +
            `Investments: ${result.investmentPricesSynced}, ` +
            `Fixed-rate: ${result.fixedRateInvestmentsUpdated}, ` +
            `Portfolios: ${result.portfoliosUpdated}, ` +
            `Errors: ${result.errors.length}`
        );

        if (result.errors.length > 0) {
          logger.warn('Profit calculation completed with errors:', result.errors);
        }
      } catch (error) {
        logger.error('Fatal error in scheduled profit calculation:', error);
      }
    },
    {
      timezone: process.env.TZ || 'UTC',
    }
  );

  // Start the job
  job.start();
  logger.info('Investment calculation cron job started successfully');

  // Handle process termination
  process.on('SIGTERM', () => {
    logger.info('Stopping investment calculation cron job...');
    job.stop();
  });

  process.on('SIGINT', () => {
    logger.info('Stopping investment calculation cron job...');
    job.stop();
  });
}
