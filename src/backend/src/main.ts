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
import { getCurrentInvoke } from '@codegenie/serverless-express';
import { Database } from './database/db.js';
import { allowAuthAttempt } from './auth/rate-limit.js';
import { trustedCloudFrontSource } from './auth/ingress.js';

export async function createApp() {
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{logger:process.env.NODE_ENV==='test'?false:['error','warn','log']});
  app.enableShutdownHooks();
  // Parse before async middleware so Lambda's synthetic request stream is consumed in time.
  app.useBodyParser('json',{limit:'100kb'});
  const database=app.get(Database);
  if(config.mode==='competition') {
    const unsafe=await database.pool.query(`SELECT EXISTS(SELECT 1 FROM visits WHERE data_source<>'synthetic')
      OR EXISTS(SELECT 1 FROM agent_runs WHERE provider<>'ollama') AS unsafe`);
    if(unsafe.rows[0].unsafe) {await app.close();throw new Error('Competition mode requires a dedicated synthetic-only database with local-model runs.');}
  }
  app.use(async (req:Request,res:Response,next:NextFunction) => {
    const viewerSource=config.cloudfrontOriginToken ? trustedCloudFrontSource(req.headers,config.cloudfrontOriginToken) : null;
    if(config.cloudfrontOriginToken && !viewerSource)
      return res.status(403).json({code:'INVALID_INGRESS',message:'Use the application website to access this service.'});
    if (['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin && !config.origins.includes(req.headers.origin))
      return res.status(403).json({code:'INVALID_ORIGIN',message:'Request origin is not allowed.'});
    if (req.path==='/api/auth/login' || req.path==='/api/auth/unlock') {
      // API Gateway's invocation context is authoritative; client forwarding headers are not.
      const event=process.env.AWS_LAMBDA_FUNCTION_NAME ? getCurrentInvoke().event : undefined;
      const key=viewerSource || event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp || req.socket.remoteAddress || 'local';
      try {
        if (!await allowAuthAttempt(database,key)) return res.status(429).json({code:'RATE_LIMITED',message:'Too many sign-in attempts. Try again in a minute.'});
      } catch {return res.status(503).json({code:'AUTH_UNAVAILABLE',message:'Sign-in is temporarily unavailable. Please try again.'});}
    }
    next();
  });
  app.useGlobalFilters({catch(error:any,host:any) {
    const response=host.switchToHttp().getResponse() as Response;
    if (error instanceof HttpException) {
      const details=error.getResponse();response.status(error.getStatus()).json(typeof details==='string'?{message:details}:details);
    } else if(error instanceof ZodError) response.status(400).json({code:'VALIDATION_ERROR',message:'Invalid input.'});
    else {console.error('Backend operation failed.');response.status(500).json({code:'INTERNAL_ERROR',message:'Operation failed; no confirmation was issued.'});}
  }});
  if (existsSync(resolve('src/frontend/dist/index.html'))) app.useStaticAssets(resolve('src/frontend/dist'));
  return app;
}
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  const app=await createApp();await app.listen(config.port,config.host);
  console.log(`AfyaFlow backend listening on http://${config.host}:${config.port}`);
}
