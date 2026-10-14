import 'reflect-metadata';
import { configure } from '@codegenie/serverless-express';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { initializeLambda } from './bootstrap.js';

export const configureApi=(app:any)=>configure({app,respondWithErrors:false,
  log:{debug:()=>{},verbose:()=>{},info:()=>{},warn:()=>{},error:()=>console.error('API adapter operation failed.')}});
let adapter:Promise<ReturnType<typeof configureApi>>|undefined;
export async function handler(event:APIGatewayProxyEventV2,context:Context) {
  context.callbackWaitsForEmptyEventLoop=false;
  if(!adapter) adapter=(async()=>{
    await initializeLambda();
    const {createApp}=await import('../main.js');
    const app=await createApp();
    await app.init();
    return configureApi(app.getHttpAdapter().getInstance());
  })().catch(error=>{adapter=undefined;throw error;});
  return (await adapter)(event,context,()=>{});
}
