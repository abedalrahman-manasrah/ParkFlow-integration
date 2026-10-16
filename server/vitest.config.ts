import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config();
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Set TEST_DATABASE_URL to a dedicated database whose name ends in _test');
process.env.DATABASE_URL=url;process.env.NODE_ENV='test';process.env.PAYMENT_PROVIDER='development';
const redis=new URL(process.env.REDIS_URL!);redis.pathname='/15';process.env.REDIS_URL=redis.toString();
export default defineConfig({test:{exclude:['dist/**','node_modules/**'],fileParallelism:false,testTimeout:30000,hookTimeout:60000,setupFiles:['./tests/setup.ts']}});
