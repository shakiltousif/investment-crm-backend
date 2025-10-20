import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { withdrawalService } from '../services/withdrawal.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createWithdrawalSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  bankAccountId: z.string().min(1, 'Bank account ID is required'),
  description: z.string().optional(),
});

const withdrawalFiltersSchema = z.object({
  status: z.string().optional(),
  currency: z.string().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

/**
 * GET /api/withdrawals
 * Get all withdrawals
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = withdrawalFiltersSchema.parse(req.query);
    const result = await withdrawalService.getWithdrawals(req.userId!, filters);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/withdrawals
 * Create withdrawal request
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createWithdrawalSchema.parse(req.body);
    const result = await withdrawalService.createWithdrawal(req.userId!, data);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/withdrawals/:id
 * Get withdrawal by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const withdrawal = await withdrawalService.getWithdrawalById(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: withdrawal });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/withdrawals/:id/approve
 * Approve withdrawal
 */
router.post('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const withdrawal = await withdrawalService.approveWithdrawal(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: withdrawal });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/withdrawals/:id/complete
 * Complete withdrawal
 */
router.post('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const withdrawal = await withdrawalService.completeWithdrawal(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: withdrawal });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/withdrawals/:id/reject
 * Reject withdrawal
 */
router.post('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const withdrawal = await withdrawalService.rejectWithdrawal(req.userId!, req.params.id, reason);
    res.status(200).json({ success: true, data: withdrawal });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/withdrawals/summary/all
 * Get withdrawal summary
 */
router.get('/summary/all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const summary = await withdrawalService.getWithdrawalSummary(req.userId!);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    throw error;
  }
});

export default router;

