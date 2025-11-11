import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { documentService } from '../services/document.service.js';
import { z } from 'zod';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * POST /api/documents
 * Upload document (client or admin)
 */
router.post(
  '/',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const schema = z.object({
        type: z.string().min(1),
        description: z.string().optional(),
      });

      const validatedData = schema.parse(req.body);

      const document = await documentService.uploadDocument(req.userId!, req.userId!, {
        type: validatedData.type,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: validatedData.description,
        fileBuffer: req.file.buffer,
      });

      res.status(201).json({
        message: 'Document uploaded successfully',
        data: document,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * GET /api/documents
 * Get user documents
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.type) {
      filters.type = req.query.type;
    }
    if (req.query.isImportant !== undefined) {
      filters.isImportant = req.query.isImportant === 'true';
    }

    const documents = await documentService.getUserDocuments(req.userId!, filters);
    res.status(200).json({
      message: 'Documents retrieved successfully',
      data: documents,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/documents/statements
 * Upload statement (admin only)
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.post(
  '/statements',
  authenticate,
  requireAdmin,
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const schema = z.object({
        userId: z.string().min(1),
        period: z.string().min(1),
        description: z.string().optional(),
      });

      const validatedData = schema.parse(req.body);

      const statement = await documentService.uploadStatement(req.userId!, {
        userId: validatedData.userId,
        period: validatedData.period,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        description: validatedData.description,
        fileBuffer: req.file.buffer,
      });

      res.status(201).json({
        message: 'Statement uploaded successfully',
        data: statement,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * GET /api/documents/statements
 * Get user statements
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/statements', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.period) {
      filters.period = req.query.period;
    }

    const statements = await documentService.getUserStatements(req.userId!, filters);
    res.status(200).json({
      message: 'Statements retrieved successfully',
      data: statements,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/documents/statements/:id/download
 * Download statement file
 * NOTE: Must be defined BEFORE /statements/:id route to avoid route conflicts
 */
router.get('/statements/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const statement = await documentService.getStatementById(req.params.id, req.userId);

    const filePath = await documentService.getStatementFilePath(statement.id);

    res.setHeader('Content-Disposition', `attachment; filename="${statement.fileName}"`);
    res.setHeader('Content-Type', statement.mimeType);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/documents/statements/:id
 * Get statement by ID
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  '/statements/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const statement = await documentService.getStatementById(req.params.id, req.userId);

      // Construct full URL for fileUrl
      const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
      const statementWithFullUrl = {
        id: statement.id,
        userId: statement.userId,
        period: statement.period,
        fileName: statement.fileName,
        fileUrl: statement.fileUrl.startsWith('http')
          ? statement.fileUrl
          : `${apiBaseUrl}${statement.fileUrl}`,
        fileSize: statement.fileSize,
        mimeType: statement.mimeType,
        description: statement.description,
        uploadedBy: statement.uploadedBy,
        uploadedAt: statement.uploadedAt,
        createdAt: statement.createdAt,
        updatedAt: statement.updatedAt,
        downloadUrl: `${apiBaseUrl}/api/documents/statements/${statement.id}/download`,
      };

      return res.status(200).json({
        message: 'Statement retrieved successfully',
        data: statementWithFullUrl,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * DELETE /api/documents/statements/:id
 * Delete statement (admin only)
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.delete(
  '/statements/:id',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await documentService.deleteStatement(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      throw error;
    }
  }
);

/**
 * GET /api/documents/:id/download
 * Download document file
 * NOTE: Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const document = await documentService.getDocumentById(req.params.id, req.userId, isAdmin);

    const filePath = await documentService.getDocumentFilePath(document.id);

    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
    res.setHeader('Content-Type', document.mimeType);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/documents/:id
 * Get document by ID
 * NOTE: Must be defined AFTER /statements routes to avoid route conflicts
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const document = await documentService.getDocumentById(req.params.id, req.userId, isAdmin);

    // Construct full URL for fileUrl
    const apiBaseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    const documentWithFullUrl = {
      id: document.id,
      userId: document.userId,
      type: document.type,
      fileName: document.fileName,
      fileUrl: document.fileUrl.startsWith('http')
        ? document.fileUrl
        : `${apiBaseUrl}${document.fileUrl}`,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      description: document.description,
      uploadedBy: document.uploadedBy,
      isImportant: document.isImportant,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      downloadUrl: `${apiBaseUrl}/api/documents/${document.id}/download`,
    };

    return res.status(200).json({
      message: 'Document retrieved successfully',
      data: documentWithFullUrl,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/documents/:id
 * Delete document
 * NOTE: Must be defined AFTER /statements routes to avoid route conflicts
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const result = await documentService.deleteDocument(req.params.id, req.userId!, isAdmin);
    res.status(200).json(result);
  } catch (error) {
    throw error;
  }
});

export default router;
