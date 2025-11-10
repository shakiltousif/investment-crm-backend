import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter
    // For production, use SMTP settings from environment variables
    // For development, you can use Ethereal Email or a service like SendGrid
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${options.to}`);
    } catch (error) {
      console.error('Failed to send email:', error);
      // Don't throw error - email failures shouldn't break the app
      // In production, you might want to queue emails for retry
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
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
  async sendDepositNotification(email: string, amount: number, currency: string, status: string): Promise<void> {
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
  async sendWithdrawalNotification(email: string, amount: number, currency: string, status: string): Promise<void> {
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
}

export const emailService = new EmailService();

