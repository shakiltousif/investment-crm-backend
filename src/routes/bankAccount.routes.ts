import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { bankAccountService } from '../services/bankAccount.service';
import { createBankAccountSchema, updateBankAccountSchema } from '../lib/validators';

const router = Router();

// Get all bank accounts
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await bankAccountService.getBankAccounts(req.userId!);
    res.status(200).json(accounts);
  } catch (error) {
    throw error;
  }
});

// Create bank account
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createBankAccountSchema.parse(req.body);
    const account = await bankAccountService.createBankAccount(req.userId!, data);
    res.status(201).json(account);
  } catch (error) {
    throw error;
  }
});

// Get bank account by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const account = await bankAccountService.getBankAccountById(req.userId!, req.params.id);
    res.status(200).json(account);
  } catch (error) {
    throw error;
  }
});

// Update bank account
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateBankAccountSchema.parse(req.body);
    const account = await bankAccountService.updateBankAccount(req.userId!, req.params.id, data);
    res.status(200).json(account);
  } catch (error) {
    throw error;
  }
});

// Delete bank account
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await bankAccountService.deleteBankAccount(req.userId!, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    throw error;
  }
});

// Set primary account
router.post('/:id/set-primary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const account = await bankAccountService.setPrimaryAccount(req.userId!, req.params.id);
    res.status(200).json(account);
  } catch (error) {
    throw error;
  }
});

// Verify bank account
router.post('/:id/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const account = await bankAccountService.verifyBankAccount(req.userId!, req.params.id);
    res.status(200).json(account);
  } catch (error) {
    throw error;
  }
});

// Get account balance
router.get('/:id/balance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const balance = await bankAccountService.getAccountBalance(req.userId!, req.params.id);
    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    throw error;
  }
});

// Get account transactions
router.get('/:id/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const transactions = await bankAccountService.getAccountTransactions(
      req.userId!,
      req.params.id
    );
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    throw error;
  }
});

export default router;
