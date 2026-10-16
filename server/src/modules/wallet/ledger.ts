import { randomUUID } from 'node:crypto';
import type { TransactionType,TransactionStatus } from '@prisma/client';
import { lock,type Tx } from '../../database/client';
import { assert,requireValue } from '../../utils/errors';
export interface LedgerInput {amount:number;type:TransactionType;title:string;titleAr:string;subtitle?:string;subtitleAr?:string;parkingSessionId?:string;violationId?:string;paymentMethodId?:string;status?:TransactionStatus;failureReason?:string;reference?:string}
export async function post(tx:Tx,userId:string,input:LedgerInput){
 assert(Number.isSafeInteger(input.amount),'VALIDATION','Money must be integer minor units');
 await lock(tx,`wallet:${userId}`);const wallet=requireValue(await tx.wallet.findUnique({where:{userId}}));
 const status=input.status??'completed';const next=wallet.balance+(status==='completed'?input.amount:0);
 assert(next>=0,'INSUFFICIENT_FUNDS','Your wallet balance is too low',409);
 assert(next<=2147483647,'VALIDATION','Wallet limit exceeded');
 if(status==='completed')await tx.wallet.update({where:{id:wallet.id},data:{balance:next}});
 return tx.walletTransaction.create({data:{...input,status,walletId:wallet.id,balanceAfter:next,reference:input.reference??randomUUID()}});
}
