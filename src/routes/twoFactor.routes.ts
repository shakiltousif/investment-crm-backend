import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { twoFactorService } from '../services/twoFactor.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const verifyCodeSchema = z.object({
  code: z.string().min(6, 'Code must be at least 6 characters'),
});

const verifyBackupCodeSchema = z.object({
  backupCode: z.string().min(1, 'Backup code is required'),
});

/**
 * GET /api/2fa/setup
 * Generate 2FA setup
 */
router.get('/setup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const setup = await twoFactorService.generateTwoFactorSecret(req.userId!);
    res.status(200).json({ success: true, data: setup });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/2fa/enable
 * Enable 2FA
 */
router.post('/enable', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { secret, backupCodes } = req.body;

    if (!secret || !backupCodes || !Array.isArray(backupCodes)) {
      throw new Error('Invalid request');
    }

    const result = await twoFactorService.enableTwoFactor(req.userId!, secret, backupCodes);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/2fa/disable
 * Disable 2FA
 */
router.post('/disable', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await twoFactorService.disableTwoFactor(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/2fa/verify
 * Verify TOTP code
 */
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = verifyCodeSchema.parse(req.body);
    await twoFactorService.verifyTOTPCode(req.userId!, code);
    res.status(200).json({ success: true, message: 'Code verified' });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/2fa/verify-backup
 * Verify backup code
 */
router.post('/verify-backup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { backupCode } = verifyBackupCodeSchema.parse(req.body);
    await twoFactorService.verifyBackupCode(req.userId!, backupCode);
    res.status(200).json({ success: true, message: 'Backup code verified' });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/2fa/status
 * Get 2FA status
 */
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const status = await twoFactorService.getTwoFactorStatus(req.userId!);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/2fa/regenerate-backup-codes
 * Regenerate backup codes
 */
router.post('/regenerate-backup-codes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await twoFactorService.regenerateBackupCodes(req.userId!);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    throw error;
  }
});

export default router;

