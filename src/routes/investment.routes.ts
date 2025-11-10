import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { investmentService } from '../services/investment.service';
import { createInvestmentSchema, updateInvestmentSchema } from '../lib/validators';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

// Get all investments
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { portfolioId } = req.query;
    const investments = await investmentService.getInvestments(
      req.userId!,
      portfolioId as string | undefined
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

export default router;
