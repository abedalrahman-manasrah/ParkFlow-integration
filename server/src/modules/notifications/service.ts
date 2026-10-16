import { atomic,db,lock,type Tx } from '../../database/client';
import { digest,liveSessionFamily,lockSessionFamily } from '../auth/service';
import { event } from '../../realtime/outbox';
import { assert } from '../../utils/errors';
export async function notify(tx:Tx,userId:string,type:string,title:string,titleAr:string,body:string,bodyAr:string,href?:string,dedupKey?:string){
 const data={userId,type,title,titleAr,body,bodyAr,href,dedupKey};
 if(dedupKey&&await tx.notification.findUnique({where:{dedupKey}}))return;
 const n=await tx.notification.create({data});await event(tx,'notification.created',n,userId);return n;
}
export async function list(userId:string){return db.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},take:200});}
export async function unread(userId:string){return db.notification.count({where:{userId,readAt:null}});}
export async function read(userId:string,id?:string){const result=await db.notification.updateMany({where:{userId,...(id?{id}:{}),readAt:null},data:{readAt:new Date()}});return {count:result.count};}
// Token locks precede user/family locks for every device mutation and dispatch.
// Logout takes only user/family locks, so it cannot invert this order.
export async function lockDeviceToken(tx:Tx,token:string){await lock(tx,`push:token:${digest(token)}`);}
async function authenticatedFamily(tx:Tx,userId:string,sid:string){
 await lockSessionFamily(tx,userId);
 const initiating=await tx.refreshToken.findUnique({where:{id:sid}});
 assert(initiating&&initiating.userId===userId,'UNAUTHORIZED','An authenticated session is required',401);
 await lockSessionFamily(tx,userId,initiating.familyId);
 assert(await liveSessionFamily(tx,userId,initiating.familyId),'UNAUTHORIZED','Session has ended',401);
 return initiating.familyId;
}
export async function register(userId:string,sid:string,input:{token:string;platform:string;provider:string}){
 await atomic(async tx=>{
  await lockDeviceToken(tx,input.token);
  const sessionFamilyId=await authenticatedFamily(tx,userId,sid);
  await tx.deviceToken.upsert({where:{token:input.token},create:{userId,...input,sessionFamilyId},update:{userId,...input,sessionFamilyId}});
 },'ReadCommitted');
}
export async function unregister(userId:string,sid:string,token:string){
 await atomic(async tx=>{
  await lockDeviceToken(tx,token);
  const sessionFamilyId=await authenticatedFamily(tx,userId,sid);
  // A delayed request from a previous account/login cannot remove a token that
  // has since been registered by this device's current login.
  await tx.deviceToken.deleteMany({where:{userId,sessionFamilyId,token}});
 },'ReadCommitted');
}
