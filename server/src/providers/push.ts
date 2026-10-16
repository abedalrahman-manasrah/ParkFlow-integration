import { cert,getApps,initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env';
import { db } from '../database/client';
import { requireValue } from '../utils/errors';
export async function deliverPush(notificationId:string){
 const n=requireValue(await db.notification.findUnique({where:{id:notificationId},include:{user:true}}));if(n.pushedAt)return;
 const preferences=n.user.notificationPreferences as Record<string,boolean>;
 const preference=({parking_reminder:'parkingReminders',parking_expiring:'expiryWarnings',low_balance:'lowBalance',violation_issued:'violations'} as Record<string,string>)[n.type];
 if(preference&&preferences[preference]===false){await db.notification.update({where:{id:n.id},data:{pushedAt:new Date()}});return;}
 const devices=await db.deviceToken.findMany({where:{userId:n.userId}});
 const title=n.user.locale==='ar'?n.titleAr:n.title,body=n.user.locale==='ar'?n.bodyAr:n.body;
 for(const device of devices){if(device.provider==='expo'){
 const r=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',...(env.EXPO_PUSH_ACCESS_TOKEN?{Authorization:`Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}`}:{})},body:JSON.stringify({to:device.token,title,body,data:{href:n.href,notificationId:n.id}}),signal:AbortSignal.timeout(10000)});const result=await r.json() as {data?:{status?:string;details?:{error?:string}}};
 if(result.data?.details?.error==='DeviceNotRegistered'){await db.deviceToken.deleteMany({where:{id:device.id}});continue;}if(!r.ok||result.data?.status!=='ok')throw new Error('Expo push failed');
 }else{
 if(!getApps().length){if(!env.FIREBASE_PROJECT_ID||!env.FIREBASE_CLIENT_EMAIL||!env.FIREBASE_PRIVATE_KEY)throw new Error('Firebase credentials missing');initializeApp({credential:cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})});}
 try{await getMessaging().send({token:device.token,notification:{title,body},data:{href:n.href??'',notificationId:n.id}});}catch(e){const code=(e as {code?:string}).code;if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code??'')){await db.deviceToken.deleteMany({where:{id:device.id}});}else throw e;}
 }}
 await db.notification.update({where:{id:n.id},data:{pushedAt:new Date()}});
}
