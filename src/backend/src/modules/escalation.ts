import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Database, audit, id } from '../database/db.js';

/* ------------------------------------------------------------------ */
/* SMS escalation to the on-call clinician (docs/INTEGRATION_MAP.md)   */
/* ------------------------------------------------------------------ */
// When a Level 1 (RED) patient is still not seen this many minutes after arrival, text the
// on-call clinician once. The message carries no patient name or identifier. Sending is a
// notification, not a clinical decision: it changes nothing in the queue.

export type SmsResult = { ok: boolean; response: unknown };
export type SmsSender = { provider: string; send: (to: string, message: string) => Promise<SmsResult> };

const MAX_ATTEMPTS = 3;

export function escalationSettings(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.SMS_PROVIDER || 'none';
  if (!['none', 'africastalking'].includes(provider)) throw new Error('SMS_PROVIDER must be none or africastalking.');
  const environment = env.AT_ENVIRONMENT || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) throw new Error('AT_ENVIRONMENT must be sandbox or production.');
  const graceMinutes = Number(env.ESCALATION_GRACE_MINUTES || 5);
  if (!Number.isInteger(graceMinutes) || graceMinutes < 1 || graceMinutes > 120) throw new Error('ESCALATION_GRACE_MINUTES must be between 1 and 120.');
  const recipient = env.ONCALL_PHONE || '';
  if (provider !== 'none') {
    if (!/^\+\d{9,15}$/.test(recipient)) throw new Error('ONCALL_PHONE must be an international number such as +2547XXXXXXXX.');
    if (!env.AT_USERNAME || !env.AT_API_KEY) throw new Error('AT_USERNAME and AT_API_KEY are required for SMS escalation.');
  }
  return { provider, environment, graceMinutes, recipient };
}

/** Africa's Talking SMS (sandbox or production). The API key stays in the server environment. */
export function africasTalkingSender(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): SmsSender {
  const sandbox = (env.AT_ENVIRONMENT || 'sandbox') === 'sandbox';
  const url = sandbox ? 'https://api.sandbox.africastalking.com/version1/messaging' : 'https://api.africastalking.com/version1/messaging';
  return {
    provider: sandbox ? 'africastalking-sandbox' : 'africastalking',
    async send(to, message) {
      const response = await fetchImpl(url, {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { apiKey: env.AT_API_KEY!, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: env.AT_USERNAME!, to, message }).toString(),
      });
      const body: any = await response.json().catch(() => ({ status: response.status }));
      const recipient = body?.SMSMessageData?.Recipients?.[0];
      // Africa's Talking reports per-recipient status codes; 100-102 mean accepted for delivery.
      const ok = response.ok && [100, 101, 102].includes(Number(recipient?.statusCode));
      return { ok, response: { httpStatus: response.status, status: recipient?.status ?? body?.SMSMessageData?.Message ?? null,
        statusCode: recipient?.statusCode ?? null, messageId: recipient?.messageId ?? null, cost: recipient?.cost ?? null } };
    },
  };
}

const mask = (phone: string) => phone.replace(/^(\+\d{3})\d+(\d{3})$/, '$1•••$2');

/** One pass: queue alerts for Level 1 patients past the grace period and unseen, then send or retry. */
export async function runEscalations(database: Database, sender: SmsSender, settings = escalationSettings()) {
  const due = (await database.pool.query(`SELECT v.id,floor(extract(epoch FROM now()-v.arrival_at)/60)::int waited FROM visits v
    WHERE v.data_source='synthetic' AND v.closed_at IS NULL AND v.seen_at IS NULL AND v.approved_priority='RED'
    AND v.arrival_at<now()-make_interval(mins=>$1)
    AND NOT EXISTS(SELECT 1 FROM sms_escalations s WHERE s.visit_id=v.id AND s.kind='LEVEL1_UNSEEN')`, [settings.graceMinutes])).rows;
  for (const visit of due) {
    const message = `AfyaFlow A&E: a Level 1 (Emergency) patient has waited ${visit.waited} min and is not yet seen. Open the AfyaFlow queue now.`;
    await database.pool.query(`INSERT INTO sms_escalations(id,visit_id,kind,recipient_masked,message,provider) VALUES($1,$2,'LEVEL1_UNSEEN',$3,$4,$5)
      ON CONFLICT(visit_id,kind) DO NOTHING`, [id('SMS'), visit.id, mask(settings.recipient), message, sender.provider]);
  }
  const pending = (await database.pool.query(`SELECT s.*,v.seen_at,v.closed_at FROM sms_escalations s JOIN visits v ON v.id=s.visit_id
    WHERE s.status='QUEUED' OR (s.status='FAILED' AND s.attempts<$1) ORDER BY s.created_at`, [MAX_ATTEMPTS])).rows;
  let sent = 0, failed = 0;
  for (const alert of pending) {
    if (alert.seen_at || alert.closed_at) continue; // seen or closed meanwhile: no longer needed
    let result: SmsResult;
    try { result = await sender.send(settings.recipient, alert.message); }
    catch (error) { result = { ok: false, response: { error: error instanceof Error ? error.message : 'SMS request failed' } }; }
    await database.transaction(async (db) => {
      await db.query(`UPDATE sms_escalations SET status=$2,attempts=attempts+1,provider_response=$3,sent_at=CASE WHEN $2='SENT' THEN now() ELSE sent_at END WHERE id=$1`,
        [alert.id, result.ok ? 'SENT' : 'FAILED', JSON.stringify(result.response)]);
      await audit(db, null, result.ok ? 'SMS_ESCALATION_SENT' : 'SMS_ESCALATION_FAILED',
        { escalationId: alert.id, kind: alert.kind, provider: sender.provider, attempt: alert.attempts + 1 }, alert.visit_id);
    });
    if (result.ok) sent += 1; else failed += 1;
  }
  return { queued: due.length, sent, failed };
}

@Injectable()
export class EscalationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private active: Promise<unknown> | null = null;
  constructor(@Inject(Database) private readonly database: Database) {}
  onModuleInit() {
    const settings = escalationSettings();
    if (settings.provider === 'none' || process.env.ESCALATION_WORKER_DISABLED === 'true' || process.env.AWS_LAMBDA_FUNCTION_NAME) return;
    const sender = africasTalkingSender();
    this.timer = setInterval(() => {
      if (this.active) return;
      this.active = runEscalations(this.database, sender, settings).catch(() => console.error('SMS escalation unavailable.')).finally(() => { this.active = null; });
    }, 60000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.active; }
}
