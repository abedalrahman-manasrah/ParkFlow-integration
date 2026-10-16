import { assert } from '../../utils/errors';
export interface Rate {hourlyRate:number;incrementMinutes:number;freeMinutes:number;minimumCharge:number;dailyCap?:number|null;maxStayMinutes?:number|null}
export function computeCost(rate:Rate,seconds:number){if(seconds/60<=rate.freeMinutes)return 0;const minutes=Math.ceil((seconds/60-rate.freeMinutes)/Math.max(1,rate.incrementMinutes))*Math.max(1,rate.incrementMinutes);const raw=Math.max(Math.round(minutes/60*rate.hourlyRate),rate.minimumCharge);return rate.dailyCap==null?raw:Math.min(raw,rate.dailyCap);}
export function prepaidCost(rate:Rate,minutes:number){const raw=Math.max(Math.round(minutes/60*rate.hourlyRate),rate.minimumCharge);return rate.dailyCap==null?raw:Math.min(raw,rate.dailyCap);}
export function discounted<T extends Rate>(rate:T,percent:number):T{const cut=(x:number)=>Math.round(x*(1-percent/100));return {...rate,hourlyRate:cut(rate.hourlyRate),minimumCharge:cut(rate.minimumCharge),dailyCap:rate.dailyCap==null?rate.dailyCap:cut(rate.dailyCap)};}
export interface Hours {weekday:number;opensAt:string;closesAt:string;closed?:boolean}
export function assertOpen(hours:Hours[],start:Date,end?:Date){
 const parts=(date:Date)=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Hebron',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>p.find(x=>x.type===t)!.value;return {day:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),minute:Number(get('hour'))*60+Number(get('minute'))};};
 const minutes=(s:string)=>{const [h,m]=s.split(':').map(Number);return h!*60+m!;};
 const open=(d:Date)=>{const p=parts(d);return hours.some(h=>!h.closed&&(h.weekday===p.day && (minutes(h.closesAt)>minutes(h.opensAt)?p.minute>=minutes(h.opensAt)&&p.minute<=minutes(h.closesAt):p.minute>=minutes(h.opensAt)) || !h.closed && h.weekday===(p.day+6)%7 && minutes(h.closesAt)<=minutes(h.opensAt)&&p.minute<=minutes(h.closesAt)));};
 assert(open(start),'ZONE_CLOSED','Parking is outside operating hours',409);
 if(end){for(let t=start.getTime();t<end.getTime();t+=60000)assert(open(new Date(t)),'ZONE_CLOSED','The duration exceeds operating hours',409);assert(open(end),'ZONE_CLOSED','The duration exceeds operating hours',409);}
}
