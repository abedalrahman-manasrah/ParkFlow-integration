export function aggregate<T extends string>(reports:{status:T;reportedAt:Date;userId?:string}[],decayMinutes:number,windowMinutes:number,now=Date.now()){
 const recent=reports.filter(r=>{const age=now-r.reportedAt.getTime();return age>=0&&age<windowMinutes*60000;}).sort((a,b)=>b.reportedAt.getTime()-a.reportedAt.getTime());
 // Only the latest report per driver contributes, preventing one account from multiplying its vote.
 const seen=new Set<string>();const votes=recent.filter(r=>{if(!r.userId)return true;if(seen.has(r.userId))return false;seen.add(r.userId);return true;});
 const score=new Map<T,number>();for(const r of votes)score.set(r.status,(score.get(r.status)??0)+Math.exp(-(now-r.reportedAt.getTime())/60000/decayMinutes));
 const status=[...score].sort((a,b)=>b[1]-a[1])[0]?.[0];return {status,reportCount:votes.length,minutesSinceReport:recent[0]?Math.round((now-recent[0].reportedAt.getTime())/60000):undefined,assumed:!status};
}
