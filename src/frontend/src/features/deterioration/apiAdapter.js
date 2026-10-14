import * as demo from './demoAdapter.js';
import { api, mutation, useBackend } from '../../api/client.js';
import { isDemoOnline } from '../../demo/store.js';
export const apiFetchDeteriorationCases=()=>useBackend?api('/deterioration'):demo.apiFetchDeteriorationCases();
export async function apiCommitReassessmentDecision(staff,data) {
  if(!useBackend)return demo.apiCommitReassessmentDecision(staff,data);
  if(!isDemoOnline())return {success:false,error:'Reassessments require online connectivity.'};
  try{return await mutation('/deterioration/decisions',{...data,targetPriority:data.targetPriority?.code || null});}
  catch(error){return {success:false,error:error.message};}
}
