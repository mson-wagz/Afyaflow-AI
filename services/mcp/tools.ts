import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Database, id, hash } from '../../src/backend/src/database/db.js';
import { calculateSatsScore } from '../../src/shared/contracts/triage.js';
import { readProtocolThroughFilesystem } from './borrowed-protocol.js';

export const protocolPath='services/mcp/protocols/synthetic-adult-v1.json';
export async function readProtocol() {return JSON.parse(await readFile(protocolPath,'utf8'));}
export function scoreEvidence(evidence:any,protocol:any) {
  const vitals=Object.fromEntries(Object.entries(evidence.vitals).map(([key,value]) => [key,value ?? '']));
  const result=calculateSatsScore(vitals);
  const missing=protocol.requiredFields.filter((key:string) => vitals[key] === '' || vitals[key] === undefined);
  if (evidence.age < 18 || missing.length) return {...result,score:null,priority:null,isSufficientEvidence:false,
    missingEvidence:missing,ruleTriggered:evidence.age < 18 ? 'Unsupported population: manual staff review required' : 'Missing core observations: manual staff review required',
    observationId:evidence.observationId,observationVersion:evidence.version,protocolId:protocol.id};
  return {...result,observationId:evidence.observationId,observationVersion:evidence.version,protocolId:protocol.id};
}

export async function createRunTools(database:Database,runId:string) {
  const run=(await database.pool.query('SELECT * FROM agent_runs WHERE id=$1',[runId])).rows[0];
  if (!run || run.status !== 'RUNNING') throw new Error('MCP tools require an active leased agent run.');
  const server=new McpServer({name:'afyaflow-patient-tools',version:'0.1.0'});
  let evidence:any,protocol:any,scoring:any,saved=false,step=0;
  const callbacks:Record<string,(args:any)=>Promise<any>>={
    get_observations:async () => {
      const row=(await database.pool.query(`SELECT o.*,v.age,v.complaint FROM observations o JOIN visits v ON v.id=o.visit_id
        WHERE o.visit_id=$1 AND o.version=$2`,[run.visit_id,run.observation_version])).rows[0];
      if (!row) throw new Error('The run observation snapshot does not exist.');
      evidence={visitId:row.visit_id,age:row.age,presentingComplaint:row.complaint,observationId:row.id,
        version:row.version,recordedAt:row.recorded_at.toISOString(),vitals:row.vitals};
      return evidence;
    },
    read_protocol:async () => {protocol=await readProtocolThroughFilesystem();return {...protocol,retrievedVia:'official-filesystem-mcp/read_text_file'};},
    score_protocol:async () => {
      if (!evidence || !protocol) throw new Error('Retrieve observations and protocol before scoring.');
      scoring=scoreEvidence(evidence,protocol);return scoring;
    },
    save_pending_proposal:async ({summary}:{summary:string}) => {
      if (!scoring || !evidence || !protocol) throw new Error('Evidence and deterministic score are required before saving.');
      const result=await database.transaction(async db => {
        const visit=(await db.query('SELECT * FROM visits WHERE id=$1 FOR UPDATE',[run.visit_id])).rows[0];
        const lockedRun=(await db.query('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0];
        if (lockedRun.status !== 'RUNNING' || lockedRun.attempts !== run.attempts || lockedRun.delivery_generation !== run.delivery_generation || new Date(lockedRun.lease_until).getTime() < Date.now()) throw new Error('Agent lease expired.');
        if (visit.observation_version !== run.observation_version) throw new Error('STALE_OBSERVATIONS: request a new assessment.');
        const data={proposal:scoring,protocol,summary,protocolChecksum:hash(JSON.stringify(protocol)),observationId:evidence.observationId,
          observationVersion:run.observation_version,clinicalValidated:false};
        const proposalId=id('PROP');
        const inserted=(await db.query(`INSERT INTO proposals(id,run_id,visit_id,observation_version,data)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id) DO UPDATE SET data=proposals.data RETURNING id`,
          [proposalId,runId,run.visit_id,run.observation_version,JSON.stringify(data)])).rows[0];
        await db.query("UPDATE visits SET assessment_status=$2 WHERE id=$1",[run.visit_id,scoring.isSufficientEvidence ? 'PENDING_CLINICAL_DECISION':'REVIEW_REQUIRED']);
        return {proposalId:inserted.id,status:'PENDING',priority:scoring.priority,requiresHumanApproval:true,clinicalValidated:false};
      });
      saved=true;return result;
    },
  };
  for (const name of Object.keys(callbacks)) {
    const schema=name === 'save_pending_proposal' ? z.object({summary:z.string().min(1).max(2000)}).strict() : z.object({}).strict();
    server.registerTool(name,{description:{
      get_observations:'Retrieve the actual versioned observations for this assessment. No other patients can be queried.',
      read_protocol:'Retrieve the fixed synthetic scoring fixture and its missing-evidence policy.',
      score_protocol:'Calculate a deterministic proposal from retrieved evidence. Never invent measurements or choose a priority yourself.',
      save_pending_proposal:'Persist the calculated proposal for human review. This does not approve it or change the approved queue.',
    }[name]!,inputSchema:schema},async (args:any) => {
      const started=performance.now();let output:any;
      try {output=await callbacks[name](args);} catch(error) {output={error:error instanceof Error ? error.message:'Tool failed'};}
      await database.pool.query('INSERT INTO tool_traces(id,run_id,step,tool,inputs,outputs,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id('TRACE'),runId,++step,name,JSON.stringify(args),JSON.stringify(output),Math.round(performance.now()-started)]);
      return {content:[{type:'text' as const,text:JSON.stringify(output)}],isError:Boolean(output.error)};
    });
  }
  const client=new Client({name:'afyaflow-agent',version:'0.1.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  return {server,client,attempt:run.attempts,generation:run.delivery_generation,isSaved:()=>saved,isSufficient:()=>Boolean(scoring?.isSufficientEvidence),
    close:async () => {await client.close();await server.close();}};
}
