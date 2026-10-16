import type { Role,Prisma } from '@prisma/client';
import { db,atomic,json,lock,type Tx } from '../../database/client';
import { assert,requireValue } from '../../utils/errors';
import { notify } from '../notifications/service';
import { lockSessionFamily } from '../auth/service';
import { post } from '../wallet/ledger';
import { findBookingRefund } from '../wallet/bookingEscrow';
import { idempotent } from '../../utils/idempotency';
import { event } from '../../realtime/outbox';
import * as management from '../management/service';
import { zonePermission as scopedZonePermission } from '../management/permissions';
import * as managementSchemas from '../management/schemas';
export interface Actor {userId:string;role:Role;ip?:string;userAgent?:string}
async function audit(tx:Tx,a:Actor,action:string,resourceType:string,resourceId:string,before:unknown,after:unknown){await tx.auditLog.create({data:{actorUserId:a.userId,action,resourceType,resourceId,before:before==null?undefined:json(before),after:after==null?undefined:json(after),ip:a.ip,userAgent:a.userAgent}});}
export const zonePermission=scopedZonePermission;
export async function users(query?:string){
 const search=query?.trim();
 return db.user.findMany({where:search?{OR:[
  {id:{contains:search,mode:'insensitive'}},
  {fullName:{contains:search,mode:'insensitive'}},
  {email:{contains:search,mode:'insensitive'}},
  {phone:{contains:search}},
 ]}:undefined,take:200,orderBy:{createdAt:'desc'},select:{id:true,phone:true,email:true,fullName:true,role:true,status:true,createdAt:true}});
}
export async function summary(){
 const [activeUsers,suspendedUsers,activeZones,visibleReports,openAppeals,totalReservations,checkedInReservations]=await Promise.all([
  db.user.count({where:{status:'ACTIVE'}}),
  db.user.count({where:{status:'SUSPENDED'}}),
  db.parkingZone.count({where:{active:true}}),
  db.checkpointReport.count({where:{hidden:false}}),
  db.appeal.count({where:{status:{in:['submitted','under_review','more_info']}}}),
  db.parkingReservation.count(),
  db.parkingReservation.count({where:{status:{in:['checked_in','completed']}}}),
 ]);
 return {activeUsers,suspendedUsers,activeZones,visibleReports,openAppeals,totalReservations,checkedInReservations};
}
export async function zones(a:Actor){return management.listZones(a);}
export async function createZone(a:Actor,input:unknown){return management.createZone(a,managementSchemas.zoneCreateSchema.parse(input));}
export async function patchZone(a:Actor,id:string,input:unknown){await scopedZonePermission(db,a,id,'edit');return management.patchZone(a,id,managementSchemas.zonePatchSchema.parse(input));}
export async function tariff(a:Actor,zoneId:string,input:unknown){await scopedZonePermission(db,a,zoneId,'edit');return management.tariff(a,zoneId,managementSchemas.tariffSchema.parse(input));}
export async function hours(a:Actor,zoneId:string,input:unknown){await scopedZonePermission(db,a,zoneId,'edit');return management.hours(a,zoneId,managementSchemas.hoursSchema.parse(input));}
export async function availability(a:Actor,zoneId:string,input:{availability:'available'|'limited'|'full'|'unknown';availableSpaces?:number;occupiedSpaces?:number;source:string;confidence:number;reason?:string}){return atomic(async tx=>{const zone=await scopedZonePermission(tx,a,zoneId,'operate');assert(input.availableSpaces===undefined||!zone.capacity||input.availableSpaces<=zone.capacity,'VALIDATION','Available spaces exceed capacity');assert(input.occupiedSpaces===undefined||!zone.capacity||input.occupiedSpaces<=zone.capacity,'VALIDATION','Occupied spaces exceed capacity');const {reason,source:_source,...values}=input;const s=await tx.availabilitySnapshot.create({data:{zoneId,...values,source:a.role==='ADMIN'?'ADMIN':'OPERATOR'}});await audit(tx,a,'create','availability',s.id,null,{...s,reason:reason??null});await event(tx,'parking.availability.updated',{zoneId});return s;});}
export async function reports(){return db.checkpointReport.findMany({
 take:200,
 orderBy:{reportedAt:'desc'},
 include:{checkpoint:{select:{id:true,nameEn:true,nameAr:true}},user:{select:{id:true,fullName:true,email:true}}},
 });}
export async function moderate(a:Actor,id:string,hidden:boolean){return atomic(async tx=>{const before=await tx.checkpointReport.findUniqueOrThrow({where:{id}});const after=await tx.checkpointReport.update({where:{id},data:{hidden}});if(hidden)await tx.pointsEntry.updateMany({where:{roadReportId:id},data:{state:'revoked'}});await audit(tx,a,'moderate','road-report',id,before,after);await event(tx,'checkpoint.updated',{checkpointId:after.checkpointId});return after;});}
export async function violations(){return db.violation.findMany({take:200,orderBy:{issuedAt:'desc'}});}
export async function issueViolation(a:Actor,input:Prisma.ViolationUncheckedCreateInput){return atomic(async tx=>{
 const vehicle=requireValue(await tx.vehicle.findUnique({where:{id:input.vehicleId}}));const v=await tx.violation.create({data:{...input,plateNumber:vehicle.plateNumber}});
 const links=await tx.userVehicle.findMany({where:{vehicleId:vehicle.id,unlinkedAt:null,verifiedAt:{not:null}}});for(const l of links)await notify(tx,l.userId,'violation_issued','New vehicle violation','مخالفة جديدة على المركبة',v.reason,v.reasonAr,`/violations/${v.id}`);
 await audit(tx,a,'create','violation',v.id,null,v);return v;});}
export async function addEvidence(a:Actor,id:string,input:{detectedPlate:string;detectionSource:string;firstDetectionAt:string;latitude:number;longitude:number;uploadIds:string[]}){return atomic(async tx=>{requireValue(await tx.violation.findUnique({where:{id}}));const {uploadIds,...fields}=input;const owned=await tx.upload.count({where:{id:{in:uploadIds},userId:a.userId}});assert(owned===new Set(uploadIds).size,'FORBIDDEN','Attachments must be uploaded by you',403);const e=await tx.violationEvidence.create({data:{violationId:id,...fields,photos:{create:uploadIds.map((uploadId,i)=>({uploadId,kind:i===0?'vehicle':'additional'}))}}});await audit(tx,a,'create','violation-evidence',e.id,null,e);return e;});}
export async function decideAppeal(a:Actor,id:string,input:{status:'under_review'|'approved'|'rejected'|'more_info';decisionNote:string}){return atomic(async tx=>{
 await lock(tx,`appeal:${id}`);
 const before=await tx.appeal.findUniqueOrThrow({where:{id},include:{violation:true}});
 assert(!['approved','rejected'].includes(before.status),'APPEAL_ALREADY_DECIDED','This appeal has already received a final decision',409);
 if(['approved','rejected'].includes(input.status)){
  assert(before.violation.status==='appealed','APPEAL_VIOLATION_STATE_CHANGED','The violation changed state and cannot be decided from this appeal',409);
 }
 const after=await tx.appeal.update({where:{id},data:input,include:{user:{select:{id:true,fullName:true,email:true}},violation:true}});
 let resultingViolation=after.violation;
 if(input.status==='approved')resultingViolation=await tx.violation.update({where:{id:after.violationId},data:{status:'cancelled'}});
 if(input.status==='rejected')resultingViolation=await tx.violation.update({where:{id:after.violationId},data:{status:after.violation.dueAt<new Date()?'overdue':'unpaid'}});
 const result={...after,violation:resultingViolation};
 await notify(tx,after.userId,'appeal_updated','Appeal updated','تحديث التظلّم',input.decisionNote,input.decisionNote,`/violations/${after.violationId}`);
 await audit(tx,a,'decide','appeal',id,before,result);
 return result;
 });}
export async function permit(a:Actor,input:{userId:string;vehicleId:string;type:string;zoneIds:string[];validFrom:string;validTo:string;status:'active'|'pending';issuer:string}){return atomic(async tx=>{if(a.role!=='ADMIN'){assert(input.zoneIds.length,'FORBIDDEN','Operator permits must specify zones',403);for(const zoneId of input.zoneIds)await zonePermission(tx,a,zoneId);}assert(await tx.userVehicle.findFirst({where:{userId:input.userId,vehicleId:input.vehicleId,unlinkedAt:null}}),'VALIDATION','Vehicle must be linked to this user');await lock(tx,`vehicle:${input.vehicleId}`);const {zoneIds,...data}=input;const p=await tx.permit.create({data:{...data,zones:{create:zoneIds.map(zoneId=>({zoneId}))}}});await audit(tx,a,'create','permit',p.id,null,p);return p;});}
export async function revokePermit(a:Actor,id:string){return atomic(async tx=>{const p=await tx.permit.findUniqueOrThrow({where:{id},include:{zones:true}});await lock(tx,`vehicle:${p.vehicleId}`);if(a.role!=='ADMIN'){assert(p.zones.length,'FORBIDDEN','Only admin can revoke a global permit',403);for(const z of p.zones)await zonePermission(tx,a,z.zoneId);}const result=await tx.permit.update({where:{id},data:{status:'revoked'}});await audit(tx,a,'revoke','permit',id,p,result);return result;});}
export async function role(a:Actor,id:string,input:{role?:Role;status?:'ACTIVE'|'SUSPENDED'}){return atomic(async tx=>{
 await lock(tx,'platform-admins');assert(a.role==='ADMIN','FORBIDDEN','Administrator access is required',403);assert(id!==a.userId,'VALIDATION','Cannot change your own permissions');
 await lockSessionFamily(tx,id);
 const before=await tx.user.findUniqueOrThrow({where:{id}});
 if(before.role==='ADMIN'&&before.status==='ACTIVE'&&((input.role!==undefined&&input.role!=='ADMIN')||input.status==='SUSPENDED'))assert(await tx.user.count({where:{role:'ADMIN',status:'ACTIVE'}})>1,'LAST_ADMIN','At least one active platform administrator must remain',409);
 const after=await tx.user.update({where:{id},data:input});await tx.refreshToken.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,a,'permissions','user',id,{role:before.role,status:before.status},{role:after.role,status:after.status});return {id,role:after.role,status:after.status};
 },'ReadCommitted');}
export async function adjustment(a:Actor,userId:string,amount:number,reason:string,key:string){return idempotent(a.userId,`adjust:${userId}`,key,{amount,reason},async tx=>{const t=await post(tx,userId,{amount,type:'adjustment',title:reason,titleAr:reason});await audit(tx,a,'adjust','wallet',t.walletId,null,t);return t;});}
export async function auditLogs(){return db.auditLog.findMany({
 take:200,
 orderBy:{createdAt:'desc'},
 include:{actor:{select:{id:true,fullName:true,email:true}}},
 });}
export async function operators(){return db.parkingOperator.findMany({include:{users:true}});}
export async function createOperator(a:Actor,input:{name:string;type:string}){return management.createOperator(a,managementSchemas.operatorSchema.parse(input));}
export async function assignOperator(a:Actor,operatorId:string,userId:string,memberRole:'owner'|'manager'|'attendant'='manager'){return management.assignMember(a,operatorId,{userId,memberRole});}
export async function shareVehicle(a:Actor,vehicleId:string,input:{userId:string;role:'owner'|'driver'|'manager';reason:string}){
 assert(a.role==='ADMIN','FORBIDDEN','Administrator access is required',403);
 const reason=input.reason.trim();assert(reason.length>=10&&reason.length<=500,'VALIDATION','Record the reviewed evidence or verification reason');
 return atomic(async tx=>{
  await lock(tx,`vehicle-verification-link:${input.userId}:${vehicleId}`);
  const before=await tx.userVehicle.findUnique({where:{userId_vehicleId:{userId:input.userId,vehicleId}}});
  if(before)await lock(tx,`vehicle-verification:${before.id}`);
  const link=await tx.userVehicle.upsert({where:{userId_vehicleId:{userId:input.userId,vehicleId}},create:{userId:input.userId,role:input.role,vehicleId,verifiedAt:new Date()},update:{role:input.role,unlinkedAt:null,verifiedAt:new Date()}});
  await audit(tx,a,'verify','vehicle-verification',link.id,before?{role:before.role,verifiedAt:before.verifiedAt}:null,{userId:link.userId,vehicleId:link.vehicleId,role:link.role,verifiedAt:link.verifiedAt,reason});return link;
 });
}

export async function refund(a:Actor,id:string,reason:string,key:string){return idempotent(a.userId,`refund:${id}`,key,{reason},async tx=>{
 const original=requireValue(await tx.walletTransaction.findUnique({where:{id},include:{wallet:true}}));
 assert(original.status==='completed'&&original.amount<0,'INVALID_REFUND','Only a completed debit can be refunded');
 let reference=`refund-${id}`;
 if(original.type==='spot_payment'){
  assert(original.reference.startsWith('spot-payment:'),'INVALID_REFUND','Booking payment reference is invalid');
  const bookingId=original.reference.slice('spot-payment:'.length);
  await lock(tx,`spot-booking:${bookingId}`);
  const booking=requireValue(await tx.spotBooking.findUnique({where:{id:bookingId}}));
  assert(booking.driverId===original.wallet.userId&&booking.amount===-original.amount,'INVALID_REFUND','Booking payment does not match its escrow');
  const existing=await findBookingRefund(tx,'spot',bookingId);if(existing)return existing;
  assert(booking.status!=='completed'&&!await tx.walletTransaction.findUnique({where:{reference:`spot-earning:${bookingId}`}}),'ESCROW_ALREADY_SETTLED','This booking has already paid its host',409);
  reference=`spot-refund:${bookingId}`;
 }else if(original.type==='ride_payment'){
  assert(original.reference.startsWith('ride-payment:'),'INVALID_REFUND','Booking payment reference is invalid');
  const bookingId=original.reference.slice('ride-payment:'.length);
  const found=requireValue(await tx.rideBooking.findUnique({where:{id:bookingId},select:{rideId:true}}));
  await lock(tx,`ride:${found.rideId}`);
  const booking=requireValue(await tx.rideBooking.findUnique({where:{id:bookingId}}));
  assert(booking.passengerId===original.wallet.userId&&booking.amount===-original.amount,'INVALID_REFUND','Booking payment does not match its escrow');
  const existing=await findBookingRefund(tx,'ride',bookingId);if(existing)return existing;
  assert(booking.status!=='completed'&&!await tx.walletTransaction.findUnique({where:{reference:`ride-earning:${booking.rideId}`}}),'ESCROW_ALREADY_SETTLED','This ride has already paid its driver',409);
  reference=`ride-refund:${bookingId}`;
 }
 const existing=await tx.walletTransaction.findUnique({where:{reference}});if(existing)return existing;
 const entry=await post(tx,original.wallet.userId,{amount:-original.amount,type:'refund',title:reason,titleAr:reason,reference});await audit(tx,a,'refund','transaction',id,original,entry);return entry;
 });}
export async function appeals(){return db.appeal.findMany({
 take:200,
 orderBy:{submittedAt:'desc'},
 include:{user:{select:{id:true,fullName:true,email:true}},violation:{select:{id:true,plateNumber:true,reason:true,reasonAr:true,amount:true,status:true}}},
 });}
