import { prisma } from '../lib/prisma.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Type assertion for Prisma client to include SMTP configuration model
// This model exists in the generated Prisma client but TypeScript language server may not recognize it
type SMTPConfigurationDelegate = {
  findFirst: (args: { where: unknown; orderBy?: unknown }) => Promise<unknown | null>;
  findMany: (args?: unknown) => Promise<unknown[]>;
  updateMany: (args: { where: unknown; data: unknown }) => Promise<unknown>;
  create: (args: { data: unknown }) => Promise<unknown>;
};

const prismaClient = prisma as typeof prisma & {
  sMTPConfiguration: SMTPConfigurationDelegate;
};

export interface SMTPConfigData {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string; // Optional for testing (can use saved password)
  from?: string;
  senderName?: string;
  isActive?: boolean;
  testEmail?: string;
}

export interface SMTPConfigResponse {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from?: string;
  senderName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SMTPConfigService {
  /**
   * Get current SMTP configuration
   * Returns password-masked configuration
   */
  async getConfig(): Promise<SMTPConfigResponse | null> {
    const config = (await prismaClient.sMTPConfiguration.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })) as Record<string, unknown> | null;

    if (!config) {
      return null;
    }

    // Return config without password
    const configData = config as {
      id: string;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      from: string | null;
      senderName: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    return {
      id: configData.id,
      host: configData.host,
      port: configData.port,
      secure: configData.secure,
      user: configData.user,
      from: configData.from ?? undefined,
      senderName: configData.senderName ?? undefined,
      isActive: configData.isActive,
      createdAt: configData.createdAt,
      updatedAt: configData.updatedAt,
    };
  }

  /**
   * Get SMTP configuration with password (for internal use only)
   */
  async getConfigWithPassword(): Promise<{
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from?: string;
    senderName?: string;
  } | null> {
    const config = (await prismaClient.sMTPConfiguration.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })) as Record<string, unknown> | null;

    if (!config) {
      return null;
    }

    // Decrypt password (stored as bcrypt hash, but we need plain text for nodemailer)
    // Note: In production, consider using encryption instead of hashing for passwords
    // For now, we'll store it encrypted with a simple approach
    // In a real scenario, use proper encryption like AES
    const configData = config as {
      password: string;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      from: string | null;
      senderName: string | null;
    };
    const decryptedPassword = this.decryptPassword(configData.password);

    return {
      host: configData.host,
      port: configData.port,
      secure: configData.secure,
      auth: {
        user: configData.user,
        pass: decryptedPassword,
      },
      from: configData.from ?? configData.user,
      senderName: configData.senderName ?? 'Fidelity Investment Portal',
    };
  }

  /**
   * Update or create SMTP configuration
   */
  async updateConfig(data: SMTPConfigData): Promise<SMTPConfigResponse> {
    if (!data.password) {
      throw new Error('Password is required when saving configuration');
    }

    // Deactivate all existing configs
    await prismaClient.sMTPConfiguration.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Encrypt password before storing
    const encryptedPassword = this.encryptPassword(data.password);

    // Create new active configuration
    const config = (await prismaClient.sMTPConfiguration.create({
      data: {
        host: data.host,
        port: data.port,
        secure: data.secure ?? true,
        user: data.user,
        password: encryptedPassword,
        from: data.from,
        senderName: data.senderName ?? 'Fidelity Investment Portal',
        isActive: data.isActive ?? true,
      },
    })) as Record<string, unknown>;

    const configData = config as {
      id: string;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      from: string | null;
      senderName: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    return {
      id: configData.id,
      host: configData.host,
      port: configData.port,
      secure: configData.secure,
      user: configData.user,
      from: configData.from ?? undefined,
      senderName: configData.senderName ?? undefined,
      isActive: configData.isActive,
      createdAt: configData.createdAt,
      updatedAt: configData.updatedAt,
    };
  }

  /**
   * Test SMTP configuration
   */
  async testConfig(data: SMTPConfigData): Promise<{ success: boolean; message: string }> {
    try {
      // If password is not provided, try to get it from existing config
      let password = data.password;
      if (!password) {
        const existingConfig = await this.getConfigWithPassword();
        if (!existingConfig) {
          return {
            success: false,
            message: 'Password is required for testing. Please enter the password.',
          };
        }
        password = existingConfig.auth.pass;
      }

      const transporter = nodemailer.createTransport({
        host: data.host,
        port: data.port,
        secure: data.secure ?? true,
        auth: {
          user: data.user,
          pass: password,
        },
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 30000,
        socketTimeout: 30000,
        debug: false, // Set to true for detailed logging
        logger: false,
        tls: {
          // Don't reject unauthorized certificates (some servers have self-signed certs)
          rejectUnauthorized: false,
        },
      });

      let message = 'SMTP configuration is valid and connection successful';

      // If test email is provided, try sending email directly (more reliable than verify)
      if (data.testEmail) {
        try {
          const fromAddress = data.from ?? data.user;
          const senderName = data.senderName ?? 'Fidelity Investment Portal';
          const fromHeader = senderName ? `"${senderName}" <${fromAddress}>` : fromAddress;

          // Send email with a timeout to prevent hanging
          const sendPromise = transporter.sendMail({
            from: fromHeader,
            to: data.testEmail,
            subject: 'SMTP Configuration Test Email',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">SMTP Configuration Test</h2>
                <p>This is a test email to verify your SMTP configuration is working correctly.</p>
                <p>If you received this email, your SMTP settings are configured properly!</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px;">
                  This is an automated test email from your investment CRM system.
                </p>
              </div>
            `,
            text: 'This is a test email to verify your SMTP configuration is working correctly. If you received this email, your SMTP settings are configured properly!',
          });

          // Wait for email to be accepted by SMTP server (with timeout)
          await Promise.race([
            sendPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Email sending timed out after 30 seconds')), 30000)
            ),
          ]);

          // If we get here, email was accepted by server
          message = `Test email sent successfully to ${data.testEmail}. If you received the email, your SMTP configuration is working correctly!`;

          // Log success for debugging
          console.warn('Test email sent successfully:', {
            to: data.testEmail,
            from: fromAddress,
            host: data.host,
            port: data.port,
          });
        } catch (emailError: unknown) {
          const err = emailError as {
            message?: string;
            code?: string;
            command?: string;
            response?: unknown;
          };
          console.error('Failed to send test email:', {
            error: err.message,
            code: err.code,
            command: err.command,
            response: err.response,
          });

          // Check if it's just a timeout but email might have been sent
          if (err.message?.includes('timeout') || err.code === 'ETIMEDOUT') {
            // Email might have been sent but server is slow to respond
            return {
              success: true,
              message: `Email sending may have succeeded but server response timed out. Please check ${data.testEmail} inbox. If you received the email, your SMTP configuration is working correctly!`,
            };
          }

          // If sending fails, try verify as fallback to get more specific error
          try {
            await Promise.race([
              transporter.verify(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Verification timeout')), 10000)
              ),
            ]);
            return {
              success: false,
              message: `Connection verified but failed to send test email: ${err.message ?? err.code ?? 'Unknown error'}`,
            };
          } catch (verifyError: unknown) {
            return {
              success: false,
              message: `Failed to send test email: ${(emailError as { message?: string; code?: string }).message ?? (emailError as { message?: string; code?: string }).code ?? 'Unknown error'}. Connection verification also failed: ${(verifyError as { message?: string; code?: string }).message ?? (verifyError as { message?: string; code?: string }).code ?? 'Unknown error'}`,
            };
          }
        }
      } else {
        // If no test email, just verify the connection (with timeout handling)
        try {
          await Promise.race([
            transporter.verify(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Connection verification timed out after 30 seconds')),
                30000
              )
            ),
          ]);
          message = 'SMTP configuration is valid and connection successful';
        } catch (verifyError: unknown) {
          // If verify times out but we can still try a quick connection test
          // Some servers don't respond well to verify() but can still send emails
          const verifyErr = verifyError as { message?: string; code?: string };
          if (verifyErr.message?.includes('timeout') || verifyErr.code === 'ETIMEDOUT') {
            return {
              success: false,
              message: `Connection verification timed out. The server may be slow to respond. Try sending a test email instead to verify the configuration works.`,
            };
          }
          throw verifyError;
        }
      }

      return {
        success: true,
        message,
      };
    } catch (error: unknown) {
      // Extract more detailed error information
      let errorMessage = 'Failed to connect to SMTP server';
      const err = error as { code?: string; message?: string };

      if (err.code) {
        // Handle specific error codes
        switch (err.code) {
          case 'EAUTH':
            errorMessage = 'Authentication failed. Please check your email and password.';
            break;
          case 'ECONNECTION':
            errorMessage = `Connection failed. Please check the SMTP host (${data.host}) and port (${data.port}).`;
            break;
          case 'ETIMEDOUT':
          case 'ETIMEOUT':
            errorMessage = `Connection timed out after 30 seconds. Possible causes:
- The SMTP server (${data.host}:${data.port}) may be unreachable
- Your firewall may be blocking the connection
- The port (${data.port}) may be incorrect
- The server may be down or slow to respond
Please verify your SMTP settings and check your network connection.`;
            break;
          case 'ESOCKET':
            errorMessage =
              'Socket error. Please check your network connection and firewall settings.';
            break;
          case 'EENVELOPE':
            errorMessage = 'Invalid email address format.';
            break;
          default:
            errorMessage = err.message ?? `Connection error: ${err.code ?? 'Unknown'}`;
        }
      } else if (err.message) {
        // Use the error message if available
        errorMessage = err.message;

        // Provide more helpful messages for common issues
        if (errorMessage.includes('Invalid login')) {
          errorMessage = 'Authentication failed. Please check your email and password.';
        } else if (errorMessage.includes('self signed certificate')) {
          errorMessage =
            'SSL certificate error. The server may require a different security setting.';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('exceeded')) {
          errorMessage = `Connection timed out. Possible causes:
- The SMTP server (${data.host}:${data.port}) may be unreachable
- Your firewall may be blocking the connection  
- The port (${data.port}) may be incorrect
- The server may be down or slow to respond
Please verify your SMTP settings and check your network connection.`;
        } else if (errorMessage.includes('ECONNREFUSED')) {
          errorMessage = `Connection refused. Please verify the SMTP host (${data.host}) and port (${data.port}) are correct.`;
        }
      }

      // Log the full error for debugging
      const errorDetails = error as {
        code?: string;
        message?: string;
        command?: string;
        response?: unknown;
        responseCode?: string;
      };
      console.error('SMTP test error:', {
        code: errorDetails.code,
        message: errorDetails.message,
        command: errorDetails.command,
        response: errorDetails.response,
        responseCode: errorDetails.responseCode,
      });

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Simple encryption for password storage
   * Note: In production, use proper encryption (AES) with a secure key
   */
  private encryptPassword(password: string): string {
    // For now, use a simple base64 encoding
    // In production, use proper encryption like crypto.createCipheriv
    const encryptionKey = process.env.SMTP_ENCRYPTION_KEY ?? 'default-key-change-in-production';
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt password
   */
  private decryptPassword(encryptedPassword: string): string {
    try {
      const encryptionKey = process.env.SMTP_ENCRYPTION_KEY ?? 'default-key-change-in-production';
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(encryptionKey, 'salt', 32);
      const parts = encryptedPassword.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      // If decryption fails, return empty string (will cause connection to fail)
      console.error('Failed to decrypt SMTP password:', error);
      return '';
    }
  }
}

export const smtpConfigService = new SMTPConfigService();
