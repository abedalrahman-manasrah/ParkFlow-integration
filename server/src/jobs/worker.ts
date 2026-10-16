import { createServer } from 'node:http';
import { db } from '../database/client';
import { redis } from '../database/redis';
import { attachSockets } from '../realtime/socket';
import { maintenanceQueue,outboxQueue,dispatchQueue,financialQueue,pushQueue } from './queues';
import { createWorkers } from './runtime';
import { logger } from '../config/logger';

// This Socket.IO instance publishes through Redis to API instances; it does not listen publicly.
const sockets=attachSockets(createServer());
const publish=(topic:string,payload:unknown,userId:string|null)=>{sockets.io.to(userId?'user:'+userId:'community').emit(topic,payload);};
const workers=createWorkers(publish);
for(const worker of workers)worker.on('failed',(job,err)=>logger.error({jobId:job?.id,err},'Job failed'));
async function main(){
 await db.$connect();
 await maintenanceQueue.removeJobScheduler('outbox');
 await outboxQueue.upsertJobScheduler('outbox',{every:1000},{name:'outbox'});
 await maintenanceQueue.upsertJobScheduler('maintenance',{every:30000},{name:'maintenance',opts:{attempts:5,backoff:{type:'exponential',delay:5000}}});
 await dispatchQueue.upsertJobScheduler('financial',{every:30000},{name:'financial'});
 await dispatchQueue.upsertJobScheduler('reconcile-push',{every:30000},{name:'reconcile-push'});
 logger.info('Worker ready');
}
void main().catch(error=>{logger.fatal(error);process.exit(1);});
async function close(){
 await Promise.all(workers.map(worker=>worker.close()));
 await Promise.all([maintenanceQueue,outboxQueue,dispatchQueue,financialQueue,pushQueue].map(queue=>queue.close()));
 await sockets.close();await db.$disconnect();await redis.quit();
}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
