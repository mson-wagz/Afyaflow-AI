import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

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
