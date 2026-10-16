import { Worker } from 'bullmq';
import { createServer } from 'node:http';
import { db,atomic } from '../database/client';
import { redis,redisConnection } from '../database/redis';
import { attachSockets } from '../realtime/socket';
import { maintenanceQueue,pushQueue } from './queues';
import { expireSessions } from '../modules/sessions/service';
import { checkOverstays } from '../modules/gates/service';
import { verifyPoints } from '../modules/roads/service';
import { processWebhooks,topup } from '../modules/wallet/service';
import { recalculate } from '../modules/trust/service';
import { notify } from '../modules/notifications/service';
import { deliverPush } from '../providers/push';
import { logger } from '../config/logger';
// This Socket.IO instance publishes through Redis to API instances; it does not listen publicly.
const sockets=attachSockets(createServer());
export async function drainOutbox(){const events=await db.outboxEvent.findMany({where:{deliveredAt:null},orderBy:{createdAt:'asc'},take:200});for(const e of events){
 sockets.io.to(e.userId?`user:${e.userId}`:'community').emit(e.topic,e.payload);
 if(e.topic==='notification.created')await pushQueue.add('deliver',{notificationId:(e.payload as {id:string}).id},{jobId:e.id});
 await db.outboxEvent.update({where:{id:e.id},data:{deliveredAt:new Date()}});
}}
async function maintenance(){await expireSessions();await checkOverstays();await verifyPoints();await processWebhooks();
 const pending=await db.payment.findMany({where:{status:'pending'},include:{method:true},take:50});for(const p of pending){try{await topup(p.method.userId,{amount:p.amount,paymentMethodId:p.paymentMethodId},p.idempotencyKey.slice(p.method.userId.length+1));}catch(e){logger.warn({paymentId:p.id},'Payment is not yet settled');}}
 const wallets=await db.wallet.findMany({where:{autoTopUpEnabled:true},take:500});for(const w of wallets){if(w.balance>=w.autoTopUpThreshold||!w.defaultPaymentMethodId)continue;try{await topup(w.userId,{amount:w.autoTopUpAmount,paymentMethodId:w.defaultPaymentMethodId},`auto-${w.id}-${w.updatedAt.getTime()}`);}catch{await atomic(tx=>notify(tx,w.userId,'payment_failed','Automatic top-up failed','فشل الشحن التلقائي','Check your payment method.','تحقق من طريقة الدفع.','/wallet',`auto-failed:${w.id}:${w.updatedAt.getTime()}`));}}
 const expired=await db.permit.updateMany({where:{status:'active',validTo:{lt:new Date()}},data:{status:'expired'}});
 await db.violation.updateMany({where:{status:'unpaid',dueAt:{lt:new Date()}},data:{status:'overdue'}});
 const users=await db.user.findMany({take:500,orderBy:{updatedAt:'desc'},select:{id:true}});for(const u of users)await recalculate(u.id);
 await db.refreshToken.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-2592000000)}}});
}
const workers=[new Worker('parkflow-maintenance',async job=>{if(job.name==='outbox')await drainOutbox();else await maintenance();},{connection:redisConnection(),concurrency:1}),new Worker('parkflow-push',job=>deliverPush(job.data.notificationId),{connection:redisConnection(),concurrency:5})];
for(const w of workers)w.on('failed',(job,err)=>logger.error({jobId:job?.id,err},'Job failed'));
async function main(){await db.$connect();await maintenanceQueue.upsertJobScheduler('outbox',{every:1000},{name:'outbox'});await maintenanceQueue.upsertJobScheduler('maintenance',{every:30000},{name:'maintenance',opts:{attempts:5,backoff:{type:'exponential',delay:5000}}});logger.info('Worker ready');}
void main().catch(e=>{logger.fatal(e);process.exit(1);});
async function close(){await Promise.all(workers.map(w=>w.close()));await maintenanceQueue.close();await pushQueue.close();await sockets.close();await db.$disconnect();await redis.quit();}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
