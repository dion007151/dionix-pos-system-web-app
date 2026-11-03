import { db } from '../db/db';
import { AuditLog } from '../types';

export async function logActivity(
  userId: string,
  username: string,
  fullName: string,
  role: string,
  action: string,
  sessionId: string,
  details?: string
): Promise<void> {
  const log: AuditLog = {
    id: 'log-' + Math.random().toString(36).substring(2, 12),
    userId,
    username,
    fullName,
    role,
    action,
    details,
    timestamp: new Date().toISOString(),
    sessionId
  };
  await db.auditLogs.add(log);
}
