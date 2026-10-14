import * as demo from './demoAdapter.js';
import { api, mutation, useBackend } from '../../api/client.js';
import { isDemoOnline } from '../../demo/store.js';
export const apiFetchDepartmentSnapshot=()=>useBackend?api('/departments'):demo.apiFetchDepartmentSnapshot();
export const apiFetchRoutingCandidates=()=>useBackend?api('/routing/candidates'):demo.apiFetchRoutingCandidates();
export async function apiCommitDepartmentTransfer(staff,data) {
  if(!useBackend)return demo.apiCommitDepartmentTransfer(staff,data);
  if(!isDemoOnline())return {success:false,error:'Transfers require online connectivity.'};
  try{return await mutation('/routing/transfers',data);}catch(error){return {success:false,error:error.message};}
}
