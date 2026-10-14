import * as demo from './demoAdapter.js';
import { api, mutation, errorResult, useBackend } from '../../api/client.js';
import { isDemoOnline } from '../../demo/store.js';
let history=[];
export async function apiGetPendingTriageProposals() {
  if(!useBackend) return demo.apiGetPendingTriageProposals();
  const [proposals,decisions]=await Promise.all([api('/triage/proposals'),api('/triage/decisions')]);
  history=decisions;return proposals;
}
export async function apiSubmitClinicalDecision(staff,data) {
  if(!useBackend) return demo.apiSubmitClinicalDecision(staff,data);
  if(!isDemoOnline()) return errorResult({code:'OFFLINE_ACTION_BLOCKED',message:'Clinical decisions require active online connectivity. No decision was saved.'});
  try {return await mutation('/triage/decisions',{...data,overridePriority:data.overridePriority?.code || null});}
  catch(error) {return errorResult(error);}
}
export const apiGetTriageDecisionHistory=()=>useBackend?history:demo.apiGetTriageDecisionHistory();
