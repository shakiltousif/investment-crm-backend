import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { portfolioService } from '../services/portfolio.service';
import { createPortfolioSchema, updatePortfolioSchema } from '../lib/validators';

const router = Router();

// Get all portfolios
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const portfolios = await portfolioService.getPortfolios(req.userId!);
    res.status(200).json(portfolios);
  } catch (error) {
    throw error;
  }
});

// Get portfolio overview
router.get('/overview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const overview = await portfolioService.getPortfolioOverview(req.userId!);
    res.status(200).json(overview);
  } catch (error) {
    throw error;
  }
});

// Create portfolio
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createPortfolioSchema.parse(req.body);
    const portfolio = await portfolioService.createPortfolio(req.userId!, data);
    res.status(201).json(portfolio);
  } catch (error) {
    throw error;
  }
});

// Get portfolio by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const portfolio = await portfolioService.getPortfolioById(req.userId!, req.params.id);
    res.status(200).json(portfolio);
  } catch (error) {
    throw error;
  }
});

// Update portfolio
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = updatePortfolioSchema.parse(req.body);
    const portfolio = await portfolioService.updatePortfolio(req.userId!, req.params.id, data);
    res.status(200).json(portfolio);
  } catch (error) {
    throw error;
  }
});

// Delete portfolio
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await portfolioService.deletePortfolio(req.userId!, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    throw error;
  }
});

// Get portfolio allocation
router.get('/:id/allocation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const allocation = await portfolioService.getPortfolioAllocation(req.userId!, req.params.id);
    res.status(200).json(allocation);
  } catch (error) {
    throw error;
  }
});

// Get portfolio performance
router.get('/:id/performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const performance = await portfolioService.getPortfolioPerformance(req.userId!, req.params.id);
    res.status(200).json(performance);
  } catch (error) {
    throw error;
  }
});

// Rebalance portfolio
router.post('/:id/rebalance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { targetAllocation } = req.body;
    const plan = await portfolioService.rebalancePortfolio(req.userId!, req.params.id, targetAllocation);
    res.status(200).json(plan);
  } catch (error) {
    throw error;
  }
});

export default router;

