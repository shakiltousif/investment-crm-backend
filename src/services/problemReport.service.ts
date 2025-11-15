import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { emailService } from './email.service.js';
import { emailSettingsService } from './emailSettings.service.js';
import { notificationService } from './notification.service.js';

// Import NotificationType enum properly from Prisma client
// Define enum values as const object matching Prisma NotificationType enum
const NotificationType = {
  PROBLEM_REPORT_SUBMITTED: 'PROBLEM_REPORT_SUBMITTED' as const,
  ADMIN_NOTIFICATION: 'ADMIN_NOTIFICATION' as const,
  PROBLEM_REPORT_RESPONSE: 'PROBLEM_REPORT_RESPONSE' as const,
} as const;

// Type aliases for ProblemCategory and ProblemPriority (used for type assertions only)
// Using string literal unions matching Prisma enums
type ProblemCategory =
  | 'TECHNICAL'
  | 'ACCOUNT'
  | 'TRANSACTION'
  | 'INVESTMENT'
  | 'DOCUMENT'
  | 'OTHER';
type ProblemPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

import * as fs from 'fs/promises';
import * as path from 'path';

// Type assertion for Prisma client to include problem report models
// These models exist in the generated Prisma client but TypeScript language server may not recognize them
type ProblemReportDelegate = {
  create: (args: { data: unknown; include?: unknown }) => Promise<unknown>;
  findMany: (args?: {
    where?: unknown;
    include?: unknown;
    orderBy?: unknown;
    take?: number;
    skip?: number;
  }) => Promise<unknown[]>;
  findFirst: (args: { where: unknown; include?: unknown }) => Promise<unknown | null>;
  count: (args?: { where?: unknown }) => Promise<number>;
};

type ProblemReportAttachmentDelegate = {
  create: (args: { data: unknown }) => Promise<unknown>;
};

type ProblemReportResponseDelegate = {
  create: (args: { data: unknown; include?: unknown }) => Promise<unknown>;
  findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<unknown | null>;
};

type ProblemReportResponseAttachmentDelegate = {
  create: (args: { data: unknown }) => Promise<unknown>;
};

const prismaClient = prisma as typeof prisma & {
  problemReport: ProblemReportDelegate;
  problemReportAttachment: ProblemReportAttachmentDelegate;
  problemReportResponse: ProblemReportResponseDelegate;
  problemReportResponseAttachment: ProblemReportResponseAttachmentDelegate;
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const PROBLEM_REPORTS_DIR = path.join(UPLOAD_DIR, 'problem-reports');

// Ensure upload directory exists
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(PROBLEM_REPORTS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

export interface CreateProblemReportInput {
  subject: string;
  description: string;
  category: string;
  priority: string;
  attachments?: Array<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileBuffer: Buffer;
  }>;
}

export interface CreateProblemReportResponseInput {
  message: string;
  attachments?: Array<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileBuffer: Buffer;
  }>;
}

export class ProblemReportService {
  /**
   * Upload attachment for problem report
   */
  async uploadAttachment(
    userId: string,
    data: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      fileBuffer: Buffer;
    }
  ): Promise<string> {
    await ensureUploadDir();

    // Validate file size (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (data.fileSize > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate unique filename
    const fileExt = path.extname(data.fileName);
    const uniqueFileName = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;
    const filePath = path.join(PROBLEM_REPORTS_DIR, uniqueFileName);

    // Save file
    await fs.writeFile(filePath, data.fileBuffer);

    // Return the URL path
    return `/uploads/problem-reports/${uniqueFileName}`;
  }

  /**
   * Create problem report
   */
  async createProblemReport(userId: string, data: CreateProblemReportInput): Promise<unknown> {
    await ensureUploadDir();

    // Create problem report
    const problemReport = (await prismaClient.problemReport.create({
      data: {
        userId,
        subject: data.subject,
        description: data.description,
        category: data.category as ProblemCategory,
        priority: (data.priority as ProblemPriority) ?? undefined,
        status: 'OPEN',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })) as Record<string, unknown>;

    // Upload attachments if provided
    if (data.attachments && data.attachments.length > 0) {
      const attachmentPromises = data.attachments.map(async (attachment) => {
        const fileUrl = await this.uploadAttachment(userId, attachment);
        return prismaClient.problemReportAttachment.create({
          data: {
            problemReportId: (problemReport as { id: string }).id,
            fileName: attachment.fileName,
            fileUrl,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
          },
        });
      });

      await Promise.all(attachmentPromises);
    }

    // Send email notification to user
    try {
      const reportData = problemReport as {
        user: { email: string; firstName: string };
        id: string;
        subject: string;
        userId: string;
      };
      await emailService
        .sendProblemReportSubmittedEmail(
          reportData.user.email,
          reportData.user.firstName,
          reportData.id,
          reportData.subject
        )
        .catch((error) => {
          console.error('Failed to send problem report submitted email:', error);
        });

      // Create notification for user
      notificationService
        .createNotification({
          userId: reportData.userId,
          type: NotificationType.PROBLEM_REPORT_SUBMITTED,
          title: 'Problem Report Submitted',
          message: `Your problem report "${reportData.subject}" has been submitted successfully and is being reviewed.`,
          actionUrl: '/problem-reports',
          data: { problemReportId: reportData.id },
        })
        .catch((error) => {
          console.error('Failed to create problem report submitted notification:', error);
        });
    } catch (error) {
      console.error('Failed to send problem report submitted email:', error);
    }

    // Notify admins
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true, email: true },
      });

      const adminEmails = admins.map((admin) => admin.email);
      if (adminEmails.length > 0) {
        const reportDataForAdmin = problemReport as {
          id: string;
          subject: string;
          user: { firstName: string; lastName: string; email: string };
          userId: string;
        };
        // Check if admin notifications are enabled
        const shouldSend = await emailSettingsService.shouldSendNotification(
          null,
          'adminNotifications'
        );
        if (shouldSend) {
          await emailService
            .sendAdminProblemReportNotification(
              adminEmails,
              reportDataForAdmin.id,
              reportDataForAdmin.subject,
              `${reportDataForAdmin.user.firstName} ${reportDataForAdmin.user.lastName}`
            )
            .then(() => {
              console.warn('Admin problem report notification email sent successfully');
            })
            .catch((error) => {
              console.error('Failed to send admin problem report notification email:', error);
            });
        } else {
          console.warn('Admin problem report notification email skipped (disabled in settings)');
        }

        // Create notifications for admins
        await Promise.all(
          admins.map((admin) =>
            notificationService
              .createNotification({
                userId: admin.id,
                type: NotificationType.ADMIN_NOTIFICATION,
                title: 'New Problem Report',
                message: `A new problem report "${reportDataForAdmin.subject}" has been submitted by ${reportDataForAdmin.user.firstName} ${reportDataForAdmin.user.email}.`,
                actionUrl: `/admin/problem-reports`,
                data: { problemReportId: reportDataForAdmin.id, userId: reportDataForAdmin.userId },
              })
              .catch((error) => {
                console.error('Failed to create admin notification:', error);
              })
          )
        );
      }
    } catch (error) {
      console.error('Failed to notify admins:', error);
    }

    // Fetch complete report with attachments
    return await this.getProblemReportById(userId, (problemReport as { id: string }).id);
  }

  /**
   * Get user's problem reports
   */
  async getUserProblemReports(
    userId: string,
    filters: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    reports: Array<unknown>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Record<string, unknown> = { userId };

    if (filters.status) {
      where.status = filters.status;
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [reports, total] = await Promise.all([
      prismaClient.problemReport.findMany({
        where,
        include: {
          attachments: true,
          responses: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
              attachments: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          resolvedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prismaClient.problemReport.count({ where }),
    ]);

    return {
      reports,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get problem report by ID (for user)
   */
  async getProblemReportById(userId: string, id: string): Promise<unknown> {
    const report = (await prismaClient.problemReport.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        attachments: true,
        responses: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        resolvedByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })) as Record<string, unknown> | null;

    if (!report) {
      throw new NotFoundError('Problem report not found');
    }

    return report;
  }

  /**
   * Create user response to problem report
   */
  async createUserResponse(
    problemReportId: string,
    userId: string,
    data: CreateProblemReportResponseInput
  ): Promise<unknown> {
    // Verify report exists and belongs to user
    const report = (await prismaClient.problemReport.findFirst({
      where: {
        id: problemReportId,
        userId,
      },
    })) as Record<string, unknown> | null;

    if (!report) {
      throw new NotFoundError('Problem report not found');
    }

    if (report.status === 'RESOLVED') {
      throw new ValidationError('Cannot respond to a resolved problem report');
    }

    // Create response
    const response = (await prismaClient.problemReportResponse.create({
      data: {
        problemReportId,
        userId,
        message: data.message,
        isAdminResponse: false,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })) as Record<string, unknown>;

    // Upload attachments if provided
    if (data.attachments && data.attachments.length > 0) {
      const attachmentPromises = data.attachments.map(async (attachment) => {
        const fileUrl = await this.uploadAttachment(userId, attachment);
        return prismaClient.problemReportResponseAttachment.create({
          data: {
            responseId: (response as { id: string }).id,
            fileName: attachment.fileName,
            fileUrl,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
          },
        });
      });

      await Promise.all(attachmentPromises);
    }

    // Notify admins of user response
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true, email: true },
      });

      await Promise.all(
        admins.map((admin) =>
          notificationService
            .createNotification({
              userId: admin.id,
              type: NotificationType.PROBLEM_REPORT_RESPONSE,
              title: 'New Response to Problem Report',
              message: `User has responded to problem report "${report.subject}".`,
              actionUrl: `/admin/problem-reports`,
              data: { problemReportId: report.id, userId },
            })
            .catch((error) => {
              console.error('Failed to create admin notification:', error);
            })
        )
      );
    } catch (error) {
      console.error('Failed to notify admins:', error);
    }

    // Fetch complete response with attachments
    return await prismaClient.problemReportResponse.findUnique({
      where: { id: (response as { id: string }).id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        attachments: true,
      },
    });
  }
}

export const problemReportService = new ProblemReportService();
