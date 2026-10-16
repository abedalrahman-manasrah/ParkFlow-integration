import { db,type Tx } from '../../database/client';
import { incidentReportPoints,rewardPerPoint } from './rewards';
export const tiers=[{tier:'bronze',min:0,discountPercent:0},{tier:'silver',min:100,discountPercent:5},{tier:'gold',min:250,discountPercent:10},{tier:'platinum',min:500,discountPercent:15}];
export function trustScore(input:{phone:boolean;email?:boolean;vehicles:number;paid:number;reports:number;reportPoints:number;unpaid:number}){
 const factors=[{key:input.email?'verified_email':'verified_phone',count:(input.email||input.phone)?1:0,points:(input.email||input.phone)?50:0},{key:'vehicle',count:input.vehicles,points:input.vehicles?20:0},{key:'paid_sessions',count:input.paid,points:Math.min(input.paid,30)*10},{key:'reports',count:input.reports,points:input.reportPoints},{key:'unpaid_fines',count:input.unpaid,points:-40*input.unpaid}];
 const score=Math.max(0,factors.reduce((n,f)=>n+f.points,0));const tier=[...tiers].reverse().find(t=>score>=t.min)!;const next=tiers.find(t=>t.min>score);return {score,tier:tier.tier,discountPercent:tier.discountPercent,next:next?{tier:next.tier,at:next.min,discountPercent:next.discountPercent}:undefined,factors};
}
export async function computeTrust(userId:string,tx:Tx=db){const [user,links,paid,ledger]=await Promise.all([tx.user.findUniqueOrThrow({where:{id:userId}}),tx.userVehicle.findMany({where:{userId,unlinkedAt:null}}),tx.parkingSession.count({where:{userId,status:{in:['COMPLETED','EXPIRED']},paymentStatus:'paid'}}),tx.pointsEntry.findMany({where:{userId},orderBy:{createdAt:'desc'}})]);
 const earned=await tx.walletTransaction.aggregate({where:{wallet:{userId},type:'reward',status:'completed'},_sum:{amount:true}});
 const unpaid=await tx.violation.count({where:{vehicleId:{in:links.map(v=>v.vehicleId)},status:{in:['unpaid','overdue']}}});const verified=ledger.filter(e=>e.state==='verified');
 const summary=trustScore({phone:!!user.phoneVerifiedAt,email:!!user.emailVerifiedAt,vehicles:links.length,paid,reports:verified.length,reportPoints:verified.reduce((s,e)=>s+e.points,0),unpaid});
 return {...summary,pendingPoints:ledger.filter(e=>e.state==='pending').reduce((s,e)=>s+e.points,0),recent:ledger.slice(0,10).map(e=>({...e,refId:e.roadReportId??e.parkingReportId??e.incidentReportId})),rewards:{perPointMinor:rewardPerPoint(),incidentReportPoints:incidentReportPoints(),earnedMinor:earned._sum.amount??0}};
}
export async function recalculate(userId:string){const s=await computeTrust(userId);await db.trustProfile.upsert({where:{userId},create:{userId,score:s.score,tier:s.tier,discountPercent:s.discountPercent},update:{score:s.score,tier:s.tier,discountPercent:s.discountPercent}});return s;}
