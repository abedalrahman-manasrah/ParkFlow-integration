import { beforeAll,afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { db } from '../src/database/client';
import { redis } from '../src/database/redis';
beforeAll(async()=>{
 if(!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))throw new Error('Refusing a non-test database');
 execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,stdio:'pipe'});
 await redis.flushdb();
});
afterAll(async()=>{await db.$disconnect();await redis.quit();});
