import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { analyticsService } from '../services/analytics.service';

const router = Router();

/**
 * GET /api/analytics/dashboard-data
 * Get dashboard data
 */
router.get('/dashboard-data', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dashboardData = await analyticsService.getDashboardData(req.userId!);
    res.status(200).json(dashboardData);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/portfolio-performance
 * Get portfolio performance (all portfolios)
 */
router.get('/portfolio-performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const performances = await analyticsService.getAllPortfoliosPerformance(req.userId!);
    res.status(200).json(performances);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/portfolio-allocation
 * Get portfolio allocation (all portfolios)
 */
router.get('/portfolio-allocation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const allocation = await analyticsService.getAllPortfoliosAllocation(req.userId!);
    res.status(200).json(allocation);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/investment-performance
 * Get investment performance (all investments)
 */
router.get('/investment-performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const performances = await analyticsService.getAllInvestmentsPerformance(req.userId!);
    res.status(200).json(performances);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/transaction-stats
 * Get transaction statistics
 */
router.get('/transaction-stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await analyticsService.getTransactionStatistics(req.userId!);
    res.status(200).json(stats);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/dashboard
 * Get dashboard data (alias for dashboard-data)
 */
router.get('/dashboard', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dashboardData = await analyticsService.getDashboardData(req.userId!);
    res.status(200).json(dashboardData);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/portfolio/:id/performance
 * Get portfolio performance
 */
router.get('/portfolio/:id/performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const performance = await analyticsService.getPortfolioPerformance(
      req.userId!,
      req.params.id,
    );
    res.status(200).json({ success: true, data: performance });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/portfolios/performance
 * Get all portfolios performance
 */
router.get('/portfolios/performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const performances = await analyticsService.getAllPortfoliosPerformance(req.userId!);
    res.status(200).json({ success: true, data: performances });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/portfolio/:id/allocation
 * Get portfolio allocation
 */
router.get('/portfolio/:id/allocation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const allocation = await analyticsService.getPortfolioAllocation(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: allocation });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/investment/:id/performance
 * Get investment performance
 */
router.get(
  '/investment/:id/performance',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const performance = await analyticsService.getInvestmentPerformance(
        req.userId!,
        req.params.id,
      );
      res.status(200).json({ success: true, data: performance });
    } catch (error) {
      throw error;
    }
  },
);

/**
 * GET /api/analytics/summary
 * Get portfolio summary
 */
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const summary = await analyticsService.getPortfolioSummary(req.userId!);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/analytics/transactions/statistics
 * Get transaction statistics
 */
router.get(
  '/transactions/statistics',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const stats = await analyticsService.getTransactionStatistics(req.userId!);
      res.status(200).json({ success: true, data: stats });
    } catch (error) {
      throw error;
    }
  },
);

export default router;

