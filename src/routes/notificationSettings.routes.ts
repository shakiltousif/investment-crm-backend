import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { notificationSettingsService } from '../services/notificationSettings.service.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/notification-settings
 * Get current user's in-app notification settings
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await notificationSettingsService.getSettings(req.userId);
    res.status(200).json({
      message: 'Notification settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/notification-settings
 * Update current user's in-app notification settings
 */
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      accountCreated: z.boolean().optional(),
      accountLocked: z.boolean().optional(),
      accountUnlocked: z.boolean().optional(),
      kycStatusChange: z.boolean().optional(),
      documentStatusChange: z.boolean().optional(),
      documentUploaded: z.boolean().optional(),
      depositSubmitted: z.boolean().optional(),
      depositStatusChange: z.boolean().optional(),
      withdrawalSubmitted: z.boolean().optional(),
      withdrawalStatusChange: z.boolean().optional(),
      investmentApplicationSubmitted: z.boolean().optional(),
      investmentApplicationStatusChange: z.boolean().optional(),
      investmentPurchase: z.boolean().optional(),
      investmentMatured: z.boolean().optional(),
      balanceAdjustment: z.boolean().optional(),
      adminNotifications: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const settings = await notificationSettingsService.updateSettings(req.userId!, validatedData);

    res.status(200).json({
      message: 'Notification settings updated successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

// Admin-only routes
router.use(requireAdmin);

/**
 * GET /api/notification-settings/global
 * Get global in-app notification settings (admin only)
 */
router.get('/global', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await notificationSettingsService.getSettings(null);
    res.status(200).json({
      message: 'Global notification settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/notification-settings/global
 * Update global in-app notification settings (admin only)
 */
router.put('/global', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      accountCreated: z.boolean().optional(),
      accountLocked: z.boolean().optional(),
      accountUnlocked: z.boolean().optional(),
      kycStatusChange: z.boolean().optional(),
      documentStatusChange: z.boolean().optional(),
      documentUploaded: z.boolean().optional(),
      depositSubmitted: z.boolean().optional(),
      depositStatusChange: z.boolean().optional(),
      withdrawalSubmitted: z.boolean().optional(),
      withdrawalStatusChange: z.boolean().optional(),
      investmentApplicationSubmitted: z.boolean().optional(),
      investmentApplicationStatusChange: z.boolean().optional(),
      investmentPurchase: z.boolean().optional(),
      investmentMatured: z.boolean().optional(),
      balanceAdjustment: z.boolean().optional(),
      adminNotifications: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const settings = await notificationSettingsService.updateSettings(null, validatedData);

    res.status(200).json({
      message: 'Global notification settings updated successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/notification-settings/:userId
 * Get in-app notification settings for a specific user (admin only)
 */
router.get('/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await notificationSettingsService.getSettings(req.params.userId);
    res.status(200).json({
      message: 'User notification settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/notification-settings/:userId
 * Update in-app notification settings for a specific user (admin only)
 */
router.put('/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      accountCreated: z.boolean().optional(),
      accountLocked: z.boolean().optional(),
      accountUnlocked: z.boolean().optional(),
      kycStatusChange: z.boolean().optional(),
      documentStatusChange: z.boolean().optional(),
      documentUploaded: z.boolean().optional(),
      depositSubmitted: z.boolean().optional(),
      depositStatusChange: z.boolean().optional(),
      withdrawalSubmitted: z.boolean().optional(),
      withdrawalStatusChange: z.boolean().optional(),
      investmentApplicationSubmitted: z.boolean().optional(),
      investmentApplicationStatusChange: z.boolean().optional(),
      investmentPurchase: z.boolean().optional(),
      investmentMatured: z.boolean().optional(),
      balanceAdjustment: z.boolean().optional(),
      adminNotifications: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const settings = await notificationSettingsService.updateSettings(
      req.params.userId,
      validatedData
    );

    res.status(200).json({
      message: 'User notification settings updated successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

export default router;
