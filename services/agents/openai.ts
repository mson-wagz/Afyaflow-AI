import { readFileSync } from 'node:fs';
import { config } from '../../src/backend/src/config.js';
import { instructions, type Model } from './model.js';

// One instance per run: stateless Responses requests retain tool and reasoning items
// locally, without storing a conversation at the provider.
export function openaiModel(modelId=config.openaiModel,options:{apiKey?:string;fetch?:typeof fetch}={}):Model {
  const apiKey=options.apiKey || process.env.OPENAI_API_KEY ||
    (process.env.OPENAI_API_KEY_FILE ? readFileSync(process.env.OPENAI_API_KEY_FILE,'utf8').trim() : '');
  if(!apiKey)throw new Error('OpenAI credentials are not configured.');
  const transport=options.fetch || fetch;
  let history:any[]=[],consumed=0;
  const model:Model=async(messages,tools,signal)=>{
    const input=[...history];
    for(const message of messages.slice(consumed)) {
      if(message.role==='assistant')continue; // Raw response items are already in history.
      for(const block of message.content || []) {
        if(block.text)input.push({role:'user',content:block.text});
        else if(block.toolResult)input.push({type:'function_call_output',call_id:block.toolResult.toolUseId,
          output:(block.toolResult.content || []).map(part=>part.text || '').join('\n')});
      }
    }
    const definitions=tools.map(tool=>{
      if(!tool.toolSpec)throw new Error('Unsupported model tool definition.');
      const parameters={...(tool.toolSpec.inputSchema?.json as any)};
      delete parameters.$schema;
      return {type:'function',name:tool.toolSpec.name,description:tool.toolSpec.description,parameters,strict:true};
    });
    const response=await transport('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal,
      body:JSON.stringify({model:modelId,instructions,input,tools:definitions,parallel_tool_calls:false,
        max_output_tokens:1200,store:false,include:['reasoning.encrypted_content']}),
    });
    // Provider error bodies can contain sensitive inputs. Do not propagate them.
    if(!response.ok)throw new Error(`OpenAI request failed (HTTP ${response.status}).`);
    const result=await response.json() as any;
    if(result.status!=='completed' || !Array.isArray(result.output))throw new Error('OpenAI response did not complete.');
    const content:any[]=[],ids=new Set<string>();
    for(const item of result.output) {
      if(item.type==='function_call') {
        if(!definitions.some(tool=>tool.name===item.name) || typeof item.call_id!=='string' || !item.call_id || ids.has(item.call_id))
          throw new Error('OpenAI returned an invalid tool call.');
        let args:any;
        try {args=JSON.parse(item.arguments);} catch {throw new Error('OpenAI returned invalid tool arguments.');}
        if(!args || typeof args!=='object' || Array.isArray(args))throw new Error('OpenAI returned invalid tool arguments.');
        ids.add(item.call_id);content.push({toolUse:{toolUseId:item.call_id,name:item.name,input:args}});
      } else if(item.type==='message')for(const part of item.content || []) {
        if(part.type==='refusal')throw new Error('OpenAI declined the assessment. Staff review required.');
        if(part.type==='output_text')content.push({text:part.text});
      }
    }
    if(!content.length)throw new Error('OpenAI returned no usable output.');
    history=[...input,...result.output];consumed=messages.length;
    return {content,usage:result.usage};
  };
  model.traceTool='openai_responses';
  return model;
}
