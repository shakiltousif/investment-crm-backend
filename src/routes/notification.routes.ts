import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { notificationService } from '../services/notification.service.js';
import { z } from 'zod';

// Type alias for NotificationType enum (used for type assertions only)
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

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/notifications
 * Get user's notifications with pagination and filters
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      isRead: z
        .enum(['true', 'false'])
        .optional()
        .transform((val) => val === 'true'),
      type: z.string().optional(),
      limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : undefined)),
      offset: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : undefined)),
    });

    const parsedFilters = schema.parse(req.query);
    const filters = {
      ...parsedFilters,
      type: parsedFilters.type ? (parsedFilters.type as NotificationType) : undefined,
    };
    const result = await notificationService.getNotifications(req.userId ?? '', filters);

    res.status(200).json({
      message: 'Notifications retrieved successfully',
      data: result,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count', async (req: AuthRequest, res: Response) => {
  try {
    const count = await notificationService.getUnreadCount(req.userId!);
    res.status(200).json({
      message: 'Unread count retrieved successfully',
      data: { count },
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await notificationService.markAsRead(req.userId!, req.params.id);
    res.status(200).json({
      message: 'Notification marked as read',
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await notificationService.markAllAsRead(req.userId!);
    res.status(200).json({
      message: 'All notifications marked as read',
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await notificationService.deleteNotification(req.userId!, req.params.id);
    res.status(200).json({
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    throw error;
  }
});

export default router;
