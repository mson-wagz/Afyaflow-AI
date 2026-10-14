export const useBackend = import.meta.env.VITE_API_MODE !== 'demo' && import.meta.env.MODE !== 'test';
export class ApiError extends Error {
  constructor(status,body) {super(body.message || 'Request failed');this.status=status;this.code=body.code || 'API_ERROR';this.body=body;}
}
export async function api(path,options={}) {
  const response=await fetch(`/api${path}`,{credentials:'same-origin',...options,
    headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},
    body:options.body === undefined?undefined:JSON.stringify(options.body)});
  const body=await response.json().catch(()=>({message:'The backend is unavailable. Please try again.'}));
  if(!response.ok) {
    if(response.status===401) window.dispatchEvent(new Event('afyaflow-session-expired'));
    throw new ApiError(response.status,body);
  }
  return body;
}
export const retryKey = () => `request-${crypto.randomUUID()}`;
export async function mutation(path,body,key=retryKey()) {
  const result=await api(path,{method:'POST',body,headers:{'Idempotency-Key':key}});
  window.dispatchEvent(new Event('afyaflow-demo-change'));
  return result;
}
export const errorResult=error=>({success:false,error:{status:error.status || 503,code:error.code || 'NETWORK_ERROR',message:error.message || 'Backend unavailable.'}});
