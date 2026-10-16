import { Queue } from 'bullmq';
import { redisConnection } from '../database/redis';
export const maintenanceQueue=new Queue('parkflow-maintenance',{connection:redisConnection()});
export const pushQueue=new Queue('parkflow-push',{connection:redisConnection(),defaultJobOptions:{attempts:8,backoff:{type:'exponential',delay:5000},removeOnComplete:1000,removeOnFail:1000}});
