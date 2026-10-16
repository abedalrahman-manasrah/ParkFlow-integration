import { Worker } from 'bullmq';
import { redisConnection } from '../database/redis';
import { drainOutbox,maintenance,dispatchFinancialJobs,processFinancialJob,reconcilePush,type Publish } from './tasks';
import { deliverPush } from '../providers/push';

export function createWorkers(publish:Publish){
 return [
  // Consume queued legacy outbox jobs while the old scheduler is retired.
  new Worker('parkflow-maintenance',async job=>{if(job.name==='outbox')await drainOutbox(publish);else await maintenance();},{connection:redisConnection(),concurrency:1}),
  new Worker('parkflow-outbox',()=>drainOutbox(publish),{connection:redisConnection(),concurrency:1}),
  new Worker('parkflow-dispatch',async job=>{if(job.name==='financial')await dispatchFinancialJobs();else if(job.name==='reconcile-push')await reconcilePush();else throw new Error('Unknown dispatch job');},{connection:redisConnection(),concurrency:1}),
  new Worker('parkflow-financial',job=>processFinancialJob(job.name,job.data),{connection:redisConnection(),concurrency:5}),
  new Worker('parkflow-push',job=>deliverPush(job.data.notificationId),{connection:redisConnection(),concurrency:5}),
 ];
}
