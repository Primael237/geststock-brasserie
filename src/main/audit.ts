// ============================================================
// GestStock Brasserie v1.0 — Audit Logs
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbAll } from './database';

export function addAuditLog(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>
): void {
  dbRun(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userId, action, entityType, entityId, JSON.stringify(details)]
  );
}

export function getAuditLogs(limit: number = 100): unknown[] {
  return dbAll(
    `SELECT al.*, u.username
     FROM audit_logs al
     LEFT JOIN users u ON al.user_id = u.id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [limit]
  );
}