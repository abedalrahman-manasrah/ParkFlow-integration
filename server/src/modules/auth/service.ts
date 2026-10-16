import { createHmac,randomInt,randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { developmentPhoneLoginEnabled, developmentEmailLoginEnabled, requireAuthMethod, requireOtpEnabled } from '../../config/developmentAuth';
import { redis } from '../../database/redis';
import { db,atomic,lock,type Tx } from '../../database/client';
import { emailProvider } from '../../providers/email';
import { z } from 'zod';
import { assert,ApiError,requireValue } from '../../utils/errors';
import { userView } from '../users/service';
export const digest=(v:string)=>createHmac('sha256',env.JWT_REFRESH_SECRET).update(v).digest('hex');
export const normalizeEmail=(value:string)=>z.email().max(254).parse(value.trim().toLowerCase());
export const emailRequestSchema=z.object({
 email:z.string().trim().toLowerCase().pipe(z.email().max(254)),
 purpose:z.enum(['register','login']).optional(),
 fullName:z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value,context)=>{
 if(value.purpose==='register'&&!value.fullName)context.addIssue({code:'custom',path:['fullName'],message:'Name is required to register'});
});
export const devEmailLoginSchema=emailRequestSchema;
const emailChallengeLifetime=300;
const emailChallengeKey=(id:string)=>`otp:email:${id}`;
const emailPrefix=(email:string)=>`otp:email:${digest(email)}:`;
// Reserve the address budget and replace its challenge as one operation across API processes.
const prepareEmailChallenge=`
 local locked=redis.call('TTL',KEYS[1])
 if locked>0 then return {'OTP_LOCKED',locked} end
 local cooldown=redis.call('TTL',KEYS[2])
 if cooldown>0 then return {'OTP_COOLDOWN',cooldown} end
 if tonumber(redis.call('GET',KEYS[3]) or '0')>=5 then return {'OTP_SEND_LIMIT',redis.call('TTL',KEYS[3])} end
 if tonumber(redis.call('GET',KEYS[4]) or '0')>=10 then return {'OTP_SEND_LIMIT',redis.call('TTL',KEYS[4])} end
 if redis.call('INCR',KEYS[3])==1 then redis.call('EXPIRE',KEYS[3],3600) end
 if redis.call('INCR',KEYS[4])==1 then redis.call('EXPIRE',KEYS[4],86400) end
 redis.call('SET',KEYS[2],ARGV[1],'EX',60)
 local previous=redis.call('GET',KEYS[5])
 if previous then redis.call('DEL',ARGV[6]..previous) end
 redis.call('SET',KEYS[5],ARGV[1],'EX',ARGV[7])
 redis.call('HSET',KEYS[6],'email',ARGV[2],'purpose',ARGV[3],'fullName',ARGV[4],'hash',ARGV[5],'ready','0')
 redis.call('EXPIRE',KEYS[6],ARGV[7])
 return {'OK',60}
`;
const consumeEmailChallenge=`
 local locked=redis.call('TTL',KEYS[4])
 if locked>0 then return {'OTP_LOCKED',locked} end
 if redis.call('GET',KEYS[2])~=ARGV[1] or redis.call('HGET',KEYS[1],'ready')~='1' then return {'OTP_EXPIRED',0} end
 if redis.call('HGET',KEYS[1],'hash')~=ARGV[2] then
  local tries=redis.call('INCR',KEYS[3])
  redis.call('EXPIRE',KEYS[3],900)
  if tries>=5 then
   redis.call('SET',KEYS[4],'1','EX',900)
   redis.call('DEL',KEYS[1],KEYS[2],KEYS[3])
   return {'OTP_LOCKED',900}
  end
  return {'OTP_INVALID',0}
 end
 local email=redis.call('HGET',KEYS[1],'email')
 local purpose=redis.call('HGET',KEYS[1],'purpose')
 local fullName=redis.call('HGET',KEYS[1],'fullName')
 redis.call('DEL',KEYS[1],KEYS[2],KEYS[3])
 return {'OK',email,purpose,fullName}
`;
const ADMIN_SESSION_MAX_AGE_MS=8*60*60*1000;
export type WebApplication='customer'|'management';
export type WebBinding={webApplication:WebApplication;webBrowserId:string};
export type AuthMeta={device?:string;ip?:string;webApplication?:WebApplication;webBrowserId?:string};
export type NativeSession={userId:string;accessToken:string;refreshToken:string;expiresAt:string};
// Always acquire the user lock before the family lock. In particular, logout-all
// must exclude new issue/rotation until its revocation has committed.
export async function lockSessionFamily(tx:Tx,userId:string,familyId?:string){
 await lock(tx,`auth:user:${userId}`);
 if(familyId)await lock(tx,`refresh:${familyId}`);
}
export async function revokeSessionFamily(userId:string,familyId:string){
 await atomic(async tx=>{
  await lockSessionFamily(tx,userId,familyId);
  await tx.refreshToken.updateMany({where:{userId,familyId,revokedAt:null},data:{revokedAt:new Date()}});
 },'ReadCommitted');
}
// Call only while holding this user's/family's lifecycle locks. The oldest
// ancestor establishes the admin deadline even after refresh rotation.
export async function liveSessionFamily(tx:Tx,userId:string,familyId:string){
 const current=await tx.refreshToken.findFirst({where:{userId,familyId,revokedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},include:{user:true}});
 // Additive defaults on old rows cannot prove their original JWT mode.
 // Access/refresh remain valid; a signed refresh issues authoritative metadata.
 if(!current||current.metadataVersion!==1||current.user.status!=='ACTIVE')return null;
 if((current.developmentPhoneLogin&&!developmentPhoneLoginEnabled())||(current.developmentEmailLogin&&!developmentEmailLoginEnabled()))return null;
 if(await revokeExpiredAdminFamily(tx,current.user,familyId))return null;
 return current;
}
async function revokeExpiredAdminFamily(tx:Tx,user:Pick<User,'id'|'role'>,familyId:string){
 if(user.role!=='ADMIN')return false;
 // Include revoked ancestors: refreshing must never move the absolute deadline.
 const oldest=await tx.refreshToken.findFirst({where:{userId:user.id,familyId},orderBy:{createdAt:'asc'},select:{createdAt:true}});
 if(oldest&&Date.now()-oldest.createdAt.getTime()<ADMIN_SESSION_MAX_AGE_MS)return false;
 await tx.refreshToken.updateMany({where:{userId:user.id,familyId,revokedAt:null},data:{revokedAt:new Date()}});
 return true;
}
export async function requestOtp(input:z.input<typeof emailRequestSchema>){
 requireAuthMethod('email');
 requireOtpEnabled();
 const parsed=emailRequestSchema.parse(input),email=normalizeEmail(parsed.email),prefix=emailPrefix(email);
 const challengeId=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0'),key=emailChallengeKey(challengeId);
 const prepared=await redis.eval(prepareEmailChallenge,6,
  prefix+'lock',prefix+'cooldown',prefix+'hour',prefix+'day',prefix+'active',key,
  challengeId,email,parsed.purpose??'legacy',parsed.fullName??'',digest(challengeId+code),'otp:email:',emailChallengeLifetime,
 ) as [string,number];
 if(prepared[0]!=='OK')throw new ApiError(429,prepared[0],'Please wait before trying again',{retryAfterSeconds:Math.max(1,Number(prepared[1]))});
 const expiresAt=new Date(Date.now()+emailChallengeLifetime*1000).toISOString();
 try {
  await emailProvider.sendOtp(email,code);
  const activated=await redis.eval(`
   if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('EXISTS',KEYS[2])==0 then return 0 end
   redis.call('HSET',KEYS[2],'ready','1');return 1
  `,2,prefix+'active',key,challengeId);
  if(Number(activated)!==1)throw new Error('Challenge superseded or expired during delivery');
 }catch {
  await redis.eval(`
   redis.call('DEL',KEYS[2])
   if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end
   if redis.call('GET',KEYS[3])==ARGV[1] then redis.call('DEL',KEYS[3]) end
   return 1
  `,3,prefix+'active',key,prefix+'cooldown',challengeId);
  // Keep send accounting: provider failures may be retried, but never without a budget.
  throw new ApiError(503,'EMAIL_DELIVERY_FAILED','Unable to send the verification email. Please try again.');
 }
 return {challengeId,email,resendAfterSeconds:60,expiresAt};
}
export async function issue(tx:Tx,user:User,meta:AuthMeta,familyId:string=randomUUID(),developmentPhoneLogin=false,developmentEmailLogin=false):Promise<NativeSession>{
 await lockSessionFamily(tx,user.id,familyId);
 user=requireValue(await tx.user.findUnique({where:{id:user.id}}));
 assert(user.status==='ACTIVE','ACCOUNT_SUSPENDED','This account is suspended',403);
 const id=randomUUID(),expiresAt=new Date(Date.now()+env.REFRESH_TOKEN_TTL*1000);
 assert(Boolean(meta.webApplication)===Boolean(meta.webBrowserId),'UNAUTHORIZED','Invalid session binding',401);
 const binding=meta.webApplication?{webApplication:meta.webApplication,webBrowserId:meta.webBrowserId,familyId}:{};
 const mode={...(developmentPhoneLogin?{developmentPhoneLogin:true}:{}),...(developmentEmailLogin?{developmentEmailLogin:true}:{})};
 const refreshToken=jwt.sign({sub:user.id,jti:id,familyId,kind:'refresh',...mode,...binding},env.JWT_REFRESH_SECRET,{algorithm:'HS256',expiresIn:env.REFRESH_TOKEN_TTL,issuer:'parkflow',audience:'parkflow-refresh'});
 await tx.refreshToken.create({data:{id,userId:user.id,tokenHash:digest(refreshToken),familyId,expiresAt,device:meta.device,ip:meta.ip,transport:meta.webApplication?'web':'native',metadataVersion:1,developmentPhoneLogin,developmentEmailLogin}});
 return {userId:user.id,accessToken:jwt.sign({sub:user.id,sid:id,kind:'access',...mode,...binding},env.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:env.ACCESS_TOKEN_TTL,issuer:'parkflow',audience:'parkflow-api'}),refreshToken,expiresAt:new Date(Date.now()+env.ACCESS_TOKEN_TTL*1000).toISOString()};
}
export async function verifyOtp(input:{challengeId:string;code:string},meta:AuthMeta){
 requireAuthMethod('email');
 requireOtpEnabled();
 const storedEmail=await redis.hget(emailChallengeKey(input.challengeId),'email');
 assert(storedEmail,'OTP_EXPIRED','The code is invalid or expired',401);
 const prefix=emailPrefix(storedEmail);
 const result=await redis.eval(consumeEmailChallenge,4,
  emailChallengeKey(input.challengeId),prefix+'active',prefix+'attempts',prefix+'lock',
  input.challengeId,digest(input.challengeId+input.code),
 ) as string[];
 if(result[0]==='OTP_LOCKED')throw new ApiError(429,'OTP_LOCKED','Too many incorrect codes. Try again later.',{retryAfterSeconds:Number(result[1])});
 assert(result[0]==='OK',result[0]!,'The code is invalid or expired',401);
 const [,email,purpose,fullName]=result;
 return atomic(async tx=>{
 await lock(tx,`email:${email!}`);
 let existing=await tx.user.findUnique({where:{email:email!}});
 if(existing){await lockSessionFamily(tx,existing.id);existing=await tx.user.findUniqueOrThrow({where:{id:existing.id}});}
 assert(!existing || existing.emailVerifiedAt || existing.emailVerificationPending,'EMAIL_MIGRATION_REQUIRED','Contact support to link your existing account to a verified email',409);
 assert(!existing||existing.status==='ACTIVE','ACCOUNT_SUSPENDED','This account is suspended',403);
 assert(existing||purpose!=='login','EMAIL_ACCOUNT_NOT_FOUND','Create an account with this email first',404);
 const user=existing
  ?await tx.user.update({where:{id:existing.id},data:{lastLoginAt:new Date(),...(existing.emailVerificationPending?{emailVerifiedAt:new Date(),emailVerificationPending:false}:{})}})
  :await tx.user.create({data:{email:email!,emailVerifiedAt:new Date(),fullName:fullName!,firstName:fullName!.split(/\s+/)[0]??'',lastName:fullName!.split(/\s+/).slice(1).join(' '),lastLoginAt:new Date(),wallet:{create:{}}}});
 return {session:await issue(tx,user,meta),user:userView(user),isNewUser:!user.profileCompletedAt};
 },'ReadCommitted');
}
export async function devLogin(input:z.input<typeof devEmailLoginSchema>,meta:AuthMeta){
 requireAuthMethod('email');
 assert(developmentEmailLoginEnabled(),'DEV_LOGIN_DISABLED','Development login is disabled',403);
 const parsed=devEmailLoginSchema.parse(input);
 const email=normalizeEmail(parsed.email);
 return atomic(async tx=>{
  await lock(tx,`email:${email}`);
  let existing=await tx.user.findUnique({where:{email}});
  if(existing){await lockSessionFamily(tx,existing.id);existing=await tx.user.findUniqueOrThrow({where:{id:existing.id}});}
  assert(!existing||existing.status==='ACTIVE','ACCOUNT_SUSPENDED','This account is suspended',403);
  assert(existing||parsed.purpose!=='login','EMAIL_ACCOUNT_NOT_FOUND','Create an account with this email first',404);
  const fullName=parsed.fullName??'';
  const user=existing
   ?await tx.user.update({where:{id:existing.id},data:{lastLoginAt:new Date()}})
   :await tx.user.create({data:{email,emailVerificationPending:true,fullName,firstName:fullName.split(/\s+/)[0]??'',lastName:fullName.split(/\s+/).slice(1).join(' '),lastLoginAt:new Date(),wallet:{create:{}}}});
  await tx.auditLog.create({data:{actorUserId:user.id,action:'auth.development_email_login',resourceType:'user',resourceId:user.id,ip:meta.ip,userAgent:meta.device}});
  return {session:await issue(tx,user,meta,undefined,false,true),user:userView(user),isNewUser:!user.profileCompletedAt};
 },'ReadCommitted');
}
function assertTransport(v:jwt.JwtPayload,binding?:WebBinding){
 if(binding)assert(v.webApplication===binding.webApplication&&v.webBrowserId===binding.webBrowserId&&typeof v.familyId==='string','UNAUTHORIZED','Invalid browser session binding',401);
 else assert(v.webApplication===undefined&&v.webBrowserId===undefined,'UNAUTHORIZED','Browser credentials require the cookie transport',401);
}
function accessClaims(token:string,binding?:WebBinding){try{
 const v=jwt.verify(token,env.JWT_ACCESS_SECRET,{algorithms:['HS256'],issuer:'parkflow',audience:'parkflow-api'}) as jwt.JwtPayload;
 assert(!v.developmentPhoneLogin||developmentPhoneLoginEnabled(),'UNAUTHORIZED','Development session has ended. Sign in with a verification code.',401);
 assert(!v.developmentEmailLogin||developmentEmailLoginEnabled(),'UNAUTHORIZED','Development email session has ended. Sign in again.',401);
 assertTransport(v,binding);
 assert(v.kind==='access'&&typeof v.sub==='string'&&typeof v.sid==='string'&&typeof v.exp==='number','UNAUTHORIZED','Invalid token',401);return {userId:v.sub,sid:v.sid,exp:v.exp,...(binding?{familyId:v.familyId as string}:{})};
 }catch{throw new ApiError(401,'UNAUTHORIZED','Invalid or expired access token');}}
export function verifyAccess(token:string){return accessClaims(token);}
export function verifyWebAccess(token:string,binding:WebBinding){return accessClaims(token,binding);}
async function authenticateClaims(claims:ReturnType<typeof accessClaims>){const record=await db.refreshToken.findUnique({where:{id:claims.sid},include:{user:true}});
 assert(record&&record.userId===claims.userId&&(!claims.familyId||record.familyId===claims.familyId)&&!record.revokedAt&&record.expiresAt>new Date()&&record.user.status==='ACTIVE','UNAUTHORIZED','Session has ended',401);
 if(record.user.role==='ADMIN'){
  const role=await atomic(async tx=>{
   await lockSessionFamily(tx,record.userId,record.familyId);
   const current=await tx.refreshToken.findUnique({where:{id:record.id},include:{user:true}});
   if(!current||current.userId!==claims.userId||current.revokedAt||current.expiresAt<=new Date()||current.user.status!=='ACTIVE')return null;
   if(await revokeExpiredAdminFamily(tx,current.user,current.familyId))return null;
   return current.user.role;
  },'ReadCommitted');
  // Throw only after the transaction commits, preserving family revocation.
  assert(role,'UNAUTHORIZED','Admin session has ended. Sign in again.',401);return {...claims,role};
 }
 return {...claims,role:record.user.role};}
export async function authenticate(token:string){return authenticateClaims(verifyAccess(token));}
export async function authenticateWeb(token:string,binding:WebBinding){return authenticateClaims(verifyWebAccess(token,binding));}
function refreshClaims(token:string,binding?:WebBinding){
 let claims:jwt.JwtPayload;
 try{claims=jwt.verify(token,env.JWT_REFRESH_SECRET,{algorithms:['HS256'],issuer:'parkflow',audience:'parkflow-refresh'}) as jwt.JwtPayload;}catch{throw new ApiError(401,'UNAUTHORIZED','Refresh token expired');}
 assertTransport(claims,binding);
 assert(claims.kind==='refresh'&&typeof claims.sub==='string'&&typeof claims.jti==='string'&&typeof claims.familyId==='string'&&typeof claims.exp==='number'&&(!claims.developmentPhoneLogin||developmentPhoneLoginEnabled())&&(!claims.developmentEmailLogin||developmentEmailLoginEnabled()),'UNAUTHORIZED','Session has ended. Sign in again.',401);
 return claims;
}
// Bootstrap and conditional logout require a signed token AND its stored hash.
// Merely knowing a browser-slot id or family id can never restore a login.
export async function inspectWebRefresh(token:string,binding:WebBinding,allowRevoked=false){
 const claims=refreshClaims(token,binding);
 const record=await db.refreshToken.findUnique({where:{tokenHash:digest(token)},include:{user:true}});
 assert(record&&record.id===claims.jti&&record.userId===claims.sub&&record.familyId===claims.familyId&&record.expiresAt>new Date(),'UNAUTHORIZED','Invalid browser refresh proof',401);
 if(!allowRevoked){
  assert(!record.revokedAt&&record.user.status==='ACTIVE','UNAUTHORIZED','Session has ended',401);
  if(record.user.role==='ADMIN'){
   const alive=await atomic(async tx=>{
    await lockSessionFamily(tx,record.userId,record.familyId);
    const current=await tx.refreshToken.findUnique({where:{id:record.id},include:{user:true}});
    if(!current||current.revokedAt||current.expiresAt<=new Date()||current.user.status!=='ACTIVE')return false;
    return !(await revokeExpiredAdminFamily(tx,current.user,current.familyId));
   },'ReadCommitted');
   assert(alive,'UNAUTHORIZED','Admin session has ended. Sign in again.',401);
  }
 }
 return record;
}
async function rotateRefresh(token:string,meta:AuthMeta,binding?:WebBinding){
 const claims=refreshClaims(token,binding);
 const result=await atomic(async tx=>{
 await lockSessionFamily(tx,claims.sub!,claims.familyId as string);
 const current=await tx.refreshToken.findUnique({where:{tokenHash:digest(token)},include:{user:true}});
 if(!current||current.id!==claims.jti||current.userId!==claims.sub||current.familyId!==claims.familyId)return null;
 if(current.revokedAt){if(!binding)await tx.refreshToken.updateMany({where:{userId:current.userId,familyId:current.familyId,revokedAt:null},data:{revokedAt:new Date()}});return null;}
 if(await revokeExpiredAdminFamily(tx,current.user,current.familyId))return null;
 if(current.expiresAt<=new Date()||current.user.status!=='ACTIVE')return null;
 const next=await issue(tx,current.user,{device:meta.device,ip:meta.ip,...binding},current.familyId,claims.developmentPhoneLogin===true,claims.developmentEmailLogin===true);
 const nextClaims=jwt.decode(next.refreshToken) as jwt.JwtPayload;
 await tx.refreshToken.update({where:{id:current.id},data:{revokedAt:new Date(),replacedBy:nextClaims.jti}});return next;
 },'ReadCommitted');
 assert(result,binding?'SESSION_CHANGED':'UNAUTHORIZED','Refresh token was revoked or reused',401);return result;
}
export async function refresh(token:string,meta:AuthMeta){return rotateRefresh(token,meta);}
export async function refreshWeb(token:string,meta:AuthMeta&WebBinding){return rotateRefresh(token,meta,meta);}
export async function logout(userId:string,sid:string,all=false){
 await atomic(async tx=>{
  await lockSessionFamily(tx,userId);
  const initiating=await tx.refreshToken.findUnique({where:{id:sid}});
  if(!initiating||initiating.userId!==userId)return;
  if(!all)await lockSessionFamily(tx,userId,initiating.familyId);
  // The initiating sid can already be a revoked ancestor after a concurrent
  // refresh. Revoke the current family, including its committed successor.
  await tx.refreshToken.updateMany({where:{userId,...(all?{}:{familyId:initiating.familyId}),revokedAt:null},data:{revokedAt:new Date()}});
 },'ReadCommitted');
}
