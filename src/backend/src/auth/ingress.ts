import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const PROXY_CLIENT_IP_HEADER='x-afyaflow-client-ip';

// Only meaningful when the app is reachable solely through a proxy that overwrites this header
// (deploy/ec2/Caddyfile). Without a proxy, a client could set it and pick its own throttle key.
export function trustedProxySource(headers:Record<string,unknown>) {
  const supplied=headers[PROXY_CLIENT_IP_HEADER];
  if(typeof supplied!=='string') return null;
  const source=supplied.trim();
  return isIP(source) ? source : null;
}

export function trustedCloudFrontSource(headers:Record<string,unknown>,token:string) {
  const supplied=headers['x-afyaflow-origin-token'];
  if(typeof supplied!=='string') return null;
  const suppliedBytes=Buffer.from(supplied),expectedBytes=Buffer.from(token);
  if(suppliedBytes.length!==expectedBytes.length || !timingSafeEqual(suppliedBytes,expectedBytes)) return null;
  const address=headers['cloudfront-viewer-address'];
  if(typeof address!=='string') return null;
  const source=address.slice(0,address.lastIndexOf(':')).replace(/^\[|\]$/g,'');
  return isIP(source) ? source : null;
}
