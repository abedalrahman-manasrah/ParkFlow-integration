import { PrismaClient, Prisma } from '@prisma/client';
export const db = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export const json = (value:unknown):Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export async function atomic<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>{
 for(let n=0;;n++)try{return await db.$transaction(fn,{isolationLevel:'Serializable',timeout:15000,maxWait:10000});}
 catch(e){if(n<5 && e instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(e.code)) {await new Promise(r=>setTimeout(r,20*(n+1)));continue;}throw e;}
}
export async function lock(tx:Tx,key:string){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;}
