import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { Message, Tool } from '@aws-sdk/client-bedrock-runtime';
import { Database, id } from '../../src/backend/src/database/db.js';
import { config } from '../../src/backend/src/config.js';
import { createRunTools } from '../mcp/tools.js';
import { bedrockModel, Model } from './bedrock.js';
import { performance } from 'node:perf_hooks';

// Persistence of the job and human-review pause belongs to PostgreSQL, not model memory.
export async function executeAgent(database:Database,runId:string,model:Model=bedrockModel()) {
  const signal=AbortSignal.timeout(config.agentTimeout);
  const tools=await createRunTools(database,runId);
  try {
    const available=(await tools.client.listTools()).tools;
    const definitions:Tool[]=available.map(tool => ({toolSpec:{name:tool.name,description:tool.description,
      inputSchema:{json:tool.inputSchema as any}}}));
    const State=Annotation.Root({messages:Annotation<Message[]>(),steps:Annotation<number>(),calls:Annotation<any[]>()});
    const graph=new StateGraph(State)
      .addNode('model',async state => {
        if (signal.aborted) throw new Error('Agent deadline exceeded.');
        const started=performance.now();
        const response=await model(state.messages,definitions,signal);
        await database.pool.query('UPDATE agent_runs SET steps=$2 WHERE id=$1 AND attempts=$3',[runId,state.steps+1,tools.attempt]);
        await database.pool.query('INSERT INTO tool_traces(id,run_id,step,tool,inputs,outputs,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [id('TRACE'),runId,1000+state.steps,'bedrock_converse',JSON.stringify({model:config.model,messageCount:state.messages.length}),JSON.stringify({content:response.content,usage:response.usage}),Math.round(performance.now()-started)]);
        return {messages:[...state.messages,{role:'assistant' as const,content:response.content}],
          steps:state.steps+1,calls:response.content.filter(block => block.toolUse).map(block => block.toolUse)};
      })
      .addNode('tools',async state => {
        if(state.calls.length>4)throw new Error('Model exceeded the per-step tool-call budget.');
        const content:any[]=[];
        for (const call of state.calls) {
          if (!available.some(tool => tool.name === call.name)) throw new Error('Model requested a tool outside the approved allowlist.');
          let result:any;
          for (let attempt=0;attempt<2;attempt++) {
            signal.throwIfAborted();
            result=await tools.client.callTool({name:call.name,arguments:call.input || {}},{signal,timeout:15000});
            if (!result.isError) break;
          }
          content.push({toolResult:{toolUseId:call.toolUseId,content:[{text:JSON.stringify(result.content)}],status:result.isError?'error':'success'}});
        }
        return {messages:[...state.messages,{role:'user' as const,content}]};
      })
      .addEdge(START,'model')
      .addConditionalEdges('model',state => {
        if (tools.isSaved()) return END;
        if (!state.calls.length) throw new Error('Model finished without saving a sourced proposal. Staff review required.');
        if (state.steps >= config.maxSteps) throw new Error('Agent tool budget exceeded. Staff review required.');
        return 'tools';
      })
      .addConditionalEdges('tools',() => tools.isSaved()?END:'model')
      .compile();
    await graph.invoke({messages:[{role:'user',content:[{text:'Assess the bound synthetic visit. Retrieve evidence, read the protocol, calculate a proposal and save it for human review.'}]}],steps:0,calls:[]},{recursionLimit:config.maxSteps*3,signal});
    if (!tools.isSaved()) throw new Error('No proposal saved.');
    await database.pool.query("UPDATE agent_runs SET status=$2,finished_at=now(),lease_until=null WHERE id=$1 AND status='RUNNING' AND attempts=$3",
      [runId,tools.isSufficient()?'WAITING_FOR_REVIEW':'REVIEW_REQUIRED',tools.attempt]);
  } finally {await tools.close();}
}
