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
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'price', 'return', 'popularity']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
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
      limit ? parseInt(limit as string) : 10
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

/**
 * POST /api/marketplace/items
 * Create a new marketplace item
 */
router.post('/items', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { createMarketplaceItemSchema } = await import('../lib/validators');
    const input = createMarketplaceItemSchema.parse(req.body);
    const item = await marketplaceService.createMarketplaceItem(input);
    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('Create marketplace item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create marketplace item',
    });
  }
});

/**
 * PUT /api/marketplace/items/:id
 * Update a marketplace item
 */
router.put('/items/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { updateMarketplaceItemSchema } = await import('../lib/validators');
    const input = updateMarketplaceItemSchema.parse(req.body);
    const item = await marketplaceService.updateMarketplaceItem(req.params.id, input);
    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('Update marketplace item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update marketplace item',
    });
  }
});

/**
 * DELETE /api/marketplace/items/:id
 * Delete a marketplace item
 */
router.delete('/items/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await marketplaceService.deleteMarketplaceItem(req.params.id);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Delete marketplace item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete marketplace item',
    });
  }
});

/**
 * GET /api/marketplace/items/:id
 * Get marketplace item by ID
 */
router.get('/items/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await marketplaceService.getMarketplaceItemById(req.params.id);
    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('Get marketplace item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get marketplace item',
    });
  }
});

/**
 * POST /api/marketplace/update-prices
 * Update all marketplace item prices with live quotes
 */
router.post('/update-prices', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await marketplaceService.updatePricesWithLiveQuotes();
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Update prices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prices',
    });
  }
});

export default router;
