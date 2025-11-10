import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { transactionService } from '../services/transaction.service';
import { createTransactionSchema } from '../lib/validators';

const router = Router();

// Get all transactions
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      type: req.query.type,
      status: req.query.status,
      bankAccountId: req.query.bankAccountId,
      investmentId: req.query.investmentId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
    };
    const transactions = await transactionService.getTransactions(req.userId!, filters);
    res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    throw error;
  }
});

// Create transaction
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createTransactionSchema.parse(req.body);
    const transaction = await transactionService.createTransaction(req.userId!, data);
    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    throw error;
  }
});

// Get transaction by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await transactionService.getTransactionById(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    throw error;
  }
});

// Approve transaction
router.post('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await transactionService.approveTransaction(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    throw error;
  }
});

// Complete transaction
router.post('/:id/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await transactionService.completeTransaction(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    throw error;
  }
});

// Reject transaction
router.post('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await transactionService.rejectTransaction(req.userId!, req.params.id);
    res.status(200).json({ success: true, data: transaction });
  } catch (error) {
    throw error;
  }
});

// Get transaction summary
router.get('/summary/all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const summary = await transactionService.getTransactionSummary(req.userId!);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    throw error;
  }
});

export default router;
