import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLogService } from '../services/auditLog.service';

const router = Router();

/**
 * GET /api/audit-logs
 * Get audit logs
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const logs = await auditLogService.getAuditLogs(filters);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/audit-logs/user/:userId
 * Get user audit logs
 */
router.get('/user/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      action: req.query.action as string,
      resource: req.query.resource as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const logs = await auditLogService.getUserAuditLogs(req.params.userId, filters);
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/audit-logs/resource/:resource/:resourceId
 * Get resource audit logs
 */
router.get(
  '/resource/:resource/:resourceId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const logs = await auditLogService.getResourceAuditLogs(
        req.params.resource,
        req.params.resourceId
      );
      res.status(200).json({ success: true, data: logs });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * GET /api/audit-logs/summary
 * Get audit summary
 */
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const summary = await auditLogService.getAuditSummary(userId);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/audit-logs/export
 * Export audit logs
 */
router.get('/export', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      userId: req.query.userId as string,
      action: req.query.action as string,
      resource: req.query.resource as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    };

    const logs = await auditLogService.exportAuditLogs(filters);

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');

    // Convert to CSV
    const headers = [
      'Timestamp',
      'User ID',
      'Action',
      'Resource',
      'Resource ID',
      'Status',
      'IP Address',
      'User Agent',
      'Details',
    ];
    const csv = [
      headers.join(','),
      ...logs.map((log) =>
        [
          log.timestamp,
          log.userId,
          log.action,
          log.resource,
          log.resourceId || '',
          log.status,
          log.ipAddress || '',
          log.userAgent || '',
          log.details || '',
        ]
          .map((field) => `"${field}"`)
          .join(',')
      ),
    ].join('\n');

    res.send(csv);
  } catch (error) {
    throw error;
  }
});

export default router;
