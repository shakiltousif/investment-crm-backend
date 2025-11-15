import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { io } from '../index.js';
import { Prisma } from '@prisma/client';

// Type alias for NotificationType enum (used in interfaces)
// Using string literal union matching Prisma NotificationType enum
type NotificationType =
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'KYC_STATUS_CHANGE'
  | 'DOCUMENT_STATUS_CHANGE'
  | 'DOCUMENT_UPLOADED'
  | 'DEPOSIT_SUBMITTED'
  | 'DEPOSIT_STATUS_CHANGE'
  | 'WITHDRAWAL_SUBMITTED'
  | 'WITHDRAWAL_STATUS_CHANGE'
  | 'INVESTMENT_APPLICATION_SUBMITTED'
  | 'INVESTMENT_APPLICATION_STATUS_CHANGE'
  | 'INVESTMENT_PURCHASE'
  | 'INVESTMENT_MATURED'
  | 'BALANCE_ADJUSTMENT'
  | 'ADMIN_NOTIFICATION'
  | 'PROBLEM_REPORT_SUBMITTED'
  | 'PROBLEM_REPORT_RESPONSE'
  | 'PROBLEM_REPORT_STATUS_CHANGE';

// Type assertion for Prisma client to include notification models
// These models exist in the generated Prisma client but TypeScript language server may not recognize them
type NotificationDelegate = {
  create: (args: { data: unknown }) => Promise<unknown>;
  findMany: (args?: {
    where?: unknown;
    orderBy?: unknown;
    take?: number;
    skip?: number;
  }) => Promise<unknown[]>;
  findFirst: (args: { where: unknown }) => Promise<unknown | null>;
  count: (args?: { where?: unknown }) => Promise<number>;
  update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>;
  updateMany: (args: { where: unknown; data: unknown }) => Promise<unknown>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
};

type InAppNotificationSettingsDelegate = {
  findUnique: (args: { where: { userId: string | null } }) => Promise<unknown | null>;
  findFirst: (args: { where: { userId: string | null } }) => Promise<unknown | null>;
};

const prismaClient = prisma as typeof prisma & {
  notification: NotificationDelegate;
  inAppNotificationSettings: InAppNotificationSettingsDelegate;
};

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  actionUrl?: string;
}

export interface NotificationFilters {
  isRead?: boolean;
  type?: NotificationType;
  limit?: number;
  offset?: number;
}

export class NotificationService {
  /**
   * Create a notification and emit via Socket.io
   */
  async createNotification(data: CreateNotificationData): Promise<void> {
    // Check if user wants to receive this notification type
    const shouldSend = await this.shouldSendNotification(data.userId, data.type);
    if (!shouldSend) {
      return; // User has disabled this notification type
    }

    const notification = (await prismaClient.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: (data.data as Prisma.InputJsonValue) ?? {},
        actionUrl: data.actionUrl,
      },
    })) as Record<string, unknown>;

    // Emit notification via Socket.io to the user's room
    if (io) {
      io.to(`user:${data.userId}`).emit('notification', {
        id: notification.id as string,
        type: notification.type as NotificationType,
        title: notification.title as string,
        message: notification.message as string,
        data: notification.data as Record<string, unknown> | null,
        actionUrl: notification.actionUrl as string | null,
        isRead: notification.isRead as boolean,
        createdAt: notification.createdAt as Date,
      });
    }
  }

  /**
   * Get notifications for a user with pagination and filters
   */
  async getNotifications(
    userId: string,
    filters: NotificationFilters = {}
  ): Promise<{
    notifications: Array<{
      id: string;
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      isRead: boolean;
      data: Record<string, unknown> | null;
      actionUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    total: number;
    unreadCount: number;
  }> {
    const where: Record<string, unknown> = {
      userId,
    };

    if (filters.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prismaClient.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      prismaClient.notification.count({ where }),
      prismaClient.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      notifications: (notifications as Array<Record<string, unknown>>).map((n) => ({
        id: n.id as string,
        userId: n.userId as string,
        type: n.type as NotificationType,
        title: n.title as string,
        message: n.message as string,
        isRead: n.isRead as boolean,
        data: n.data as Record<string, unknown> | null,
        actionUrl: n.actionUrl as string | null,
        createdAt: n.createdAt as Date,
        updatedAt: n.updatedAt as Date,
      })),
      total,
      unreadCount,
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const notification = (await prismaClient.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    })) as Record<string, unknown> | null;

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    if (!(notification as { isRead: boolean }).isRead) {
      await prismaClient.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      // Emit update via Socket.io
      if (io) {
        io.to(`user:${userId}`).emit('notification:read', {
          notificationId,
          isRead: true,
        });
      }
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await prismaClient.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Emit update via Socket.io
    if (io) {
      io.to(`user:${userId}`).emit('notifications:all-read', { userId });
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notification = (await prismaClient.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    })) as Record<string, unknown> | null;

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    await prismaClient.notification.delete({
      where: { id: notificationId },
    });

    // Emit deletion via Socket.io
    if (io) {
      io.to(`user:${userId}`).emit('notification:deleted', { notificationId });
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prismaClient.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Check if user should receive a notification based on preferences
   */
  async shouldSendNotification(
    userId: string,
    notificationType: NotificationType
  ): Promise<boolean> {
    // Get user's notification settings
    const settings = (await prismaClient.inAppNotificationSettings.findUnique({
      where: { userId },
    })) as Record<string, unknown> | null;

    // If user has custom settings, use them
    if (settings) {
      const settingKey = this.getSettingKey(notificationType);
      if (settingKey) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settingValue = (settings as any)[settingKey];
        if (settingValue === false) {
          return false;
        }
      }
    }

    // Check global settings
    const globalSettings = (await prismaClient.inAppNotificationSettings.findFirst({
      where: { userId: null },
    })) as Record<string, unknown> | null;

    if (globalSettings) {
      const settingKey = this.getSettingKey(notificationType);
      if (settingKey) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settingValue = (globalSettings as any)[settingKey];
        if (settingValue === false) {
          return false;
        }
      }
    }

    // Default to true if no settings found
    return true;
  }

  /**
   * Map notification type to settings key
   */
  private getSettingKey(type: NotificationType): string | null {
    const mapping: Record<NotificationType, string> = {
      ACCOUNT_CREATED: 'accountCreated',
      ACCOUNT_LOCKED: 'accountLocked',
      ACCOUNT_UNLOCKED: 'accountUnlocked',
      KYC_STATUS_CHANGE: 'kycStatusChange',
      DOCUMENT_STATUS_CHANGE: 'documentStatusChange',
      DOCUMENT_UPLOADED: 'documentUploaded',
      DEPOSIT_SUBMITTED: 'depositSubmitted',
      DEPOSIT_STATUS_CHANGE: 'depositStatusChange',
      WITHDRAWAL_SUBMITTED: 'withdrawalSubmitted',
      WITHDRAWAL_STATUS_CHANGE: 'withdrawalStatusChange',
      INVESTMENT_APPLICATION_SUBMITTED: 'investmentApplicationSubmitted',
      INVESTMENT_APPLICATION_STATUS_CHANGE: 'investmentApplicationStatusChange',
      INVESTMENT_PURCHASE: 'investmentPurchase',
      INVESTMENT_MATURED: 'investmentMatured',
      BALANCE_ADJUSTMENT: 'balanceAdjustment',
      ADMIN_NOTIFICATION: 'adminNotifications',
      PROBLEM_REPORT_SUBMITTED: 'problemReportSubmitted',
      PROBLEM_REPORT_RESPONSE: 'problemReportResponse',
      PROBLEM_REPORT_STATUS_CHANGE: 'problemReportStatusChange',
    };

    return mapping[type] || null;
  }
}

export const notificationService = new NotificationService();
