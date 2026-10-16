import Redis from 'ioredis';
import { env } from '../config/env';
export const redis = new Redis(env.REDIS_URL,{maxRetriesPerRequest:null});
export const redisConnection = () => {const u=new URL(env.REDIS_URL);return {host:u.hostname,port:Number(u.port||6379),username:u.username||undefined,password:u.password||undefined,db:Number(u.pathname.slice(1)||0),...(u.protocol==='rediss:'?{tls:{}}:{})};};
