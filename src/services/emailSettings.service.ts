import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../middleware/errorHandler.js';

// Type assertion for Prisma client to include email notification settings model
// This model exists in the generated Prisma client but TypeScript language server may not recognize it
type EmailNotificationSettingsDelegate = {
  findFirst: (args: { where: { userId: string | null } }) => Promise<unknown | null>;
  findUnique: (args: { where: { userId: string } }) => Promise<unknown | null>;
  findMany: (args?: unknown) => Promise<unknown[]>;
  create: (args: { data: unknown }) => Promise<unknown>;
  update: (args: { where: { userId?: string; id?: string }; data: unknown }) => Promise<unknown>;
  upsert: (args: {
    where: { userId: string | null };
    create: unknown;
    update: unknown;
  }) => Promise<unknown>;
};

const prismaClient = prisma as typeof prisma & {
  emailNotificationSettings: EmailNotificationSettingsDelegate;
};

export interface EmailNotificationSettingsData {
  accountCreated?: boolean;
  accountLocked?: boolean;
  accountUnlocked?: boolean;
  kycStatusChange?: boolean;
  documentStatusChange?: boolean;
  documentUploaded?: boolean;
  depositSubmitted?: boolean;
  depositStatusChange?: boolean;
  withdrawalSubmitted?: boolean;
  withdrawalStatusChange?: boolean;
  investmentApplicationSubmitted?: boolean;
  investmentApplicationStatusChange?: boolean;
  investmentPurchase?: boolean;
  investmentMatured?: boolean;
  balanceAdjustment?: boolean;
  adminNotifications?: boolean;
}

export class EmailSettingsService {
  /**
   * Get email notification settings for a user (or global if userId is null)
   */
  async getSettings(userId?: string | null): Promise<EmailNotificationSettingsData> {
    // Handle null userId for global settings - use findFirst for null values
    let settings;
    if (userId === null || userId === undefined) {
      settings = (await prismaClient.emailNotificationSettings.findFirst({
        where: { userId: null },
      })) as Record<string, unknown> | null;
    } else {
      settings = (await prismaClient.emailNotificationSettings.findUnique({
        where: { userId },
      })) as Record<string, unknown> | null;
    }

    if (!settings) {
      // Return default settings if none exist
      return {
        accountCreated: true,
        accountLocked: true,
        accountUnlocked: true,
        kycStatusChange: true,
        documentStatusChange: true,
        documentUploaded: true,
        depositSubmitted: true,
        depositStatusChange: true,
        withdrawalSubmitted: true,
        withdrawalStatusChange: true,
        investmentApplicationSubmitted: true,
        investmentApplicationStatusChange: true,
        investmentPurchase: true,
        investmentMatured: true,
        balanceAdjustment: true,
        adminNotifications: true,
      };
    }

    const settingsData = settings as EmailNotificationSettingsData;
    return {
      accountCreated: settingsData.accountCreated,
      accountLocked: settingsData.accountLocked,
      accountUnlocked: settingsData.accountUnlocked,
      kycStatusChange: settingsData.kycStatusChange,
      documentStatusChange: settingsData.documentStatusChange,
      documentUploaded: settingsData.documentUploaded,
      depositSubmitted: settingsData.depositSubmitted,
      depositStatusChange: settingsData.depositStatusChange,
      withdrawalSubmitted: settingsData.withdrawalSubmitted,
      withdrawalStatusChange: settingsData.withdrawalStatusChange,
      investmentApplicationSubmitted: settingsData.investmentApplicationSubmitted,
      investmentApplicationStatusChange: settingsData.investmentApplicationStatusChange,
      investmentPurchase: settingsData.investmentPurchase,
      investmentMatured: settingsData.investmentMatured,
      balanceAdjustment: settingsData.balanceAdjustment,
      adminNotifications: settingsData.adminNotifications,
    };
  }

  /**
   * Update email notification settings for a user (or global if userId is null)
   */
  async updateSettings(
    userId: string | null,
    data: EmailNotificationSettingsData
  ): Promise<EmailNotificationSettingsData> {
    // If userId is provided, verify user exists
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }
    }

    const updateData: Record<string, boolean> = {};

    if (data.accountCreated !== undefined) {
      updateData.accountCreated = data.accountCreated;
    }
    if (data.accountLocked !== undefined) {
      updateData.accountLocked = data.accountLocked;
    }
    if (data.accountUnlocked !== undefined) {
      updateData.accountUnlocked = data.accountUnlocked;
    }
    if (data.kycStatusChange !== undefined) {
      updateData.kycStatusChange = data.kycStatusChange;
    }
    if (data.documentStatusChange !== undefined) {
      updateData.documentStatusChange = data.documentStatusChange;
    }
    if (data.documentUploaded !== undefined) {
      updateData.documentUploaded = data.documentUploaded;
    }
    if (data.depositSubmitted !== undefined) {
      updateData.depositSubmitted = data.depositSubmitted;
    }
    if (data.depositStatusChange !== undefined) {
      updateData.depositStatusChange = data.depositStatusChange;
    }
    if (data.withdrawalSubmitted !== undefined) {
      updateData.withdrawalSubmitted = data.withdrawalSubmitted;
    }
    if (data.withdrawalStatusChange !== undefined) {
      updateData.withdrawalStatusChange = data.withdrawalStatusChange;
    }
    if (data.investmentApplicationSubmitted !== undefined) {
      updateData.investmentApplicationSubmitted = data.investmentApplicationSubmitted;
    }
    if (data.investmentApplicationStatusChange !== undefined) {
      updateData.investmentApplicationStatusChange = data.investmentApplicationStatusChange;
    }
    if (data.investmentPurchase !== undefined) {
      updateData.investmentPurchase = data.investmentPurchase;
    }
    if (data.investmentMatured !== undefined) {
      updateData.investmentMatured = data.investmentMatured;
    }
    if (data.balanceAdjustment !== undefined) {
      updateData.balanceAdjustment = data.balanceAdjustment;
    }
    if (data.adminNotifications !== undefined) {
      updateData.adminNotifications = data.adminNotifications;
    }

    // Handle null userId for global settings - need to use findFirst/findUnique + create/update pattern
    let settings;
    const userIdValue = userId ?? null;

    if (userIdValue === null) {
      // For global settings, use findFirst since findUnique doesn't work with null
      const existing = (await prismaClient.emailNotificationSettings.findFirst({
        where: { userId: null },
      })) as Record<string, unknown> | null;

      if (existing) {
        settings = (await prismaClient.emailNotificationSettings.update({
          where: { id: (existing as { id: string }).id },
          data: updateData,
        })) as Record<string, unknown>;
      } else {
        settings = (await prismaClient.emailNotificationSettings.create({
          data: {
            userId: null,
            accountCreated: data.accountCreated ?? true,
            accountLocked: data.accountLocked ?? true,
            accountUnlocked: data.accountUnlocked ?? true,
            kycStatusChange: data.kycStatusChange ?? true,
            documentStatusChange: data.documentStatusChange ?? true,
            documentUploaded: data.documentUploaded ?? true,
            depositSubmitted: data.depositSubmitted ?? true,
            depositStatusChange: data.depositStatusChange ?? true,
            withdrawalSubmitted: data.withdrawalSubmitted ?? true,
            withdrawalStatusChange: data.withdrawalStatusChange ?? true,
            investmentApplicationSubmitted: data.investmentApplicationSubmitted ?? true,
            investmentApplicationStatusChange: data.investmentApplicationStatusChange ?? true,
            investmentPurchase: data.investmentPurchase ?? true,
            investmentMatured: data.investmentMatured ?? true,
            balanceAdjustment: data.balanceAdjustment ?? true,
            adminNotifications: data.adminNotifications ?? true,
          },
        })) as Record<string, unknown>;
      }
    } else {
      // For user-specific settings, use upsert
      settings = (await prismaClient.emailNotificationSettings.upsert({
        where: { userId: userIdValue },
        update: updateData,
        create: {
          userId: userIdValue,
          accountCreated: data.accountCreated ?? true,
          accountLocked: data.accountLocked ?? true,
          accountUnlocked: data.accountUnlocked ?? true,
          kycStatusChange: data.kycStatusChange ?? true,
          documentStatusChange: data.documentStatusChange ?? true,
          documentUploaded: data.documentUploaded ?? true,
          depositSubmitted: data.depositSubmitted ?? true,
          depositStatusChange: data.depositStatusChange ?? true,
          withdrawalSubmitted: data.withdrawalSubmitted ?? true,
          withdrawalStatusChange: data.withdrawalStatusChange ?? true,
          investmentApplicationSubmitted: data.investmentApplicationSubmitted ?? true,
          investmentApplicationStatusChange: data.investmentApplicationStatusChange ?? true,
          investmentPurchase: data.investmentPurchase ?? true,
          investmentMatured: data.investmentMatured ?? true,
          balanceAdjustment: data.balanceAdjustment ?? true,
          adminNotifications: data.adminNotifications ?? true,
        },
      })) as Record<string, unknown>;
    }

    const settingsData = settings as EmailNotificationSettingsData;
    return {
      accountCreated: settingsData.accountCreated,
      accountLocked: settingsData.accountLocked,
      accountUnlocked: settingsData.accountUnlocked,
      kycStatusChange: settingsData.kycStatusChange,
      documentStatusChange: settingsData.documentStatusChange,
      documentUploaded: settingsData.documentUploaded,
      depositSubmitted: settingsData.depositSubmitted,
      depositStatusChange: settingsData.depositStatusChange,
      withdrawalSubmitted: settingsData.withdrawalSubmitted,
      withdrawalStatusChange: settingsData.withdrawalStatusChange,
      investmentApplicationSubmitted: settingsData.investmentApplicationSubmitted,
      investmentApplicationStatusChange: settingsData.investmentApplicationStatusChange,
      investmentPurchase: settingsData.investmentPurchase,
      investmentMatured: settingsData.investmentMatured,
      balanceAdjustment: settingsData.balanceAdjustment,
      adminNotifications: settingsData.adminNotifications,
    };
  }

  /**
   * Check if a notification should be sent based on settings
   */
  async shouldSendNotification(
    userId: string | null,
    notificationType: keyof EmailNotificationSettingsData
  ): Promise<boolean> {
    const settings = await this.getSettings(userId);
    return settings[notificationType] ?? true; // Default to true if not set
  }
}

export const emailSettingsService = new EmailSettingsService();
