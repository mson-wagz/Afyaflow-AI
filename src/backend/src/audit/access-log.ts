import { CallHandler, ExecutionContext, Injectable, Inject, NestInterceptor, SetMetadata, ServiceUnavailableException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap } from 'rxjs';
import { Database, hash, id } from '../database/db.js';
import type { StaffRequest } from '../auth/auth.js';

/**
 * Read-access audit logging for routes that return patient records.
 *
 * Mark a route with `@AccessLogged()`. After the handler returns, the patient IDs found in the
 * response are recorded for the signed-in staff member before the response is sent. If the access
 * cannot be recorded, the data is withheld (fail closed).
 *
 * Screens poll every few seconds, so the same staff member viewing the same set of records through
 * the same route is recorded once per ACCESS_LOG_WINDOW_SECONDS; any change in the set is recorded
 * immediately.
 */
export const ACCESS_LOGGED = 'afyaflow:access-logged';
export const AccessLogged = () => SetMetadata(ACCESS_LOGGED, true);
export const ACCESS_LOG_WINDOW_SECONDS = 300;

const PATIENT_KEYS = new Set(['patientId', 'visitId', 'visit_id']);
const RECORD_ID = /^(SYN-PT|MIMIC-ED)-/;

/** Collects patient/visit identifiers from a response body. */
export function patientIdsIn(body: unknown, params: Record<string, string> = {}) {
  const found = new Set<string>();
  for (const value of Object.values(params)) if (RECORD_ID.test(value)) found.add(value);
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && (PATIENT_KEYS.has(key) || (key === 'id' && RECORD_ID.test(child)))) found.add(child);
      else visit(child, depth + 1);
    }
  };
  visit(body, 0);
  return [...found].sort();
}

/** Newest 200 access records, optionally for one patient. Administrators only. */
export async function listAccess(database: Database, staff: { role: string }, patientId?: string) {
  if (staff.role !== 'admin') throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Administrator access required to review record access.' });
  if (patientId !== undefined && !/^[A-Za-z0-9-]{1,80}$/.test(patientId))
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid patient identifier.' });
  const rows = (await database.pool.query(`SELECT a.id,a.staff_id,s.profile->>'name' staff_name,s.role,a.route,a.params,a.patient_ids,a.record_count,a.accessed_at
    FROM access_log a JOIN staff s ON s.id=a.staff_id WHERE $1::text IS NULL OR $1=ANY(a.patient_ids)
    ORDER BY a.accessed_at DESC LIMIT 200`, [patientId ?? null])).rows;
  return rows.map((r) => ({ id: r.id, staffId: r.staff_id, staffName: r.staff_name, staffRole: r.role, route: r.route, params: r.params,
    patientIds: r.patient_ids, recordCount: r.record_count, accessedAt: new Date(r.accessed_at).toISOString() }));
}

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(Database) private readonly database: Database) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (!this.reflector.get<boolean>(ACCESS_LOGGED, context.getHandler())) return next.handle();
    const req = context.switchToHttp().getRequest<StaffRequest>();
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const params = { ...(req.params || {}) } as Record<string, string>;
    return next.handle().pipe(mergeMap(async (body) => {
      const patientIds = patientIdsIn(body, params);
      const subject = hash(JSON.stringify([route, params, patientIds]));
      try {
        await this.database.pool.query(`INSERT INTO access_log(id,staff_id,route,params,patient_ids,record_count,subject_hash)
          SELECT $1,$2,$3,$4,$5,$6,$7 WHERE NOT EXISTS (SELECT 1 FROM access_log WHERE staff_id=$2 AND subject_hash=$7
          AND accessed_at>now()-make_interval(secs=>$8))`,
          [id('ACCESS'), req.staff.id, route, JSON.stringify(params), patientIds, patientIds.length, subject, ACCESS_LOG_WINDOW_SECONDS]);
      } catch {
        throw new ServiceUnavailableException({ code: 'ACCESS_NOT_RECORDED', message: 'Patient data is unavailable because access could not be recorded. Try again.' });
      }
      return body;
    }));
  }
}
