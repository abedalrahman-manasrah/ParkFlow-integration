import { createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { assert } from '../utils/errors';
export const paymentResult=z.object({id:z.string(),status:z.enum(['pending','completed','failed']),amount:z.number().int().nonnegative(),currency:z.literal('ILS')});
export type PaymentResult=z.infer<typeof paymentResult>;
export interface PaymentProvider {createPayment(input:{id:string;amount:number;method:string;idempotencyKey:string}):Promise<PaymentResult>;verifyPayment(id:string,amount:number):Promise<PaymentResult>;refundPayment(id:string,amount:number,key:string):Promise<PaymentResult>;handleWebhook(raw:Buffer,signature:string):{id:string;paymentId:string};}
async function call(path:string,body?:unknown){assert(env.PAYMENT_API_URL&&env.PAYMENT_API_KEY,'PROVIDER_UNAVAILABLE','Payment provider is not configured',503);const r=await fetch(env.PAYMENT_API_URL+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${env.PAYMENT_API_KEY}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});assert(r.ok,'PAYMENT_FAILED','Payment provider request failed',502);return r.json();}
export const payments:PaymentProvider={
 async createPayment(input){if(env.PAYMENT_PROVIDER==='development')return {id:input.id,status:input.method.endsWith('0000')?'failed':'completed',amount:input.amount,currency:'ILS'};return paymentResult.parse(await call('/payments',input));},
 async verifyPayment(id,amount){if(env.PAYMENT_PROVIDER==='development')return {id,status:'completed',amount,currency:'ILS'};return paymentResult.parse(await call(`/payments/${encodeURIComponent(id)}`));},
 async refundPayment(id,amount,idempotencyKey){if(env.PAYMENT_PROVIDER==='development')return {id:`refund-${idempotencyKey}`,status:'completed',amount,currency:'ILS'};return paymentResult.parse(await call(`/payments/${encodeURIComponent(id)}/refunds`,{amount,idempotencyKey}));},
 handleWebhook(raw,signature){const expected=createHmac('sha256',env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');assert(signature.length===expected.length&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected)),'UNAUTHORIZED','Invalid webhook signature',401);return z.object({id:z.string().max(200),paymentId:z.string().max(200)}).parse(JSON.parse(raw.toString()));}
};
export async function tokenize(input:{providerToken?:string;last4:string;brand:string;expiryMonth:number;expiryYear:number}){
 if(env.PAYMENT_PROVIDER==='development')return {providerMethodId:`dev-${input.last4}`,...input};
 assert(input.providerToken,'TOKENIZATION_REQUIRED','A token from the payment provider is required');
 const schema=z.object({providerMethodId:z.string(),last4:z.string().regex(/^\d{4}$/),brand:z.enum(['visa','mastercard','amex']),expiryMonth:z.number().int().min(1).max(12),expiryYear:z.number().int()});
 return schema.parse(await call('/payment-methods',{token:input.providerToken}));
}
