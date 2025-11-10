import { z } from 'zod';

// Auth Validators
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// User Validators
export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  phoneNumber: z.string().optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});

// Bank Account Validators
export const createBankAccountSchema = z.object({
  accountHolderName: z.string().min(1, 'Account holder name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  bankName: z.string().min(1, 'Bank name is required'),
  bankCode: z.string().optional(),
  accountType: z.string().min(1, 'Account type is required'),
  currency: z.string().default('GBP'),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

// Portfolio Validators
export const createPortfolioSchema = z
  .object({
    name: z.string().min(1, 'Portfolio name is required'),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    totalValue: z.number().min(0, 'Total value must be non-negative').optional(),
    totalInvested: z.number().min(0, 'Total invested must be non-negative').optional(),
    totalGain: z.number().optional(),
    gainPercentage: z.number().min(-100, 'Gain percentage cannot be less than -100%').optional(),
  })
  .refine(
    (data) => {
      // If both totalValue and totalInvested are provided, validate totalGain calculation
      if (data.totalValue !== undefined && data.totalInvested !== undefined) {
        const calculatedGain = data.totalValue - data.totalInvested;
        if (data.totalGain !== undefined && Math.abs(data.totalGain - calculatedGain) > 0.01) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Total gain must match the difference between total value and total invested',
      path: ['totalGain'],
    }
  )
  .refine(
    (data) => {
      // If both totalInvested and gainPercentage are provided, validate calculation
      if (
        data.totalInvested !== undefined &&
        data.gainPercentage !== undefined &&
        data.totalInvested > 0
      ) {
        const calculatedGainPercentage =
          (((data.totalValue || 0) - data.totalInvested) / data.totalInvested) * 100;
        if (Math.abs(data.gainPercentage - calculatedGainPercentage) > 0.01) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        'Gain percentage must match the calculated percentage based on total value and invested amount',
      path: ['gainPercentage'],
    }
  );

export const updatePortfolioSchema = z.object({
  name: z.string().min(1, 'Portfolio name is required').optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  totalValue: z.number().min(0, 'Total value must be non-negative').optional(),
  totalInvested: z.number().min(0, 'Total invested must be non-negative').optional(),
  totalGain: z.number().optional(),
  gainPercentage: z.number().min(-100, 'Gain percentage cannot be less than -100%').optional(),
});

// Investment Validators
export const createInvestmentSchema = z.object({
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
  purchaseDate: z.string().datetime(),
  maturityDate: z.string().datetime().optional(),
  interestRate: z.number().optional(),
});

export const updateInvestmentSchema = createInvestmentSchema.partial();

// Transaction Validators
export const createTransactionSchema = z.object({
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'TRANSFER', 'FEE']),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('GBP'),
  description: z.string().optional(),
  bankAccountId: z.string().optional(),
  investmentId: z.string().optional(),
});

// Marketplace Validators
export const createMarketplaceItemSchema = z.object({
  name: z.string().min(1, 'Investment name is required'),
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
  symbol: z.string().optional(),
  description: z.string().optional(),
  currentPrice: z.coerce.number().positive('Current price must be positive'),
  minimumInvestment: z.coerce.number().positive('Minimum investment must be positive'),
  maximumInvestment: z.coerce.number().positive('Maximum investment must be positive').optional(),
  currency: z.string().default('GBP'),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  expectedReturn: z.coerce.number().min(0, 'Expected return must be non-negative').optional(),
  category: z.string().optional(),
  issuer: z.string().optional(),
  maturityDate: z.string().datetime().optional(),
  isAvailable: z.boolean().default(true),
});

export const updateMarketplaceItemSchema = createMarketplaceItemSchema.partial();

export const marketplaceFiltersSchema = z.object({
  type: z.string().optional(),
  riskLevel: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

// Type exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;
export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateMarketplaceItemInput = z.infer<typeof createMarketplaceItemSchema>;
export type UpdateMarketplaceItemInput = z.infer<typeof updateMarketplaceItemSchema>;
export type MarketplaceFiltersInput = z.infer<typeof marketplaceFiltersSchema>;
