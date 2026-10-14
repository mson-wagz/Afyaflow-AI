import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';
import { AppModule } from './app.module.js';
import { config } from './config.js';
import type { Request, Response, NextFunction } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export async function createApp() {
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{logger:process.env.NODE_ENV==='test'?false:['error','warn','log']});
  app.enableShutdownHooks();
  const attempts=new Map<string,{count:number;expires:number}>();
  app.use((req:Request,res:Response,next:NextFunction) => {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin && !config.origins.includes(req.headers.origin))
      return res.status(403).json({code:'INVALID_ORIGIN',message:'Request origin is not allowed.'});
    if (req.path==='/api/auth/login' || req.path==='/api/auth/unlock') {
      const key=req.socket.remoteAddress || 'local';const now=Date.now();
      for (const [ip,value] of attempts) if (value.expires<now) attempts.delete(ip);
      const value=attempts.get(key) || {count:0,expires:now+60000};
      attempts.set(key,value);
      if (++value.count>20) return res.status(429).json({code:'RATE_LIMITED',message:'Too many sign-in attempts. Try again in a minute.'});
    }
    next();
  });
  app.useGlobalFilters({catch(error:any,host:any) {
    const response=host.switchToHttp().getResponse() as Response;
    if (error instanceof HttpException) {
      const details=error.getResponse();response.status(error.getStatus()).json(typeof details==='string'?{message:details}:details);
    } else if(error instanceof ZodError) response.status(400).json({code:'VALIDATION_ERROR',message:'Invalid input.'});
    else {console.error('Backend operation failed:',error instanceof Error?error.message:'Unknown error');response.status(500).json({code:'INTERNAL_ERROR',message:'Operation failed; no confirmation was issued.'});}
  }});
  if (existsSync(resolve('src/frontend/dist/index.html'))) app.useStaticAssets(resolve('src/frontend/dist'));
  return app;
}
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  const app=await createApp();await app.listen(config.port,config.host);
  console.log(`AfyaFlow backend listening on http://${config.host}:${config.port}`);
}
