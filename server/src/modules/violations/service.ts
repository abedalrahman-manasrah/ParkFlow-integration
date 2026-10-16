import { randomUUID } from 'node:crypto';
import { db,atomic,lock } from '../../database/client';
import { idempotent } from '../../utils/idempotency';
import { assert,requireValue } from '../../utils/errors';
import { vehicleAccess } from '../vehicles/service';
import { post } from '../wallet/ledger';
import { notify } from '../notifications/service';
import { put,signedUrl } from '../../providers/storage';
import type { Prisma } from '@prisma/client';
const include={zone:true,evidence:true,appeals:{orderBy:{submittedAt:'desc' as const},take:1}};
function dto(v:Prisma.ViolationGetPayload<{include:typeof include}>){return {...v,currency:'ILS',location:{latitude:v.latitude,longitude:v.longitude},zoneCode:v.zone?.code,evidenceId:v.evidence?.id,appealId:v.appeals[0]?.id,zone:undefined,evidence:undefined,appeals:undefined};}
export async function list(userId:string,vehicleId?:string){return (await db.violation.findMany({where:{...(vehicleId?{vehicleId}:{}),vehicle:{users:{some:{userId,unlinkedAt:null}}}},include,orderBy:{issuedAt:'desc'},take:200})).map(dto);}
export async function get(userId:string,id:string){return dto(requireValue(await db.violation.findFirst({where:{id,vehicle:{users:{some:{userId,unlinkedAt:null}}}},include})));}
export async function evidence(userId:string,id:string){await get(userId,id);const e=await db.violationEvidence.findUnique({where:{violationId:id},include:{photos:{include:{upload:true}}}});if(!e)return null;
 const urls=await Promise.all(e.photos.map(async p=>({...p,url:await signedUrl(p.upload.objectKey)})));return {...e,photos:undefined,location:{latitude:e.latitude,longitude:e.longitude},vehiclePhotoUrl:urls.find(p=>p.kind==='vehicle')?.url??'',plateCropUrl:urls.find(p=>p.kind==='plate')?.url,additionalPhotoUrls:urls.filter(p=>p.kind==='additional').map(p=>p.url)};}
export async function pay(userId:string,id:string,key:string){await idempotent(userId,`violation:${id}`,key,{},async tx=>{await lock(tx,`violation:${id}`);const v=requireValue(await tx.violation.findUnique({where:{id}}));await vehicleAccess(tx,userId,v.vehicleId);if(v.status==='paid')return v;assert(['unpaid','overdue'].includes(v.status),'VIOLATION_NOT_PAYABLE','This violation cannot be paid in its current state',409);
 const t=await post(tx,userId,{amount:-v.amount,type:'violation_payment',title:'Violation Payment',titleAr:'دفع مخالفة',violationId:id});const result=await tx.violation.update({where:{id},data:{status:'paid',paidAt:new Date(),paymentTransactionId:t.id}});await notify(tx,userId,'payment_success','Violation paid','تم دفع المخالفة',v.reference,v.reference,`/violations/${id}`);return result;});return get(userId,id);}
export async function upload(userId:string,file:{buffer:Buffer;mimetype:string;originalname:string}){const id=randomUUID(),key=`users/${userId}/${id}`;await put(key,file.buffer,file.mimetype);const u=await db.upload.create({data:{id,userId,objectKey:key,name:file.originalname.slice(0,200),mimeType:file.mimetype,sizeBytes:file.buffer.length}});return {...u,uri:await signedUrl(key)};}
export async function appeal(userId:string,id:string,input:{reason:string;notes:string;attachmentIds:string[]}){const result=await atomic(async tx=>{await lock(tx,`violation:${id}`);const v=requireValue(await tx.violation.findUnique({where:{id}}));await vehicleAccess(tx,userId,v.vehicleId);assert(['unpaid','overdue'].includes(v.status),'APPEAL_NOT_ALLOWED','This violation cannot be appealed in its current state',409);
 const uploads=await tx.upload.findMany({where:{id:{in:input.attachmentIds},userId}});assert(uploads.length===new Set(input.attachmentIds).size,'INVALID_UPLOAD','An attachment is missing or belongs to another user');
 const a=await tx.appeal.create({data:{userId,violationId:id,reason:input.reason,notes:input.notes,attachments:{create:uploads.map(u=>({uploadId:u.id}))}}});await tx.violation.update({where:{id},data:{status:'appealed'}});return a;});return getAppeal(userId,result.id);}
export async function getAppeal(userId:string,id:string){const a=requireValue(await db.appeal.findFirst({where:{id,userId},include:{attachments:{include:{upload:true}}}}));return {...a,attachments:await Promise.all(a.attachments.map(async p=>({...p.upload,uri:await signedUrl(p.upload.objectKey)})))};}
