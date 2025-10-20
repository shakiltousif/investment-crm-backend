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

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// User Validators
export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  phoneNumber: z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

// Bank Account Validators
export const createBankAccountSchema = z.object({
  accountHolderName: z.string().min(1, 'Account holder name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  bankName: z.string().min(1, 'Bank name is required'),
  bankCode: z.string().optional(),
  accountType: z.string().min(1, 'Account type is required'),
  currency: z.string().default('USD'),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

// Portfolio Validators
export const createPortfolioSchema = z.object({
  name: z.string().min(1, 'Portfolio name is required'),
  description: z.string().optional(),
});

export const updatePortfolioSchema = createPortfolioSchema.partial();

// Investment Validators
export const createInvestmentSchema = z.object({
  portfolioId: z.string().min(1, 'Portfolio ID is required'),
  type: z.enum(['STOCK', 'BOND', 'TERM_DEPOSIT', 'PRIVATE_EQUITY', 'MUTUAL_FUND', 'ETF', 'CRYPTOCURRENCY', 'OTHER']),
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
  currency: z.string().default('USD'),
  description: z.string().optional(),
  bankAccountId: z.string().optional(),
  investmentId: z.string().optional(),
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

