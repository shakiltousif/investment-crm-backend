import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { emailSettingsService } from '../services/emailSettings.service.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/email-settings
 * Get current user's email notification settings
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await emailSettingsService.getSettings(req.userId);
    res.status(200).json({
      message: 'Email settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/email-settings
 * Update current user's email notification settings
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
    const settings = await emailSettingsService.updateSettings(req.userId!, validatedData);

    res.status(200).json({
      message: 'Email settings updated successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

// Admin-only routes
router.use(requireAdmin);

/**
 * GET /api/email-settings/global
 * Get global email notification settings (admin only)
 */
router.get('/global', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await emailSettingsService.getSettings(null);
    res.status(200).json({
      message: 'Global email settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/email-settings/global
 * Update global email notification settings (admin only)
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
    const settings = await emailSettingsService.updateSettings(null, validatedData);

    res.status(200).json({
      message: 'Global email settings updated successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/email-settings/:userId
 * Get email notification settings for a specific user (admin only)
 */
router.get('/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await emailSettingsService.getSettings(req.params.userId);
    res.status(200).json({
      message: 'User email settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/email-settings/:userId
 * Update email notification settings for a specific user (admin only)
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
    const settings = await emailSettingsService.updateSettings(req.params.userId, validatedData);

    res.status(200).json({
      message: 'User email settings updated successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

export default router;
