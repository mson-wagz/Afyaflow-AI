import * as demo from './demoAdapter.js';
import { api, useBackend, errorResult } from '../../api/client.js';
let audit=[];
export async function apiSignIn(identifier,pin) {
  if(!useBackend)return demo.apiSignIn(identifier,pin);
  try {const result=await api('/auth/login',{method:'POST',body:{identifier,pin}});audit=await api('/audit');return result;}
  catch(error){return {success:false,error:error.message};}
}
export async function apiUnlockSession(staffId,pin) {
  if(!useBackend)return demo.apiUnlockSession(staffId,pin);
  try{return await api('/auth/unlock',{method:'POST',body:{pin}});}catch(error){return {success:false,error:error.message};}
}
export async function apiExecuteClinicalAction(staff,action,payload) {
  if(!useBackend)return demo.apiExecuteClinicalAction(staff,action,payload);
  return errorResult({code:'PROPOSAL_REQUIRED',message:'Use the triage review screen to decide an actual versioned proposal.'});
}
export const apiGetAuditLogs=()=>useBackend?audit:demo.apiGetAuditLogs();
export async function apiRefreshAuditLogs() {if(useBackend)audit=await api('/audit');return apiGetAuditLogs();}
