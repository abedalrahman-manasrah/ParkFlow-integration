import { cert,getApps,initializeApp } from 'firebase-admin/app';
import { env } from '../config/env';
import { atomic,db,type Tx } from '../database/client';
import { liveSessionFamily,lockSessionFamily } from '../modules/auth/service';
import { lockDeviceToken } from '../modules/notifications/service';
import { requireValue } from '../utils/errors';
import type { DeviceToken,Notification } from '@prisma/client';

export const PUSH_LIFETIME_MS=7*24*60*60_000;

type FcmAuthorization={projectId:string;accessToken:string};
async function prepareFcm():Promise<FcmAuthorization>{
 let app=getApps()[0];
 if(!app){
  if(!env.FIREBASE_PROJECT_ID||!env.FIREBASE_CLIENT_EMAIL||!env.FIREBASE_PRIVATE_KEY)throw new Error('Firebase credentials missing');
  app=initializeApp({projectId:env.FIREBASE_PROJECT_ID,credential:cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})});
 }
 const projectId=app.options.projectId??env.FIREBASE_PROJECT_ID;
 if(!projectId||!app.options.credential)throw new Error('Firebase credentials missing');
 // OAuth may refresh/retry, but contains no notification content and holds no
 // session locks. Delivery revalidates ownership and the family afterward.
 const authorization=await app.options.credential.getAccessToken();
 return {projectId,accessToken:authorization.access_token};
}
function dispatchBudget(deadline:number){
 const remaining=Math.min(10000,Math.floor(deadline-performance.now()));
 if(remaining<=0)throw new Error('Push dispatch lock budget exhausted');
 return remaining;
}
async function eligibleDevice(tx:Tx,selected:DeviceToken,notification:Notification){
 await lockDeviceToken(tx,selected.token);
 const device=await tx.deviceToken.findUnique({where:{id:selected.id}});
 if(!device||device.token!==selected.token||device.userId!==notification.userId||!device.sessionFamilyId)return null;
 await lockSessionFamily(tx,device.userId,device.sessionFamilyId);
 const session=await liveSessionFamily(tx,device.userId,device.sessionFamilyId);
 if(!session)return null;
 // Durable redrive must never replay an older private payload to a new login.
 // Include revoked ancestors so normal refresh rotation keeps its eligibility.
 const origin=await tx.refreshToken.findFirst({where:{userId:device.userId,familyId:device.sessionFamilyId},orderBy:{createdAt:'asc'},select:{createdAt:true}});
 if(!origin||origin.createdAt>notification.createdAt)return null;
 const preferences=session.user.notificationPreferences as Record<string,boolean>;
 const preference=({parking_reminder:'parkingReminders',parking_expiring:'expiryWarnings',low_balance:'lowBalance',violation_issued:'violations'} as Record<string,string>)[notification.type];
 if(preference&&preferences[preference]===false)return null;
 // Recheck after credential/lock waits as well as at entry.
 if(notification.createdAt.getTime()<Date.now()-PUSH_LIFETIME_MS)return null;
 return {device,user:session.user};
}
async function sendToDevice(tx:Tx,device:DeviceToken,n:Notification,locale:string,deadline:number,fcm?:FcmAuthorization){
 const title=locale==='ar'?n.titleAr:n.title,body=locale==='ar'?n.bodyAr:n.body;
 if(device.provider==='expo'){
  const response=await fetch('https://exp.host/--/api/v2/push/send',{
   method:'POST',headers:{'Content-Type':'application/json',...(env.EXPO_PUSH_ACCESS_TOKEN?{Authorization:`Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`}:{})},
   body:JSON.stringify({to:device.token,title,body,data:{href:n.href,notificationId:n.id}}),signal:AbortSignal.timeout(dispatchBudget(deadline)),
  });
  const result=await response.json() as {data?:{status?:string;details?:{error?:string}}};
  if(result.data?.details?.error==='DeviceNotRegistered'){
   await tx.deviceToken.deleteMany({where:{id:device.id}});return;
  }
  if(!response.ok||result.data?.status!=='ok')throw new Error('Expo push failed');
  return;
 }
 if(!fcm)throw new Error('Firebase credentials missing');
 const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcm.projectId)}/messages:send`,{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${fcm.accessToken}`},
  body:JSON.stringify({message:{token:device.token,notification:{title,body},data:{href:n.href??'',notificationId:n.id}}}),
  signal:AbortSignal.timeout(dispatchBudget(deadline)),
 });
 const result=await response.json() as {name?:string;error?:{status?:string;details?:Array<{'@type'?:string;errorCode?:string}>}};
 const code=result.error?.details?.find(detail=>detail['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
 if(code==='UNREGISTERED'){
  await tx.deviceToken.deleteMany({where:{id:device.id}});return;
 }
 if(!response.ok||!result.name)throw new Error('Firebase push failed');
}

export async function deliverPush(notificationId:string){
 const notification=requireValue(await db.notification.findUnique({where:{id:notificationId}}));
 if(notification.pushedAt)return;
 if(notification.createdAt.getTime()<Date.now()-PUSH_LIFETIME_MS){
  await db.notification.updateMany({where:{id:notification.id,pushedAt:null},data:{pushedAt:new Date()}});
  return;
 }
 const devices=await db.deviceToken.findMany({where:{userId:notification.userId,sessionFamilyId:{not:null}}});
 for(const selected of devices){
  let fcm:FcmAuthorization|undefined;
  if(selected.provider!=='expo'){
   const eligible=await atomic(async tx=>Boolean(await eligibleDevice(tx,selected,notification)),'ReadCommitted');
   if(!eligible)continue;
   fcm=await prepareFcm();
  }
  // One transaction per device. Subtract lock/query time from the HTTP budget
  // so cancellation happens before the 15s transaction releases lifecycle locks.
  await atomic(async tx=>{
   const deadline=performance.now()+14000;
   const eligible=await eligibleDevice(tx,selected,notification);
   if(!eligible)return;
   const {device,user}=eligible;
   // Hold lifecycle locks through the actual cancellable provider request.
   // Worker retries reacquire locks and repeat eligibility; the SDK cannot retry
   // a personal payload after this transaction or logout has completed.
   await sendToDevice(tx,device,notification,user.locale,deadline,fcm);
  },'ReadCommitted');
 }
 // Also finish notifications with no eligible devices; a later login must not
 // replay private notifications queued for a previous session.
 await db.notification.update({where:{id:notification.id},data:{pushedAt:new Date()}});
}
