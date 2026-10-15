import { BedrockRuntimeClient, ConverseCommand, Message, Tool } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../../src/backend/src/config.js';
import { instructions, type Model } from './model.js';
export type { Model, ModelReply } from './model.js';
export function bedrockModel(modelId=config.bedrockModel):Model {
  const client=new BedrockRuntimeClient({region:config.region,maxAttempts:2});
  return async (messages,tools,signal) => {
    const response=await client.send(new ConverseCommand({modelId,messages,
      system:[{text:instructions}],
      toolConfig:{tools},inferenceConfig:{maxTokens:700,temperature:0}}),{abortSignal:signal});
    return {content:response.output?.message?.content || [],usage:response.usage};
  };
}
