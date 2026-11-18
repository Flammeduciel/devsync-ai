import type { Db, Prisma } from '@devsync/database';

export interface AuditEntry {
  teamId: string;
  actorUserId?: string;
  actorAgentId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export function recordAudit(db: Db, entry: AuditEntry) {
  return db.auditLog.create({
    data: {
      teamId: entry.teamId,
      actorType: entry.actorAgentId ? 'AGENT' : entry.actorUserId ? 'HUMAN' : 'SYSTEM',
      actorUserId: entry.actorUserId ?? null,
      actorAgentId: entry.actorAgentId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
