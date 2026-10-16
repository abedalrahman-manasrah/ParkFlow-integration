import { db,atomic,lock,type Tx } from '../../database/client';
import { assert,requireValue } from '../../utils/errors';
import type { Prisma } from '@prisma/client';
export type VehicleInput={plateNumber:string;type:string;make?:string;model?:string;year?:number;color?:string;colorHex?:string;nickname?:string;region?:string};
export async function vehicleAccess(tx:Tx,userId:string,vehicleId:string){return requireValue(await tx.userVehicle.findFirst({where:{userId,vehicleId,unlinkedAt:null},include:{vehicle:true}}),'Vehicle not linked to your account');}
function view(link:Prisma.UserVehicleGetPayload<{include:{vehicle:true}}>){return {...link.vehicle,linkId:link.id,role:link.role,nickname:link.nickname,isDefault:link.isDefault,displayName:link.nickname||[link.vehicle.make,link.vehicle.model].filter(Boolean).join(' ')||link.vehicle.plateNumber};}
export async function list(userId:string){return (await db.userVehicle.findMany({where:{userId,unlinkedAt:null},include:{vehicle:true},orderBy:{linkedAt:'asc'}})).map(view);}
export async function get(userId:string,id:string){return view(await vehicleAccess(db,userId,id));}
export async function create(userId:string,input:VehicleInput){return atomic(async tx=>{
 await lock(tx,`vehicles:${userId}`);const {nickname,...fields}=input;const plateNumber=input.plateNumber.replace(/[^0-9]/g,'');
 const region=input.region??'PS';
 const existing=await tx.vehicle.findUnique({where:{plateNumber_region:{plateNumber,region}}});
 // A plate alone is not proof of ownership. Sharing existing vehicles needs an authorized operator/admin grant.
 if(existing){const own=await tx.userVehicle.findUnique({where:{userId_vehicleId:{userId,vehicleId:existing.id}}});assert(own,'OWNERSHIP_VERIFICATION_REQUIRED','This plate is registered. Contact support to verify access.',409);assert(own.unlinkedAt,'CONFLICT','Vehicle is already linked',409);}
 const vehicle=existing??await tx.vehicle.create({data:{...fields,plateNumber,region}});
 const count=await tx.userVehicle.count({where:{userId,unlinkedAt:null}});
 const link=await tx.userVehicle.upsert({where:{userId_vehicleId:{userId,vehicleId:vehicle.id}},create:{userId,vehicleId:vehicle.id,nickname,isDefault:count===0},update:{unlinkedAt:null,nickname,isDefault:count===0},include:{vehicle:true}});return view(link);
 });}
export async function update(userId:string,id:string,input:Partial<VehicleInput>){return atomic(async tx=>{const link=await vehicleAccess(tx,userId,id);const {nickname,plateNumber,region,...fields}=input;
 assert(!plateNumber||plateNumber.replace(/[^0-9]/g,'')===link.vehicle.plateNumber,'VALIDATION','Plate changes require verification');
 assert(!region||region===link.vehicle.region,'VALIDATION','Region changes require verification');
 assert(link.role==='owner'||link.role==='manager'||Object.keys(fields).length===0,'FORBIDDEN','Only an owner can update vehicle details',403);
 await tx.vehicle.update({where:{id},data:fields});return view(await tx.userVehicle.update({where:{id:link.id},data:{nickname},include:{vehicle:true}}));});}
export async function setDefault(userId:string,id:string){await atomic(async tx=>{await lock(tx,`vehicles:${userId}`);const link=await vehicleAccess(tx,userId,id);await tx.userVehicle.updateMany({where:{userId},data:{isDefault:false}});await tx.userVehicle.update({where:{id:link.id},data:{isDefault:true}});});}
export async function unlink(userId:string,id:string){await atomic(async tx=>{await lock(tx,`vehicles:${userId}`);const link=await vehicleAccess(tx,userId,id);assert(!await tx.parkingSession.findFirst({where:{vehicleId:id,status:'ACTIVE'}}),'ACTIVE_SESSION_EXISTS','Stop parking before unlinking this vehicle',409);await tx.userVehicle.update({where:{id:link.id},data:{unlinkedAt:new Date(),isDefault:false}});if(link.isDefault){const next=await tx.userVehicle.findFirst({where:{userId,unlinkedAt:null}});if(next)await tx.userVehicle.update({where:{id:next.id},data:{isDefault:true}});}});}
export async function permits(userId:string,id:string){await vehicleAccess(db,userId,id);return (await db.permit.findMany({where:{vehicleId:id},include:{zones:true}})).map(p=>({...p,zoneIds:p.zones.map(z=>z.zoneId),status:p.status==='active'&&p.validTo<new Date()?'expired':p.status}));}
