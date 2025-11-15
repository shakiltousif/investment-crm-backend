import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { problemReportService } from '../services/problemReport.service.js';
import { createProblemReportSchema, createProblemReportResponseSchema } from '../lib/validators.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * POST /api/problem-reports
 * Create a new problem report
 */
router.post(
  '/',
  authenticate,
  upload.array('attachments', 5), // Max 5 attachments
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const validatedData = createProblemReportSchema.parse(req.body);

      const attachments = req.files
        ? (req.files as Express.Multer.File[]).map((file) => ({
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            fileBuffer: file.buffer,
          }))
        : undefined;

      const report = await problemReportService.createProblemReport(req.userId, {
        ...validatedData,
        attachments,
      });

      res.status(201).json({
        message: 'Problem report created successfully',
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/problem-reports
 * Get user's problem reports
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new Error('User ID not found');
    }

    const filters = {
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };

    const result = await problemReportService.getUserProblemReports(req.userId, filters);

    res.status(200).json({
      message: 'Problem reports retrieved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/problem-reports/:id
 * Get specific problem report
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      throw new Error('User ID not found');
    }

    const report = await problemReportService.getProblemReportById(req.userId, req.params.id);

    res.status(200).json({
      message: 'Problem report retrieved successfully',
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/problem-reports/:id/respond
 * User responds to problem report
 */
router.post(
  '/:id/respond',
  authenticate,
  upload.array('attachments', 5), // Max 5 attachments
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        throw new Error('User ID not found');
      }

      const validatedData = createProblemReportResponseSchema.parse(req.body);

      const attachments = req.files
        ? (req.files as Express.Multer.File[]).map((file) => ({
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            fileBuffer: file.buffer,
          }))
        : undefined;

      const response = await problemReportService.createUserResponse(req.params.id, req.userId, {
        ...validatedData,
        attachments,
      });

      res.status(201).json({
        message: 'Response created successfully',
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
