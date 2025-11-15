import nodemailer from 'nodemailer';
import { smtpConfigService } from './smtpConfig.service.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SMTPConfigCache {
  config: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password?: string;
    from?: string;
  };
  timestamp: number;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private configCache: SMTPConfigCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize with environment variables first, then try to load from DB
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT ?? '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    // Try to load from database asynchronously
    this.initializeTransporter().catch(console.error);
  }

  /**
   * Initialize or reinitialize the transporter
   */
  private async initializeTransporter(): Promise<void> {
    try {
      // Try to get SMTP config from database first
      const dbConfig = await smtpConfigService.getConfigWithPassword();

      if (dbConfig) {
        this.transporter = nodemailer.createTransport({
          host: dbConfig.host,
          port: dbConfig.port,
          secure: dbConfig.secure,
          auth: dbConfig.auth,
        });
        this.configCache = {
          config: {
            host: dbConfig.host,
            port: dbConfig.port,
            secure: dbConfig.secure,
            user: dbConfig.auth.user,
            password: dbConfig.auth.pass,
            from: dbConfig.from,
          },
          timestamp: Date.now(),
        };
        return;
      }
    } catch (error) {
      console.warn(
        'Failed to load SMTP config from database, falling back to environment variables:',
        error
      );
    }

    // Fallback to environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT ?? '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Refresh transporter if config cache is stale
   */
  private async refreshTransporterIfNeeded(): Promise<void> {
    const now = Date.now();
    if (!this.configCache || now - this.configCache.timestamp > this.CACHE_TTL) {
      await this.initializeTransporter();
    }
  }

  /**
   * Get the "from" email address
   */
  private async getFromAddress(): Promise<string> {
    await this.refreshTransporterIfNeeded();

    if (this.configCache?.config?.from) {
      return this.configCache.config.from;
    }

    return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@example.com';
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      // Always refresh config before sending to ensure we have the latest SMTP settings
      await this.initializeTransporter();

      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const fromAddress = await this.getFromAddress();
      const mailOptions = {
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]*>/g, ''),
      };

      await this.transporter.sendMail(mailOptions);
      // Email sent successfully
      console.warn(`Email sent successfully to ${options.to} from ${fromAddress}`);
    } catch (error: unknown) {
      const err = error as {
        message?: string;
        code?: string;
        response?: unknown;
        command?: string;
      };
      console.error('Failed to send email:', {
        to: options.to,
        subject: options.subject,
        error: err.message,
        code: err.code,
        response: err.response,
        command: err.command,
      });
      // Re-throw error so caller can handle it appropriately
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password for your FIL LIMITED account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p>${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset Request - FIL LIMITED',
      html,
    });
  }

  /**
   * Send deposit notification email
   */
  async sendDepositNotification(
    email: string,
    amount: number,
    currency: string,
    status: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .status { padding: 10px; border-radius: 5px; margin: 20px 0; }
            .status.pending { background-color: #FEF3C7; color: #92400E; }
            .status.completed { background-color: #D1FAE5; color: #065F46; }
            .status.rejected { background-color: #FEE2E2; color: #991B1B; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Deposit Request ${status === 'COMPLETED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Submitted'}</h2>
            <p>Your deposit request has been ${status.toLowerCase()}.</p>
            <div class="status ${status.toLowerCase()}">
              <strong>Amount:</strong> ${currency} ${amount.toLocaleString()}<br>
              <strong>Status:</strong> ${status}
            </div>
            <p>${status === 'PENDING' ? 'We are processing your deposit request. You will receive another email once it is approved.' : status === 'COMPLETED' ? 'Your deposit has been successfully processed and added to your account.' : 'Your deposit request was rejected. Please contact support for more information.'}</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `Deposit Request ${status} - FIL LIMITED`,
      html,
    });
  }

  /**
   * Send withdrawal notification email
   */
  async sendWithdrawalNotification(
    email: string,
    amount: number,
    currency: string,
    status: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .status { padding: 10px; border-radius: 5px; margin: 20px 0; }
            .status.pending { background-color: #FEF3C7; color: #92400E; }
            .status.completed { background-color: #D1FAE5; color: #065F46; }
            .status.rejected { background-color: #FEE2E2; color: #991B1B; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Withdrawal Request ${status === 'COMPLETED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Submitted'}</h2>
            <p>Your withdrawal request has been ${status.toLowerCase()}.</p>
            <div class="status ${status.toLowerCase()}">
              <strong>Amount:</strong> ${currency} ${amount.toLocaleString()}<br>
              <strong>Status:</strong> ${status}
            </div>
            <p>${status === 'PENDING' ? 'We are processing your withdrawal request. You will receive another email once it is approved.' : status === 'COMPLETED' ? 'Your withdrawal has been successfully processed and will be transferred to your bank account.' : 'Your withdrawal request was rejected. Please contact support for more information.'}</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `Withdrawal Request ${status} - FIL LIMITED`,
      html,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to FIL LIMITED, ${firstName}!</h2>
            <p>Thank you for joining our investment management platform.</p>
            <p>You can now:</p>
            <ul>
              <li>View your portfolio and investments</li>
              <li>Make deposits and withdrawals</li>
              <li>Browse available investment opportunities</li>
              <li>Upload documents and view statements</li>
            </ul>
            <p>If you have any questions, please don't hesitate to contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Welcome to FIL LIMITED',
      html,
    });
  }

  /**
   * Send account created by admin email (with credentials)
   */
  async sendAccountCreatedEmail(
    email: string,
    firstName: string,
    password: string,
    isTemporaryPassword: boolean = false
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .credentials { background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .warning { background-color: #FEF3C7; padding: 10px; border-radius: 5px; margin: 20px 0; color: #92400E; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Your FIL LIMITED Account Has Been Created</h2>
            <p>Hello ${firstName},</p>
            <p>Your account has been created by an administrator. You can now access your account using the credentials below:</p>
            <div class="credentials">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> ${password}</p>
            </div>
            ${isTemporaryPassword ? '<div class="warning"><p><strong>Important:</strong> This is a temporary password. Please change it after your first login.</p></div>' : ''}
            <p>You can log in at: <a href="${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login">${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login</a></p>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Your FIL LIMITED Account Has Been Created',
      html,
    });
  }

  /**
   * Send account locked email
   */
  async sendAccountLockedEmail(email: string, firstName: string, lockUntil?: Date): Promise<void> {
    const lockUntilText = lockUntil ? ` until ${lockUntil.toLocaleString()}` : '';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .warning { background-color: #FEE2E2; padding: 15px; border-radius: 5px; margin: 20px 0; color: #991B1B; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Account Security Alert</h2>
            <p>Hello ${firstName},</p>
            <div class="warning">
              <p><strong>Your account has been temporarily locked${lockUntilText}.</strong></p>
            </div>
            <p>This action was taken due to multiple failed login attempts. This is a security measure to protect your account.</p>
            <p>If this was not you, please contact our support team immediately.</p>
            <p>If you forgot your password, you can reset it using the "Forgot Password" link on the login page.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Account Security Alert - FIL LIMITED',
      html,
    });
  }

  /**
   * Send account unlocked email
   */
  async sendAccountUnlockedEmail(email: string, firstName: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #065F46; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Account Unlocked</h2>
            <p>Hello ${firstName},</p>
            <div class="success">
              <p><strong>Your account has been unlocked.</strong></p>
            </div>
            <p>You can now log in to your account again. If you continue to experience issues, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Account Unlocked - FIL LIMITED',
      html,
    });
  }

  /**
   * Send KYC status change email
   */
  async sendKYCStatusChangeEmail(
    email: string,
    firstName: string,
    status: 'VERIFIED' | 'REJECTED' | 'EXPIRED',
    reason?: string
  ): Promise<void> {
    const statusMessages: Record<string, { title: string; message: string; color: string }> = {
      VERIFIED: {
        title: 'KYC Verification Approved',
        message:
          'Your KYC verification has been approved. You now have full access to all platform features.',
        color: '#065F46',
      },
      REJECTED: {
        title: 'KYC Verification Rejected',
        message: reason
          ? `Your KYC verification has been rejected. Reason: ${reason}. Please contact support for assistance.`
          : 'Your KYC verification has been rejected. Please contact support for assistance.',
        color: '#991B1B',
      },
      EXPIRED: {
        title: 'KYC Verification Expired',
        message:
          'Your KYC verification has expired. Please submit updated documents to continue using the platform.',
        color: '#92400E',
      },
    };

    const statusInfo = statusMessages[status] || statusMessages.REJECTED;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .status { padding: 15px; border-radius: 5px; margin: 20px 0; background-color: ${status === 'VERIFIED' ? '#D1FAE5' : status === 'REJECTED' ? '#FEE2E2' : '#FEF3C7'}; color: ${statusInfo.color}; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${statusInfo.title}</h2>
            <p>Hello ${firstName},</p>
            <div class="status">
              <p><strong>Status:</strong> ${status}</p>
              <p>${statusInfo.message}</p>
            </div>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `${statusInfo.title} - FIL LIMITED`,
      html,
    });
  }

  /**
   * Send document status change email
   */
  async sendDocumentStatusChangeEmail(
    email: string,
    firstName: string,
    documentName: string,
    status: 'VERIFIED' | 'REJECTED',
    reason?: string
  ): Promise<void> {
    const statusInfo =
      status === 'VERIFIED'
        ? {
            title: 'Document Verified',
            message: 'Your document has been verified and approved.',
            color: '#065F46',
            bgColor: '#D1FAE5',
          }
        : {
            title: 'Document Rejected',
            message: reason
              ? `Your document has been rejected. Reason: ${reason}. Please upload a new document.`
              : 'Your document has been rejected. Please upload a new document.',
            color: '#991B1B',
            bgColor: '#FEE2E2',
          };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .status { padding: 15px; border-radius: 5px; margin: 20px 0; background-color: ${statusInfo.bgColor}; color: ${statusInfo.color}; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${statusInfo.title}</h2>
            <p>Hello ${firstName},</p>
            <div class="status">
              <p><strong>Document:</strong> ${documentName}</p>
              <p><strong>Status:</strong> ${status}</p>
              <p>${statusInfo.message}</p>
            </div>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `${statusInfo.title} - FIL LIMITED`,
      html,
    });
  }

  /**
   * Send document uploaded by admin email
   */
  async sendDocumentUploadedByAdminEmail(
    email: string,
    firstName: string,
    documentName: string,
    documentType: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .info { background-color: #DBEAFE; padding: 15px; border-radius: 5px; margin: 20px 0; color: #1E40AF; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>New Document Available</h2>
            <p>Hello ${firstName},</p>
            <div class="info">
              <p>A new document has been uploaded to your account:</p>
              <p><strong>Document Name:</strong> ${documentName}</p>
              <p><strong>Type:</strong> ${documentType}</p>
            </div>
            <p>You can view and download this document from your account dashboard.</p>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'New Document Available - FIL LIMITED',
      html,
    });
  }

  /**
   * Send investment application submitted email (to client)
   */
  async sendInvestmentApplicationSubmittedEmail(
    email: string,
    firstName: string,
    investmentName: string,
    referenceNumber: string,
    requestedAmount: number,
    currency: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .info { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #92400E; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Investment Enrollment Submitted</h2>
            <p>Hello ${firstName},</p>
            <p>Your investment enrollment has been successfully submitted.</p>
            <div class="info">
              <p><strong>Investment:</strong> ${investmentName}</p>
              <p><strong>Reference Number:</strong> ${referenceNumber}</p>
              <p><strong>Requested Amount:</strong> ${currency} ${requestedAmount.toLocaleString()}</p>
              <p><strong>Status:</strong> PENDING</p>
            </div>
            <p>We will review your enrollment and notify you once a decision has been made.</p>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Investment Enrollment Submitted - FIL LIMITED',
      html,
    });
  }

  /**
   * Send investment application status change email (to client)
   */
  async sendInvestmentApplicationStatusChangeEmail(
    email: string,
    firstName: string,
    investmentName: string,
    referenceNumber: string,
    status: 'APPROVED' | 'REJECTED' | 'ALLOCATED',
    allocatedAmount?: number,
    allocatedQuantity?: number,
    currency?: string,
    notes?: string
  ): Promise<void> {
    const statusMessages: Record<
      string,
      { title: string; message: string; color: string; bgColor: string }
    > = {
      APPROVED: {
        title: 'Investment Enrollment Approved',
        message:
          'Your investment enrollment has been approved. You will be notified once allocation is complete.',
        color: '#065F46',
        bgColor: '#D1FAE5',
      },
      ALLOCATED: {
        title: 'Investment Enrollment Allocated',
        message: 'Your investment enrollment has been allocated.',
        color: '#065F46',
        bgColor: '#D1FAE5',
      },
      REJECTED: {
        title: 'Investment Enrollment Rejected',
        message: notes
          ? `Your investment enrollment has been rejected. Reason: ${notes}. Please contact support for more information.`
          : 'Your investment enrollment has been rejected. Please contact support for more information.',
        color: '#991B1B',
        bgColor: '#FEE2E2',
      },
    };

    const statusInfo = statusMessages[status] || statusMessages.REJECTED;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .status { padding: 15px; border-radius: 5px; margin: 20px 0; background-color: ${statusInfo.bgColor}; color: ${statusInfo.color}; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${statusInfo.title}</h2>
            <p>Hello ${firstName},</p>
            <div class="status">
              <p><strong>Investment:</strong> ${investmentName}</p>
              <p><strong>Reference Number:</strong> ${referenceNumber}</p>
              <p><strong>Status:</strong> ${status}</p>
              ${allocatedAmount ? `<p><strong>Allocated Amount:</strong> ${currency ?? 'GBP'} ${allocatedAmount.toLocaleString()}</p>` : ''}
              ${allocatedQuantity ? `<p><strong>Allocated Quantity:</strong> ${allocatedQuantity.toLocaleString()}</p>` : ''}
              <p>${statusInfo.message}</p>
            </div>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `${statusInfo.title} - FIL LIMITED`,
      html,
    });
  }

  /**
   * Send investment purchase confirmation email
   */
  async sendInvestmentPurchaseConfirmationEmail(
    email: string,
    firstName: string,
    investmentName: string,
    quantity: number,
    unitPrice: number,
    totalAmount: number,
    currency: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #065F46; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Investment Purchase Confirmation</h2>
            <p>Hello ${firstName},</p>
            <p>Your investment purchase has been completed successfully.</p>
            <div class="success">
              <p><strong>Investment:</strong> ${investmentName}</p>
              <p><strong>Quantity:</strong> ${quantity.toLocaleString()}</p>
              <p><strong>Unit Price:</strong> ${currency} ${unitPrice.toLocaleString()}</p>
              <p><strong>Total Amount:</strong> ${currency} ${totalAmount.toLocaleString()}</p>
            </div>
            <p>You can view your investment in your portfolio dashboard.</p>
            <p>If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Investment Purchase Confirmation - FIL LIMITED',
      html,
    });
  }

  /**
   * Send investment matured email
   */
  async sendInvestmentMaturedEmail(
    email: string,
    firstName: string,
    investmentName: string,
    maturityDate: Date,
    totalValue: number,
    currency: string
  ): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .info { background-color: #DBEAFE; padding: 15px; border-radius: 5px; margin: 20px 0; color: #1E40AF; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Investment Matured</h2>
            <p>Hello ${firstName},</p>
            <p>Your investment has reached maturity.</p>
            <div class="info">
              <p><strong>Investment:</strong> ${investmentName}</p>
              <p><strong>Maturity Date:</strong> ${maturityDate.toLocaleDateString()}</p>
              <p><strong>Total Value:</strong> ${currency} ${totalValue.toLocaleString()}</p>
            </div>
            <p>You can view the details in your portfolio dashboard. If you have any questions, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Investment Matured - FIL LIMITED',
      html,
    });
  }

  /**
   * Send balance adjustment email
   */
  async sendBalanceAdjustmentEmail(
    email: string,
    firstName: string,
    amount: number,
    currency: string,
    description: string,
    newBalance: number
  ): Promise<void> {
    const isPositive = amount >= 0;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .info { background-color: ${isPositive ? '#D1FAE5' : '#FEE2E2'}; padding: 15px; border-radius: 5px; margin: 20px 0; color: ${isPositive ? '#065F46' : '#991B1B'}; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Account Balance Adjustment</h2>
            <p>Hello ${firstName},</p>
            <p>Your account balance has been adjusted by an administrator.</p>
            <div class="info">
              <p><strong>Adjustment Amount:</strong> ${isPositive ? '+' : ''}${currency} ${Math.abs(amount).toLocaleString()}</p>
              <p><strong>Description:</strong> ${description}</p>
              <p><strong>New Balance:</strong> ${currency} ${newBalance.toLocaleString()}</p>
            </div>
            <p>If you have any questions about this adjustment, please contact our support team.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Account Balance Adjustment - FIL LIMITED',
      html,
    });
  }

  /**
   * Send admin notification email (for new deposits, withdrawals, applications, documents, account lockouts)
   */
  async sendAdminNotificationEmail(
    adminEmails: string[],
    subject: string,
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const detailsHtml = details
      ? Object.entries(details)
          .map(([key, value]) => `<p><strong>${key}:</strong> ${String(value)}</p>`)
          .join('')
      : '';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #92400E; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${subject}</h2>
            <div class="alert">
              <p>${message}</p>
              ${detailsHtml}
            </div>
            <p>Please review this in the admin dashboard.</p>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send to all admin emails
    for (const email of adminEmails) {
      await this.sendEmail({
        to: email,
        subject: `Admin Alert: ${subject} - FIL LIMITED`,
        html,
      });
    }
  }

  /**
   * Helper method to get all admin emails
   */
  async getAdminEmails(): Promise<string[]> {
    const { prisma } = await import('../lib/prisma.js');
    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        email: true,
      },
    });

    return admins.map((admin) => admin.email);
  }

  /**
   * Send problem report submitted email to user
   */
  async sendProblemReportSubmittedEmail(
    email: string,
    firstName: string,
    reportId: string,
    subject: string
  ): Promise<void> {
    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/problem-reports`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #065F46; }
            .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Problem Report Submitted</h2>
            <p>Dear ${firstName},</p>
            <div class="success">
              <p><strong>Your problem report has been submitted successfully!</strong></p>
              <p><strong>Subject:</strong> ${subject}</p>
              <p><strong>Report ID:</strong> ${reportId}</p>
            </div>
            <p>We have received your problem report and our team will review it shortly. You will be notified when there's an update.</p>
            <a href="${reportUrl}" class="button">View Your Reports</a>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Problem Report Submitted - FIL LIMITED',
      html,
    });
  }

  /**
   * Send problem report response email to user
   */
  async sendProblemReportResponseEmail(
    email: string,
    firstName: string,
    _reportId: string,
    adminMessage: string
  ): Promise<void> {
    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/problem-reports`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .response { background-color: #EFF6FF; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #00598f; }
            .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Response to Your Problem Report</h2>
            <p>Dear ${firstName},</p>
            <p>An admin has responded to your problem report:</p>
            <div class="response">
              <p>${adminMessage}</p>
            </div>
            <a href="${reportUrl}" class="button">View Report</a>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Response to Your Problem Report - FIL LIMITED',
      html,
    });
  }

  /**
   * Send problem report status change email to user
   */
  async sendProblemReportStatusChangeEmail(
    email: string,
    firstName: string,
    reportId: string,
    status: string
  ): Promise<void> {
    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/problem-reports`;
    const statusText = status === 'RESOLVED' ? 'Resolved' : 'Reopened';
    const statusColor = status === 'RESOLVED' ? '#D1FAE5' : '#FEF3C7';
    const textColor = status === 'RESOLVED' ? '#065F46' : '#92400E';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .status { background-color: ${statusColor}; padding: 15px; border-radius: 5px; margin: 20px 0; color: ${textColor}; }
            .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Problem Report Status Update</h2>
            <p>Dear ${firstName},</p>
            <div class="status">
              <p><strong>Your problem report has been ${statusText.toLowerCase()}.</strong></p>
              <p><strong>Report ID:</strong> ${reportId}</p>
            </div>
            <p>${status === 'RESOLVED' ? 'Your problem report has been resolved. If you have any further concerns, please feel free to submit a new report.' : 'Your problem report has been reopened and is being reviewed again.'}</p>
            <a href="${reportUrl}" class="button">View Report</a>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject: `Problem Report ${statusText} - FIL LIMITED`,
      html,
    });
  }

  /**
   * Send admin notification for new problem report
   */
  async sendAdminProblemReportNotification(
    adminEmails: string[],
    reportId: string,
    subject: string,
    userName: string
  ): Promise<void> {
    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/admin/problem-reports`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .alert { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #92400E; }
            .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>New Problem Report</h2>
            <div class="alert">
              <p><strong>A new problem report has been submitted.</strong></p>
              <p><strong>Subject:</strong> ${subject}</p>
              <p><strong>User:</strong> ${userName}</p>
              <p><strong>Report ID:</strong> ${reportId}</p>
            </div>
            <p>Please review and respond to this report in the admin dashboard.</p>
            <a href="${reportUrl}" class="button">View Report</a>
            <div class="footer">
              <p>FIL LIMITED Investment Management</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send to all admin emails
    for (const email of adminEmails) {
      await this.sendEmail({
        to: email,
        subject: `New Problem Report: ${subject} - FIL LIMITED`,
        html,
      });
    }
  }
}

export const emailService = new EmailService();
