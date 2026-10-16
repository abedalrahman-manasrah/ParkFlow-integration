import { db,atomic,lock,json,type Tx } from '../../database/client';
import type { ParkingSession } from '@prisma/client';
import { idempotent } from '../../utils/idempotency';
import { assert,requireValue } from '../../utils/errors';
import { vehicleAccess } from '../vehicles/service';
import { computeTrust } from '../trust/service';
import { assertOpen,computeCost,prepaidCost,discounted,type Rate } from '../parking/pricing';
import { post } from '../wallet/ledger';
import { notify } from '../notifications/service';
import { event } from '../../realtime/outbox';
interface Start {vehicleId:string;zoneId:string;mode:'start_stop'|'prepaid';durationMinutes?:number;entryMethod:string}
function dto(s:ParkingSession){return {...s,currentCost:s.status==='ACTIVE'&&s.parkingMode==='start_stop'?computeCost(s.rateSnapshot as unknown as Rate,(Date.now()-s.startedAt.getTime())/1000):s.currentCost};}
async function owned(tx:Tx,userId:string,id:string){return requireValue(await tx.parkingSession.findFirst({where:{id,userId}}));}
export async function start(userId:string,input:Start,key:string){return idempotent(userId,'start',key,input,async tx=>{
 await lock(tx,`vehicle:${input.vehicleId}`);await vehicleAccess(tx,userId,input.vehicleId);
 assert(!await tx.parkingSession.findFirst({where:{vehicleId:input.vehicleId,status:'ACTIVE'}}),'ACTIVE_SESSION_EXISTS','This vehicle already has an active parking session',409);
 const now=new Date();const zone=requireValue(await tx.parkingZone.findFirst({where:{id:input.zoneId,active:true},include:{operatingHours:true,tariffs:{where:{validFrom:{lte:now},OR:[{validTo:null},{validTo:{gt:now}}]},orderBy:{validFrom:'desc'},take:1}}}));
 const tariff=requireValue(zone.tariffs[0],'No current tariff configured');
 assert(zone.parkingAllowed,'PARKING_RESTRICTED','This location is not available for normal public parking',409);
 assert(zone.supportedModes.includes(input.mode),'INVALID_MODE','This parking mode is not supported');
 assert(zone.supportedEntryMethods.includes(input.entryMethod),'INVALID_ENTRY_METHOD','This entry method is not supported');
 const duration=input.durationMinutes;
 if(input.mode==='prepaid'){assert(duration&&Number.isInteger(duration)&&duration>=15&&duration%15===0,'INVALID_DURATION','Choose a duration in 15-minute increments');assert(!tariff.maxStayMinutes||duration<=tariff.maxStayMinutes,'MAX_STAY','Maximum stay exceeded');}
 const endsAt=input.mode==='prepaid'?new Date(now.getTime()+duration!*60000):undefined;
 assertOpen(zone.operatingHours,now,endsAt);
 const trust=await computeTrust(userId,tx),rate=discounted(tariff,trust.discountPercent);
 const amount=endsAt?prepaidCost(rate,duration!):0,subtotal=endsAt?prepaidCost(tariff,duration!):0;
 const s=await tx.parkingSession.create({data:{userId,vehicleId:input.vehicleId,parkingZoneId:zone.id,parkingMode:input.mode,startedAt:now,endsAt,currentCost:amount,subtotalMinor:subtotal,discountMinor:subtotal-amount,paymentStatus:endsAt?'paid':'unpaid',rateSnapshot:json({...rate,tariffId:tariff.id,capturedAt:now.toISOString(),loyaltyDiscountPercent:trust.discountPercent}),originalTariffSnapshot:json(tariff),trustDiscountSnapshot:json({score:trust.score,tier:trust.tier,percent:trust.discountPercent}),pricingRulesSnapshot:json({mode:input.mode,operatingHours:zone.operatingHours,entryMethod:input.entryMethod,zoneCode:zone.code,zoneName:zone.name,zoneNameAr:zone.nameAr,city:zone.city})}});
 if(endsAt){const t=await post(tx,userId,{amount:-amount,type:'parking_payment',title:'Prepaid parking',titleAr:'وقوف مدفوع مسبقاً',subtitle:zone.name,subtitleAr:zone.nameAr,parkingSessionId:s.id});s.paymentTransactionId=t.id;await tx.parkingSession.update({where:{id:s.id},data:{paymentTransactionId:t.id}});}
 await notify(tx,userId,'parking_started','Parking started','بدأ الوقوف',zone.name,zone.nameAr,`/parking/active/${s.id}`,`start:${s.id}`);
 await event(tx,'parking.session.updated',{id:s.id},userId);return s;
 });}
async function chargeStopped(tx:Tx,s:ParkingSession,cost:number){await lock(tx,`wallet:${s.userId}`);const wallet=requireValue(await tx.wallet.findUnique({where:{userId:s.userId}}));const paid=wallet.balance>=cost;
 const t=await post(tx,s.userId,{amount:-cost,type:'parking_payment',status:paid?'completed':'failed',title:'Parking',titleAr:'وقوف',parkingSessionId:s.id,failureReason:paid?undefined:'insufficient_funds'});
 if(!paid)await tx.sessionDebt.upsert({where:{sessionId:s.id},create:{sessionId:s.id,amount:cost},update:{amount:cost}});
 return {status:paid?'COMPLETED' as const:'PAYMENT_FAILED' as const,paymentStatus:paid?'paid' as const:'failed' as const,paymentTransactionId:t.id};
}
export async function stop(userId:string,id:string,key:string){return idempotent(userId,`stop:${id}`,key,{},async tx=>{
 await lock(tx,`session:${id}`);const s=await owned(tx,userId,id);if(s.status!=='ACTIVE')return s;
 const now=new Date(),seconds=(now.getTime()-s.startedAt.getTime())/1000;
 const cost=s.parkingMode==='prepaid'?s.currentCost:computeCost(s.rateSnapshot as unknown as Rate,seconds);
 const subtotal=s.parkingMode==='prepaid'?s.subtotalMinor:computeCost(s.originalTariffSnapshot as unknown as Rate,seconds);
 const payment=s.parkingMode==='prepaid'?{status:'COMPLETED' as const,paymentStatus:'paid' as const}:await chargeStopped(tx,s,cost);
 const result=await tx.parkingSession.update({where:{id},data:{...payment,stoppedAt:now,endsAt:s.endsAt??now,finalCost:cost,currentCost:cost,subtotalMinor:subtotal,discountMinor:subtotal-cost}});
 const paid=payment.paymentStatus==='paid';await notify(tx,userId,paid?'parking_completed':'payment_failed',paid?'Parking completed':'Parking ended with an unpaid balance',paid?'انتهى الوقوف':'انتهى الوقوف مع رصيد غير مدفوع','Your parking session has ended.','انتهت جلسة الوقوف.',`/parking/receipt/${id}`,`stop:${id}`);
 await event(tx,'parking.session.updated',{id},userId);return result;
 });}
export async function extend(userId:string,id:string,additionalMinutes:number,key:string){return idempotent(userId,`extend:${id}`,key,{additionalMinutes},async tx=>{
 await lock(tx,`session:${id}`);const s=await owned(tx,userId,id);
 assert(s.status==='ACTIVE'&&s.parkingMode==='prepaid'&&s.endsAt&&s.endsAt>new Date(),'SESSION_NOT_EXTENDABLE','Only unexpired prepaid sessions may be extended',409);
 assert(additionalMinutes>=15&&additionalMinutes%15===0,'INVALID_DURATION','Use 15-minute increments');
 const rate=s.rateSnapshot as unknown as Rate,original=s.originalTariffSnapshot as unknown as Rate;
 const end=new Date(s.endsAt.getTime()+additionalMinutes*60000),total=(end.getTime()-s.startedAt.getTime())/60000;
 assert(!rate.maxStayMinutes||total<=rate.maxStayMinutes,'MAX_STAY','Maximum stay exceeded');
 const rules=s.pricingRulesSnapshot as unknown as {operatingHours:{weekday:number;opensAt:string;closesAt:string;closed?:boolean}[]};assertOpen(rules.operatingHours,s.endsAt,end);
 // Charge only the incremental price under the original snapshot, respecting the total cap.
 const cost=prepaidCost(rate,total),extra=Math.max(0,cost-s.currentCost),subtotal=prepaidCost(original,total);
 await post(tx,userId,{amount:-extra,type:'parking_payment',title:'Parking extension',titleAr:'تمديد الوقوف',parkingSessionId:id});
 const result=await tx.parkingSession.update({where:{id},data:{endsAt:end,currentCost:cost,subtotalMinor:subtotal,discountMinor:subtotal-cost}});await event(tx,'parking.session.updated',{id},userId);return result;
 });}
export async function settle(userId:string,id:string,key:string){return idempotent(userId,`settle:${id}`,key,{},async tx=>{await lock(tx,`session:${id}`);const s=await owned(tx,userId,id);assert(s.status!=='ACTIVE','SESSION_ACTIVE','Stop the session before settling',409);if(s.paymentStatus==='paid')return s;const debt=requireValue(await tx.sessionDebt.findFirst({where:{sessionId:id,settledAt:null}}));
 const t=await post(tx,userId,{amount:-debt.amount,type:'parking_payment',title:'Parking settlement',titleAr:'تسوية الوقوف',parkingSessionId:id});await tx.sessionDebt.update({where:{id:debt.id},data:{settledAt:new Date()}});
 const result=await tx.parkingSession.update({where:{id},data:{status:'COMPLETED',paymentStatus:'paid',paymentTransactionId:t.id}});await event(tx,'parking.session.updated',{id},userId);return result;});}
export async function get(userId:string,id:string){return dto(await owned(db,userId,id));}
export async function list(userId:string,options:{active?:boolean;vehicleId?:string;limit?:number}={}){return (await db.parkingSession.findMany({where:{userId,...(options.active?{status:'ACTIVE'}:{}),...(options.vehicleId?{vehicleId:options.vehicleId}:{})},orderBy:{startedAt:'desc'},take:options.limit??100})).map(dto);}
export async function expireSessions(now=new Date()){
 const rows=await db.parkingSession.findMany({where:{status:'ACTIVE',parkingMode:'prepaid',endsAt:{lte:now}},take:500});
 for(const row of rows)await atomic(async tx=>{await lock(tx,`session:${row.id}`);const s=await tx.parkingSession.findUniqueOrThrow({where:{id:row.id}});if(s.status!=='ACTIVE'||!s.endsAt||s.endsAt>now)return;
 await tx.parkingSession.update({where:{id:s.id},data:{status:'EXPIRED',stoppedAt:s.endsAt,finalCost:s.currentCost}});
 await notify(tx,s.userId,'parking_expiring','Prepaid parking ended','انتهى الوقوف المدفوع مسبقاً','Your prepaid period has ended.','انتهت المدة المدفوعة مسبقاً.',`/parking/receipt/${s.id}`,`expired:${s.id}`);await event(tx,'parking.session.updated',{id:s.id},s.userId);});
 // Two warnings before paid time runs out, each with a way to extend, so overstay charges are never a surprise.
 for(const minutes of [15,5]){const soon=await db.parkingSession.findMany({where:{status:'ACTIVE',parkingMode:'prepaid',endsAt:{gt:now,lte:new Date(now.getTime()+minutes*60000)}},take:500});
 // A 15-minute session would otherwise get its 15-minute warning the moment it starts.
 for(const s of soon.filter(x=>x.endsAt!.getTime()-x.startedAt.getTime()>(minutes+5)*60000))await atomic(tx=>notify(tx,s.userId,'parking_reminder',`Parking ends in ${minutes} minutes`,`ينتهي الوقوف خلال ${minutes} دقائق`,'Extend now to avoid an overstay violation.','مدّد الآن لتجنب مخالفة تجاوز الوقت.',`/parking/active/${s.id}`,`reminder:${s.id}:${s.endsAt!.toISOString()}:${minutes}`));}
}
