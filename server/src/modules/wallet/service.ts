import { createHash } from 'node:crypto';
import type { TransactionType } from '@prisma/client';
import { db,atomic,lock,json,type Tx } from '../../database/client';
import { idempotent } from '../../utils/idempotency';
import { assert,requireValue } from '../../utils/errors';
import { post } from './ledger';
import { payments,tokenize,type PaymentResult } from '../../providers/payments';
import { env } from '../../config/env';
import { notify } from '../notifications/service';
import { lockSessionFamily } from '../auth/service';
export async function get(userId:string){return requireValue(await db.wallet.findUnique({where:{userId}}));}
export async function methods(userId:string){const rows=await db.paymentMethod.findMany({where:{userId,deletedAt:null},orderBy:{createdAt:'asc'}});return rows.map(({providerMethodId,...m})=>m);}
export async function addMethod(userId:string,input:{last4:string;brand:string;expiryMonth:number;expiryYear:number;holderName?:string;makeDefault?:boolean;providerToken?:string}){
 const token=await tokenize(input);return atomic(async tx=>{await lock(tx,`wallet:${userId}`);const count=await tx.paymentMethod.count({where:{userId,deletedAt:null}});const makeDefault=input.makeDefault||!count;if(makeDefault)await tx.paymentMethod.updateMany({where:{userId},data:{isDefault:false}});const method=await tx.paymentMethod.create({data:{userId,provider:env.PAYMENT_PROVIDER,providerMethodId:token.providerMethodId,last4:token.last4,brand:token.brand,expiryMonth:token.expiryMonth,expiryYear:token.expiryYear,holderName:input.holderName,isDefault:makeDefault}});if(makeDefault)await tx.wallet.update({where:{userId},data:{defaultPaymentMethodId:method.id}});return {...method,providerMethodId:undefined};});
}
export async function defaultMethod(userId:string,id:string){await atomic(async tx=>{await lock(tx,`wallet:${userId}`);requireValue(await tx.paymentMethod.findFirst({where:{userId,id,deletedAt:null}}));await tx.paymentMethod.updateMany({where:{userId},data:{isDefault:false}});await tx.paymentMethod.update({where:{id},data:{isDefault:true}});await tx.wallet.update({where:{userId},data:{defaultPaymentMethodId:id}});});}
export async function removeMethod(userId:string,id:string){await atomic(async tx=>{await lock(tx,`wallet:${userId}`);const m=requireValue(await tx.paymentMethod.findFirst({where:{id,userId,deletedAt:null}}));await tx.paymentMethod.update({where:{id},data:{deletedAt:new Date(),isDefault:false}});if(m.isDefault){const next=await tx.paymentMethod.findFirst({where:{userId,deletedAt:null}});if(next)await tx.paymentMethod.update({where:{id:next.id},data:{isDefault:true}});await tx.wallet.update({where:{userId},data:{defaultPaymentMethodId:next?.id??null,autoTopUpEnabled:!!next&&(await get(userId)).autoTopUpEnabled}});}});}
export async function autoTopup(userId:string,input:{enabled:boolean;threshold?:number;amount?:number}){return atomic(async tx=>{await lock(tx,`wallet:${userId}`);const w=requireValue(await tx.wallet.findUnique({where:{userId}}));assert(!input.enabled||w.defaultPaymentMethodId,'VALIDATION','Add a payment method first');return tx.wallet.update({where:{userId},data:{autoTopUpEnabled:input.enabled,autoTopUpThreshold:input.threshold,autoTopUpAmount:input.amount}});},'ReadCommitted');}
export async function transactions(userId:string,types?:string[],limit=100){const w=await get(userId);const rows=await db.walletTransaction.findMany({where:{walletId:w.id,...(types?.length?{type:{in:types as TransactionType[]}}:{})},orderBy:{createdAt:'desc'},take:limit});return rows.map(t=>({...t,userId,currency:'ILS'}));}
export async function transaction(userId:string,id:string){const t=requireValue(await db.walletTransaction.findFirst({where:{id,wallet:{userId}}}));return {...t,userId,currency:'ILS'};}
export async function confirmPayment(id:string,result:PaymentResult){return atomic(async tx=>{await lock(tx,`payment:${id}`);const p=requireValue(await tx.payment.findUnique({where:{id},include:{method:true}}));assert(result.amount===p.amount&&result.currency===p.currency,'PAYMENT_MISMATCH','Payment amount mismatch',409);
 if(p.ledgerId)return; if(result.status==='pending')return;
 const ledger=await post(tx,p.method.userId,{amount:p.amount,type:'topup',status:result.status,title:'Wallet Top-up',titleAr:'شحن المحفظة',paymentMethodId:p.paymentMethodId});await tx.payment.update({where:{id},data:{status:result.status,ledgerId:ledger.id}});
 if(result.status==='completed')await notify(tx,p.method.userId,'topup_success','Wallet topped up','تم شحن المحفظة','Your payment has been confirmed.','تم تأكيد دفعتك.','/wallet',`topup:${p.id}`);
 });}
type TopupInput={amount:number;paymentMethodId:string};
async function reserveTopup(tx:Tx,userId:string,input:TopupInput,key:string){
 // Reservation order is idempotency then wallet. Provider work runs afterward.
 await lock(tx,`wallet:${userId}`);
 requireValue(await tx.paymentMethod.findFirst({where:{id:input.paymentMethodId,userId,deletedAt:null}}));
 return tx.payment.create({data:{...input,provider:env.PAYMENT_PROVIDER,idempotencyKey:`${userId}:${key}`}});
}
const automaticDispatchScope='automatic-topup-dispatch';
type AutomaticDispatchProof={version:1;state:'reserved'|'started'|'cancelled';walletId:string;walletVersion:string;methodId:string;amount:number};
async function authorizeAutomaticDispatch(paymentId:string,userId:string){
 const identity={userId,scope:automaticDispatchScope,key:paymentId};
 // Proof-less legacy authorizations may already have reached the provider.
 // Keep their original same-payment/idempotency-key recovery semantics.
 if(!await db.idempotencyRecord.findUnique({where:{userId_scope_key:identity},select:{id:true}}))return true;
 return atomic(async tx=>{
  // Account transitions precede payment then wallet, matching confirmation's
  // payment-before-wallet order. No provider I/O runs under these locks.
  await lockSessionFamily(tx,userId);
  await lock(tx,`payment:${paymentId}`);
  const record=requireValue(await tx.idempotencyRecord.findUnique({where:{userId_scope_key:identity}}));
  const proof=record.response as unknown as AutomaticDispatchProof|null;
  assert(proof&&proof.version===1&&['reserved','started','cancelled'].includes(proof.state),'PAYMENT_PENDING','Payment authorization requires reconciliation',202);
  if(proof.state==='cancelled')return false;
  let payment=requireValue(await tx.payment.findUnique({where:{id:paymentId},include:{method:true}}));
  if(payment.ledgerId||payment.providerId||proof.state==='started')return true;
  await lock(tx,`wallet:${userId}`);
  payment=requireValue(await tx.payment.findUnique({where:{id:paymentId},include:{method:true}}));
  if(payment.ledgerId||payment.providerId)return true;
  const wallet=await tx.wallet.findUnique({where:{id:proof.walletId},include:{user:{select:{status:true}}}});
  const eligible=wallet&&wallet.userId===userId&&wallet.user.status==='ACTIVE'&&wallet.autoTopUpEnabled&&wallet.balance<wallet.autoTopUpThreshold&&wallet.updatedAt.toISOString()===proof.walletVersion&&wallet.defaultPaymentMethodId===payment.paymentMethodId&&payment.paymentMethodId===proof.methodId&&payment.amount===proof.amount&&payment.method.userId===userId&&!payment.method.deletedAt&&payment.status==='pending';
  if(!eligible){
   // A suspension changes only the user. Advance an otherwise unchanged wallet
   // epoch so reactivation can reserve a fresh authorization while this proof
   // remains terminal. Preserve an epoch already changed by wallet settings.
   if(wallet&&wallet.userId===userId&&wallet.updatedAt.toISOString()===proof.walletVersion){
    await tx.wallet.update({where:{id:wallet.id},data:{updatedAt:new Date(Math.max(Date.now(),wallet.updatedAt.getTime()+1))}});
   }
   await tx.payment.update({where:{id:paymentId},data:{status:'failed'}});
   await tx.idempotencyRecord.update({where:{id:record.id},data:{response:json({...proof,state:'cancelled'})}});
   return false;
  }
  // Commit the started marker BEFORE the first HTTP attempt. A crash or
  // ambiguous response must retry this exact authorization after settings change.
  await tx.idempotencyRecord.update({where:{id:record.id},data:{response:json({...proof,state:'started'})}});
  return true;
 },'ReadCommitted');
}
export async function processPayment(paymentId:string){
 let payment=requireValue(await db.payment.findUnique({where:{id:paymentId},include:{method:true}}));
 if(!payment.ledgerId){
  const authorized=await authorizeAutomaticDispatch(payment.id,payment.method.userId);
  // Throw after the transaction commits so cancellation remains durable. The
  // financial consumer treats this internal result as a successful no-op.
  assert(authorized,'AUTOMATIC_TOPUP_CANCELLED','Automatic payment was cancelled before submission',409);
  payment=requireValue(await db.payment.findUnique({where:{id:paymentId},include:{method:true}}));
 }
 if(!payment.ledgerId){const result=payment.providerId?await payments.verifyPayment(payment.providerId,payment.amount):await payments.createPayment({id:payment.id,amount:payment.amount,method:payment.method.providerMethodId,idempotencyKey:payment.idempotencyKey});await db.payment.update({where:{id:payment.id},data:{providerId:result.id}});await confirmPayment(payment.id,result);}
 const final=await db.payment.findUniqueOrThrow({where:{id:payment.id}});assert(final.status!=='failed','PAYMENT_FAILED','Payment provider declined the payment',402);assert(final.ledgerId,'PAYMENT_PENDING','Payment is processing; your balance updates after provider confirmation',202);
 return {wallet:await get(payment.method.userId),transaction:await transaction(payment.method.userId,final.ledgerId)};
}
export async function topup(userId:string,input:TopupInput,key:string){
 const payment=await idempotent(userId,'topup',key,input,tx=>reserveTopup(tx,userId,input,key));
 return processPayment(payment.id);
}
class SkipAutomaticTopup extends Error {}
export async function prepareAutomaticTopup(walletId:string,version:string):Promise<string|null>{
 const initial=await db.wallet.findUnique({where:{id:walletId}});
 if(!initial||initial.updatedAt.toISOString()!==version)return null;
 const stamp=initial.updatedAt.getTime(),key=`auto-${initial.id}-${stamp}`;
 const input={amount:initial.autoTopUpAmount,paymentMethodId:initial.defaultPaymentMethodId!};
 try{
  const payment=await idempotent(initial.userId,'topup',key,input,async tx=>{
   await lock(tx,`wallet:${initial.userId}`);
   const wallet=await tx.wallet.findUnique({where:{id:walletId},include:{user:{select:{status:true}}}});
   if(!wallet||wallet.updatedAt.toISOString()!==version||!wallet.autoTopUpEnabled||wallet.balance>=wallet.autoTopUpThreshold||!wallet.defaultPaymentMethodId||wallet.user.status!=='ACTIVE')throw new SkipAutomaticTopup();
   // A previous automatic or manual authorization must settle before reserving
   // another automatic charge, even if configuration changed its version.
   if(await tx.payment.findFirst({where:{status:'pending',method:{userId:wallet.userId}},select:{id:true}}))throw new SkipAutomaticTopup();
   const payment=await reserveTopup(tx,wallet.userId,input,key);
   const proof:AutomaticDispatchProof={version:1,state:'reserved',walletId:wallet.id,walletVersion:version,methodId:payment.paymentMethodId,amount:payment.amount};
   await tx.idempotencyRecord.create({data:{userId:wallet.userId,scope:automaticDispatchScope,key:payment.id,requestHash:createHash('sha256').update(JSON.stringify(proof)).digest('hex'),response:json(proof)}});
   return payment;
  },'ReadCommitted');
  const persisted=await db.payment.findUnique({where:{id:payment.id}});
  return persisted&&!persisted.ledgerId?persisted.id:null;
 }catch(error){if(error instanceof SkipAutomaticTopup)return null;throw error;}
}
export async function webhook(provider:string,raw:Buffer,signature:string){assert(provider===env.PAYMENT_PROVIDER,'NOT_FOUND','Unknown payment provider',404);const payload=payments.handleWebhook(raw,signature);await db.paymentWebhook.upsert({where:{id:payload.id},create:{id:payload.id,provider,payload:json(payload)},update:{}});return {accepted:true};}
export async function processWebhook(id:string){const w=await db.paymentWebhook.findUnique({where:{id}});if(!w||w.processedAt)return;const payload=w.payload as {paymentId:string};const p=await db.payment.findUnique({where:{providerId:payload.paymentId}});if(!p)return;const result=await payments.verifyPayment(payload.paymentId,p.amount);await confirmPayment(p.id,result);await db.paymentWebhook.update({where:{id:w.id},data:{processedAt:new Date()}});}
export async function processWebhooks(){const rows=await db.paymentWebhook.findMany({where:{processedAt:null},take:100});for(const w of rows)await processWebhook(w.id);}
