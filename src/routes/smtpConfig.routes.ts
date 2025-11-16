import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { smtpConfigService } from '../services/smtpConfig.service.js';

const router = Router();

/**
 * GET /api/smtp-config
 * Get current SMTP configuration (admin only)
 */
router.get('/', authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const config = await smtpConfigService.getConfig();
    res.status(200).json({
      message: 'SMTP configuration retrieved successfully',
      data: config,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/smtp-config
 * Update SMTP configuration (admin only)
 */
router.put('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      host: z.string().min(1, 'SMTP host is required'),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean().optional(),
      user: z.string().email('Invalid email address'),
      password: z.string().min(1, 'Password is required'),
      from: z
        .union([
          z.string().email('Invalid from email address'),
          z.literal(''),
          z.undefined(),
        ])
        .optional()
        .transform((val) => (val === '' ? undefined : val)),
      senderName: z.string().optional(),
      isActive: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const config = await smtpConfigService.updateConfig({
      ...validatedData,
      secure: validatedData.secure ?? false,
    });

    res.status(200).json({
      message: 'SMTP configuration updated successfully',
      data: config,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/smtp-config/test
 * Test SMTP configuration (admin only)
 */
router.post('/test', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  // Set a longer timeout for this route (60 seconds)
  req.setTimeout(60000);

  try {
    const schema = z.object({
      host: z.string().min(1, 'SMTP host is required'),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean().optional(),
      user: z.string().email('Invalid email address'),
      password: z.string().optional(), // Optional if using existing saved config
      from: z
        .union([
          z.string().email('Invalid from email address'),
          z.literal(''),
          z.undefined(),
        ])
        .optional()
        .transform((val) => (val === '' ? undefined : val)),
      senderName: z.string().optional(),
      testEmail: z.string().email('Invalid test email address').optional(),
    });

    const validatedData = schema.parse(req.body);
    const result = await smtpConfigService.testConfig({
      ...validatedData,
      secure: validatedData.secure ?? false,
    });

    res.status(result.success ? 200 : 400).json({
      message: result.message,
      success: result.success,
    });
  } catch (error) {
    throw error;
  }
});

export default router;
