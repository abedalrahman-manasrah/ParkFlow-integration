import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { db } from './database/client';
import { redis } from './database/redis';
import { attachSockets } from './realtime/socket';
import { ensureBucket } from './providers/storage';
const server=createServer(createApp());const sockets=attachSockets(server);
async function main(){if(env.NODE_ENV==='production'&&env.PAYMENT_PROVIDER==='development')logger.warn('Simulated payments are enabled: no real gateway is called and no card is charged');await db.$connect();await redis.ping();await ensureBucket();server.listen(env.PORT,'0.0.0.0',()=>logger.info({port:env.PORT},'ParkFlow API ready'));}
async function close(){await sockets.close();server.close();await db.$disconnect();await redis.quit();}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());void main().catch(err=>{logger.fatal({err},'Startup failed');process.exit(1);});
