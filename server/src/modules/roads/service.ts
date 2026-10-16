import { db,atomic,lock,type Tx } from '../../database/client';
import type { CheckpointStatus, Availability } from '@prisma/client';
import { aggregate } from '../reports/aggregation';
import { assert,requireValue } from '../../utils/errors';
import { event } from '../../realtime/outbox';
import { announcePoints,settlePoints } from '../trust/rewards';
export async function checkpoints(){const rows=await db.roadCheckpoint.findMany({where:{active:true},include:{reports:{where:{hidden:false,reportedAt:{gte:new Date(Date.now()-21600000)}}}}});return rows.map(c=>({...c,reports:undefined,location:{latitude:c.latitude,longitude:c.longitude},...aggregate(c.reports,90,360),status:aggregate(c.reports,90,360).status??'open'}));}
export async function feed(limit=25){return (await db.checkpointReport.findMany({where:{hidden:false},take:limit,orderBy:{reportedAt:'desc'},include:{checkpoint:true}})).map(r=>({...r,checkpoint:undefined,checkpointNameAr:r.checkpoint.nameAr,checkpointNameEn:r.checkpoint.nameEn}));}
async function reward(tx:Tx,userId:string,placeId:string,refId:string,reason:'road_report'|'zone_report'){
 const last=await tx.pointsEntry.findFirst({where:{userId,placeId,createdAt:{gt:new Date(Date.now()-1800000)}}});if(last)return undefined;
 const p=await tx.pointsEntry.create({data:{userId,placeId,reason,points:5,...(reason==='road_report'?{roadReportId:refId}:{parkingReportId:refId})}});const notification=await announcePoints(tx,p);return {...p,refId,notification};
}
export async function reportRoad(userId:string,checkpointId:string,status:CheckpointStatus){return atomic(async tx=>{await lock(tx,`report:${userId}:${checkpointId}`);const cp=requireValue(await tx.roadCheckpoint.findFirst({where:{id:checkpointId,active:true}}));
 const last=await tx.checkpointReport.findFirst({where:{userId,checkpointId,reportedAt:{gt:new Date(Date.now()-60000)}}});assert(!last,'REPORT_COOLDOWN','Wait a minute before reporting this place again',429);
 const r=await tx.checkpointReport.create({data:{userId,checkpointId,status}});const points=await reward(tx,userId,checkpointId,r.id,'road_report');await event(tx,'checkpoint.updated',{checkpointId});return {event:{...r,checkpointNameAr:cp.nameAr,checkpointNameEn:cp.nameEn},points};});}
export async function reportZone(userId:string,zoneId:string,availability:Availability){return atomic(async tx=>{await lock(tx,`report:${userId}:${zoneId}`);requireValue(await tx.parkingZone.findFirst({where:{id:zoneId,active:true}}));
 assert(!await tx.parkingReport.findFirst({where:{userId,zoneId,reportedAt:{gt:new Date(Date.now()-60000)}}}),'REPORT_COOLDOWN','Wait a minute before reporting this place again',429);
 const report=await tx.parkingReport.create({data:{userId,zoneId,availability}});const points=await reward(tx,userId,zoneId,report.id,'zone_report');await event(tx,'parking.availability.updated',{zoneId});return {report,points};});}
export async function zoneReports(zoneId:string){return db.parkingReport.findMany({where:{zoneId,reportedAt:{gte:new Date(Date.now()-7200000)}},orderBy:{reportedAt:'desc'},take:100});}
export async function verifyPoints(now=new Date()){const pending=await db.pointsEntry.findMany({where:{state:'pending',createdAt:{lte:new Date(now.getTime()-900000)}},take:500});for(const entry of pending){await atomic(async tx=>{const end=new Date(entry.createdAt.getTime()+900000);let conflicting=false;
 if(entry.roadReportId){const original=await tx.checkpointReport.findUniqueOrThrow({where:{id:entry.roadReportId}});conflicting=original.hidden||!!await tx.checkpointReport.findFirst({where:{checkpointId:entry.placeId,userId:{not:entry.userId},hidden:false,status:{not:original.status},reportedAt:{gt:entry.createdAt,lte:end}}});}
 else if(entry.parkingReportId){const original=await tx.parkingReport.findUniqueOrThrow({where:{id:entry.parkingReportId}});conflicting=!!await tx.parkingReport.findFirst({where:{zoneId:entry.placeId,userId:{not:entry.userId},availability:{not:original.availability},reportedAt:{gt:entry.createdAt,lte:end}}});}
 // A map incident stands unless other drivers said it was not there.
 else if(entry.incidentReportId){const original=await tx.roadReport.findUniqueOrThrow({where:{id:entry.incidentReportId}});conflicting=original.status==='disputed'||original.status==='resolved'||original.rejectionCount>original.confirmationCount;}
 await settlePoints(tx,entry,!conflicting,now);});}}
