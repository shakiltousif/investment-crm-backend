import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { portfolioService } from '../services/portfolio.service';
import { createPortfolioSchema, updatePortfolioSchema } from '../lib/validators';

const router = Router();

// Get all portfolios
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const portfolios = await portfolioService.getPortfolios(req.userId!);
    res.status(200).json(portfolios);
  } catch (error) {
    next(error);
  }
});

// Get portfolio overview
router.get(
  '/overview',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const overview = await portfolioService.getPortfolioOverview(req.userId!);
      res.status(200).json(overview);
    } catch (error) {
      next(error);
    }
  }
);

// Create portfolio
router.post('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = createPortfolioSchema.parse(req.body);
    const portfolio = await portfolioService.createPortfolio(req.userId!, data);
    res.status(201).json(portfolio);
  } catch (error) {
    next(error);
  }
});

// Get portfolio by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const portfolio = await portfolioService.getPortfolioById(req.userId!, req.params.id);
    res.status(200).json(portfolio);
  } catch (error) {
    next(error);
  }
});

// Update portfolio
router.put('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = updatePortfolioSchema.parse(req.body);
    const portfolio = await portfolioService.updatePortfolio(req.userId!, req.params.id, data);
    res.status(200).json(portfolio);
  } catch (error) {
    next(error);
  }
});

// Delete portfolio
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await portfolioService.deletePortfolio(req.userId!, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// Get portfolio allocation
router.get(
  '/:id/allocation',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const allocation = await portfolioService.getPortfolioAllocation(req.userId!, req.params.id);
      res.status(200).json(allocation);
    } catch (error) {
      next(error);
    }
  }
);

// Get portfolio performance
router.get(
  '/:id/performance',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const performance = await portfolioService.getPortfolioPerformance(
        req.userId!,
        req.params.id
      );
      res.status(200).json(performance);
    } catch (error) {
      next(error);
    }
  }
);

// Rebalance portfolio
router.post(
  '/:id/rebalance',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { targetAllocation } = req.body;
      const plan = await portfolioService.rebalancePortfolio(
        req.userId!,
        req.params.id,
        targetAllocation
      );
      res.status(200).json(plan);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
