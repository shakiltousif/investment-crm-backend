import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { quotesService } from '../services/quotes.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const getQuoteSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
});

const getQuotesSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1, 'At least one symbol is required'),
});

const searchSymbolsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
});

/**
 * GET /api/quotes/:symbol
 * Get live quote for a single symbol
 */
router.get('/:symbol', async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = getQuoteSchema.parse({ symbol: req.params.symbol });
    const quote = await quotesService.getQuote(symbol);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: `No quote data available for ${symbol}`,
      });
    }

    res.status(200).json({
      success: true,
      data: quote,
    });
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote',
    });
  }
});

/**
 * POST /api/quotes/batch
 * Get live quotes for multiple symbols
 */
router.post('/batch', async (req: AuthRequest, res: Response) => {
  try {
    const { symbols } = getQuotesSchema.parse(req.body);
    const quotes = await quotesService.getQuotes(symbols);

    res.status(200).json({
      success: true,
      data: Object.fromEntries(quotes),
    });
  } catch (error) {
    console.error('Get quotes batch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes',
    });
  }
});

/**
 * GET /api/quotes/search/:query
 * Search for symbols by name
 */
router.get('/search/:query', async (req: AuthRequest, res: Response) => {
  try {
    const { query } = searchSymbolsSchema.parse({ query: req.params.query });
    const results = await quotesService.searchSymbols(query);

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Search symbols error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search symbols',
    });
  }
});

/**
 * GET /api/quotes/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = quotesService.getCacheStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get cache stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache stats',
    });
  }
});

/**
 * DELETE /api/quotes/cache
 * Clear quote cache
 */
router.delete('/cache', async (req: AuthRequest, res: Response) => {
  try {
    quotesService.clearCache();

    res.status(200).json({
      success: true,
      message: 'Cache cleared successfully',
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
    });
  }
});

export default router;
