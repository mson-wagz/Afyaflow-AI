import { Message, Tool } from '@aws-sdk/client-bedrock-runtime';
export type ModelReply = {
    content: any[];
    usage?: unknown;
};
export type Model = (messages: Message[], tools: Tool[], signal: AbortSignal) => Promise<ModelReply>;
export declare function bedrockModel(): Model;
