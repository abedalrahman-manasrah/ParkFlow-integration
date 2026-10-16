import { Queue } from 'bullmq';
import { redisConnection } from '../database/redis';
const history={removeOnComplete:1000,removeOnFail:1000};
export const maintenanceQueue=new Queue('parkflow-maintenance',{connection:redisConnection(),defaultJobOptions:history});
export const outboxQueue=new Queue('parkflow-outbox',{connection:redisConnection(),defaultJobOptions:{...history,attempts:5,backoff:{type:'exponential',delay:1000}}});
export const dispatchQueue=new Queue('parkflow-dispatch',{connection:redisConnection(),defaultJobOptions:{...history,attempts:5,backoff:{type:'exponential',delay:5000}}});
export const financialQueue=new Queue('parkflow-financial',{connection:redisConnection(),defaultJobOptions:{...history,attempts:5,backoff:{type:'exponential',delay:5000}}});
// Keep every recent failed push for at least the redrive cooldown. A count cap
// could evict a recent failure and erase its finishedOn cooldown evidence.
// Older jobs retain their original options until their next redrive.
export const pushQueue=new Queue('parkflow-push',{connection:redisConnection(),defaultJobOptions:{...history,removeOnFail:{age:300},attempts:8,backoff:{type:'exponential',delay:5000}}});
