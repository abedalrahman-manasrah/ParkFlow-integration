import { createHash } from 'node:crypto';
import { atomic,json,lock,type Tx } from '../database/client';
import { assert } from './errors';
export async function idempotent<T>(userId:string,scope:string,key:string,input:unknown,fn:(tx:Tx)=>Promise<T>):Promise<T>{
 assert(key && key.length<=200,'IDEMPOTENCY_REQUIRED','Provide an Idempotency-Key header');
 const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 return atomic(async tx=>{
 await lock(tx,`idempotency:${userId}:${scope}:${key}`);
 const old=await tx.idempotencyRecord.findUnique({where:{userId_scope_key:{userId,scope,key}}});
 if(old){assert(old.requestHash===requestHash,'IDEMPOTENCY_CONFLICT','Key was already used with different input',409);return old.response as T;}
 const result=await fn(tx);
 await tx.idempotencyRecord.create({data:{userId,scope,key,requestHash,response:json(result)}});return result;
 });
}
