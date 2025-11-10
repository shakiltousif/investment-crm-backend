import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { reportService } from '../services/report.service';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/reports/portfolio
 * Generate portfolio report (returns JSON data)
 */
router.get('/portfolio', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const { startDate, endDate } = schema.parse(req.query);

    const reportData = await reportService.generatePortfolioReportData(
      req.userId!,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.status(200).json({
      message: 'Portfolio report generated successfully',
      data: reportData,
    });
  } catch (error) {
    throw error;
  }
});

/**
 * GET /api/reports/portfolio/csv
 * Generate portfolio report as CSV
 */
router.get('/portfolio/csv', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    });

    const { startDate, endDate } = schema.parse(req.query);

    const reportData = await reportService.generatePortfolioReportData(
      req.userId!,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    const csv = reportService.generateCSVReport(reportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="portfolio-report-${Date.now()}.csv"`
    );
    res.status(200).send(csv);
  } catch (error) {
    throw error;
  }
});

export default router;
