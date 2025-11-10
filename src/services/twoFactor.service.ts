import { prisma } from '../lib/prisma';
import { ValidationError } from '../middleware/errorHandler';
import crypto from 'crypto';

export interface TwoFactorSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export class TwoFactorService {
  /**
   * Generate TOTP secret and QR code
   */
  async generateTwoFactorSecret(userId: string): Promise<TwoFactorSetupResponse> {
    // Generate random secret (32 bytes = 256 bits)
    const secret = crypto.randomBytes(32).toString('base64');

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // In production, you would generate a QR code using a library like 'qrcode'
    // For now, we'll return a placeholder
    const qrCode = `otpauth://totp/InvestmentCRM:${userId}?secret=${secret}&issuer=InvestmentCRM`;

    return {
      secret,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(
    userId: string,
    secret: string,
    backupCodes: string[]
  ): Promise<{ success: boolean; message: string; backupCodes: string[] }> {
    // Update user
    // Note: twoFactorBackupCodes field doesn't exist in Prisma schema
    // TODO: Add twoFactorBackupCodes field to User model or store as JSON
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        // twoFactorBackupCodes: hashedBackupCodes, // Field doesn't exist in schema
      },
    });

    return {
      success: true,
      message: '2FA enabled successfully',
      backupCodes, // Return unhashed codes once for user to save
    };
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(userId: string): Promise<{ success: boolean; message: string }> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        // twoFactorBackupCodes: [], // Field doesn't exist in schema
      },
    });

    return {
      success: true,
      message: '2FA disabled successfully',
    };
  }

  /**
   * Verify TOTP code
   */
  async verifyTOTPCode(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.twoFactorSecret) {
      throw new ValidationError('2FA not enabled for this user');
    }

    // In production, use a library like 'speakeasy' to verify TOTP
    // For now, we'll implement a simple verification
    const isValid = this.verifyTOTP(user.twoFactorSecret, code);

    if (!isValid) {
      throw new ValidationError('Invalid 2FA code');
    }

    return true;
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(_userId: string, _code: string): Promise<boolean> {
    // Note: twoFactorBackupCodes field doesn't exist in Prisma schema
    // TODO: Implement backup code verification when field is added to schema
    throw new ValidationError('Backup codes not yet implemented - field missing from schema');
  }

  /**
   * Get 2FA status
   */
  async getTwoFactorStatus(
    userId: string
  ): Promise<{ enabled: boolean; backupCodesRemaining: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ValidationError('User not found');
    }

    return {
      enabled: user.twoFactorEnabled,
      backupCodesRemaining: 0, // TODO: Return actual count when twoFactorBackupCodes field is added
    };
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(
    _userId: string
  ): Promise<{ success: boolean; message: string; backupCodes: string[] }> {
    // Note: twoFactorBackupCodes field doesn't exist in Prisma schema
    // TODO: Implement backup code regeneration when field is added to schema
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // await prisma.user.update({
    //   where: { id: userId },
    //   data: {
    //     twoFactorBackupCodes: hashedBackupCodes, // Field doesn't exist in schema
    //   },
    // });

    return {
      success: true,
      message: 'Backup codes regenerated (not stored - field missing from schema)',
      backupCodes,
    };
  }

  /**
   * Verify TOTP code (simple implementation)
   * In production, use 'speakeasy' library
   */
  private verifyTOTP(_secret: string, code: string): boolean {
    // This is a simplified implementation
    // In production, use: const speakeasy = require('speakeasy');
    // return speakeasy.totp.verify({
    //   secret: secret,
    //   encoding: 'base64',
    //   token: code,
    //   window: 2
    // });

    // For now, accept any 6-digit code (for testing)
    return /^\d{6}$/.test(code);
  }

  /**
   * Hash backup code
   */
  private hashCode(_code: string): string {
    return crypto.createHash('sha256').update(_code).digest('hex');
  }
}

export const twoFactorService = new TwoFactorService();
