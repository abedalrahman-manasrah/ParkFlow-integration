import type * as admin from './modules/admin/service';
import { Router,type Request,type RequestHandler } from 'express';
import { z } from 'zod';
import type { Role } from '@prisma/client';
import { auth,roles } from './middleware/auth';
import { assert } from './utils/errors';
export const api=Router();
export const paths:Record<string,Record<string,unknown>>={};
export const empty=z.object({}).strict();
export const id=z.string().min(1).max(200),text=z.string().trim().min(1).max(200),money=z.number().int().min(0).max(10000000);
export const geo=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict();
export const limit=z.coerce.number().int().min(1).max(200).optional();
export const admins:Role[]=['ADMIN'],operators:Role[]=['ADMIN','PARKING_OPERATOR'],officers:Role[]=['ADMIN','ENFORCEMENT_OFFICER'];
export const user=(r:Request)=>r.auth!.userId,param=(r:Request,name='id')=>String(r.params[name]);
export const actor=(r:Request):admin.Actor=>({...r.auth!,ip:r.ip,userAgent:r.get('user-agent')?.slice(0,500)});
export const key=(r:Request)=>r.get('Idempotency-Key')??'';
export function route<T extends z.ZodType>(method:'get'|'post'|'patch'|'delete',path:string,schema:T,handler:(r:Request,input:z.output<T>)=>Promise<unknown>,permissions:Role[]|false=[]){
 const validate:RequestHandler=async(req,res,next)=>{try{const input=schema.parse(method==='get'?req.query:(req.body??{}));const result=await handler(req,input);res.json(result??{ok:true});}catch(e){next(e);}};
 api[method](path,...(permissions===false?[]:[auth,...(permissions.length?[roles(permissions)]:[])]),validate);
 const docPath='/api/v1'+path.replace(/:([A-Za-z]+)/g,'{$1}');
 const params=[...path.matchAll(/:([A-Za-z]+)/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string'}}));
 let body:unknown;try{body=z.toJSONSchema(schema,{unrepresentable:'any',io:'input'});}catch{body={type:'object'};}
 const shape=body as {properties?:Record<string,unknown>;required?:string[]};
 paths[docPath]??={};paths[docPath]![method]={tags:[path.split('/')[1]],summary:method.toUpperCase()+' '+path,security:permissions===false?[]:[{bearerAuth:[]}],parameters:method==='get'?[...params,...Object.entries(shape.properties??{}).map(([name,schema])=>({name,in:'query',required:shape.required?.includes(name)??false,schema}))]:[...params,{in:'header',name:'Idempotency-Key',schema:{type:'string'},description:'Required for financial and session mutations; replay the same key for retries.'}],...(method==='get'?{}:{requestBody:{required:true,content:{'application/json':{schema:body}}}}),responses:{'200':{description:'Successful response in the existing ParkFlow domain DTO shape',content:{'application/json':{schema:{type:['object','array','integer','null']}}}},'400':{$ref:'#/components/responses/Error'},'401':{$ref:'#/components/responses/Error'},'403':{$ref:'#/components/responses/Error'},'409':{$ref:'#/components/responses/Error'},'429':{$ref:'#/components/responses/Error'}}};
}