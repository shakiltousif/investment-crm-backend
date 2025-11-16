import nodemailer from 'nodemailer';
import { smtpConfigService } from './smtpConfig.service.js';
import { emailTemplateService } from './emailTemplate.service.js';

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
    senderName?: string;
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
            senderName: dbConfig.senderName,
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

    const config = this.configCache?.config;
    if (config) {
      const fromAddress =
        config.from ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@example.com';
      const senderName = config.senderName ?? 'Fidelity Investment Portal';
      return `"${senderName}" <${fromAddress}>`;
    }

    const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@example.com';
    const senderName = 'Fidelity Investment Portal';
    return `"${senderName}" <${fromAddress}>`;
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

    const template = await emailTemplateService.getTemplate('PASSWORD_RESET');
    if (!template) {
      throw new Error('Password reset email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      resetUrl,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('DEPOSIT_NOTIFICATION');
    if (!template) {
      throw new Error('Deposit notification email template not found');
    }

    const statusText = status === 'COMPLETED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Submitted';
    const statusClass = status.toLowerCase();
    const statusMessage =
      status === 'PENDING'
        ? 'We are processing your deposit request. You will receive another email once it is approved.'
        : status === 'COMPLETED'
          ? 'Your deposit has been successfully processed and added to your account.'
          : 'Your deposit request was rejected. Please contact support for more information.';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      status,
      statusText,
      statusClass,
      statusMessage,
      amount: amount.toLocaleString(),
      currency,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('WITHDRAWAL_NOTIFICATION');
    if (!template) {
      throw new Error('Withdrawal notification email template not found');
    }

    const statusText = status === 'COMPLETED' ? 'Approved' : status === 'REJECTED' ? 'Rejected' : 'Submitted';
    const statusClass = status.toLowerCase();
    const statusMessage =
      status === 'PENDING'
        ? 'We are processing your withdrawal request. You will receive another email once it is approved.'
        : status === 'COMPLETED'
          ? 'Your withdrawal has been successfully processed and will be transferred to your bank account.'
          : 'Your withdrawal request was rejected. Please contact support for more information.';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      status,
      statusText,
      statusClass,
      statusMessage,
      amount: amount.toLocaleString(),
      currency,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const template = await emailTemplateService.getTemplate('WELCOME_EMAIL');
    if (!template) {
      throw new Error('Welcome email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('ACCOUNT_CREATED');
    if (!template) {
      throw new Error('Account created email template not found');
    }

    const loginUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login`;
    const temporaryPasswordWarning = isTemporaryPassword
      ? '<div class="warning"><p><strong>Important:</strong> This is a temporary password. Please change it after your first login.</p></div>'
      : '';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      email,
      password,
      temporaryPasswordWarning,
      loginUrl,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
    });
  }

  /**
   * Send account locked email
   */
  async sendAccountLockedEmail(email: string, firstName: string, lockUntil?: Date): Promise<void> {
    const template = await emailTemplateService.getTemplate('ACCOUNT_LOCKED');
    if (!template) {
      throw new Error('Account locked email template not found');
    }

    const lockUntilText = lockUntil ? ` until ${lockUntil.toLocaleString()}` : '';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      lockUntilText,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
    });
  }

  /**
   * Send account unlocked email
   */
  async sendAccountUnlockedEmail(email: string, firstName: string): Promise<void> {
    const template = await emailTemplateService.getTemplate('ACCOUNT_UNLOCKED');
    if (!template) {
      throw new Error('Account unlocked email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('KYC_STATUS_CHANGE');
    if (!template) {
      throw new Error('KYC status change email template not found');
    }

    const statusMessages: Record<string, { title: string; message: string; color: string; bgColor: string }> = {
      VERIFIED: {
        title: 'KYC Verification Approved',
        message:
          'Your KYC verification has been approved. You now have full access to all platform features.',
        color: '#065F46',
        bgColor: '#D1FAE5',
      },
      REJECTED: {
        title: 'KYC Verification Rejected',
        message: reason
          ? `Your KYC verification has been rejected. Reason: ${reason}. Please contact support for assistance.`
          : 'Your KYC verification has been rejected. Please contact support for assistance.',
        color: '#991B1B',
        bgColor: '#FEE2E2',
      },
      EXPIRED: {
        title: 'KYC Verification Expired',
        message:
          'Your KYC verification has expired. Please submit updated documents to continue using the platform.',
        color: '#92400E',
        bgColor: '#FEF3C7',
      },
    };

    const statusInfo = statusMessages[status] || statusMessages.REJECTED;

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      status,
      statusTitle: statusInfo.title,
      statusMessage: statusInfo.message,
      statusBgColor: statusInfo.bgColor,
      statusColor: statusInfo.color,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('DOCUMENT_STATUS_CHANGE');
    if (!template) {
      throw new Error('Document status change email template not found');
    }

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

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      documentName,
      status,
      statusTitle: statusInfo.title,
      statusMessage: statusInfo.message,
      statusBgColor: statusInfo.bgColor,
      statusColor: statusInfo.color,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
    });
  }

  /**
   * Send statement status change email
   * Reuses DOCUMENT_STATUS_CHANGE template
   */
  async sendStatementStatusChangeEmail(
    email: string,
    firstName: string,
    statementName: string,
    status: 'VERIFIED' | 'REJECTED',
    reason?: string
  ): Promise<void> {
    // Reuse document status change email template
    await this.sendDocumentStatusChangeEmail(email, firstName, statementName, status, reason);
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
    const template = await emailTemplateService.getTemplate('DOCUMENT_UPLOADED_BY_ADMIN');
    if (!template) {
      throw new Error('Document uploaded by admin email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      documentName,
      documentType,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('INVESTMENT_APPLICATION_SUBMITTED');
    if (!template) {
      throw new Error('Investment application submitted email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      investmentName,
      referenceNumber,
      requestedAmount: requestedAmount.toLocaleString(),
      currency,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('INVESTMENT_APPLICATION_STATUS_CHANGE');
    if (!template) {
      throw new Error('Investment application status change email template not found');
    }

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

    const allocatedAmountHtml = allocatedAmount
      ? `<p><strong>Allocated Amount:</strong> ${currency ?? 'GBP'} ${allocatedAmount.toLocaleString()}</p>`
      : '';
    const allocatedQuantityHtml = allocatedQuantity
      ? `<p><strong>Allocated Quantity:</strong> ${allocatedQuantity.toLocaleString()}</p>`
      : '';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      investmentName,
      referenceNumber,
      status,
      statusTitle: statusInfo.title,
      statusMessage: statusInfo.message,
      statusBgColor: statusInfo.bgColor,
      statusColor: statusInfo.color,
      allocatedAmountHtml,
      allocatedQuantityHtml,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('INVESTMENT_PURCHASE_CONFIRMATION');
    if (!template) {
      throw new Error('Investment purchase confirmation email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      investmentName,
      quantity: quantity.toLocaleString(),
      unitPrice: unitPrice.toLocaleString(),
      totalAmount: totalAmount.toLocaleString(),
      currency,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
    });
  }

  /**
   * Send investment approval email
   */
  async sendInvestmentApprovalEmail(
    email: string,
    firstName: string,
    investmentName: string,
    totalAmount: number
  ): Promise<void> {
    const template = await emailTemplateService.getTemplate('INVESTMENT_PURCHASE_CONFIRMATION');
    if (!template) {
      throw new Error('Investment purchase confirmation email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      investmentName,
      quantity: '1',
      unitPrice: totalAmount.toLocaleString(),
      totalAmount: totalAmount.toLocaleString(),
      currency: 'GBP',
      status: 'approved',
      message: `Your investment in "${investmentName}" has been approved and is now active in your portfolio.`,
    });

    await this.sendEmail({
      to: email,
      subject: `Investment Approved: ${investmentName}`,
      html: interpolated.html,
    });
  }

  /**
   * Send investment rejection email
   */
  async sendInvestmentRejectionEmail(
    email: string,
    firstName: string,
    investmentName: string,
    reason?: string
  ): Promise<void> {
    const template = await emailTemplateService.getTemplate('INVESTMENT_PURCHASE_CONFIRMATION');
    if (!template) {
      throw new Error('Investment purchase confirmation email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      investmentName,
      quantity: '1',
      unitPrice: '0',
      totalAmount: '0',
      currency: 'GBP',
      status: 'rejected',
      message: `Your investment request for "${investmentName}" has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
    });

    await this.sendEmail({
      to: email,
      subject: `Investment Rejected: ${investmentName}`,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('INVESTMENT_MATURED');
    if (!template) {
      throw new Error('Investment matured email template not found');
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      investmentName,
      maturityDate: maturityDate.toLocaleDateString(),
      totalValue: totalValue.toLocaleString(),
      currency,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('BALANCE_ADJUSTMENT');
    if (!template) {
      throw new Error('Balance adjustment email template not found');
    }

    const isPositive = amount >= 0;
    const adjustmentAmount = `${isPositive ? '+' : ''}${currency} ${Math.abs(amount).toLocaleString()}`;
    const adjustmentBgColor = isPositive ? '#D1FAE5' : '#FEE2E2';
    const adjustmentColor = isPositive ? '#065F46' : '#991B1B';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      adjustmentAmount,
      description,
      newBalance: newBalance.toLocaleString(),
      currency,
      adjustmentBgColor,
      adjustmentColor,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('ADMIN_NOTIFICATION');
    if (!template) {
      throw new Error('Admin notification email template not found');
    }

    const detailsHtml = details
      ? Object.entries(details)
          .map(([key, value]) => `<p><strong>${key}:</strong> ${String(value)}</p>`)
          .join('')
      : '';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      subject,
      message,
      detailsHtml,
    });

    // Send to all admin emails
    for (const email of adminEmails) {
      await this.sendEmail({
        to: email,
        subject: interpolated.subject,
        html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('PROBLEM_REPORT_SUBMITTED');
    if (!template) {
      throw new Error('Problem report submitted email template not found');
    }

    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/problem-reports`;

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      subject,
      reportId,
      reportUrl,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('PROBLEM_REPORT_RESPONSE');
    if (!template) {
      throw new Error('Problem report response email template not found');
    }

    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/problem-reports`;

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      adminMessage,
      reportUrl,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('PROBLEM_REPORT_STATUS_CHANGE');
    if (!template) {
      throw new Error('Problem report status change email template not found');
    }

    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/problem-reports`;
    const statusText = status === 'RESOLVED' ? 'Resolved' : 'Reopened';
    const statusColor = status === 'RESOLVED' ? '#D1FAE5' : '#FEF3C7';
    const textColor = status === 'RESOLVED' ? '#065F46' : '#92400E';
    const statusMessage =
      status === 'RESOLVED'
        ? 'Your problem report has been resolved. If you have any further concerns, please feel free to submit a new report.'
        : 'Your problem report has been reopened and is being reviewed again.';

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      firstName,
      reportId,
      status,
      statusText,
      statusMessage,
      statusColor,
      textColor,
      reportUrl,
    });

    await this.sendEmail({
      to: email,
      subject: interpolated.subject,
      html: interpolated.html,
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
    const template = await emailTemplateService.getTemplate('ADMIN_PROBLEM_REPORT_NOTIFICATION');
    if (!template) {
      throw new Error('Admin problem report notification email template not found');
    }

    const reportUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/admin/problem-reports`;

    const interpolated = emailTemplateService.interpolateTemplate(template, {
      subject,
      userName,
      reportId,
      reportUrl,
    });

    // Send to all admin emails
    for (const email of adminEmails) {
      await this.sendEmail({
        to: email,
        subject: interpolated.subject,
        html: interpolated.html,
      });
    }
  }
}

export const emailService = new EmailService();
