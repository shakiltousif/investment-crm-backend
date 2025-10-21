import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { depositService } from '../services/deposit.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createDepositSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().min(1, 'Currency is required'),
  bankAccountId: z.string().min(1, 'Bank account ID is required'),
  transferMethod: z.enum(['CHAPS', 'FPS', 'SWIFT']),
  description: z.string().optional(),
});

const depositFiltersSchema = z.object({
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
 * GET /api/deposits
 * Get all deposits
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = depositFiltersSchema.parse(req.query);
    const result = await depositService.getDeposits(req.userId!, filters);
    res.status(200).json(result);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/deposits
 * Create deposit request
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createDepositSchema.parse(req.body);
    const result = await depositService.createDeposit(req.userId!, data);
    res.status(201).json(result);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/deposits/:id
 * Get deposit by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deposit = await depositService.getDepositById(req.userId!, req.params.id);
    res.status(200).json(deposit);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/deposits/:id/approve
 * Approve deposit
 */
router.post('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deposit = await depositService.approveDeposit(req.userId!, req.params.id);
    res.status(200).json(deposit);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/deposits/:id/complete
 * Complete deposit
 */
router.post('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const deposit = await depositService.completeDeposit(req.userId!, req.params.id);
    res.status(200).json(deposit);
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/deposits/:id/reject
 * Reject deposit
 */
router.post('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const deposit = await depositService.rejectDeposit(req.userId!, req.params.id, reason);
    res.status(200).json(deposit);
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/deposits/summary/all
 * Get deposit summary
 */
router.get('/summary/all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const summary = await depositService.getDepositSummary(req.userId!);
    res.status(200).json(summary);
  } catch (error) {
    throw error;
  }
});

export default router;

