import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { investmentProductService } from '../services/investmentProduct.service';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createBondSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().optional(),
  description: z.string().optional(),
  currentPrice: z.number().positive(),
  minimumInvestment: z.number().positive(),
  maximumInvestment: z.number().positive().optional(),
  currency: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  expectedReturn: z.number().optional(),
  issuer: z.string().min(1),
  maturityDate: z.string().datetime(),
  couponRate: z.number().min(0).max(100),
  payoutFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  nextPayoutDate: z.string().datetime().optional(),
});

const createSavingsSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  minimumInvestment: z.number().positive(),
  maximumInvestment: z.number().positive().optional(),
  currency: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  interestRate: z.number().min(0).max(100),
  issuer: z.string().min(1),
});

const createIPOSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string().optional(),
  currentPrice: z.number().positive(),
  minimumInvestment: z.number().positive(),
  maximumInvestment: z.number().positive().optional(),
  currency: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  issuer: z.string().min(1),
  applicationDeadline: z.string().datetime(),
  allocationDate: z.string().datetime().optional(),
});

const createFixedDepositSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  minimumInvestment: z.number().positive(),
  maximumInvestment: z.number().positive().optional(),
  currency: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  interestRate: z.number().min(0).max(100),
  lockPeriodMonths: z.number().int().positive(),
  earlyWithdrawalPenalty: z.number().min(0).max(100).optional(),
  issuer: z.string().min(1),
});

const createApplicationSchema = z.object({
  marketplaceItemId: z.string().min(1),
  requestedAmount: z.number().positive(),
  requestedQuantity: z.number().positive().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/investment-products/bonds
 * Create Corporate Bond product (admin only)
 */
router.post('/bonds', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = createBondSchema.parse(req.body);
    const bond = await investmentProductService.createBondProduct({
      ...data,
      maturityDate: new Date(data.maturityDate),
      nextPayoutDate: data.nextPayoutDate ? new Date(data.nextPayoutDate) : undefined,
    });
    res.status(201).json({
      message: 'Corporate Bond product created successfully',
      data: bond,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/investment-products/savings
 * Create High Interest Savings Account product (admin only)
 */
router.post('/savings', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = createSavingsSchema.parse(req.body);
    const savings = await investmentProductService.createSavingsProduct(data);
    res.status(201).json({
      message: 'Savings Account product created successfully',
      data: savings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/investment-products/ipo
 * Create IPO product (admin only)
 */
router.post('/ipo', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = createIPOSchema.parse(req.body);
    const ipo = await investmentProductService.createIPOProduct({
      ...data,
      applicationDeadline: new Date(data.applicationDeadline),
      allocationDate: data.allocationDate ? new Date(data.allocationDate) : undefined,
    });
    res.status(201).json({
      message: 'IPO product created successfully',
      data: ipo,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/investment-products/fixed-deposits
 * Create Fixed Rate Deposit product (admin only)
 */
router.post(
  '/fixed-deposits',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const data = createFixedDepositSchema.parse(req.body);
      const fixedDeposit = await investmentProductService.createFixedDepositProduct(data);
      res.status(201).json({
        message: 'Fixed Rate Deposit product created successfully',
        data: fixedDeposit,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * POST /api/investment-products/applications
 * Create investment application (client)
 */
router.post('/applications', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createApplicationSchema.parse(req.body);
    const application = await investmentProductService.createApplication(req.userId!, data);
    res.status(201).json({
      message: 'Investment application submitted successfully',
      data: application,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/investment-products/applications
 * Get user's investment applications
 */
router.get('/applications', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
    };
    const applications = await investmentProductService.getUserApplications(req.userId!, filters);
    res.status(200).json({
      message: 'Applications retrieved successfully',
      data: applications,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/investment-products/applications/:id
 * Get application by ID
 */
router.get('/applications/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const application = await investmentProductService.getApplicationById(
      req.params.id,
      req.user?.role === 'ADMIN' ? undefined : req.userId!
    );
    res.status(200).json({
      message: 'Application retrieved successfully',
      data: application,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/investment-products/bonds/:id/payout-schedule
 * Calculate bond payout schedule
 */
router.get('/bonds/:id/payout-schedule', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { investmentAmount } = z
      .object({
        investmentAmount: z.number().positive(),
      })
      .parse(req.query);

    const bond = await prisma.marketplaceItem.findUnique({
      where: { id: req.params.id },
    });

    if (bond?.type !== 'CORPORATE_BOND') {
      throw new NotFoundError('Corporate Bond not found');
    }

    const schedule = investmentProductService.calculateBondPayoutSchedule(
      { ...bond, payoutFrequency: bond.payoutFrequency ?? null },
      investmentAmount
    );
    res.status(200).json({
      message: 'Payout schedule calculated successfully',
      data: schedule,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/investment-products/savings/:id/interest
 * Calculate savings account interest
 */
router.get('/savings/:id/interest', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { balance, days } = z
      .object({
        balance: z.number().positive(),
        days: z.number().int().positive().optional(),
      })
      .parse(req.query);

    const savings = await prisma.marketplaceItem.findUnique({
      where: { id: req.params.id },
    });

    if (savings?.type !== 'HIGH_INTEREST_SAVINGS') {
      throw new NotFoundError('Savings Account product not found');
    }

    const interest = investmentProductService.calculateSavingsInterest(
      savings,
      balance,
      days ?? 30
    );
    res.status(200).json({
      message: 'Interest calculated successfully',
      data: interest,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/investment-products/fixed-deposits/:id/maturity
 * Calculate fixed deposit maturity
 */
router.get(
  '/fixed-deposits/:id/maturity',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { investmentAmount } = z
        .object({
          investmentAmount: z.number().positive(),
        })
        .parse(req.query);

      const fixedDeposit = await prisma.marketplaceItem.findUnique({
        where: { id: req.params.id },
      });

      if (fixedDeposit?.type !== 'FIXED_RATE_DEPOSIT') {
        throw new NotFoundError('Fixed Rate Deposit product not found');
      }

      const maturity = investmentProductService.calculateFixedDepositMaturity(
        { ...fixedDeposit, lockPeriodMonths: fixedDeposit.lockPeriodMonths ?? null },
        investmentAmount
      );
      res.status(200).json({
        message: 'Maturity calculated successfully',
        data: maturity,
      });
    } catch (error) {
      throw error;
    }
  }
);

export default router;
