import { prisma } from '../lib/prisma.js';

// Define EmailTemplateType as a string union type
type EmailTemplateType =
  | 'PASSWORD_RESET'
  | 'DEPOSIT_NOTIFICATION'
  | 'WITHDRAWAL_NOTIFICATION'
  | 'WELCOME_EMAIL'
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED'
  | 'KYC_STATUS_CHANGE'
  | 'DOCUMENT_STATUS_CHANGE'
  | 'DOCUMENT_UPLOADED_BY_ADMIN'
  | 'INVESTMENT_APPLICATION_SUBMITTED'
  | 'INVESTMENT_APPLICATION_STATUS_CHANGE'
  | 'INVESTMENT_PURCHASE_CONFIRMATION'
  | 'INVESTMENT_MATURED'
  | 'BALANCE_ADJUSTMENT'
  | 'ADMIN_NOTIFICATION'
  | 'PROBLEM_REPORT_SUBMITTED'
  | 'PROBLEM_REPORT_RESPONSE'
  | 'PROBLEM_REPORT_STATUS_CHANGE'
  | 'ADMIN_PROBLEM_REPORT_NOTIFICATION';

export interface EmailTemplateVariable {
  name: string;
  description: string;
  required: boolean;
  example?: string;
}

export interface EmailTemplateData {
  type: EmailTemplateType;
  name: string;
  description?: string;
  subject: string;
  htmlContent: string;
  cssStyles?: string;
  variables: EmailTemplateVariable[];
  isActive?: boolean;
}

export interface InterpolatedTemplate {
  subject: string;
  html: string;
}

export class EmailTemplateService {
  /**
   * Get template from database, fallback to default if not found
   */
  async getTemplate(type: EmailTemplateType): Promise<EmailTemplateData | null> {
    const template = await prisma.emailTemplate.findUnique({
      where: { type, isActive: true },
    });

    if (template) {
      return {
        type: template.type,
        name: template.name,
        description: template.description || undefined,
        subject: template.subject,
        htmlContent: template.htmlContent,
        cssStyles: template.cssStyles || undefined,
        variables: template.variables as any as EmailTemplateVariable[],
        isActive: template.isActive,
      };
    }

    // Fallback to default template
    return this.getDefaultTemplate(type);
  }

  /**
   * Get all templates
   */
  async getAllTemplates(): Promise<EmailTemplateData[]> {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { name: 'asc' },
    });

    return templates.map((template) => ({
      type: template.type,
      name: template.name,
      description: template.description || undefined,
      subject: template.subject,
      htmlContent: template.htmlContent,
      cssStyles: template.cssStyles || undefined,
      variables: (template.variables || []) as any,
      isActive: template.isActive,
    }));
  }

  /**
   * Create new template
   */
  async createTemplate(data: EmailTemplateData): Promise<EmailTemplateData> {
    const template = await prisma.emailTemplate.create({
      data: {
        type: data.type,
        name: data.name,
        description: data.description,
        subject: data.subject,
        htmlContent: data.htmlContent,
        cssStyles: data.cssStyles,
        variables: (data.variables || []) as any,
        isActive: data.isActive ?? true,
      },
    });

    return {
      type: template.type,
      name: template.name,
      description: template.description || undefined,
      subject: template.subject,
      htmlContent: template.htmlContent,
      cssStyles: template.cssStyles || undefined,
      variables: (template.variables || []) as any,
      isActive: template.isActive,
    };
  }

  /**
   * Update existing template
   */
  async updateTemplate(
    type: EmailTemplateType,
    data: Partial<Omit<EmailTemplateData, 'type'>>
  ): Promise<EmailTemplateData> {
    const template = await prisma.emailTemplate.update({
      where: { type },
      data: {
        name: data.name,
        description: data.description,
        subject: data.subject,
        htmlContent: data.htmlContent,
        cssStyles: data.cssStyles,
        variables: data.variables ? (data.variables as any) : undefined,
        isActive: data.isActive,
      },
    });

    return {
      type: template.type,
      name: template.name,
      description: template.description || undefined,
      subject: template.subject,
      htmlContent: template.htmlContent,
      cssStyles: template.cssStyles || undefined,
      variables: (template.variables || []) as any,
      isActive: template.isActive,
    };
  }

  /**
   * Delete/deactivate template
   */
  async deleteTemplate(type: EmailTemplateType): Promise<void> {
    await prisma.emailTemplate.update({
      where: { type },
      data: { isActive: false },
    });
  }

  /**
   * Interpolate template with variables
   */
  interpolateTemplate(
    template: EmailTemplateData,
    variables: Record<string, string | number | Date | undefined | null>
  ): InterpolatedTemplate {
    let subject = template.subject;
    let html = template.htmlContent;

    // Inject CSS if provided
    if (template.cssStyles) {
      // Try to inject into <head> tag first
      if (html.includes('</head>')) {
        html = html.replace(
          '</head>',
          `<style>${template.cssStyles}</style></head>`
        );
      } else if (html.includes('<head>')) {
        // If head tag exists but no closing tag, add style before closing
        html = html.replace(
          '<head>',
          `<head><style>${template.cssStyles}</style>`
        );
      } else if (html.includes('<!DOCTYPE html>') || html.includes('<html>')) {
        // If HTML structure exists, try to add head section
        if (html.includes('<html>')) {
          html = html.replace(
            '<html>',
            `<html><head><style>${template.cssStyles}</style></head>`
          );
        } else {
          // Add style tag at the beginning after DOCTYPE
          html = html.replace(
            '<!DOCTYPE html>',
            `<!DOCTYPE html><style>${template.cssStyles}</style>`
          );
        }
      } else {
        // No HTML structure, just prepend style tag
        html = `<style>${template.cssStyles}</style>${html}`;
      }
    }

    // Replace all variables in subject and HTML
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `\${${key}}`;
      const replacement = value !== null && value !== undefined ? String(value) : '';
      // Escape special regex characters in placeholder
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedPlaceholder, 'g');
      subject = subject.replace(regex, replacement);
      html = html.replace(regex, replacement);
    });

    return { subject, html };
  }

  /**
   * Get available variables for a template type
   */
  getAvailableVariables(type: EmailTemplateType): EmailTemplateVariable[] {
    const defaultTemplate = this.getDefaultTemplate(type);
    return defaultTemplate?.variables || [];
  }

  /**
   * Get default template (hardcoded fallback)
   */
  getDefaultTemplate(type: EmailTemplateType): EmailTemplateData | null {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const logoUrl = `${frontendUrl}/logo.jpeg`;
    const currentYear = new Date().getFullYear();

    const emailHeader = `
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #e5e7eb; margin-bottom: 30px;">
        <img src="${logoUrl}" alt="Fidelity Investment Portal" style="max-width: 200px; height: auto; margin-bottom: 15px;" />
        <h1 style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 600;">Fidelity Investment Portal</h1>
      </div>
    `;

    const emailFooter = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
        <p style="margin: 5px 0;">Fidelity Investment Portal</p>
        <p style="margin: 5px 0;">© ${currentYear} All rights reserved.</p>
      </div>
    `;

    const defaults: Record<string, EmailTemplateData> = {
      PASSWORD_RESET: {
        type: 'PASSWORD_RESET' as any,
        name: 'Password Reset',
        description: 'Email sent when user requests password reset',
        subject: 'Password Reset Request - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Password Reset Request</h2>
                <p>You requested to reset your password for your Fidelity Investment Portal account.</p>
                <p>Click the button below to reset your password:</p>
                <a href="\${resetUrl}" class="button">Reset Password</a>
                <p>Or copy and paste this link into your browser:</p>
                <p>\${resetUrl}</p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'resetUrl', description: 'Password reset URL with token', required: true },
        ],
        isActive: true,
      },
      DEPOSIT_NOTIFICATION: {
        type: 'DEPOSIT_NOTIFICATION' as any,
        name: 'Deposit Notification',
        description: 'Email sent for deposit request status updates',
        subject: 'Deposit Request \${status} - Fidelity Investment Portal',
        htmlContent: `
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
                ${emailHeader}
                <h2>Deposit Request \${statusText}</h2>
                <p>Your deposit request has been \${status}.</p>
                <div class="status \${statusClass}">
                  <strong>Amount:</strong> \${currency} \${amount}<br>
                  <strong>Status:</strong> \${status}
                </div>
                <p>\${statusMessage}</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'status', description: 'Deposit status (PENDING, COMPLETED, REJECTED)', required: true },
          { name: 'statusText', description: 'Formatted status text', required: true },
          { name: 'statusClass', description: 'CSS class for status styling', required: true },
          { name: 'statusMessage', description: 'Status-specific message', required: true },
          { name: 'amount', description: 'Deposit amount', required: true },
          { name: 'currency', description: 'Currency code', required: true },
        ],
        isActive: true,
      },
      WITHDRAWAL_NOTIFICATION: {
        type: 'WITHDRAWAL_NOTIFICATION' as any,
        name: 'Withdrawal Notification',
        description: 'Email sent for withdrawal request status updates',
        subject: 'Withdrawal Request \${status} - Fidelity Investment Portal',
        htmlContent: `
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
                ${emailHeader}
                <h2>Withdrawal Request \${statusText}</h2>
                <p>Your withdrawal request has been \${status}.</p>
                <div class="status \${statusClass}">
                  <strong>Amount:</strong> \${currency} \${amount}<br>
                  <strong>Status:</strong> \${status}
                </div>
                <p>\${statusMessage}</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'status', description: 'Withdrawal status (PENDING, COMPLETED, REJECTED)', required: true },
          { name: 'statusText', description: 'Formatted status text', required: true },
          { name: 'statusClass', description: 'CSS class for status styling', required: true },
          { name: 'statusMessage', description: 'Status-specific message', required: true },
          { name: 'amount', description: 'Withdrawal amount', required: true },
          { name: 'currency', description: 'Currency code', required: true },
        ],
        isActive: true,
      },
      WELCOME_EMAIL: {
        type: 'WELCOME_EMAIL' as any,
        name: 'Welcome Email',
        description: 'Welcome email sent to new users',
        subject: 'Welcome to Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Welcome to Fidelity Investment Portal, \${firstName}!</h2>
                <p>Thank you for joining our investment management platform.</p>
                <p>You can now:</p>
                <ul>
                  <li>View your portfolio and investments</li>
                  <li>Make deposits and withdrawals</li>
                  <li>Browse available investment opportunities</li>
                  <li>Upload documents and view statements</li>
                </ul>
                <p>If you have any questions, please don't hesitate to contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
        ],
        isActive: true,
      },
      ACCOUNT_CREATED: {
        type: 'ACCOUNT_CREATED' as any,
        name: 'Account Created',
        description: 'Email sent when admin creates a new account',
        subject: 'Your Fidelity Investment Portal Account Has Been Created',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .credentials { background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .warning { background-color: #FEF3C7; padding: 10px; border-radius: 5px; margin: 20px 0; color: #92400E; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Your Fidelity Investment Portal Account Has Been Created</h2>
                <p>Hello \${firstName},</p>
                <p>Your account has been created by an administrator. You can now access your account using the credentials below:</p>
                <div class="credentials">
                  <p><strong>Email:</strong> \${email}</p>
                  <p><strong>Password:</strong> \${password}</p>
                </div>
                \${temporaryPasswordWarning}
                <p>You can log in at: <a href="\${loginUrl}">\${loginUrl}</a></p>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'email', description: 'User email address', required: true },
          { name: 'password', description: 'User password', required: true },
          { name: 'temporaryPasswordWarning', description: 'Warning message if temporary password', required: false },
          { name: 'loginUrl', description: 'Login page URL', required: true },
        ],
        isActive: true,
      },
      ACCOUNT_LOCKED: {
        type: 'ACCOUNT_LOCKED' as any,
        name: 'Account Locked',
        description: 'Email sent when account is locked due to security',
        subject: 'Account Security Alert - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .warning { background-color: #FEE2E2; padding: 15px; border-radius: 5px; margin: 20px 0; color: #991B1B; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Account Security Alert</h2>
                <p>Hello \${firstName},</p>
                <div class="warning">
                  <p><strong>Your account has been temporarily locked\${lockUntilText}.</strong></p>
                </div>
                <p>This action was taken due to multiple failed login attempts. This is a security measure to protect your account.</p>
                <p>If this was not you, please contact our support team immediately.</p>
                <p>If you forgot your password, you can reset it using the "Forgot Password" link on the login page.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'lockUntilText', description: 'Lock duration text', required: false },
        ],
        isActive: true,
      },
      ACCOUNT_UNLOCKED: {
        type: 'ACCOUNT_UNLOCKED' as any,
        name: 'Account Unlocked',
        description: 'Email sent when account is unlocked',
        subject: 'Account Unlocked - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #065F46; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Account Unlocked</h2>
                <p>Hello \${firstName},</p>
                <div class="success">
                  <p><strong>Your account has been unlocked.</strong></p>
                </div>
                <p>You can now log in to your account again. If you continue to experience issues, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
        ],
        isActive: true,
      },
      KYC_STATUS_CHANGE: {
        type: 'KYC_STATUS_CHANGE' as any,
        name: 'KYC Status Change',
        description: 'Email sent when KYC status changes',
        subject: '\${statusTitle} - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .status { padding: 15px; border-radius: 5px; margin: 20px 0; background-color: \${statusBgColor}; color: \${statusColor}; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>\${statusTitle}</h2>
                <p>Hello \${firstName},</p>
                <div class="status">
                  <p><strong>Status:</strong> \${status}</p>
                  <p>\${statusMessage}</p>
                </div>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'status', description: 'KYC status (VERIFIED, REJECTED, EXPIRED)', required: true },
          { name: 'statusTitle', description: 'Status title', required: true },
          { name: 'statusMessage', description: 'Status message', required: true },
          { name: 'statusBgColor', description: 'Status background color', required: true },
          { name: 'statusColor', description: 'Status text color', required: true },
        ],
        isActive: true,
      },
      DOCUMENT_STATUS_CHANGE: {
        type: 'DOCUMENT_STATUS_CHANGE' as any,
        name: 'Document Status Change',
        description: 'Email sent when document status changes',
        subject: '\${statusTitle} - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .status { padding: 15px; border-radius: 5px; margin: 20px 0; background-color: \${statusBgColor}; color: \${statusColor}; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>\${statusTitle}</h2>
                <p>Hello \${firstName},</p>
                <div class="status">
                  <p><strong>Document:</strong> \${documentName}</p>
                  <p><strong>Status:</strong> \${status}</p>
                  <p>\${statusMessage}</p>
                </div>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'documentName', description: 'Document name', required: true },
          { name: 'status', description: 'Document status (VERIFIED, REJECTED)', required: true },
          { name: 'statusTitle', description: 'Status title', required: true },
          { name: 'statusMessage', description: 'Status message', required: true },
          { name: 'statusBgColor', description: 'Status background color', required: true },
          { name: 'statusColor', description: 'Status text color', required: true },
        ],
        isActive: true,
      },
      DOCUMENT_UPLOADED_BY_ADMIN: {
        type: 'DOCUMENT_UPLOADED_BY_ADMIN' as any,
        name: 'Document Uploaded by Admin',
        description: 'Email sent when admin uploads a document for user',
        subject: 'New Document Available - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .info { background-color: #DBEAFE; padding: 15px; border-radius: 5px; margin: 20px 0; color: #1E40AF; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>New Document Available</h2>
                <p>Hello \${firstName},</p>
                <div class="info">
                  <p>A new document has been uploaded to your account:</p>
                  <p><strong>Document Name:</strong> \${documentName}</p>
                  <p><strong>Type:</strong> \${documentType}</p>
                </div>
                <p>You can view and download this document from your account dashboard.</p>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'documentName', description: 'Document name', required: true },
          { name: 'documentType', description: 'Document type', required: true },
        ],
        isActive: true,
      },
      INVESTMENT_APPLICATION_SUBMITTED: {
        type: 'INVESTMENT_APPLICATION_SUBMITTED' as any,
        name: 'Investment Application Submitted',
        description: 'Email sent when investment application is submitted',
        subject: 'Investment Enrollment Submitted - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .info { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #92400E; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Investment Enrollment Submitted</h2>
                <p>Hello \${firstName},</p>
                <p>Your investment enrollment has been successfully submitted.</p>
                <div class="info">
                  <p><strong>Investment:</strong> \${investmentName}</p>
                  <p><strong>Reference Number:</strong> \${referenceNumber}</p>
                  <p><strong>Requested Amount:</strong> \${currency} \${requestedAmount}</p>
                  <p><strong>Status:</strong> PENDING</p>
                </div>
                <p>We will review your enrollment and notify you once a decision has been made.</p>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'investmentName', description: 'Investment product name', required: true },
          { name: 'referenceNumber', description: 'Application reference number', required: true },
          { name: 'requestedAmount', description: 'Requested investment amount', required: true },
          { name: 'currency', description: 'Currency code', required: true },
        ],
        isActive: true,
      },
      INVESTMENT_APPLICATION_STATUS_CHANGE: {
        type: 'INVESTMENT_APPLICATION_STATUS_CHANGE' as any,
        name: 'Investment Application Status Change',
        description: 'Email sent when investment application status changes',
        subject: '\${statusTitle} - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .status { padding: 15px; border-radius: 5px; margin: 20px 0; background-color: \${statusBgColor}; color: \${statusColor}; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>\${statusTitle}</h2>
                <p>Hello \${firstName},</p>
                <div class="status">
                  <p><strong>Investment:</strong> \${investmentName}</p>
                  <p><strong>Reference Number:</strong> \${referenceNumber}</p>
                  <p><strong>Status:</strong> \${status}</p>
                  \${allocatedAmountHtml}
                  \${allocatedQuantityHtml}
                  <p>\${statusMessage}</p>
                </div>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'investmentName', description: 'Investment product name', required: true },
          { name: 'referenceNumber', description: 'Application reference number', required: true },
          { name: 'status', description: 'Application status (APPROVED, REJECTED, ALLOCATED)', required: true },
          { name: 'statusTitle', description: 'Status title', required: true },
          { name: 'statusMessage', description: 'Status message', required: true },
          { name: 'statusBgColor', description: 'Status background color', required: true },
          { name: 'statusColor', description: 'Status text color', required: true },
          { name: 'allocatedAmountHtml', description: 'HTML for allocated amount (if applicable)', required: false },
          { name: 'allocatedQuantityHtml', description: 'HTML for allocated quantity (if applicable)', required: false },
        ],
        isActive: true,
      },
      INVESTMENT_PURCHASE_CONFIRMATION: {
        type: 'INVESTMENT_PURCHASE_CONFIRMATION' as any,
        name: 'Investment Purchase Confirmation',
        description: 'Email sent when investment purchase is confirmed',
        subject: 'Investment Purchase Confirmation - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #065F46; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Investment Purchase Confirmation</h2>
                <p>Hello \${firstName},</p>
                <p>Your investment purchase has been completed successfully.</p>
                <div class="success">
                  <p><strong>Investment:</strong> \${investmentName}</p>
                  <p><strong>Quantity:</strong> \${quantity}</p>
                  <p><strong>Unit Price:</strong> \${currency} \${unitPrice}</p>
                  <p><strong>Total Amount:</strong> \${currency} \${totalAmount}</p>
                </div>
                <p>You can view your investment in your portfolio dashboard.</p>
                <p>If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'investmentName', description: 'Investment product name', required: true },
          { name: 'quantity', description: 'Purchase quantity', required: true },
          { name: 'unitPrice', description: 'Unit price', required: true },
          { name: 'totalAmount', description: 'Total purchase amount', required: true },
          { name: 'currency', description: 'Currency code', required: true },
        ],
        isActive: true,
      },
      INVESTMENT_MATURED: {
        type: 'INVESTMENT_MATURED' as any,
        name: 'Investment Matured',
        description: 'Email sent when investment reaches maturity',
        subject: 'Investment Matured - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .info { background-color: #DBEAFE; padding: 15px; border-radius: 5px; margin: 20px 0; color: #1E40AF; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Investment Matured</h2>
                <p>Hello \${firstName},</p>
                <p>Your investment has reached maturity.</p>
                <div class="info">
                  <p><strong>Investment:</strong> \${investmentName}</p>
                  <p><strong>Maturity Date:</strong> \${maturityDate}</p>
                  <p><strong>Total Value:</strong> \${currency} \${totalValue}</p>
                </div>
                <p>You can view the details in your portfolio dashboard. If you have any questions, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'investmentName', description: 'Investment product name', required: true },
          { name: 'maturityDate', description: 'Maturity date', required: true },
          { name: 'totalValue', description: 'Total investment value', required: true },
          { name: 'currency', description: 'Currency code', required: true },
        ],
        isActive: true,
      },
      BALANCE_ADJUSTMENT: {
        type: 'BALANCE_ADJUSTMENT' as any,
        name: 'Balance Adjustment',
        description: 'Email sent when account balance is adjusted by admin',
        subject: 'Account Balance Adjustment - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .info { background-color: \${adjustmentBgColor}; padding: 15px; border-radius: 5px; margin: 20px 0; color: \${adjustmentColor}; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Account Balance Adjustment</h2>
                <p>Hello \${firstName},</p>
                <p>Your account balance has been adjusted by an administrator.</p>
                <div class="info">
                  <p><strong>Adjustment Amount:</strong> \${adjustmentAmount}</p>
                  <p><strong>Description:</strong> \${description}</p>
                  <p><strong>New Balance:</strong> \${currency} \${newBalance}</p>
                </div>
                <p>If you have any questions about this adjustment, please contact our support team.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'adjustmentAmount', description: 'Formatted adjustment amount with sign', required: true },
          { name: 'description', description: 'Adjustment description', required: true },
          { name: 'newBalance', description: 'New account balance', required: true },
          { name: 'currency', description: 'Currency code', required: true },
          { name: 'adjustmentBgColor', description: 'Background color based on adjustment type', required: true },
          { name: 'adjustmentColor', description: 'Text color based on adjustment type', required: true },
        ],
        isActive: true,
      },
      ADMIN_NOTIFICATION: {
        type: 'ADMIN_NOTIFICATION' as any,
        name: 'Admin Notification',
        description: 'Email sent to admins for various notifications',
        subject: 'Admin Alert: \${subject} - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .alert { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #92400E; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>\${subject}</h2>
                <div class="alert">
                  <p>\${message}</p>
                  \${detailsHtml}
                </div>
                <p>Please review this in the admin dashboard.</p>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'subject', description: 'Notification subject', required: true },
          { name: 'message', description: 'Notification message', required: true },
          { name: 'detailsHtml', description: 'HTML for additional details', required: false },
        ],
        isActive: true,
      },
      PROBLEM_REPORT_SUBMITTED: {
        type: 'PROBLEM_REPORT_SUBMITTED' as any,
        name: 'Problem Report Submitted',
        description: 'Email sent when user submits a problem report',
        subject: 'Problem Report Submitted - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .success { background-color: #D1FAE5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #065F46; }
                .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Problem Report Submitted</h2>
                <p>Dear \${firstName},</p>
                <div class="success">
                  <p><strong>Your problem report has been submitted successfully!</strong></p>
                  <p><strong>Subject:</strong> \${subject}</p>
                  <p><strong>Report ID:</strong> \${reportId}</p>
                </div>
                <p>We have received your problem report and our team will review it shortly. You will be notified when there's an update.</p>
                <a href="\${reportUrl}" class="button">View Your Reports</a>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'subject', description: 'Problem report subject', required: true },
          { name: 'reportId', description: 'Problem report ID', required: true },
          { name: 'reportUrl', description: 'URL to view reports', required: true },
        ],
        isActive: true,
      },
      PROBLEM_REPORT_RESPONSE: {
        type: 'PROBLEM_REPORT_RESPONSE' as any,
        name: 'Problem Report Response',
        description: 'Email sent when admin responds to problem report',
        subject: 'Response to Your Problem Report - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .response { background-color: #EFF6FF; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #00598f; }
                .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Response to Your Problem Report</h2>
                <p>Dear \${firstName},</p>
                <p>An admin has responded to your problem report:</p>
                <div class="response">
                  <p>\${adminMessage}</p>
                </div>
                <a href="\${reportUrl}" class="button">View Report</a>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'adminMessage', description: 'Admin response message', required: true },
          { name: 'reportUrl', description: 'URL to view report', required: true },
        ],
        isActive: true,
      },
      PROBLEM_REPORT_STATUS_CHANGE: {
        type: 'PROBLEM_REPORT_STATUS_CHANGE' as any,
        name: 'Problem Report Status Change',
        description: 'Email sent when problem report status changes',
        subject: 'Problem Report \${statusText} - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .status { background-color: \${statusColor}; padding: 15px; border-radius: 5px; margin: 20px 0; color: \${textColor}; }
                .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>Problem Report Status Update</h2>
                <p>Dear \${firstName},</p>
                <div class="status">
                  <p><strong>Your problem report has been \${statusText}.</strong></p>
                  <p><strong>Report ID:</strong> \${reportId}</p>
                </div>
                <p>\${statusMessage}</p>
                <a href="\${reportUrl}" class="button">View Report</a>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'firstName', description: 'User first name', required: true },
          { name: 'reportId', description: 'Problem report ID', required: true },
          { name: 'status', description: 'Report status (RESOLVED, OPEN)', required: true },
          { name: 'statusText', description: 'Formatted status text', required: true },
          { name: 'statusMessage', description: 'Status-specific message', required: true },
          { name: 'statusColor', description: 'Status background color', required: true },
          { name: 'textColor', description: 'Status text color', required: true },
          { name: 'reportUrl', description: 'URL to view report', required: true },
        ],
        isActive: true,
      },
      ADMIN_PROBLEM_REPORT_NOTIFICATION: {
        type: 'ADMIN_PROBLEM_REPORT_NOTIFICATION' as any,
        name: 'Admin Problem Report Notification',
        description: 'Email sent to admins when new problem report is submitted',
        subject: 'New Problem Report: \${subject} - Fidelity Investment Portal',
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .alert { background-color: #FEF3C7; padding: 15px; border-radius: 5px; margin: 20px 0; color: #92400E; }
                .button { display: inline-block; padding: 12px 24px; background-color: #00598f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                ${emailHeader}
                <h2>New Problem Report</h2>
                <div class="alert">
                  <p><strong>A new problem report has been submitted.</strong></p>
                  <p><strong>Subject:</strong> \${subject}</p>
                  <p><strong>User:</strong> \${userName}</p>
                  <p><strong>Report ID:</strong> \${reportId}</p>
                </div>
                <p>Please review and respond to this report in the admin dashboard.</p>
                <a href="\${reportUrl}" class="button">View Report</a>
                ${emailFooter}
              </div>
            </body>
          </html>
        `,
        cssStyles: '',
        variables: [
          { name: 'subject', description: 'Problem report subject', required: true },
          { name: 'userName', description: 'User name who submitted report', required: true },
          { name: 'reportId', description: 'Problem report ID', required: true },
          { name: 'reportUrl', description: 'URL to view report in admin dashboard', required: true },
        ],
        isActive: true,
      },
    };

    return defaults[type] || null;
  }
}

export const emailTemplateService = new EmailTemplateService();

