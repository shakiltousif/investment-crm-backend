import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { Decimal } from '@prisma/client/runtime/library';
import { emailService } from './email.service.js';
import { emailSettingsService } from './emailSettings.service.js';
import { notificationService } from './notification.service.js';

// Import NotificationType enum properly from Prisma client
// Define enum values as const object matching Prisma NotificationType enum
// Using string literals that match the Prisma enum values for type compatibility
const NotificationType = {
  INVESTMENT_APPLICATION_SUBMITTED: 'INVESTMENT_APPLICATION_SUBMITTED' as const,
  ADMIN_NOTIFICATION: 'ADMIN_NOTIFICATION' as const,
} as const;

export interface CreateBondProductInput {
  name: string;
  symbol?: string;
  description?: string;
  currentPrice: number;
  minimumInvestment: number;
  maximumInvestment?: number;
  currency?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedReturn?: number;
  issuer: string;
  maturityDate: Date;
  couponRate: number;
  payoutFrequency: 'MONTHLY' | 'QUARTERLY' | 'BI_ANNUALLY' | 'ANNUAL';
  nextPayoutDate?: Date;
}

export interface CreateSavingsProductInput {
  name: string;
  description?: string;
  minimumInvestment: number;
  maximumInvestment?: number;
  currency?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  interestRate: number;
  issuer: string;
}

export interface CreateIPOProductInput {
  name: string;
  symbol: string;
  description?: string;
  currentPrice: number;
  minimumInvestment: number;
  maximumInvestment?: number;
  currency?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  issuer: string;
  applicationDeadline: Date;
  allocationDate?: Date;
}

export interface CreateFixedDepositProductInput {
  name: string;
  description?: string;
  minimumInvestment: number;
  maximumInvestment?: number;
  currency?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  interestRate: number;
  lockPeriodMonths: number;
  earlyWithdrawalPenalty?: number;
  issuer: string;
}

export interface CreateInvestmentApplicationInput {
  marketplaceItemId: string;
  requestedAmount: number;
  requestedQuantity?: number;
  notes?: string;
}

export class InvestmentProductService {
  /**
   * Create Corporate Bond product
   */
  async createBondProduct(data: CreateBondProductInput): Promise<unknown> {
    const bond = await prisma.marketplaceItem.create({
      data: {
        name: data.name,
        type: 'CORPORATE_BOND',
        symbol: data.symbol,
        description: data.description,
        currentPrice: new Decimal(data.minimumInvestment), // Use minimum investment as base price
        minimumInvestment: new Decimal(data.minimumInvestment),
        maximumInvestment: null, // No max for corporate bonds
        currency: data.currency ?? 'GBP',
        riskLevel: data.riskLevel,
        expectedReturn: null, // Not used for corporate bonds
        issuer: data.issuer,
        maturityDate: data.maturityDate,
        couponRate: new Decimal(data.couponRate),
        payoutFrequency: data.payoutFrequency,
        nextPayoutDate: null, // Not used for corporate bonds
      },
    });

    return bond;
  }

  /**
   * Create High Interest Savings Account product
   */
  async createSavingsProduct(data: CreateSavingsProductInput): Promise<unknown> {
    const savings = await prisma.marketplaceItem.create({
      data: {
        name: data.name,
        type: 'HIGH_INTEREST_SAVINGS',
        description: data.description,
        currentPrice: new Decimal(data.minimumInvestment), // Use minimum as base price
        minimumInvestment: new Decimal(data.minimumInvestment),
        maximumInvestment: data.maximumInvestment ? new Decimal(data.maximumInvestment) : null,
        currency: data.currency ?? 'GBP',
        riskLevel: data.riskLevel,
        expectedReturn: new Decimal(data.interestRate),
        interestRate: new Decimal(data.interestRate),
        issuer: data.issuer,
      },
    });

    return savings;
  }

  /**
   * Create IPO product
   */
  async createIPOProduct(data: CreateIPOProductInput): Promise<unknown> {
    const ipo = await prisma.marketplaceItem.create({
      data: {
        name: data.name,
        type: 'IPO',
        symbol: data.symbol,
        description: data.description,
        currentPrice: new Decimal(data.currentPrice),
        minimumInvestment: new Decimal(data.minimumInvestment),
        maximumInvestment: data.maximumInvestment ? new Decimal(data.maximumInvestment) : null,
        currency: data.currency ?? 'GBP',
        riskLevel: data.riskLevel,
        issuer: data.issuer,
        applicationDeadline: data.applicationDeadline,
        allocationDate: data.allocationDate ?? null,
        ipoStatus: 'OPEN',
      },
    });

    return ipo;
  }

  /**
   * Create Fixed Rate Deposit product
   */
  async createFixedDepositProduct(data: CreateFixedDepositProductInput): Promise<unknown> {
    const fixedDeposit = await prisma.marketplaceItem.create({
      data: {
        name: data.name,
        type: 'FIXED_RATE_DEPOSIT',
        description: data.description,
        currentPrice: new Decimal(data.minimumInvestment),
        minimumInvestment: new Decimal(data.minimumInvestment),
        maximumInvestment: data.maximumInvestment ? new Decimal(data.maximumInvestment) : null,
        currency: data.currency ?? 'GBP',
        riskLevel: data.riskLevel,
        expectedReturn: new Decimal(data.interestRate),
        interestRate: new Decimal(data.interestRate),
        lockPeriodMonths: data.lockPeriodMonths,
        earlyWithdrawalPenalty: data.earlyWithdrawalPenalty
          ? new Decimal(data.earlyWithdrawalPenalty)
          : null,
        issuer: data.issuer,
        maturityDate: new Date(Date.now() + data.lockPeriodMonths * 30 * 24 * 60 * 60 * 1000), // Approximate maturity
      },
    });

    return fixedDeposit;
  }

  /**
   * Create investment application (for IPO, etc.)
   */
  async createApplication(
    userId: string,
    data: CreateInvestmentApplicationInput
  ): Promise<unknown> {
    // Verify marketplace item exists and is available
    const item = await prisma.marketplaceItem.findUnique({
      where: { id: data.marketplaceItemId },
    });

    if (!item) {
      throw new NotFoundError('Investment product not found');
    }

    if (!item.isAvailable) {
      throw new ValidationError('This investment product is not currently available');
    }

    // For IPO, check if application deadline has passed
    if (item.type === 'IPO' && item.applicationDeadline && item.applicationDeadline < new Date()) {
      throw new ValidationError('Application deadline has passed');
    }

    // Generate unique reference number
    const referenceNumber = `APP-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const application = await prisma.investmentApplication.create({
      data: {
        userId,
        marketplaceItemId: data.marketplaceItemId,
        requestedAmount: new Decimal(data.requestedAmount),
        requestedQuantity: data.requestedQuantity ? new Decimal(data.requestedQuantity) : null,
        status: 'PENDING',
        referenceNumber,
        notes: data.notes,
      },
      include: {
        marketplaceItem: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
          },
        },
      },
    });

    // Send email notification to client
    try {
      // Check if investment application submitted emails are enabled
      const shouldSend = await emailSettingsService.shouldSendNotification(
        application.userId,
        'investmentApplicationSubmitted'
      );
      if (shouldSend) {
        await emailService
          .sendInvestmentApplicationSubmittedEmail(
            application.user.email,
            application.user.firstName,
            item.name,
            referenceNumber,
            data.requestedAmount,
            item.currency
          )
          .then(() => {
            console.warn(
              `Investment application submitted email sent successfully to ${application.user.email}`
            );
          })
          .catch((error) => {
            console.error('Failed to send investment application submitted email:', error);
          });
      } else {
        console.warn(
          `Investment application submitted email skipped for ${application.user.email} (disabled in settings)`
        );
      }

      // Create notification for user
      notificationService
        .createNotification({
          userId: application.userId,
          type: NotificationType.INVESTMENT_APPLICATION_SUBMITTED,
          title: 'Investment Enrollment Submitted',
          message: `Your enrollment for ${item.name} has been submitted successfully and is pending review.`,
          actionUrl: '/dashboard/investments',
          data: { applicationId: application.id, productId: item.id },
        })
        .catch((error) => {
          console.error('Failed to create application submitted notification:', error);
        });
    } catch (error) {
      console.error('Failed to send investment application submitted email:', error);
      // Don't throw - email failure shouldn't break the application creation
    }

    // Send admin notification
    try {
      // Create admin notifications
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });

      await Promise.all(
        admins.map((admin) =>
          notificationService
            .createNotification({
              userId: admin.id,
              type: NotificationType.ADMIN_NOTIFICATION,
              title: 'New Investment Enrollment',
              message: `A new investment enrollment for ${item.name} has been submitted by ${application.user.firstName} ${application.user.email}.`,
              actionUrl: `/admin/investment-products`,
              data: {
                applicationId: application.id,
                userId: application.userId,
                productId: item.id,
              },
            })
            .catch((error) => {
              console.error('Failed to create admin notification:', error);
            })
        )
      );

      // Check if admin notifications are enabled
      const shouldSendAdmin = await emailSettingsService.shouldSendNotification(
        null,
        'adminNotifications'
      );
      if (shouldSendAdmin) {
        const adminEmails = await emailService.getAdminEmails();
        if (adminEmails.length > 0) {
          await emailService
            .sendAdminNotificationEmail(
              adminEmails,
              'New Investment Enrollment',
              `A new investment enrollment has been submitted.`,
              {
                Client: `${application.user.firstName} ${application.user.email}`,
                Investment: item.name,
                'Reference Number': referenceNumber,
                'Requested Amount': `${item.currency} ${data.requestedAmount.toLocaleString()}`,
              }
            )
            .catch((error) => {
              console.error('Failed to send admin notification email:', error);
            });
        }
      } else {
        console.warn('Admin notification email skipped (disabled in settings)');
      }
    } catch (error) {
      console.error('Failed to send admin notification email:', error);
      // Don't throw - email failure shouldn't break the application creation
    }

    return application;
  }

  /**
   * Get user's investment applications
   */
  async getUserApplications(
    userId: string,
    filters?: { status?: string; type?: string }
  ): Promise<Array<unknown>> {
    const where: Record<string, unknown> = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.type) {
      where.marketplaceItem = {
        type: filters.type,
      };
    }

    const applications = await prisma.investmentApplication.findMany({
      where,
      include: {
        marketplaceItem: true,
      },
      orderBy: { submittedAt: 'desc' },
    });

    return applications;
  }

  /**
   * Get application by ID
   */
  async getApplicationById(applicationId: string, userId?: string): Promise<unknown> {
    const where: Record<string, unknown> = { id: applicationId };
    if (userId) {
      where.userId = userId;
    }

    const application = await prisma.investmentApplication.findFirst({
      where,
      include: {
        marketplaceItem: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundError('Application not found');
    }

    return application;
  }

  /**
   * Calculate bond payout schedule
   */
  calculateBondPayoutSchedule(
    bond: {
      type: string;
      couponRate?: unknown;
      maturityDate?: Date | null;
      payoutFrequency?: string | null;
      nextPayoutDate?: Date | null;
    },
    investmentAmount: number
  ): {
    frequency: string;
    payoutAmount: number;
    totalPayouts: number;
    totalAmount: number;
    schedule: Array<{ date: string; amount: number }>;
    maturityDate: string;
    principalReturn: number;
  } | null {
    if (bond.type !== 'CORPORATE_BOND' || !bond.couponRate || !bond.maturityDate) {
      return null;
    }

    const couponRate = Number(bond.couponRate) / 100;
    const annualPayout = investmentAmount * couponRate;
    const frequency = bond.payoutFrequency ?? 'ANNUAL';

    let payoutsPerYear = 1;
    if (frequency === 'MONTHLY') {
      payoutsPerYear = 12;
    } else if (frequency === 'QUARTERLY') {
      payoutsPerYear = 4;
    }

    const payoutAmount = annualPayout / payoutsPerYear;
    const maturityDate = new Date(bond.maturityDate);
    const now = new Date();

    const schedule = [];
    let nextDate = bond.nextPayoutDate ? new Date(bond.nextPayoutDate) : new Date(now);

    while (nextDate < maturityDate) {
      schedule.push({
        date: nextDate.toISOString(),
        amount: payoutAmount,
      });

      // Calculate next payout date
      if (frequency === 'MONTHLY') {
        nextDate = new Date(nextDate.setMonth(nextDate.getMonth() + 1));
      } else if (frequency === 'QUARTERLY') {
        nextDate = new Date(nextDate.setMonth(nextDate.getMonth() + 3));
      } else {
        nextDate = new Date(nextDate.setFullYear(nextDate.getFullYear() + 1));
      }
    }

    return {
      frequency,
      payoutAmount,
      totalPayouts: schedule.length,
      totalAmount: payoutAmount * schedule.length,
      schedule,
      maturityDate: maturityDate.toISOString(),
      principalReturn: investmentAmount,
    };
  }

  /**
   * Calculate savings account interest
   */
  calculateSavingsInterest(
    savings: {
      type: string;
      interestRate?: unknown;
    },
    balance: number,
    days: number = 30
  ): {
    balance: number;
    interestRate: number;
    days: number;
    interest: number;
    newBalance: number;
  } | null {
    if (savings.type !== 'HIGH_INTEREST_SAVINGS' || !savings.interestRate) {
      return null;
    }

    const interestRate = Number(savings.interestRate) / 100;
    const annualInterest = balance * interestRate;
    const dailyInterest = annualInterest / 365;
    const interest = dailyInterest * days;

    return {
      balance,
      interestRate: Number(savings.interestRate),
      days,
      interest,
      newBalance: balance + interest,
    };
  }

  /**
   * Calculate fixed deposit maturity
   */
  calculateFixedDepositMaturity(
    fixedDeposit: {
      type: string;
      interestRate?: unknown;
      lockPeriodMonths?: number | null;
      earlyWithdrawalPenalty?: unknown;
    },
    investmentAmount: number
  ): {
    investmentAmount: number;
    interestRate: number;
    lockPeriodMonths: number;
    maturityDate: string;
    totalReturn: number;
    totalInterest: number;
    earlyWithdrawalPenalty: number | null;
  } | null {
    if (
      fixedDeposit.type !== 'FIXED_RATE_DEPOSIT' ||
      !fixedDeposit.interestRate ||
      !fixedDeposit.lockPeriodMonths
    ) {
      return null;
    }

    const interestRate = Number(fixedDeposit.interestRate) / 100;
    const lockPeriodMonths = fixedDeposit.lockPeriodMonths;
    const lockPeriodYears = lockPeriodMonths / 12;

    const totalInterest = investmentAmount * interestRate * lockPeriodYears;
    const maturityAmount = investmentAmount + totalInterest;

    const startDate = new Date();
    const maturityDate = new Date(startDate.setMonth(startDate.getMonth() + lockPeriodMonths));

    return {
      investmentAmount: Number(investmentAmount),
      interestRate: Number(fixedDeposit.interestRate),
      lockPeriodMonths,
      totalInterest: Number(totalInterest),
      maturityDate: maturityDate.toISOString(),
      totalReturn: Number(maturityAmount),
      earlyWithdrawalPenalty: fixedDeposit.earlyWithdrawalPenalty
        ? Number(fixedDeposit.earlyWithdrawalPenalty)
        : null,
    };
  }
}

export const investmentProductService = new InvestmentProductService();
