import { db } from '../../database/client';
import { requireValue } from '../../utils/errors';
import { aggregate } from '../reports/aggregation';
import { distanceMeters } from '../../utils/geo';
import type { Prisma } from '@prisma/client';
export const zoneInclude={operator:true,tariffs:{orderBy:{validFrom:'desc' as const}},operatingHours:true,reports:{where:{reportedAt:{gte:new Date(Date.now()-7200000)}}},snapshots:{orderBy:{recordedAt:'desc' as const},take:1}};
export function zoneDto(z:Prisma.ParkingZoneGetPayload<{include:typeof zoneInclude}>){const now=new Date();const tariff=z.tariffs.find(t=>t.validFrom<=now&&(!t.validTo||t.validTo>now));const crowd=aggregate(z.reports.map(r=>({...r,status:r.availability})),30,120);const snapshot=z.snapshots[0];const baseAvailability=snapshot&&now.getTime()-snapshot.recordedAt.getTime()<7200000?snapshot.availability:'unknown';return {...z,location:{latitude:z.latitude,longitude:z.longitude},operatorName:z.operator.name,tariff,availability:crowd.status??baseAvailability,crowd:crowd.status?{availability:crowd.status,baseAvailability,reportCount:crowd.reportCount,minutesSinceReport:crowd.minutesSinceReport}:undefined,tariffs:undefined,reports:undefined,snapshots:undefined,operator:undefined};}
export async function listZones(query:{search?:string;lat?:number;lng?:number;radius?:number}={}){
 const rows=await db.parkingZone.findMany({where:{active:true,...(query.search?{OR:['name','nameAr','code','city'].map(k=>({[k]:{contains:query.search,mode:'insensitive'}}))}:{})},include:{...zoneInclude,reports:{where:{reportedAt:{gte:new Date(Date.now()-7200000)}}}}});
 return rows.map(zoneDto).filter(z=>z.tariff).filter(z=>query.lat==null||query.lng==null||distanceMeters(z.location,{latitude:query.lat,longitude:query.lng})<=(query.radius??5000));
}
export async function getZone(id:string){const z=requireValue(await db.parkingZone.findUnique({where:{id},include:{...zoneInclude,reports:{where:{reportedAt:{gte:new Date(Date.now()-7200000)}}}}}));return zoneDto(z);}
export async function byCode(code:string){let normalized=code.trim().toUpperCase();try{normalized=new URL(code).pathname.split('/').filter(Boolean).pop()!.toUpperCase();}catch{}const z=requireValue(await db.parkingZone.findUnique({where:{code:normalized}}));return getZone(z.id);}
export async function facility(id:string){const f=requireValue(await db.parkingFacility.findUnique({where:{id}}));return {...f,location:{latitude:f.latitude,longitude:f.longitude},availability:'unknown'};}
