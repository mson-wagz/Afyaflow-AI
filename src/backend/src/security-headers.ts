import type { Request, Response, NextFunction } from 'express';

/**
 * Browser security headers for every response (API and the served frontend).
 *
 * The Content-Security-Policy allows the app's own files plus what local voice intake needs:
 * speech model downloads from Hugging Face and the ONNX runtime, which may load from jsDelivr,
 * with WebAssembly compilation. It is sent report-only by default so a missed source shows up as
 * a console warning instead of breaking the app; set CSP_MODE=enforce once the deployed site
 * shows no violations. X-Frame-Options covers framing, which report-only CSP cannot enforce.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export type SecurityHeaderOptions = { hsts: boolean; enforceCsp: boolean };

export function securityHeaders({ hsts, enforceCsp }: SecurityHeaderOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader(enforceCsp ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Voice intake records from the microphone on this origin only; nothing else is needed.
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // Only over HTTPS deployments: browsers then refuse plain HTTP to this host for a year.
    if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Patient data must not be stored by the browser cache or intermediaries.
    if (req.path.startsWith('/api/')) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); }
    next();
  };
}
