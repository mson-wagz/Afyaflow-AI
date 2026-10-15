import type {Pool,PoolClient} from 'pg';
import {compareObservationsForDeterioration,REASSESSMENT_POLICY_VERSION} from '../../src/shared/contracts/deterioration.js';

export async function reassessmentContext(db:Pool|PoolClient,visitId:string,version:number) {
  const visit=(await db.query('SELECT data_source FROM visits WHERE id=$1',[visitId])).rows[0];
  if(visit?.data_source!=='synthetic')return {followupAllowed:false,researchOnly:true};
  const rows=(await db.query('SELECT id,version,vitals,recorded_at FROM observations WHERE visit_id=$1 AND version<=$2 ORDER BY version DESC LIMIT 2',[visitId,version])).rows;
  const snapshot=(row:any)=>({id:row.id,version:row.version,vitals:row.vitals,recordedAt:row.recorded_at.toISOString()});
  const comparison=rows[1]?compareObservationsForDeterioration(rows[1].vitals,rows[0].vitals):null;
  return {followupAllowed:true,policyVersion:REASSESSMENT_POLICY_VERSION,latest:rows[0]?snapshot(rows[0]):null,baseline:rows[1]?snapshot(rows[1]):null,
    comparison,clinicalValidated:false,ruleCitation:'AfyaFlow synthetic recorded-change fixture; not a validated monitoring protocol',
    limitation:'Only recorded observations are compared. No flags does not establish stability or continuous monitoring. Staff must choose any follow-up time.'};
}
