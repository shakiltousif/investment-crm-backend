import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { marketplaceService } from '../services/marketplace.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const buyInvestmentSchema = z.object({
  investmentId: z.string().min(1, 'Investment ID is required'),
  quantity: z.number().positive('Quantity must be positive'),
  portfolioId: z.string().min(1, 'Portfolio ID is required'),
});

const sellInvestmentSchema = z.object({
  investmentId: z.string().min(1, 'Investment ID is required'),
  quantity: z.number().positive('Quantity must be positive'),
});

const marketplaceFiltersSchema = z.object({
  type: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'price', 'return', 'popularity']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

/**
 * GET /api/marketplace
 * Get available investments with filters
 */
router.get('/', async (req, res: Response) => {
  try {
    const filters = marketplaceFiltersSchema.parse(req.query);
    const result = await marketplaceService.getAvailableInvestments(filters);
    res.status(200).json(result);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/marketplace/search
 * Search investments
 */
router.get('/search', async (req, res: Response) => {
  try {
    const { q, limit } = req.query;
    if (!q) {
      throw new Error('Search query is required');
    }
    const results = await marketplaceService.searchInvestments(
      q as string,
      limit ? parseInt(limit as string) : 10,
    );
    res.status(200).json(results);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/marketplace/compare
 * Compare investments
 */
router.get('/compare', async (req, res: Response) => {
  try {
    const { ids } = req.query;
    if (!ids) {
      throw new Error('Investment IDs are required');
    }
    const investmentIds = Array.isArray(ids) ? ids : [ids];
    const results = await marketplaceService.compareInvestments(investmentIds as string[]);
    res.status(200).json(results);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/marketplace/:id
 * Get investment details
 */
router.get('/:id', async (req, res: Response) => {
  try {
    const investment = await marketplaceService.getInvestmentDetails(req.params.id);
    res.status(200).json(investment);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/marketplace/buy/preview
 * Preview buy transaction
 */
router.post('/buy/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = buyInvestmentSchema.parse(req.body);
    const preview = await marketplaceService.previewBuyTransaction(req.userId!, data);
    res.status(200).json(preview);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/marketplace/buy
 * Execute buy transaction
 */
router.post('/buy', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = buyInvestmentSchema.parse(req.body);
    const result = await marketplaceService.buyInvestment(req.userId!, data);
    res.status(201).json(result);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/marketplace/sell/preview
 * Preview sell transaction
 */
router.post('/sell/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = sellInvestmentSchema.parse(req.body);
    const preview = await marketplaceService.previewSellTransaction(req.userId!, data);
    res.status(200).json(preview);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/marketplace/sell
 * Execute sell transaction
 */
router.post('/sell', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = sellInvestmentSchema.parse(req.body);
    const result = await marketplaceService.sellInvestment(req.userId!, data);
    res.status(201).json(result);
  } catch (error) {
    throw error;
  }
});

export default router;

