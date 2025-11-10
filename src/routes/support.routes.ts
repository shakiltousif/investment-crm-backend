import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { supportService } from '../services/support.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createSupportSettingSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string().min(1, 'Value is required'),
  label: z.string().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

const updateSupportSettingSchema = z.object({
  value: z.string().optional(),
  label: z.string().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/support
 * Get active support settings (public, no auth required)
 */
router.get('/', async (_req, res: Response) => {
  try {
    const supportInfo = await supportService.getFormattedSupportInfo();
    res.status(200).json({
      message: 'Support information retrieved successfully',
      data: supportInfo,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/support/settings
 * Get all support settings (admin only)
 */
router.get('/settings', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await supportService.getAllSupportSettings();
    res.status(200).json({
      message: 'Support settings retrieved successfully',
      data: settings,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/support/settings/:key
 * Get a specific support setting (admin only)
 */
router.get('/settings/:key', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const setting = await supportService.getSupportSettingByKey(req.params.key);
    res.status(200).json({
      message: 'Support setting retrieved successfully',
      data: setting,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/support/settings
 * Create a new support setting (admin only)
 */
router.post('/settings', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = createSupportSettingSchema.parse(req.body);
    const setting = await supportService.createSupportSetting(data);
    res.status(201).json({
      message: 'Support setting created successfully',
      data: setting,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/support/settings/:key
 * Update a support setting (admin only)
 */
router.put('/settings/:key', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateSupportSettingSchema.parse(req.body);
    const setting = await supportService.updateSupportSetting(req.params.key, data);
    res.status(200).json({
      message: 'Support setting updated successfully',
      data: setting,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/support/settings/:key
 * Delete a support setting (admin only)
 */
router.delete('/settings/:key', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await supportService.deleteSupportSetting(req.params.key);
    res.status(200).json({
      message: 'Support setting deleted successfully',
    });
  } catch (error) {
    throw error;
  }
});

export default router;

