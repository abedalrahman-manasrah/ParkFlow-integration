import { db,type Tx } from '../../database/client';
import { event } from '../../realtime/outbox';
import { requireValue } from '../../utils/errors';
export async function notify(tx:Tx,userId:string,type:string,title:string,titleAr:string,body:string,bodyAr:string,href?:string,dedupKey?:string){
 const data={userId,type,title,titleAr,body,bodyAr,href,dedupKey};
 if(dedupKey&&await tx.notification.findUnique({where:{dedupKey}}))return;
 const n=await tx.notification.create({data});await event(tx,'notification.created',n,userId);return n;
}
export async function list(userId:string){return db.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},take:200});}
export async function unread(userId:string){return db.notification.count({where:{userId,readAt:null}});}
export async function read(userId:string,id?:string){const result=await db.notification.updateMany({where:{userId,...(id?{id}:{}),readAt:null},data:{readAt:new Date()}});return {count:result.count};}
export async function register(userId:string,input:{token:string;platform:string;provider:string}){await db.deviceToken.upsert({where:{token:input.token},create:{userId,...input},update:{userId,...input}});}
export async function unregister(userId:string,token:string){await db.deviceToken.deleteMany({where:{userId,token}});}
