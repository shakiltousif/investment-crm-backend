import { prisma } from '../lib/prisma.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import fs from 'fs/promises';
import path from 'path';
import { emailService } from './email.service.js';
import { emailSettingsService } from './emailSettings.service.js';
import { notificationService } from './notification.service.js';

// Import NotificationType enum properly from Prisma client
// Define enum values as const object matching Prisma NotificationType enum
const NotificationType = {
  ADMIN_NOTIFICATION: 'ADMIN_NOTIFICATION' as const,
} as const;

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure upload directory exists
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'documents'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'statements'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'profile-pictures'), { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directories:', error);
  }
}

void ensureUploadDir();

export interface UploadDocumentInput {
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  fileBuffer: Buffer;
}

export interface UploadStatementInput {
  userId: string;
  period: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  fileBuffer: Buffer;
}

export class DocumentService {
  /**
   * Upload document (client or admin)
   */
  async uploadDocument(
    userId: string,
    uploadedBy: string,
    data: UploadDocumentInput
  ): Promise<unknown> {
    // Validate file size
    if (data.fileSize > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validate mime type
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(data.mimeType)) {
      throw new ValidationError('Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX');
    }

    // Generate unique filename
    const fileExt = path.extname(data.fileName);
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, 'documents', uniqueFileName);

    // Save file
    await fs.writeFile(filePath, data.fileBuffer);

    // Create database record
    const document = await prisma.document.create({
      data: {
        userId,
        type: data.type as
          | 'KYC'
          | 'IDENTIFICATION'
          | 'PROOF_OF_ADDRESS'
          | 'BANK_STATEMENT'
          | 'TAX_DOCUMENT'
          | 'AGREEMENT'
          | 'OTHER',
        fileName: data.fileName,
        fileUrl: `/uploads/documents/${uniqueFileName}`,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        description: data.description,
        uploadedBy,
        isImportant: uploadedBy !== userId, // Admin uploads are marked as important
      },
    });

    // Send admin notification if document is uploaded by client (not admin)
    if (uploadedBy === userId) {
      // Create admin notifications
      prisma.user
        .findMany({
          where: { role: 'ADMIN', isActive: true },
          select: { id: true },
        })
        .then((admins) => {
          return prisma.user
            .findUnique({
              where: { id: userId },
              select: { email: true, firstName: true, lastName: true },
            })
            .then((user) => {
              if (user) {
                return Promise.all(
                  admins.map((admin) =>
                    notificationService
                      .createNotification({
                        userId: admin.id,
                        type: NotificationType.ADMIN_NOTIFICATION,
                        title: 'New Document Uploaded',
                        message: `A new document (${data.fileName}) has been uploaded by ${user.firstName} ${user.lastName}.`,
                        actionUrl: `/admin/documents`,
                        data: { documentId: document.id, userId: userId },
                      })
                      .catch((error) => {
                        console.error('Failed to create admin notification:', error);
                      })
                  )
                );
              }
              return undefined;
            });
        })
        .catch((error) => {
          console.error('Failed to create admin notifications:', error);
        });

      // Check if admin notifications are enabled
      emailSettingsService
        .shouldSendNotification(null, 'adminNotifications')
        .then((shouldSend) => {
          if (shouldSend) {
            return emailService.getAdminEmails().then((adminEmails) => {
              if (adminEmails.length > 0) {
                return prisma.user
                  .findUnique({
                    where: { id: userId },
                    select: { email: true, firstName: true },
                  })
                  .then((user) => {
                    if (user) {
                      return emailService.sendAdminNotificationEmail(
                        adminEmails,
                        'New Document Uploaded',
                        'A new document has been uploaded by a client and requires review.',
                        {
                          Client: `${user.firstName} ${user.email}`,
                          'Document Type': data.type,
                          'File Name': data.fileName,
                          'Document ID': document.id,
                        }
                      );
                    }
                    return undefined;
                  });
              }
              return undefined;
            });
          } else {
            console.warn('Admin notification email skipped (disabled in settings)');
          }
          return undefined;
        })
        .catch((error) => {
          console.error('Failed to send admin notification email:', error);
          // Don't throw - email failure shouldn't break the document upload
        });
    }

    return document;
  }

  /**
   * Get user documents
   */
  async getUserDocuments(
    userId: string,
    filters?: { type?: string; isImportant?: boolean }
  ): Promise<Array<unknown>> {
    const where: Record<string, unknown> = { userId };

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.isImportant !== undefined) {
      where.isImportant = filters.isImportant;
    }

    const documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Construct full URLs for each document
    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return documents.map((doc) => ({
      ...doc,
      fileUrl: doc.fileUrl.startsWith('http') ? doc.fileUrl : `${apiBaseUrl}${doc.fileUrl}`,
      downloadUrl: `${apiBaseUrl}/api/documents/${doc.id}/download`,
    }));
  }

  /**
   * Get document file path
   */
  async getDocumentFilePath(documentId: string): Promise<string> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Construct full file path - fileUrl is already /uploads/documents/...
    const filePath = path.join(process.cwd(), document.fileUrl);

    // Verify file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError('Document file not found on server');
    }

    return filePath;
  }

  /**
   * Get document by ID
   */
  async getDocumentById(
    documentId: string,
    userId?: string,
    isAdmin: boolean = false
  ): Promise<{
    id: string;
    userId: string;
    type: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    description: string | null;
    uploadedBy: string;
    isImportant: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    // First check if document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // If userId is provided and user is not admin, check ownership
    if (userId && !isAdmin && document.userId !== userId) {
      throw new NotFoundError('Document not found'); // Don't reveal existence to unauthorized users
    }

    return document;
  }

  /**
   * Delete document
   */
  async deleteDocument(
    documentId: string,
    userId: string,
    isAdmin: boolean = false
  ): Promise<{ message: string }> {
    const document = await prisma.document.findFirst({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundError('Document not found');
    }

    // Only allow deletion if user owns it or is admin
    if (!isAdmin && document.userId !== userId) {
      throw new ValidationError('Unauthorized to delete this document');
    }

    // Delete file
    try {
      const filePath = path.join(process.cwd(), 'public', document.fileUrl);
      await fs.unlink(filePath);
    } catch (error) {
      console.warn('Failed to delete file:', error);
    }

    // Delete database record
    await prisma.document.delete({
      where: { id: documentId },
    });

    return { message: 'Document deleted successfully' };
  }

  /**
   * Upload profile picture
   */
  async uploadProfilePicture(
    userId: string,
    data: {
      fileName: string;
      fileSize: number;
      mimeType: string;
      fileBuffer: Buffer;
    }
  ): Promise<string> {
    // Validate file size (5MB max for profile pictures)
    const MAX_PROFILE_PIC_SIZE = 5 * 1024 * 1024; // 5MB
    if (data.fileSize > MAX_PROFILE_PIC_SIZE) {
      throw new ValidationError(
        `File size exceeds maximum of ${MAX_PROFILE_PIC_SIZE / 1024 / 1024}MB`
      );
    }

    // Validate mime type (only images)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(data.mimeType)) {
      throw new ValidationError('Invalid file type. Allowed: JPG, PNG, WEBP');
    }

    // Get existing profile picture to delete it
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profilePicture: true },
    });

    // Delete old profile picture if exists
    if (user?.profilePicture) {
      const oldFilePath = path.join(
        UPLOAD_DIR,
        'profile-pictures',
        path.basename(user.profilePicture)
      );
      try {
        await fs.unlink(oldFilePath);
      } catch (error) {
        // Ignore if file doesn't exist
        console.warn('Failed to delete old profile picture:', error);
      }
    }

    // Generate unique filename
    const fileExt = path.extname(data.fileName);
    const uniqueFileName = `${userId}-${Date.now()}${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, 'profile-pictures', uniqueFileName);

    // Save file
    await fs.writeFile(filePath, data.fileBuffer);

    // Return the URL path
    return `/uploads/profile-pictures/${uniqueFileName}`;
  }

  /**
   * Upload statement (admin only)
   */
  async uploadStatement(adminId: string, data: UploadStatementInput): Promise<unknown> {
    // Validate file size
    if (data.fileSize > MAX_FILE_SIZE) {
      throw new ValidationError(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Validate mime type (statements should be PDF)
    if (data.mimeType !== 'application/pdf') {
      throw new ValidationError('Statements must be PDF files');
    }

    // Generate unique filename
    const fileExt = path.extname(data.fileName);
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, 'statements', uniqueFileName);

    // Save file
    await fs.writeFile(filePath, data.fileBuffer);

    // Create database record
    const statement = await prisma.statement.create({
      data: {
        userId: data.userId,
        period: data.period,
        fileName: data.fileName,
        fileUrl: `/uploads/statements/${uniqueFileName}`,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        description: data.description,
        status: 'PENDING',
        uploadedBy: adminId,
      },
    });

    return statement;
  }

  /**
   * Get user statements
   */
  async getUserStatements(userId: string, filters?: { period?: string }): Promise<Array<unknown>> {
    const where: Record<string, unknown> = { userId };

    if (filters?.period) {
      where.period = filters.period;
    }

    const statements = await prisma.statement.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
    });

    // Construct full URLs for each statement
    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return statements.map((stmt) => ({
      ...stmt,
      fileUrl: stmt.fileUrl.startsWith('http') ? stmt.fileUrl : `${apiBaseUrl}${stmt.fileUrl}`,
      downloadUrl: `${apiBaseUrl}/api/documents/statements/${stmt.id}/download`,
      status: stmt.status || 'PENDING',
    }));
  }

  /**
   * Get all statements (admin only)
   */
  async getAllStatements(filters?: {
    userId?: string;
    period?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    statements: Array<unknown>;
    total: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }
    if (filters?.period) {
      where.period = filters.period;
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    const [statements, total] = await Promise.all([
      prisma.statement.findMany({
        where,
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
        orderBy: { uploadedAt: 'desc' },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
      }),
      prisma.statement.count({ where }),
    ]);

    // Construct full URLs for each statement
    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    const statementsWithUrls = statements.map((stmt) => ({
      ...stmt,
      fileUrl: stmt.fileUrl.startsWith('http') ? stmt.fileUrl : `${apiBaseUrl}${stmt.fileUrl}`,
      downloadUrl: `${apiBaseUrl}/api/documents/statements/${stmt.id}/download`,
      status: stmt.status || 'PENDING',
    }));

    return {
      statements: statementsWithUrls,
      total,
    };
  }

  /**
   * Update statement status
   */
  async updateStatementStatus(
    statementId: string,
    status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED',
    reason?: string
  ): Promise<unknown> {
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
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
    });

    if (!statement) {
      throw new NotFoundError('Statement not found');
    }

    const oldStatus = statement.status || 'PENDING';

    // Update statement
    const updated = await prisma.statement.update({
      where: { id: statementId },
      data: {
        status,
        description: reason
          ? `${statement.description || ''}${statement.description ? ' - ' : ''}${reason}`.trim()
          : statement.description,
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
    });

    // Construct full URL
    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    return {
      ...updated,
      fileUrl: updated.fileUrl.startsWith('http')
        ? updated.fileUrl
        : `${apiBaseUrl}${updated.fileUrl}`,
      downloadUrl: `${apiBaseUrl}/api/documents/statements/${updated.id}/download`,
      oldStatus,
    };
  }

  /**
   * Get statement file path
   */
  async getStatementFilePath(statementId: string): Promise<string> {
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
    });

    if (!statement) {
      throw new NotFoundError('Statement not found');
    }

    // Construct full file path - fileUrl is already /uploads/statements/...
    const filePath = path.join(process.cwd(), statement.fileUrl);

    // Verify file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundError('Statement file not found on server');
    }

    return filePath;
  }

  /**
   * Get statement by ID
   */
  async getStatementById(
    statementId: string,
    userId?: string
  ): Promise<{
    id: string;
    userId: string;
    period: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    description: string | null;
    uploadedBy: string;
    uploadedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const where: Record<string, unknown> = { id: statementId };
    if (userId) {
      where.userId = userId;
    }

    const statement = await prisma.statement.findFirst({
      where,
    });

    if (!statement) {
      throw new NotFoundError('Statement not found');
    }

    return statement;
  }

  /**
   * Delete statement (admin only)
   */
  async deleteStatement(statementId: string): Promise<{ message: string }> {
    const statement = await prisma.statement.findFirst({
      where: { id: statementId },
    });

    if (!statement) {
      throw new NotFoundError('Statement not found');
    }

    // Delete file
    try {
      const filePath = path.join(process.cwd(), 'public', statement.fileUrl);
      await fs.unlink(filePath);
    } catch (error) {
      console.warn('Failed to delete file:', error);
    }

    // Delete database record
    await prisma.statement.delete({
      where: { id: statementId },
    });

    return { message: 'Statement deleted successfully' };
  }
}

export const documentService = new DocumentService();
