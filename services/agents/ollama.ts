import { randomUUID } from 'node:crypto';
import { config } from '../../src/backend/src/config.js';
import { instructions, type Model } from './model.js';

// Native Ollama tool calling; no remote fallback, API key or transcript storage.
export function ollamaModel(modelId=config.ollamaModel,transport:typeof fetch=fetch):Model {
  const calls=new Map<string,string>();
  const model:Model=async(messages,tools,signal)=>{
    const input:any[]=[{role:'system',content:instructions}];
    for(const message of messages) {
      if(message.role==='assistant') {
        const content=(message.content || []).filter(p=>p.text).map(p=>p.text).join('\n');
        const tool_calls=(message.content || []).filter(p=>p.toolUse).map(p=>({type:'function',function:{name:p.toolUse!.name,arguments:p.toolUse!.input}}));
        input.push({role:'assistant',content,...(tool_calls.length?{tool_calls}:{})});
      } else for(const part of message.content || []) {
        if(part.text)input.push({role:'user',content:part.text});
        else if(part.toolResult) {
          const name=calls.get(part.toolResult.toolUseId!);
          if(!name)throw new Error('Local model received an unmatched tool result.');
          input.push({role:'tool',tool_name:name,content:(part.toolResult.content || []).map(p=>p.text || '').join('\n')});
        }
      }
    }
    const definitions=tools.map(tool=>{
      if(!tool.toolSpec)throw new Error('Unsupported local model tool definition.');
      return {type:'function',function:{name:tool.toolSpec.name,description:tool.toolSpec.description,parameters:tool.toolSpec.inputSchema?.json}};
    });
    const response=await transport(`${config.ollamaUrl}/api/chat`,{method:'POST',signal,redirect:'error',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({model:modelId,messages:input,tools:definitions,
        stream:false,think:false,options:{temperature:0,num_ctx:8192,num_predict:1200}})});
    if(!response.ok)throw new Error(`Local model request failed (HTTP ${response.status}).`);
    const result=await response.json() as any;
    if(result.done!==true || result.done_reason==='length' || result.message?.role!=='assistant')throw new Error('Local model response did not complete.');
    const content:any[]=[];
    if(result.message.content)content.push({text:result.message.content});
    for(const call of result.message.tool_calls || []) {
      const name=call.function?.name,args=call.function?.arguments;
      if(!definitions.some(d=>d.function.name===name) || !args || typeof args!=='object' || Array.isArray(args))
        throw new Error('Local model returned an invalid tool call.');
      const toolUseId=randomUUID();calls.set(toolUseId,name);
      content.push({toolUse:{toolUseId,name,input:args}});
    }
    if(!content.length)throw new Error('Local model returned no usable output.');
    return {content,usage:{inputTokens:result.prompt_eval_count,outputTokens:result.eval_count,totalDurationNs:result.total_duration}};
  };
  model.traceTool='ollama_chat';return model;
}
