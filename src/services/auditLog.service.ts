import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

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
  async logAction(entry: AuditLogEntry): Promise<unknown> {
    const auditLog = await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.resource,
        entityId: entry.resourceId,
        changes: entry.changes ? (entry.changes as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });

    return auditLog;
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(filters: AuditLogFilters): Promise<{
    data: Array<unknown>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      pages: number;
    };
  }> {
    const where: Record<string, unknown> = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.resource) {
      where.entity = filters.resource;
    }

    if (filters.startDate || filters.endDate) {
      const createdAtFilter: { gte?: Date; lte?: Date } = {};
      if (filters.startDate) {
        createdAtFilter.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        createdAtFilter.lte = new Date(filters.endDate);
      }
      where.createdAt = createdAtFilter;
    }

    const limit = Math.min(filters.limit ?? 50, 500);
    const offset = filters.offset ?? 0;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs.map((log) => ({
        ...log,
        changes: log.changes ?? null,
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
  async getUserAuditLogs(
    userId: string,
    filters: Omit<AuditLogFilters, 'userId'>
  ): Promise<{
    data: Array<unknown>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      pages: number;
    };
  }> {
    return this.getAuditLogs({
      ...filters,
      userId,
    });
  }

  /**
   * Get audit logs by resource
   */
  async getResourceAuditLogs(resource: string, resourceId: string): Promise<Array<unknown>> {
    const logs = await prisma.auditLog.findMany({
      where: {
        entity: resource,
        entityId: resourceId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      ...log,
      changes: log.changes ?? null,
    }));
  }

  /**
   * Get audit summary
   */
  async getAuditSummary(userId?: string): Promise<{
    totalLogs: number;
    successCount: number;
    failureCount: number;
    successRate: string;
    actionSummary: Record<string, number>;
  }> {
    const baseWhere = userId ? { userId } : {};

    const [totalLogs, actionCounts] = await Promise.all([
      prisma.auditLog.count({ where: baseWhere }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: baseWhere,
        _count: true,
      }),
    ]);

    const actionSummary: Record<string, number> = {};
    for (const item of actionCounts) {
      actionSummary[item.action] = item._count;
    }

    return {
      totalLogs,
      successCount: 0,
      failureCount: 0,
      successRate: '0',
      actionSummary,
    };
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(filters: AuditLogFilters): Promise<
    Array<{
      timestamp: string;
      userId: string;
      action: string;
      resource: string;
      resourceId: string | null;
      status: string;
      ipAddress: string | null;
      userAgent: string | null;
      details: string | null;
      changes: unknown;
    }>
  > {
    const logs = await this.getAuditLogs({
      ...filters,
      limit: 10000, // Max export limit
    });

    return (
      logs.data as Array<{
        createdAt: Date;
        userId: string;
        action: string;
        entity: string;
        entityId: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        changes: unknown;
      }>
    ).map((log) => ({
      timestamp: log.createdAt.toISOString(),
      userId: log.userId,
      action: log.action,
      resource: log.entity,
      resourceId: log.entityId,
      status: 'SUCCESS',
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      details: null,
      changes: log.changes,
    }));
  }

  /**
   * Delete old audit logs (retention policy)
   */
  async deleteOldAuditLogs(daysToKeep: number = 90): Promise<{ count: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return {
      count: result.count,
    };
  }
}

export const auditLogService = new AuditLogService();
