import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { adminService } from '../services/admin.service';
import { z } from 'zod';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/dashboard
 * Get admin dashboard statistics
 */
router.get('/dashboard', async (_req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const stats = await adminService.getDashboardStats();
    return res.status(200).json({
      message: 'Dashboard stats retrieved successfully',
      data: stats,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/users
 * Get all users with filters
 */
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string | undefined,
      role: req.query.role as string | undefined,
      isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getUsers(filters);
    res.status(200).json({
      message: 'Users retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/users/:id
 * Get user by ID
 */
router.get('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.status(200).json({
      message: 'User retrieved successfully',
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/users
 * Create new user
 */
router.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8).optional(), // Optional - will generate if not provided
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phoneNumber: z.string().optional(),
      role: z.enum(['CLIENT', 'ADMIN']).optional(),
      sendCredentialsEmail: z.boolean().optional(), // Whether to send email with credentials
    });

    const validatedData = schema.parse(req.body);
    const user = await adminService.createUser(validatedData);

    res.status(201).json({
      message: 'User created successfully',
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user
 */
router.put('/users/:id', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    // Prevent admin from changing their own role or deactivating themselves
    if (req.userId === req.params.id) {
      if (req.body.role !== undefined && req.body.role !== 'ADMIN') {
        return res.status(400).json({
          message: 'You cannot change your own role',
          error: 'SELF_ROLE_CHANGE_NOT_ALLOWED',
        });
      }
      if (req.body.isActive !== undefined && req.body.isActive === false) {
        return res.status(400).json({
          message: 'You cannot deactivate your own account',
          error: 'SELF_DEACTIVATION_NOT_ALLOWED',
        });
      }
    }

    const schema = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      phoneNumber: z.string().optional(),
      role: z.enum(['CLIENT', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const user = await adminService.updateUser(req.params.id, validatedData);

    return res.status(200).json({
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user
 */
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Prevent admin from deleting themselves
    if (req.userId === req.params.id) {
      return res.status(400).json({
        message: 'You cannot delete your own account',
        error: 'SELF_DELETE_NOT_ALLOWED',
      });
    }

    const result = await adminService.deleteUser(req.params.id);

    return res.status(200).json({
      message: 'User deleted successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/deposits/pending
 * Get pending deposits
 */
router.get('/deposits/pending', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getPendingDeposits(filters);
    res.status(200).json({
      message: 'Pending deposits retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/withdrawals/pending
 * Get pending withdrawals
 */
router.get('/withdrawals/pending', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getPendingWithdrawals(filters);
    res.status(200).json({
      message: 'Pending withdrawals retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/transactions/:id/approve
 * Approve transaction
 */
router.post('/transactions/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await adminService.updateTransactionStatus(
      req.params.id,
      'COMPLETED',
      req.body.notes
    );

    res.status(200).json({
      message: 'Transaction approved successfully',
      data: transaction,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/transactions/:id/reject
 * Reject transaction
 */
router.post('/transactions/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await adminService.updateTransactionStatus(
      req.params.id,
      'REJECTED',
      req.body.notes
    );

    res.status(200).json({
      message: 'Transaction rejected successfully',
      data: transaction,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/transactions
 * Get all transactions (admin only - across all users)
 */
router.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
      userId: req.query.userId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getAllTransactions(filters);
    res.status(200).json({
      message: 'Transactions retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/users/:userId/balance/adjust
 * Adjust user balance
 */
router.post('/users/:userId/balance/adjust', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      bankAccountId: z.string().min(1),
      amount: z.number(),
      description: z.string().min(1),
    });

    const validatedData = schema.parse(req.body);
    const transaction = await adminService.adjustUserBalance(
      req.params.userId,
      validatedData.bankAccountId,
      validatedData.amount,
      validatedData.description
    );

    res.status(200).json({
      message: 'Balance adjusted successfully',
      data: transaction,
    });
  } catch (error) {
    throw error;
  }
});

export default router;
