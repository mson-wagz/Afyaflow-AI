import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30-second steps, 6 digits): the
 * scheme used by Google Authenticator, Microsoft Authenticator and similar apps.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step to tolerate small clock differences on phones. */
const DRIFT_STEPS = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 encoded for entry into an authenticator app. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export const totpStep = (atMs: number) => Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);

export function totpCode(secret: string, step: number, digits = TOTP_DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Returns the matching time step, or null. A code is accepted only for a step later than
 * `lastUsedStep`, so each code works once even inside its validity window.
 */
export function verifyTotp(secret: string, code: string, lastUsedStep: number | null, atMs = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(atMs);
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

/** otpauth:// URI that authenticator apps accept (typed in, or rendered as a QR code). */
export function otpauthUri(secret: string, account: string, issuer = 'AfyaFlow') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
