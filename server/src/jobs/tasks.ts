import { createHash } from 'node:crypto';
import { atomic,db } from '../database/client';
import { redis } from '../database/redis';
import { financialQueue,pushQueue } from './queues';
import { expireSessions } from '../modules/sessions/service';
import { checkOverstays } from '../modules/gates/service';
import { verifyPoints } from '../modules/roads/service';
import { prepareAutomaticTopup,processPayment,processWebhook } from '../modules/wallet/service';
import { recalculate } from '../modules/trust/service';
import { notify } from '../modules/notifications/service';
import { expireInventoryHolds } from '../modules/reservations/service';
import { ApiError } from '../utils/errors';
import { PUSH_LIFETIME_MS } from '../providers/push';

const pageSize=100,failedRedriveDelay=5*60_000;
export type Publish=(topic:string,payload:unknown,userId:string|null)=>void|Promise<void>;
type FinancialData={paymentId?:string;webhookId?:string;walletId?:string;version?:string};

export async function drainOutbox(publish:Publish){
 const events=await db.outboxEvent.findMany({where:{deliveredAt:null},orderBy:[{createdAt:'asc'},{id:'asc'}],take:200});
 for(const e of events){
  await publish(e.topic,e.payload,e.userId);
  if(e.topic==='notification.created')await pushQueue.add('deliver',{notificationId:(e.payload as {id:string}).id},{jobId:e.id});
  await db.outboxEvent.update({where:{id:e.id},data:{deliveredAt:new Date()}});
 }
}

// No external provider calls are made by maintenance or by dispatch scans.
export async function maintenance(){
 await expireSessions();await expireInventoryHolds();await checkOverstays();await verifyPoints();
 await db.permit.updateMany({where:{status:'active',validTo:{lt:new Date()}},data:{status:'expired'}});
 await db.violation.updateMany({where:{status:'unpaid',dueAt:{lt:new Date()}},data:{status:'overdue'}});
 const users=await db.user.findMany({take:500,orderBy:{updatedAt:'desc'},select:{id:true}});
 for(const user of users)await recalculate(user.id);
 await db.refreshToken.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-2592000000)}}});
}

// Persist a cyclic keyset position only after this page has been enqueued.
// Range predicates still work when an earlier cursor row has been deleted.
async function scan<T extends {id:string}>(name:string,read:(after:string)=>Promise<T[]>,consume:(row:T)=>Promise<void>){
 const key='jobs:scan:'+name,after=await redis.get(key)??'';
 let rows=await read(after);
 if(!rows.length&&after)rows=await read('');
 for(const row of rows)await consume(row);
 await redis.set(key,rows.length===pageSize?rows.at(-1)!.id:'');
}
async function enqueueFinancial(name:string,data:FinancialData,jobId:string){
 const existing=await financialQueue.getJob(jobId);
 let delay=0;
 if(existing){
  const state=await existing.getState();
  if(state!=='completed'&&state!=='failed')return;
  if(state==='failed')delay=Math.max(0,failedRedriveDelay-(Date.now()-(existing.finishedOn??Date.now())));
  await existing.remove();
 }
 await financialQueue.add(name,data,{jobId,delay});
}
export async function dispatchFinancialJobs(){
 await Promise.all([
  scan('pending-payments',after=>db.payment.findMany({where:{status:'pending',...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:pageSize,select:{id:true}}),payment=>enqueueFinancial('payment',{paymentId:payment.id},'payment-'+payment.id)),
  scan('payment-webhooks',after=>db.paymentWebhook.findMany({where:{processedAt:null,...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:pageSize,select:{id:true}}),webhook=>enqueueFinancial('webhook',{webhookId:webhook.id},'webhook-'+createHash('sha256').update(webhook.id).digest('hex'))),
  scan('automatic-wallets',after=>db.wallet.findMany({where:{autoTopUpEnabled:true,balance:{lt:db.wallet.fields.autoTopUpThreshold},defaultMethod:{is:{deletedAt:null}},user:{status:'ACTIVE'},...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:pageSize,select:{id:true,updatedAt:true}}),wallet=>enqueueFinancial('auto-topup',{walletId:wallet.id,version:wallet.updatedAt.toISOString()},'auto-'+wallet.id+'-'+wallet.updatedAt.getTime())),
 ]);
}
async function automaticFailure(paymentId:string){
 const payment=await db.payment.findUnique({where:{id:paymentId},include:{method:true}});
 if(!payment)return;
 const wallet=await db.wallet.findUnique({where:{userId:payment.method.userId},select:{id:true}});
 if(!wallet)return;
 const prefix=payment.method.userId+':auto-'+wallet.id+'-';
 if(!payment.idempotencyKey.startsWith(prefix))return;
 const version=payment.idempotencyKey.slice(prefix.length);
 await atomic(tx=>notify(tx,payment.method.userId,'payment_failed','Automatic top-up failed','فشل الشحن التلقائي','Check your payment method.','تحقق من طريقة الدفع.','/wallet','auto-failed:'+wallet.id+':'+version));
}
export async function processFinancialJob(name:string,data:FinancialData){
 if(name==='auto-topup'&&data.walletId&&data.version){
  const paymentId=await prepareAutomaticTopup(data.walletId,data.version);
  if(paymentId)await enqueueFinancial('payment',{paymentId},'payment-'+paymentId);
  return;
 }
 if(name==='webhook'&&data.webhookId)return processWebhook(data.webhookId);
 if(name==='payment'&&data.paymentId){
  try{await processPayment(data.paymentId);}catch(error){if(error instanceof ApiError&&error.code==='AUTOMATIC_TOPUP_CANCELLED')return;await automaticFailure(data.paymentId);throw error;}
  return;
 }
 throw new Error('Unknown financial job');
}

export async function reconcilePush(){
 await scan('pending-push',after=>db.notification.findMany({where:{pushedAt:null,...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:pageSize,select:{id:true,createdAt:true}}),async notification=>{
  if(notification.createdAt.getTime()<Date.now()-PUSH_LIFETIME_MS){
   // Complete the push attempt only; the in-app notification remains intact.
   await db.notification.updateMany({where:{id:notification.id,pushedAt:null},data:{pushedAt:new Date()}});
   return;
  }
  // Retain legacy outbox IDs so an upgrade cannot enqueue a parallel copy of
  // an already waiting, active, or delayed push job under a new identifier.
  const origin=await db.outboxEvent.findFirst({where:{topic:'notification.created',payload:{path:['id'],equals:notification.id}},orderBy:{createdAt:'asc'},select:{id:true}});
  const jobId=origin?.id??'push-'+notification.id;
  const existing=await pushQueue.getJob(jobId);
  let delay=0;
  if(existing){
   const state=await existing.getState();
   if(state!=='failed'&&state!=='completed')return;
   if(state==='failed')delay=Math.max(0,failedRedriveDelay-(Date.now()-(existing.finishedOn??Date.now())));
   await existing.remove();
  }
  await pushQueue.add('deliver',{notificationId:notification.id},{jobId,delay});
 });
}
