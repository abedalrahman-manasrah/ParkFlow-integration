import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import swaggerUi from 'swagger-ui-express';
import { env,origins } from './config/env';
import { logger } from './config/logger';
import { db } from './database/client';
import { redis } from './database/redis';
import { api,paths } from './api';
import { errors } from './middleware/errors';
import { ApiError } from './utils/errors';
import { webhook } from './modules/wallet/service';
export function createApp(){const app=express();app.disable('x-powered-by');if(env.TRUST_PROXY!==undefined)app.set('trust proxy',env.TRUST_PROXY);
 app.use(helmet());app.use(cors({origin:(origin,cb)=>{if(!origin||origins.includes(origin))cb(null,true);else cb(new ApiError(403,'CORS_FORBIDDEN','Origin is not allowed'));},credentials:true,allowedHeaders:['Content-Type','Authorization','Idempotency-Key','X-Request-Id','X-ParkFlow-App','X-ParkFlow-Session','X-ParkFlow-Login','X-ParkFlow-CSRF']}));
 app.use(pinoHttp({logger,genReqId:()=>randomUUID(),customProps:req=>({requestId:req.id}),autoLogging:env.NODE_ENV!=='test'}));
 app.use((req,res,next)=>{res.setHeader('X-Request-Id',String(req.id));res.setHeader('Cache-Control','no-store');next();});
 app.get('/health',(_req,res)=>res.json({status:'ok'}));app.get('/ready',async(_req,res)=>{try{await db.$queryRaw`SELECT 1`;await redis.ping();res.json({status:'ready'});}catch{res.status(503).json({status:'unavailable'});}});
 const limiter=(prefix:string,limit:number,windowMs:number)=>rateLimit({windowMs,limit,standardHeaders:'draft-8',legacyHeaders:false,store:new RedisStore({prefix,sendCommand:(...args:string[])=>redis.call(...args as [string,...string[]]) as Promise<never>}),handler:(_req,res)=>{const retryAfterSeconds=Math.max(1,Number(res.getHeader('Retry-After'))||Math.ceil(windowMs/1000));res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests. Try again later.',details:{retryAfterSeconds}}});}});
 app.use('/api/v1',limiter('rate:api:',300,60000));
 app.use('/api/v1/vehicle-warnings/check',limiter('rate:vehicle-warnings:',6,60000));
 if(!(env.NODE_ENV==='development'&&env.DEV_SKIP_EMAIL_OTP)) app.use('/api/v1/auth/request-otp',limiter('rate:otp:',10,600000));
 app.use('/api/v1/auth/verify-otp',limiter('rate:verify:',30,600000));
 app.use('/api/v1/auth/phone/request-otp',limiter('rate:phone-request:',10,600000));
 app.use('/api/v1/auth/phone/verify-otp',limiter('rate:phone-verify:',30,600000));
 app.use('/api/v1/auth/dev-login',limiter('rate:dev-login:',30,600000));
 app.use('/api/v1/auth/phone/dev-login',limiter('rate:phone-dev-login:',30,600000));
 app.post('/api/v1/webhooks/payments/:provider',express.raw({type:'application/json',limit:'64kb'}),async(req,res,next)=>{try{res.json(await webhook(String(req.params.provider),req.body,req.get('X-Payment-Signature')??''));}catch(e){next(e);}});
 app.use(express.json({limit:'128kb'}));app.use('/api/v1',api);
 if(env.NODE_ENV!=='production'){
 const doc={...{"openapi": "3.1.0", "info": {"title": "ParkFlow API", "version": "1.0.0"}, "components": {"securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}}, "responses": {"Error": {"description": "Request failed", "content": {"application/json": {"schema": {"type": "object", "properties": {"error": {"type": "object", "properties": {"code": {"type": "string"}, "message": {"type": "string"}, "details": {"type": "object"}}}}}}}}}}},paths};
 app.get('/api/openapi.json',(_r,res)=>res.json(doc));app.use('/api/docs',swaggerUi.serve,swaggerUi.setup(doc));
 }
 app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND','Endpoint not found')));app.use(errors);return app;
}
