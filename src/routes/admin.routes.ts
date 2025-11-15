import { Router, Response } from 'express';
import multer from 'multer';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { adminService } from '../services/admin.service.js';
import {
  adminCreatePortfolioSchema,
  updatePortfolioSchema,
  adminCreateBankAccountSchema,
  adminUpdateBankAccountSchema,
  updateProblemReportStatusSchema,
  createProblemReportResponseSchema,
} from '../lib/validators.js';
import { z } from 'zod';
import type { UploadDocumentInput } from '../services/document.service.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

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
      phoneNumber: z.string().optional().nullable(),
      role: z.enum(['CLIENT', 'ADMIN']).optional(),
      sendCredentialsEmail: z.boolean().optional(), // Whether to send email with credentials
      dateOfBirth: z.string().datetime().optional().nullable(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      zipCode: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      profilePicture: z.string().url().optional().nullable(),
      kycStatus: z.enum(['PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED']).optional(),
      documentType: z.string().optional().nullable(),
      documentNumber: z.string().optional().nullable(),
      documentExpiryDate: z.string().datetime().optional().nullable(),
      isEmailVerified: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    // Convert phoneNumber from null to undefined for createUser
    const createData = { ...validatedData } as Parameters<typeof adminService.createUser>[0];
    if (createData.phoneNumber === null) {
      createData.phoneNumber = undefined;
    }
    const user = await adminService.createUser(createData);

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
      phoneNumber: z.string().optional().nullable(),
      role: z.enum(['CLIENT', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
      email: z.string().email().optional(),
      dateOfBirth: z.string().datetime().optional().nullable(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      zipCode: z.string().optional().nullable(),
      country: z.string().optional().nullable(),
      profilePicture: z.string().url().optional().nullable(),
      kycStatus: z.enum(['PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED']).optional(),
      documentType: z.string().optional().nullable(),
      documentNumber: z.string().optional().nullable(),
      documentExpiryDate: z.string().datetime().optional().nullable(),
      isEmailVerified: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    // Convert phoneNumber from null to undefined for updateUser
    const updateData = { ...validatedData } as Parameters<typeof adminService.updateUser>[1];
    if (updateData.phoneNumber === null) {
      updateData.phoneNumber = undefined;
    }
    const user = await adminService.updateUser(req.params.id, updateData);

    return res.status(200).json({
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/users/:id/unlock
 * Unlock user account (reset failed login attempts)
 */
router.post('/users/:id/unlock', async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const user = await adminService.unlockAccount(req.params.id);

    return res.status(200).json({
      message: 'User account unlocked successfully',
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

/**
 * GET /api/admin/investments
 * Get all investments with pagination and filters
 */
router.get('/investments', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string | undefined,
      portfolioId: req.query.portfolioId as string | undefined,
      type: req.query.type as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getAllInvestments(filters);
    res.status(200).json({
      message: 'Investments retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/users/:userId/investments
 * Get all investments for a user
 */
router.get('/users/:userId/investments', async (req: AuthRequest, res: Response) => {
  try {
    const investments = await adminService.getUserInvestments(req.params.userId);
    res.status(200).json({
      message: 'User investments retrieved successfully',
      data: investments,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/users/:userId/portfolios
 * Get all portfolios for a user
 */
router.get('/users/:userId/portfolios', async (req: AuthRequest, res: Response) => {
  try {
    const portfolios = await adminService.getUserPortfolios(req.params.userId);
    res.status(200).json({
      message: 'User portfolios retrieved successfully',
      data: portfolios,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/users/:userId/investments
 * Create investment for a user
 */
router.post('/users/:userId/investments', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      portfolioId: z.string().min(1, 'Portfolio ID is required'),
      type: z.enum([
        'STOCK',
        'BOND',
        'TERM_DEPOSIT',
        'PRIVATE_EQUITY',
        'MUTUAL_FUND',
        'ETF',
        'CRYPTOCURRENCY',
        'OTHER',
      ]),
      name: z.string().min(1, 'Investment name is required'),
      symbol: z.string().optional(),
      quantity: z.number().positive('Quantity must be positive'),
      purchasePrice: z.number().positive('Purchase price must be positive'),
      currentPrice: z.number().positive('Current price must be positive'),
      purchaseDate: z.string().datetime().optional(),
      maturityDate: z.string().datetime().optional().nullable(),
      interestRate: z.number().optional().nullable(),
    });

    const validatedData = schema.parse(req.body);

    const investment = await adminService.createUserInvestment(req.params.userId, {
      portfolioId: validatedData.portfolioId,
      type: validatedData.type,
      name: validatedData.name,
      symbol: validatedData.symbol,
      quantity: validatedData.quantity,
      purchasePrice: validatedData.purchasePrice,
      currentPrice: validatedData.currentPrice,
      purchaseDate: validatedData.purchaseDate ?? new Date().toISOString(),
      maturityDate: validatedData.maturityDate ?? null,
      interestRate: validatedData.interestRate ?? null,
    });

    res.status(201).json({
      message: 'Investment created successfully',
      data: investment,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/users/:userId/investments/:investmentId
 * Update user investment
 */
router.put('/users/:userId/investments/:investmentId', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      quantity: z.number().positive().optional(),
      purchasePrice: z.number().positive().optional(),
      currentPrice: z.number().positive().optional(),
      maturityDate: z.string().nullable().optional(),
      interestRate: z.number().nullable().optional(),
    });

    const validatedData = schema.parse(req.body);

    // Convert maturityDate string to Date if provided
    const updateData: {
      quantity?: number;
      purchasePrice?: number;
      currentPrice?: number;
      maturityDate?: Date | null;
      interestRate?: number | null;
    } = {
      quantity: validatedData.quantity,
      purchasePrice: validatedData.purchasePrice,
      currentPrice: validatedData.currentPrice,
      interestRate: validatedData.interestRate,
    };

    if (validatedData.maturityDate !== undefined) {
      updateData.maturityDate = validatedData.maturityDate
        ? new Date(validatedData.maturityDate)
        : null;
    }

    const investment = await adminService.updateUserInvestment(
      req.params.userId,
      req.params.investmentId,
      updateData
    );

    res.status(200).json({
      message: 'Investment updated successfully',
      data: investment,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/users/:userId/investments/:investmentId
 * Delete user investment
 */
router.delete(
  '/users/:userId/investments/:investmentId',
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await adminService.deleteUserInvestment(
        req.params.userId,
        req.params.investmentId
      );
      res.status(200).json({
        message: 'Investment deleted successfully',
        data: result,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * POST /api/admin/users/:userId/portfolios/:portfolioId/adjust
 * Adjust portfolio totals (manual or auto-calculate)
 */
router.post(
  '/users/:userId/portfolios/:portfolioId/adjust',
  async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        totalValue: z.number().optional(),
        totalInvested: z.number().optional(),
        totalGain: z.number().optional(),
        manualAdjust: z.boolean(),
      });

      const validatedData = schema.parse(req.body);
      const portfolio = await adminService.adjustPortfolioTotals(
        req.params.userId,
        req.params.portfolioId,
        validatedData
      );

      res.status(200).json({
        message: 'Portfolio totals adjusted successfully',
        data: portfolio,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * POST /api/admin/portfolios
 * Create a portfolio for a user
 */
router.post('/portfolios', async (req: AuthRequest, res: Response) => {
  try {
    const data = adminCreatePortfolioSchema.parse(req.body);
    const portfolio = await adminService.createUserPortfolio(data.userId, {
      name: data.name,
      description: data.description,
      isActive: data.isActive,
    });
    res.status(201).json({
      message: 'Portfolio created successfully',
      data: portfolio,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/portfolios
 * Get all portfolios with optional filters
 */
router.get('/portfolios', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getAllPortfolios(filters);
    res.status(200).json({
      message: 'Portfolios retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/users/:userId/portfolios/:portfolioId
 * Update a user's portfolio
 */
router.put('/users/:userId/portfolios/:portfolioId', async (req: AuthRequest, res: Response) => {
  try {
    const data = updatePortfolioSchema.parse(req.body);
    const portfolio = await adminService.updateUserPortfolio(
      req.params.userId,
      req.params.portfolioId,
      data
    );
    res.status(200).json({
      message: 'Portfolio updated successfully',
      data: portfolio,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/users/:userId/portfolios/:portfolioId
 * Delete a user's portfolio
 */
router.delete('/users/:userId/portfolios/:portfolioId', async (req: AuthRequest, res: Response) => {
  try {
    const result = await adminService.deleteUserPortfolio(
      req.params.userId,
      req.params.portfolioId
    );
    res.status(200).json({
      message: 'Portfolio deleted successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/marketplace/items
 * Get all marketplace items with pagination and filters
 */
router.get('/marketplace/items', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      type: req.query.type as string | undefined,
      riskLevel: req.query.riskLevel as string | undefined,
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getAllMarketplaceItems(filters);
    res.status(200).json({
      message: 'Marketplace items retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/marketplace/items/:id
 * Get marketplace item by ID
 */
router.get('/marketplace/items/:id', async (req: AuthRequest, res: Response) => {
  try {
    const item = await adminService.getMarketplaceItemById(req.params.id);
    res.status(200).json({
      message: 'Marketplace item retrieved successfully',
      data: item,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/marketplace/items
 * Create marketplace item
 */
router.post('/marketplace/items', async (req: AuthRequest, res: Response) => {
  try {
    const { createMarketplaceItemSchema } = await import('../lib/validators.js');
    const validatedData = createMarketplaceItemSchema.parse(req.body);
    // Convert null to undefined for maximumInvestment and maturityDate
    const dataToSend = {
      ...validatedData,
      maximumInvestment:
        validatedData.maximumInvestment === null ? undefined : validatedData.maximumInvestment,
      maturityDate: validatedData.maturityDate === null ? undefined : validatedData.maturityDate,
    };
    const item = await adminService.createMarketplaceItem(dataToSend);
    res.status(201).json({
      message: 'Marketplace item created successfully',
      data: item,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/marketplace/items/:id
 * Update marketplace item
 */
router.put('/marketplace/items/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { updateMarketplaceItemSchema } = await import('../lib/validators.js');
    const validatedData = updateMarketplaceItemSchema.parse(req.body);
    // Convert null to undefined for maximumInvestment and maturityDate
    const dataToSend = {
      ...validatedData,
      maximumInvestment:
        validatedData.maximumInvestment === null ? undefined : validatedData.maximumInvestment,
      maturityDate: validatedData.maturityDate === null ? undefined : validatedData.maturityDate,
    };
    const item = await adminService.updateMarketplaceItem(req.params.id, dataToSend);
    res.status(200).json({
      message: 'Marketplace item updated successfully',
      data: item,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/marketplace/items/:id
 * Delete marketplace item
 */
router.delete('/marketplace/items/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await adminService.deleteMarketplaceItem(req.params.id);
    res.status(200).json({
      message: 'Marketplace item deleted successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/documents
 * Get all documents with filters and pagination
 */
router.get('/documents', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string | undefined,
      type: req.query.type as string | undefined,
      isImportant: req.query.isImportant ? req.query.isImportant === 'true' : undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await adminService.getAllDocuments(filters);
    res.status(200).json({
      message: 'Documents retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/documents/:id
 * Get document by ID
 */
router.get('/documents/:id', async (req: AuthRequest, res: Response) => {
  try {
    const document = await adminService.getDocumentById(req.params.id);
    res.status(200).json({
      message: 'Document retrieved successfully',
      data: document,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/documents
 * Upload document for a user
 */
router.post(
  '/documents',
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const schema = z.object({
        userId: z.string().min(1),
        type: z.string().min(1),
        description: z.string().optional(),
        isImportant: z.boolean().optional(),
      });

      const validatedData = schema.parse(req.body);

      const uploadData: UploadDocumentInput = {
        type: validatedData.type,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: validatedData.description,
        fileBuffer: req.file.buffer,
      };

      const document = await adminService.uploadDocumentForUser(
        req.userId!,
        validatedData.userId,
        uploadData
      );

      // If isImportant is set, update the document
      if (validatedData.isImportant) {
        await adminService.updateDocument((document as { id: string }).id, {
          isImportant: true,
        });
      }

      res.status(201).json({
        message: 'Document uploaded successfully',
        data: document,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * PUT /api/admin/documents/:id
 * Update document metadata
 */
router.put('/documents/:id', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      type: z.string().optional(),
      description: z.string().optional().nullable(),
      isImportant: z.boolean().optional(),
      status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED']).optional(),
    });

    const validatedData = schema.parse(req.body);
    const updateData = {
      ...validatedData,
      description: validatedData.description === null ? undefined : validatedData.description,
    };
    const document = await adminService.updateDocument(req.params.id, updateData);
    res.status(200).json({
      message: 'Document updated successfully',
      data: document,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/documents/:id
 * Delete document
 */
router.delete('/documents/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await adminService.deleteDocument(req.params.id);
    res.status(200).json({
      message: 'Document deleted successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/bank-accounts
 * Get all bank accounts with filters and pagination
 */
router.get('/bank-accounts', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string | undefined,
      isVerified: req.query.isVerified ? req.query.isVerified === 'true' : undefined,
      isPrimary: req.query.isPrimary ? req.query.isPrimary === 'true' : undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getAllBankAccounts(filters);
    res.status(200).json({
      message: 'Bank accounts retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/bank-accounts/:id
 * Get specific bank account by ID
 */
router.get('/bank-accounts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const bankAccount = await adminService.getBankAccountById(req.params.id);
    res.status(200).json({
      message: 'Bank account retrieved successfully',
      data: bankAccount,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/bank-accounts
 * Create bank account for user
 */
router.post('/bank-accounts', async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = adminCreateBankAccountSchema.parse(req.body);
    const bankAccount = await adminService.createBankAccountForUser(validatedData.userId, {
      accountHolderName: validatedData.accountHolderName,
      accountNumber: validatedData.accountNumber,
      bankName: validatedData.bankName,
      bankCode: validatedData.bankCode ?? null,
      accountType: validatedData.accountType,
      currency: validatedData.currency,
      balance: validatedData.balance,
      isVerified: validatedData.isVerified,
      isPrimary: validatedData.isPrimary,
    });
    res.status(201).json({
      message: 'Bank account created successfully',
      data: bankAccount,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/bank-accounts/:id
 * Update bank account
 */
router.put('/bank-accounts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = adminUpdateBankAccountSchema.parse(req.body);
    const bankAccount = await adminService.updateBankAccount(req.params.id, {
      accountHolderName: validatedData.accountHolderName,
      accountNumber: validatedData.accountNumber,
      bankName: validatedData.bankName,
      bankCode: validatedData.bankCode ?? undefined,
      accountType: validatedData.accountType,
      currency: validatedData.currency,
      balance: validatedData.balance,
      isVerified: validatedData.isVerified,
      isPrimary: validatedData.isPrimary,
    });
    res.status(200).json({
      message: 'Bank account updated successfully',
      data: bankAccount,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/bank-accounts/:id
 * Delete bank account
 */
router.delete('/bank-accounts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await adminService.deleteBankAccount(req.params.id);
    res.status(200).json({
      message: 'Bank account deleted successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/bank-accounts/:id/verify
 * Verify bank account
 */
router.post('/bank-accounts/:id/verify', async (req: AuthRequest, res: Response) => {
  try {
    const bankAccount = await adminService.verifyBankAccount(req.params.id);
    res.status(200).json({
      message: 'Bank account verified successfully',
      data: bankAccount,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/bank-accounts/:id/set-primary
 * Set bank account as primary
 */
router.post('/bank-accounts/:id/set-primary', async (req: AuthRequest, res: Response) => {
  try {
    const bankAccount = await adminService.getBankAccountById(req.params.id);
    const result = await adminService.setPrimaryBankAccount(bankAccount.userId, req.params.id);
    res.status(200).json({
      message: 'Bank account set as primary successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/problem-reports
 * Get all problem reports with filters
 */
router.get('/problem-reports', async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string | undefined,
      status: req.query.status as string | undefined,
      category: req.query.category as string | undefined,
      priority: req.query.priority as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await adminService.getAllProblemReports(filters);
    res.status(200).json({
      message: 'Problem reports retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/problem-reports/:id
 * Get specific problem report
 */
router.get('/problem-reports/:id', async (req: AuthRequest, res: Response) => {
  try {
    const report = await adminService.getProblemReportById(req.params.id);
    res.status(200).json({
      message: 'Problem report retrieved successfully',
      data: report,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/problem-reports/:id/status
 * Update problem report status
 */
router.put('/problem-reports/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      throw new Error('User ID not found');
    }

    const validatedData = updateProblemReportStatusSchema.parse(req.body);

    const report = await adminService.updateProblemReportStatus(
      req.params.id,
      validatedData.status,
      req.userId
    );

    res.status(200).json({
      message: 'Problem report status updated successfully',
      data: report,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/problem-reports/:id/respond
 * Admin responds to problem report
 */
router.post(
  '/problem-reports/:id/respond',
  upload.array('attachments', 5), // Max 5 attachments
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const validatedData = createProblemReportResponseSchema.parse(req.body);

      const attachments = req.files
        ? (req.files as Express.Multer.File[]).map((file) => ({
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            fileBuffer: file.buffer,
          }))
        : undefined;

      const response = await adminService.createProblemReportResponse(req.params.id, req.userId, {
        ...validatedData,
        attachments,
      });

      res.status(201).json({
        message: 'Response created successfully',
        data: response,
      });
    } catch (error) {
      throw error;
    }
  }
);

export default router;
