import { Router, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { emailTemplateService } from '../services/emailTemplate.service.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/email-templates
 * List all email templates
 */
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const templates = await emailTemplateService.getAllTemplates();
    res.status(200).json({
      message: 'Email templates retrieved successfully',
      data: templates,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/admin/email-templates/:type
 * Get single email template by type
 */
router.get('/:type', async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const template = await emailTemplateService.getTemplate(type as any);
    
    if (!template) {
      return res.status(404).json({
        message: 'Email template not found',
      });
    }

    return res.status(200).json({
      message: 'Email template retrieved successfully',
      data: template,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/email-templates
 * Create new email template
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      type: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      subject: z.string().min(1),
      htmlContent: z.string().min(1),
      cssStyles: z.string().optional(),
      variables: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          required: z.boolean(),
          example: z.string().optional(),
        })
      ),
      isActive: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const template = await emailTemplateService.createTemplate(validatedData as any);

    res.status(201).json({
      message: 'Email template created successfully',
      data: template,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * PUT /api/admin/email-templates/:type
 * Update existing email template
 */
router.put('/:type', async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      subject: z.string().min(1).optional(),
      htmlContent: z.string().min(1).optional(),
      cssStyles: z.string().optional(),
      variables: z
        .array(
          z.object({
            name: z.string(),
            description: z.string(),
            required: z.boolean(),
            example: z.string().optional(),
          })
        )
        .optional(),
      isActive: z.boolean().optional(),
    });

    const validatedData = schema.parse(req.body);
    const template = await emailTemplateService.updateTemplate(type as any, validatedData);

    res.status(200).json({
      message: 'Email template updated successfully',
      data: template,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * DELETE /api/admin/email-templates/:type
 * Delete/deactivate email template
 */
router.delete('/:type', async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    await emailTemplateService.deleteTemplate(type as any);

    res.status(200).json({
      message: 'Email template deleted successfully',
    });
  } catch (error) {
    throw error;
  }
});

/**
 * POST /api/admin/email-templates/:type/preview
 * Preview email template with sample data
 */
router.post('/:type/preview', async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const schema = z.object({
      variables: z.record(z.union([z.string(), z.number(), z.null()])),
    });

    const { variables } = schema.parse(req.body);
    const template = await emailTemplateService.getTemplate(type as any);

    if (!template) {
      return res.status(404).json({
        message: 'Email template not found',
      });
    }

    const interpolated = emailTemplateService.interpolateTemplate(template, variables as any);

    return res.status(200).json({
      message: 'Template preview generated successfully',
      data: {
        subject: interpolated.subject,
        html: interpolated.html,
      },
    });
  } catch (error) {
    throw error;
  }
});

export default router;

