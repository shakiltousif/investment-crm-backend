import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.js';
import { investmentService } from '../services/investment.service.js';
import { investmentCalculationService } from '../services/investmentCalculation.service.js';
import { createInvestmentSchema, updateInvestmentSchema } from '../lib/validators.js';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

// Get all investments
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { portfolioId, status } = req.query;
    const investments = await investmentService.getInvestments(
      req.userId!,
      portfolioId as string | undefined,
      status as string | undefined
    );
    res.status(200).json(investments);
  } catch (error) {
    throw error;
  }
});

// Create investment
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createInvestmentSchema.parse(req.body);
    const investment = await investmentService.createInvestment(req.userId!, data);
    res.status(201).json(investment);
  } catch (error) {
    throw error;
  }
});

// Get investment by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const investment = await investmentService.getInvestmentById(req.userId!, req.params.id);
    res.status(200).json(investment);
  } catch (error) {
    throw error;
  }
});

// Update investment
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateInvestmentSchema.parse(req.body);
    const investment = await investmentService.updateInvestment(req.userId!, req.params.id, data);
    res.status(200).json(investment);
  } catch (error) {
    throw error;
  }
});

// Delete investment
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await investmentService.deleteInvestment(req.userId!, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    throw error;
  }
});

// Update investment price
router.patch('/:id/price', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPrice } = req.body;
    const investment = await investmentService.updateInvestmentPrice(
      req.userId!,
      req.params.id,
      new Decimal(currentPrice)
    );
    res.status(200).json(investment);
  } catch (error) {
    throw error;
  }
});

// Get portfolio performance
router.get('/:id/performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const performance = await investmentService.getPortfolioPerformance(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: performance });
  } catch (error) {
    throw error;
  }
});

// Sync investment prices from marketplace (admin only)
router.post('/sync-prices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is admin
    const { prisma } = await import('../lib/prisma.js');
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await investmentService.syncInvestmentPricesFromMarketplace();
    return res.status(200).json({
      message: 'Investment prices synced successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

// Manually trigger daily profit calculation (admin only)
router.post('/calculate-profits', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await investmentCalculationService.calculateDailyProfits();
    return res.status(200).json({
      success: result.success,
      message: 'Profit calculation completed',
      data: {
        marketplacePricesUpdated: result.marketplacePricesUpdated,
        investmentPricesSynced: result.investmentPricesSynced,
        fixedRateInvestmentsUpdated: result.fixedRateInvestmentsUpdated,
        portfoliosUpdated: result.portfoliosUpdated,
        errors: result.errors,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate profits',
      error: (error as Error).message,
    });
  }
});

export default router;
