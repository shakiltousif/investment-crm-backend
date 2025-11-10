import { prisma } from '../lib/prisma';

export interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resource?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class AuditLogService {
  /**
   * Log an action
   */
  async logAction(entry: AuditLogEntry) {
    const auditLog = await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        changes: entry.changes ? JSON.stringify(entry.changes) : null,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        status: entry.status,
        details: entry.details,
        timestamp: new Date(),
      },
    });

    return auditLog;
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(filters: AuditLogFilters) {
    const where: Record<string, unknown> = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.resource) {
      where.resource = filters.resource;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.timestamp.lte = new Date(filters.endDate);
      }
    }

    const limit = Math.min(filters.limit || 50, 500);
    const offset = filters.offset || 0;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs.map((log) => ({
        ...log,
        changes: log.changes ? JSON.parse(log.changes) : null,
      })),
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user audit logs
   */
  async getUserAuditLogs(userId: string, filters: Omit<AuditLogFilters, 'userId'>) {
    return this.getAuditLogs({
      ...filters,
      userId,
    });
  }

  /**
   * Get audit logs by resource
   */
  async getResourceAuditLogs(resource: string, resourceId: string) {
    const logs = await prisma.auditLog.findMany({
      where: {
        resource,
        resourceId,
      },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log) => ({
      ...log,
      changes: log.changes ? JSON.parse(log.changes) : null,
    }));
  }

  /**
   * Get audit summary
   */
  async getAuditSummary(userId?: string) {
    const where = userId ? { userId } : {};

    const [totalLogs, successCount, failureCount, actionCounts] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, status: 'SUCCESS' } }),
      prisma.auditLog.count({ where: { ...where, status: 'FAILURE' } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
    ]);

    const actionSummary: Record<string, number> = {};
    for (const item of actionCounts) {
      actionSummary[item.action] = item._count;
    }

    return {
      totalLogs,
      successCount,
      failureCount,
      successRate: totalLogs > 0 ? ((successCount / totalLogs) * 100).toFixed(2) : '0',
      actionSummary,
    };
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(filters: AuditLogFilters) {
    const logs = await this.getAuditLogs({
      ...filters,
      limit: 10000, // Max export limit
    });

    return logs.data.map((log) => ({
      timestamp: log.timestamp.toISOString(),
      userId: log.userId,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      status: log.status,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      details: log.details,
      changes: log.changes,
    }));
  }

  /**
   * Delete old audit logs (retention policy)
   */
  async deleteOldAuditLogs(daysToKeep: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    return {
      deletedCount: result.count,
      message: `Deleted ${result.count} audit logs older than ${daysToKeep} days`,
    };
  }
}

export const auditLogService = new AuditLogService();
