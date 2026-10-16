import { json,type Tx } from '../database/client';
export async function event(tx:Tx,topic:string,payload:unknown,userId?:string){await tx.outboxEvent.create({data:{topic,payload:json(payload),userId}});}
