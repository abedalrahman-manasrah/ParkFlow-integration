import { beforeEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { db,atomic } from '../src/database/client';
import { redis } from '../src/database/redis';
import * as auth from '../src/modules/auth/service';
import * as vehicles from '../src/modules/vehicles/service';
import * as sessions from '../src/modules/sessions/service';
import * as wallet from '../src/modules/wallet/service';
import * as violations from '../src/modules/violations/service';
import * as roads from '../src/modules/roads/service';
import * as roadReports from '../src/modules/roadReports/service';
import { calculateConfidence } from '../src/modules/roadReports/confidence';
import * as admin from '../src/modules/admin/service';
import { computeTrust,trustScore } from '../src/modules/trust/service';
import { computeCost,assertOpen } from '../src/modules/parking/pricing';
import { aggregate } from '../src/modules/reports/aggregation';
import { routingService } from '../src/modules/routing/service';
import { validateFile } from '../src/providers/storage';
import { notify } from '../src/modules/notifications/service';
import { post } from '../src/modules/wallet/ledger';
import { emailProvider } from '../src/providers/email';
import { env } from '../src/config/env';
import * as emergency from '../src/modules/emergency/service';
const app=createApp();
const sentCode=()=>vi.mocked(emailProvider.sendOtp).mock.calls.at(-1)![1];
const key=()=>randomUUID();
let driver:Awaited<ReturnType<typeof auth.verifyOtp>>,other:Awaited<ReturnType<typeof auth.verifyOtp>>;
let vehicleId:string;
async function login(phone:string){const c=await auth.requestOtp({email:`${phone}@example.com`});return auth.verifyOtp({challengeId:c.challengeId,code:sentCode()},{});}
async function credit(userId:string,amount=10000){return atomic(tx=>post(tx,userId,{amount,type:'adjustment',title:'Test credit',titleAr:'???? ??????'}));}
const startInput=()=>({vehicleId,zoneId:'test-zone',mode:'start_stop' as const,entryMethod:'manual'});
async function backdate(id:string,minutes=65){await db.parkingSession.update({where:{id},data:{startedAt:new Date(Date.now()-minutes*60000)}});}
beforeEach(async()=>{
 vi.restoreAllMocks();vi.unstubAllGlobals();
 vi.spyOn(emailProvider,'sendOtp').mockResolvedValue();
 const tables=await db.$queryRaw<{tablename:string}[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
 await db.$executeRawUnsafe('TRUNCATE '+tables.map(t=>'"'+t.tablename.replace(/"/g,'""')+'"').join(',')+' CASCADE');
 await redis.flushdb();
 await db.parkingOperator.create({data:{id:'op',name:'Test operator'}});
 await db.parkingZone.create({data:{id:'test-zone',operatorId:'op',code:'TEST-001',name:'Test parking',nameAr:'???? ??????',city:'Ramallah',cityAr:'??? ????',latitude:31.9,longitude:35.2,kind:'garage',defaultMode:'start_stop',supportedModes:['start_stop','prepaid'],supportedEntryMethods:['manual','qr','zone_code','gps'],tariffs:{create:{id:'rate',name:'Test',hourlyRate:600,incrementMinutes:15,freeMinutes:5,minimumCharge:100,maxStayMinutes:180,validFrom:new Date('2020-01-01')}},operatingHours:{create:Array.from({length:7},(_,weekday)=>({weekday,opensAt:'00:00',closesAt:'00:00'}))}}});
 await db.roadCheckpoint.create({data:{id:'cp',nameEn:'Test checkpoint',nameAr:'???? ??????',latitude:31.9,longitude:35.2}});
 driver=await login('599111111');other=await login('599222222');vehicleId=(await vehicles.create(driver.user.id,{plateNumber:'1234567',type:'private'})).id;
});
describe('authentication and authorization',()=>{
 it('keeps development login disabled unless both development guards are enabled',async()=>{
  expect((await request(app).post('/api/v1/auth/dev-login').send({email:'dev@example.com'})).status).toBe(403);
  const nodeEnv=env.NODE_ENV,skip=env.DEV_SKIP_EMAIL_OTP;
  try{
   env.NODE_ENV='development';env.DEV_SKIP_EMAIL_OTP=true;
   const first=await request(app).post('/api/v1/auth/dev-login').send({email:' Dev@Example.COM '});
   expect(first.status).toBe(200);expect(first.body).toMatchObject({user:{email:'dev@example.com'},isNewUser:true});
   expect(first.body.user.emailVerifiedAt).toBeTruthy();
   expect(await db.wallet.count({where:{userId:first.body.user.id}})).toBe(1);
   await db.user.update({where:{id:first.body.user.id},data:{fullName:'Dev User'}});
   const again=await request(app).post('/api/v1/auth/dev-login').send({email:'dev@example.com'});
   expect(again.status).toBe(200);expect(again.body).toMatchObject({user:{id:first.body.user.id},isNewUser:false});
   await expect(auth.authenticate(again.body.session.accessToken)).resolves.toMatchObject({userId:first.body.user.id});
  }finally{env.NODE_ENV=nodeEnv;env.DEV_SKIP_EMAIL_OTP=skip;}
 });
 it('normalizes emails and stores only OTP hashes',async()=>{const c=await auth.requestOtp({email:' Person@Example.COM '});expect(c.email).toBe('person@example.com');expect(c).not.toHaveProperty('devCode');expect(sentCode()).toMatch(/^\d{6}$/);const state=await redis.hgetall('otp:email:'+c.challengeId);expect(JSON.stringify(state)).not.toContain(sentCode());expect(state.hash).toHaveLength(64);});
 it('expires OTP and enforces one-time use',async()=>{const c=await auth.requestOtp({email:'person@example.com'});await redis.del('otp:email:'+c.challengeId);await expect(auth.verifyOtp({challengeId:c.challengeId,code:sentCode()},{})).rejects.toMatchObject({code:'OTP_EXPIRED'});await expect(auth.verifyOtp({challengeId:c.challengeId,code:sentCode()},{})).rejects.toBeDefined();});
 it('locks after five incorrect OTP attempts',async()=>{const c=await auth.requestOtp({email:'person@example.com'});for(let i=0;i<5;i++)await expect(auth.verifyOtp({challengeId:c.challengeId,code:'000000'},{})).rejects.toBeDefined();await expect(auth.verifyOtp({challengeId:c.challengeId,code:sentCode()},{})).rejects.toMatchObject({code:'OTP_LOCKED'});});
 it('enforces resend cooldown',async()=>{await auth.requestOtp({email:'person@example.com'});await expect(auth.requestOtp({email:'person@example.com'})).rejects.toMatchObject({status:429});});
 it('registers with email, logs in to the same account and consumes OTP once',async()=>{
 const c=await auth.requestOtp({email:'new@example.com'}),code=sentCode();
 const first=await auth.verifyOtp({challengeId:c.challengeId,code},{});
 expect(first.user.email).toBe('new@example.com');expect(first.user.phone).toBeNull();expect(first.user.emailVerifiedAt).toBeTruthy();
 await expect(auth.verifyOtp({challengeId:c.challengeId,code},{})).rejects.toMatchObject({code:'OTP_EXPIRED'});
 await redis.del('otp:email:cooldown:new@example.com');
 const next=await auth.requestOtp({email:'NEW@EXAMPLE.COM'});
 const again=await auth.verifyOtp({challengeId:next.challengeId,code:sentCode()},{});
 expect(again.user.id).toBe(first.user.id);
 await expect(auth.authenticate(again.session.accessToken)).resolves.toMatchObject({userId:first.user.id});
 });
 it('rejects invalid email and old phone requests',async()=>{
 for(const body of [{email:'invalid'},{countryCode:'+970',phone:'599333333'}])expect((await request(app).post('/api/v1/auth/request-otp').send(body)).status).toBe(400);
 });
 it('cleans up failed delivery so the user can retry',async()=>{
 vi.mocked(emailProvider.sendOtp).mockRejectedValueOnce(new Error('SMTP failure'));
 await expect(auth.requestOtp({email:'retry@example.com'})).rejects.toMatchObject({code:'EMAIL_DELIVERY_FAILED'});
 expect(await redis.exists('otp:email:cooldown:retry@example.com')).toBe(0);
 expect(await redis.keys('otp:email:*')).toEqual(expect.not.arrayContaining([expect.stringContaining('retry@example.com')]));
 await expect(auth.requestOtp({email:'retry@example.com'})).resolves.toHaveProperty('challengeId');
 });
 it('prevents unverified legacy email takeover and profile identity changes',async()=>{
 await db.user.create({data:{email:'legacy@example.com',phone:'+970599888888',countryCode:'+970'}});
 const c=await auth.requestOtp({email:'legacy@example.com'});
 await expect(auth.verifyOtp({challengeId:c.challengeId,code:sentCode()},{})).rejects.toMatchObject({code:'EMAIL_MIGRATION_REQUIRED'});
 expect((await request(app).patch('/api/v1/users/me').auth(driver.session.accessToken,{type:'bearer'}).send({email:'changed@example.com'})).status).toBe(400);
 });
 it('rotates refresh tokens and revokes the family on replay',async()=>{const next=await auth.refresh(driver.session.refreshToken,{});expect(next.refreshToken).not.toBe(driver.session.refreshToken);await expect(auth.authenticate(next.accessToken)).resolves.toMatchObject({userId:driver.user.id});await expect(auth.refresh(driver.session.refreshToken,{})).rejects.toMatchObject({status:401});await expect(auth.refresh(next.refreshToken,{})).rejects.toMatchObject({status:401});expect(await db.refreshToken.findFirst({where:{tokenHash:driver.session.refreshToken}})).toBeNull();});
 it('requires JWT and blocks non-admin access',async()=>{expect((await request(app).get('/api/v1/wallet')).status).toBe(401);expect((await request(app).get('/api/v1/admin/users').auth(driver.session.accessToken,{type:'bearer'})).status).toBe(403);});
 it('invalidates logout sessions immediately',async()=>{const a=await auth.authenticate(driver.session.accessToken);await auth.logout(a.userId,a.sid);await expect(auth.authenticate(driver.session.accessToken)).rejects.toMatchObject({status:401});});
 it('rejects a foreign vehicle and prevents plate self-linking',async()=>{await expect(vehicles.get(other.user.id,vehicleId)).rejects.toMatchObject({status:404});await expect(vehicles.create(other.user.id,{plateNumber:'1234567',type:'private'})).rejects.toMatchObject({code:'OWNERSHIP_VERIFICATION_REQUIRED'});await expect(sessions.start(other.user.id,startInput(),key())).rejects.toMatchObject({status:404});});
 it('validates request bodies and rejects untrusted client prices',async()=>{const r=await request(app).post('/api/v1/parking/sessions').auth(driver.session.accessToken,{type:'bearer'}).set('Idempotency-Key',key()).send({...startInput(),price:1});expect(r.status).toBe(400);});
 it('enforces CORS allowlist',async()=>{expect((await request(app).get('/health').set('Origin','https://evil.invalid')).status).toBe(403);});
});
describe('parking and ledger invariants',()=>{
 it('starts, closes, charges, and keeps immutable history',async()=>{await credit(driver.user.id);const s=await sessions.start(driver.user.id,startInput(),key());await backdate(s.id);const done=await sessions.stop(driver.user.id,s.id,key());expect(done.status).toBe('COMPLETED');expect(done.finalCost).toBeGreaterThan(0);expect(done.paymentStatus).toBe('paid');expect(await db.walletTransaction.count({where:{parkingSessionId:s.id}})).toBe(1);});
 it('one active session per vehicle under concurrent starts',async()=>{const results=await Promise.allSettled([sessions.start(driver.user.id,startInput(),key()),sessions.start(driver.user.id,startInput(),key())]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await db.parkingSession.count({where:{vehicleId,status:'ACTIVE'}})).toBe(1);});
 it('allows two vehicles on the same account to park',async()=>{const v=await vehicles.create(driver.user.id,{plateNumber:'7654321',type:'private'});await Promise.all([sessions.start(driver.user.id,startInput(),key()),sessions.start(driver.user.id,{...startInput(),vehicleId:v.id},key())]);expect(await sessions.list(driver.user.id,{active:true})).toHaveLength(2);});
 it('replays an idempotent start and rejects changed payload',async()=>{const k=key();const a=await sessions.start(driver.user.id,startInput(),k);const b=await sessions.start(driver.user.id,startInput(),k);expect(a.id).toBe(b.id);await expect(sessions.start(driver.user.id,{...startInput(),entryMethod:'qr'},k)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});});
 it('replays concurrent identical requests',async()=>{const k=key();const result=await Promise.all([sessions.start(driver.user.id,startInput(),k),sessions.start(driver.user.id,startInput(),k)]);expect(result[0].id).toBe(result[1].id);});
 it('snapshots tariff and trust discount and uses them on extension',async()=>{await credit(driver.user.id);await db.pointsEntry.create({data:{userId:driver.user.id,placeId:'bonus',points:40,reason:'bonus',state:'verified'}});const s=await sessions.start(driver.user.id,{...startInput(),mode:'prepaid',durationMinutes:30},key());expect((s.rateSnapshot as {loyaltyDiscountPercent:number}).loyaltyDiscountPercent).toBe(5);await db.parkingTariff.update({where:{id:'rate'},data:{hourlyRate:9999}});await db.pointsEntry.updateMany({where:{userId:driver.user.id},data:{state:'revoked'}});const extended=await sessions.extend(driver.user.id,s.id,30,key());expect(extended.currentCost).toBe(570);expect(new Date(extended.endsAt!).getTime()-new Date(s.endsAt!).getTime()).toBe(1800000);});
 it('rejects prepaid parking without enough funds atomically',async()=>{await expect(sessions.start(driver.user.id,{...startInput(),mode:'prepaid',durationMinutes:30},key())).rejects.toMatchObject({code:'INSUFFICIENT_FUNDS'});expect(await db.parkingSession.count()).toBe(0);});
 it('rejects invalid duration and maximum stay',async()=>{await credit(driver.user.id);await expect(sessions.start(driver.user.id,{...startInput(),mode:'prepaid',durationMinutes:17},key())).rejects.toMatchObject({code:'INVALID_DURATION'});const s=await sessions.start(driver.user.id,{...startInput(),mode:'prepaid',durationMinutes:180},key());await expect(sessions.extend(driver.user.id,s.id,15,key())).rejects.toMatchObject({code:'MAX_STAY'});});
 it('closes payment failures, keeps debt, and settles later',async()=>{const s=await sessions.start(driver.user.id,startInput(),key());await backdate(s.id);const done=await sessions.stop(driver.user.id,s.id,key());expect(done.status).toBe('PAYMENT_FAILED');expect(done.stoppedAt).toBeTruthy();expect(await sessions.list(driver.user.id,{active:true})).toHaveLength(0);expect(await db.sessionDebt.count({where:{sessionId:s.id,settledAt:null}})).toBe(1);await credit(driver.user.id);const result=await sessions.settle(driver.user.id,s.id,key());expect(result.paymentStatus).toBe('paid');expect(await db.walletTransaction.count({where:{parkingSessionId:s.id}})).toBe(2);});
 it('does not double debit on repeated stop',async()=>{await credit(driver.user.id);const s=await sessions.start(driver.user.id,startInput(),key());await backdate(s.id);await sessions.stop(driver.user.id,s.id,key());const balance=(await wallet.get(driver.user.id)).balance;await sessions.stop(driver.user.id,s.id,key());expect((await wallet.get(driver.user.id)).balance).toBe(balance);});
 it('prevents concurrent double spending',async()=>{await credit(driver.user.id,1000);const result=await Promise.allSettled([atomic(tx=>post(tx,driver.user.id,{amount:-1000,type:'adjustment',title:'A',titleAr:'A'})),atomic(tx=>post(tx,driver.user.id,{amount:-1000,type:'adjustment',title:'B',titleAr:'B'}))]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await wallet.get(driver.user.id)).balance).toBe(0);});
 it('enforces immutable ledger and nonnegative balances in SQL',async()=>{const t=await credit(driver.user.id);await expect(db.walletTransaction.update({where:{id:t.id},data:{amount:1}})).rejects.toBeDefined();await expect(db.wallet.update({where:{userId:driver.user.id},data:{balance:-1}})).rejects.toBeDefined();});
 it('expires prepaid sessions in the backend worker',async()=>{await credit(driver.user.id);const s=await sessions.start(driver.user.id,{...startInput(),mode:'prepaid',durationMinutes:30},key());await sessions.expireSessions(new Date(Date.now()+31*60000));expect((await sessions.get(driver.user.id,s.id)).status).toBe('EXPIRED');expect(await db.notification.count({where:{type:'parking_expiring'}})).toBe(1);});
 it('validates operating hours on the server',async()=>{await db.operatingHour.updateMany({data:{closed:true}});await expect(sessions.start(driver.user.id,startInput(),key())).rejects.toMatchObject({code:'ZONE_CLOSED'});});
 it('keeps history when unlinking a vehicle',async()=>{const s=await sessions.start(driver.user.id,startInput(),key());await sessions.stop(driver.user.id,s.id,key());await vehicles.unlink(driver.user.id,vehicleId);expect(await db.parkingSession.count({where:{vehicleId}})).toBe(1);expect(await vehicles.list(driver.user.id)).toHaveLength(0);});
});
describe('payments, violations, permits and notifications',()=>{
 it('credits only provider-confirmed topups and replays safely',async()=>{const method=await wallet.addMethod(driver.user.id,{last4:'4242',brand:'visa',expiryMonth:12,expiryYear:2030});const k=key();await wallet.topup(driver.user.id,{amount:2000,paymentMethodId:method.id},k);await wallet.topup(driver.user.id,{amount:2000,paymentMethodId:method.id},k);expect((await wallet.get(driver.user.id)).balance).toBe(2000);expect(await db.walletTransaction.count({where:{type:'topup'}})).toBe(1);});
 it('a declined development payment does not credit the wallet',async()=>{const method=await wallet.addMethod(driver.user.id,{last4:'0000',brand:'visa',expiryMonth:12,expiryYear:2030});await expect(wallet.topup(driver.user.id,{amount:2000,paymentMethodId:method.id},key())).rejects.toMatchObject({code:'PAYMENT_FAILED'});expect((await wallet.get(driver.user.id)).balance).toBe(0);});
 it('rejects use of another user payment method',async()=>{const method=await wallet.addMethod(other.user.id,{last4:'4242',brand:'visa',expiryMonth:12,expiryYear:2030});await expect(wallet.topup(driver.user.id,{amount:2000,paymentMethodId:method.id},key())).rejects.toMatchObject({status:404});});
 async function fine(){return db.violation.create({data:{vehicleId,plateNumber:'1234567',type:'no_active_parking',amount:500,locationName:'Test',locationNameAr:'??????',latitude:31.9,longitude:35.2,dueAt:new Date(Date.now()+86400000),reason:'No session',reasonAr:'?? ???? ????',issuingAuthority:'Test',issuingAuthorityAr:'??????'}});}
 it('pays a plate-based violation once and hides it from other users',async()=>{const v=await fine();await credit(driver.user.id);await violations.pay(driver.user.id,v.id,key());await violations.pay(driver.user.id,v.id,key());expect((await wallet.get(driver.user.id)).balance).toBe(9500);expect(await violations.list(other.user.id)).toHaveLength(0);await expect(violations.get(other.user.id,v.id)).rejects.toMatchObject({status:404});});
 it('creates appeals and rejects unowned attachments',async()=>{const v=await fine();await expect(violations.appeal(driver.user.id,v.id,{reason:'other',notes:'Please review this notice',attachmentIds:['missing']})).rejects.toMatchObject({code:'INVALID_UPLOAD'});const a=await violations.appeal(driver.user.id,v.id,{reason:'other',notes:'Please review this notice',attachmentIds:[]});expect(a.status).toBe('submitted');expect((await violations.get(driver.user.id,v.id)).status).toBe('appealed');});
 it('operator cannot change another operator zone',async()=>{await expect(admin.patchZone({userId:driver.user.id,role:'PARKING_OPERATOR'},'test-zone',{name:'Hacked'})).rejects.toMatchObject({status:403});});
 it('audits role changes and revokes sessions',async()=>{await admin.role({userId:other.user.id,role:'ADMIN'},driver.user.id,{status:'SUSPENDED'});await expect(auth.authenticate(driver.session.accessToken)).rejects.toMatchObject({status:401});expect(await db.auditLog.count()).toBe(1);});
 it('issues scoped permits with audit records',async()=>{const p=await admin.permit({userId:other.user.id,role:'ADMIN'},{userId:driver.user.id,vehicleId,type:'resident',zoneIds:['test-zone'],validFrom:new Date().toISOString(),validTo:new Date(Date.now()+86400000).toISOString(),status:'active',issuer:'Test'});expect((await vehicles.permits(driver.user.id,vehicleId))[0]?.id).toBe(p.id);expect(await db.auditLog.count()).toBe(1);});
 it('persists a notification even with no push provider',async()=>{await atomic(tx=>notify(tx,driver.user.id,'system','Hello','?????','Test','??????'));expect(await db.notification.count({where:{userId:driver.user.id}})).toBe(1);expect(await db.outboxEvent.count({where:{topic:'notification.created'}})).toBe(1);});
 it('rejects MIME spoofing',()=>{expect(()=>validateFile(Buffer.from('not a jpeg'),'image/jpeg')).toThrow();});
});
describe('reports, trust and routing',()=>{
 it('uses deterministic road-report confidence thresholds',()=>{expect(calculateConfidence(0,0,false)).toEqual({confidenceScore:0.35,status:'unverified'});expect(calculateConfidence(2,0,false)).toEqual({confidenceScore:0.6499999999999999,status:'confirmed'});expect(calculateConfidence(0,2,false)).toMatchObject({confidenceScore:0,status:'disputed'});expect(calculateConfidence(2,0,true)).toEqual({confidenceScore:0,status:'expired'});});
 it('persists, bounds, votes, and blocks duplicate road-report votes',async()=>{const created=await roadReports.create(driver.user.id,{type:'accident',latitude:31.9,longitude:35.2,severity:'high',description:'Test event'});expect((await roadReports.active(other.user.id,{north:32,south:31,east:36,west:35}))[0]?.id).toBe(created.report.id);const voted=await roadReports.vote(other.user.id,created.report.id,'still_there');expect(voted).toMatchObject({confirmationCount:1,viewerVote:'still_there',canVote:false});await expect(roadReports.vote(other.user.id,created.report.id,'not_there')).rejects.toMatchObject({code:'ALREADY_VOTED'});});
 it('expires road reports without deleting them',async()=>{const created=await roadReports.create(driver.user.id,{type:'other',latitude:31.9,longitude:35.2});await db.roadReport.update({where:{id:created.report.id},data:{expiresAt:new Date(Date.now()-1000)}});expect(await roadReports.active(other.user.id,{north:32,south:31,east:36,west:35})).toHaveLength(0);expect((await db.roadReport.findUniqueOrThrow({where:{id:created.report.id}})).status).toBe('expired');});
 it('rejects invalid report coordinates at the API boundary',async()=>{const response=await request(app).post('/api/v1/road-reports').auth(driver.session.accessToken,{type:'bearer'}).send({type:'accident',latitude:100,longitude:35.2});expect(response.status).toBe(400);});
 it('uses freshness weights and flags assumed status',()=>{const now=Date.now();expect(aggregate([],90,360,now).assumed).toBe(true);const a=aggregate([{status:'closed',reportedAt:new Date(now-60*60000),userId:'a'},{status:'open',reportedAt:new Date(now),userId:'b'}],90,360,now);expect(a.status).toBe('open');expect(aggregate([{status:'closed',reportedAt:new Date(now-400*60000)}],90,360,now).assumed).toBe(true);});
 it('keeps parking reports on the shorter freshness window',()=>{const now=Date.now();expect(aggregate([{status:'full',reportedAt:new Date(now-130*60000)}],30,120,now).status).toBeUndefined();});
 it('aggregates reports and awards pending points only',async()=>{const r=await roads.reportRoad(driver.user.id,'cp','closed');expect(r.points?.state).toBe('pending');expect((await roads.checkpoints())[0]).toMatchObject({status:'closed',assumed:false});expect((await computeTrust(driver.user.id)).pendingPoints).toBe(5);});
 it('verifies uncontradicted points after the confirmation window',async()=>{await roads.reportRoad(driver.user.id,'cp','open');await roads.verifyPoints(new Date(Date.now()+16*60000));expect((await db.pointsEntry.findFirst())?.state).toBe('verified');});
 it('revokes points for a contradictory report from another driver',async()=>{await roads.reportRoad(driver.user.id,'cp','open');await roads.reportRoad(other.user.id,'cp','closed');await roads.verifyPoints(new Date(Date.now()+16*60000));expect((await db.pointsEntry.findFirst({where:{userId:driver.user.id}}))?.state).toBe('revoked');});
 it('prevents report spam and repeated rewards',async()=>{await roads.reportRoad(driver.user.id,'cp','open');await expect(roads.reportRoad(driver.user.id,'cp','closed')).rejects.toMatchObject({code:'REPORT_COOLDOWN'});await db.checkpointReport.updateMany({data:{reportedAt:new Date(Date.now()-61000)}});const result=await roads.reportRoad(driver.user.id,'cp','closed');expect(result.points).toBeUndefined();});
 it('awards pending points for every kind of map incident report',async()=>{for(const [i,type] of (['accident','traffic_congestion','closed_road','checkpoint','road_hazard'] as const).entries()){const r=await roadReports.create(driver.user.id,{type,latitude:31.9+i*0.05,longitude:35.2});expect(r.points).toMatchObject({points:10,state:'pending',rewardMinor:100,notification:{type:'points_awarded',titleAr:'حصلت على 10 نقاط'}});}expect((await computeTrust(driver.user.id)).pendingPoints).toBe(50);expect((await wallet.get(driver.user.id)).balance).toBe(0);const notes=await db.notification.findMany({where:{userId:driver.user.id,type:'points_awarded'}});expect(notes).toHaveLength(5);expect(notes[0]?.titleAr).toBe('حصلت على 10 نقاط');expect(notes[0]?.bodyAr).toContain('₪1.00');expect(await db.outboxEvent.count({where:{topic:'notification.created',userId:driver.user.id}})).toBe(5);});
 it('pays verified incident points into the wallet with a notification, once',async()=>{const r=await roadReports.create(driver.user.id,{type:'accident',latitude:31.9,longitude:35.2});await roads.verifyPoints(new Date(Date.now()+16*60000));await roads.verifyPoints(new Date(Date.now()+17*60000));expect((await db.pointsEntry.findFirstOrThrow({where:{incidentReportId:r.report.id}})).state).toBe('verified');expect((await wallet.get(driver.user.id)).balance).toBe(100);expect(await db.walletTransaction.count({where:{type:'reward'}})).toBe(1);expect(await db.notification.count({where:{userId:driver.user.id,type:'points_awarded'}})).toBe(1);const paid=await db.notification.findMany({where:{userId:driver.user.id,type:'reward_paid'}});expect(paid).toHaveLength(1);expect(paid[0]?.titleAr).toBe('تمت إضافة ₪1.00 إلى محفظتك');expect((await computeTrust(driver.user.id)).rewards.earnedMinor).toBe(100);});
 it('pays out as soon as other drivers confirm an incident',async()=>{const third=await login('599333333');const r=await roadReports.create(driver.user.id,{type:'road_hazard',latitude:31.9,longitude:35.2});await roadReports.vote(other.user.id,r.report.id,'still_there');expect((await wallet.get(driver.user.id)).balance).toBe(0);await roadReports.vote(third.user.id,r.report.id,'still_there');expect((await wallet.get(driver.user.id)).balance).toBe(100);expect(await db.notification.count({where:{userId:driver.user.id,type:'reward_paid'}})).toBe(1);});
 it('revokes incident points when other drivers say it was not there',async()=>{const third=await login('599333333');const r=await roadReports.create(driver.user.id,{type:'police',latitude:31.9,longitude:35.2});await roadReports.vote(other.user.id,r.report.id,'not_there');await roadReports.vote(third.user.id,r.report.id,'not_there');expect((await db.pointsEntry.findFirstOrThrow({where:{incidentReportId:r.report.id}})).state).toBe('revoked');await roads.verifyPoints(new Date(Date.now()+16*60000));expect((await wallet.get(driver.user.id)).balance).toBe(0);expect(await db.notification.count({where:{type:'points_awarded'}})).toBe(1);expect(await db.notification.count({where:{type:'reward_paid'}})).toBe(0);});
 it('caps rewarded incident reports per day and never rewards a duplicate',async()=>{const dup=await roadReports.create(driver.user.id,{type:'accident',latitude:31.9,longitude:35.2});const again=await roadReports.create(other.user.id,{type:'accident',latitude:31.9,longitude:35.2});expect(again).toMatchObject({duplicate:true,points:null});expect(dup.points).not.toBeNull();await db.pointsEntry.createMany({data:Array.from({length:9},(_,i)=>({userId:driver.user.id,placeId:`old-${i}`,points:10,reason:'incident_report'}))});await db.roadReport.updateMany({data:{createdAt:new Date(Date.now()-11*60000)}});const capped=await roadReports.create(driver.user.id,{type:'other',latitude:31.5,longitude:35.0});expect(capped.created).toBe(true);expect(capped.points).toBeNull();});
 it('also notifies and pays checkpoint report points',async()=>{const reported=await roads.reportRoad(driver.user.id,'cp','open');expect(reported.points?.notification?.type).toBe('points_awarded');expect((await db.notification.findFirstOrThrow({where:{userId:driver.user.id,type:'points_awarded'}})).titleAr).toBe('حصلت على 5 نقاط');await roads.verifyPoints(new Date(Date.now()+16*60000));expect((await wallet.get(driver.user.id)).balance).toBe(50);});
 it('keeps emergency calling off until a number is configured',async()=>{const saved=env.EMERGENCY_CALL_NUMBER;try{env.EMERGENCY_CALL_NUMBER='';expect(emergency.config()).toMatchObject({enabled:false,callNumber:null});env.EMERGENCY_CALL_NUMBER='+970599000000';const r=await request(app).get('/api/v1/emergency/config').auth(driver.session.accessToken,{type:'bearer'});expect(r.body).toMatchObject({enabled:true,callNumber:'+970599000000',countdownSeconds:15});expect((await request(app).get('/api/v1/emergency/config')).status).toBe(401);}finally{env.EMERGENCY_CALL_NUMBER=saved;}});
 it('records crash detections with the number only when a call was made',async()=>{const saved=env.EMERGENCY_CALL_NUMBER;try{env.EMERGENCY_CALL_NUMBER='112';const called=await request(app).post('/api/v1/emergency/crash-events').auth(driver.session.accessToken,{type:'bearer'}).send({detectedAt:new Date().toISOString(),latitude:31.9,longitude:35.2,speedKmh:54,peakG:6.2,rotationDeg:120,outcome:'called'});expect(called.status).toBe(200);expect(called.body).toMatchObject({outcome:'called',calledNumber:'112'});const cancelled=await emergency.recordCrash(driver.user.id,{detectedAt:new Date().toISOString(),peakG:4.5,outcome:'cancelled'});expect(cancelled.calledNumber).toBeNull();expect(await emergency.recentCrashes(other.user.id)).toHaveLength(0);expect((await request(app).post('/api/v1/emergency/crash-events').auth(driver.session.accessToken,{type:'bearer'}).send({detectedAt:'yesterday',peakG:5,outcome:'called'})).status).toBe(400);}finally{env.EMERGENCY_CALL_NUMBER=saved;}});
 it('aggregates parking availability on the backend',async()=>{await roads.reportZone(driver.user.id,'test-zone','full');const response=await request(app).get('/api/v1/parking/zones/test-zone').auth(driver.session.accessToken,{type:'bearer'});expect(response.body.availability).toBe('full');expect(response.body.crowd.reportCount).toBe(1);});
 it('calculates trust tiers, caps paid sessions and deducts unpaid fines',()=>{expect(trustScore({phone:true,vehicles:1,paid:3,reports:0,reportPoints:0,unpaid:0}).discountPercent).toBe(5);expect(trustScore({phone:true,vehicles:1,paid:100,reports:0,reportPoints:0,unpaid:0}).score).toBe(370);expect(trustScore({phone:true,vehicles:1,paid:0,reports:0,reportPoints:0,unpaid:3}).score).toBe(0);});
 it('ranks route alternatives with checkpoint penalties',async()=>{await roads.reportRoad(driver.user.id,'cp','closed');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({json:async()=>({code:'Ok',routes:[{distance:1000,duration:100,geometry:{coordinates:[[35.19,31.9],[35.21,31.9]]}},{distance:2000,duration:200,geometry:{coordinates:[[35.19,32],[35.21,32]]}}]})}));const r=await routingService.getRoute({latitude:31.9,longitude:35.19},{latitude:31.9,longitude:35.21});expect(r.distanceMeters).toBe(2000);expect(r.rejected[0]?.blockedBy?.status).toBe('closed');});
 it('snaps parking destinations and returns the fastest route with at most two alternatives',async()=>{
  const fetchMock=vi.fn()
   .mockResolvedValueOnce({json:async()=>({code:'Ok',waypoints:[{location:[35.206,31.906]}]})})
   .mockResolvedValueOnce({json:async()=>({code:'Ok',routes:[
    {distance:1800,duration:180,geometry:{coordinates:[[35.18,31.88],[35.206,31.906]]}},
    {distance:1200,duration:90,geometry:{coordinates:[[35.18,31.88],[35.206,31.906]]}},
    {distance:1400,duration:120,geometry:{coordinates:[[35.18,31.88],[35.206,31.906]]}},
    {distance:1500,duration:140,geometry:{coordinates:[[35.18,31.88],[35.206,31.906]]}},
   ]})});
  vi.stubGlobal('fetch',fetchMock);
  const r=await routingService.getRoute(
   {latitude:31.88,longitude:35.18},
   {latitude:31.9059,longitude:35.2041},
   {mode:'fastest',snapDestination:true,maxAlternatives:2},
  );
  expect(r).toMatchObject({durationSeconds:90,distanceMeters:1200,source:'osrm',snappedDestination:{latitude:31.906,longitude:35.206}});
  expect(r.rejected).toHaveLength(2);
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain('35.206,31.906');
 });
 it('labels OSRM failure fallback as approximate',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const r=await routingService.getRoute({latitude:31.8,longitude:35.19},{latitude:31.85,longitude:35.21});expect(r.source).toBe('straight-line');expect(r.coordinates).toHaveLength(2);});
 it('keeps the original billing increments, free minutes and cap',()=>{const rate={hourlyRate:600,incrementMinutes:15,freeMinutes:5,minimumCharge:100,dailyCap:1000};expect(computeCost(rate,300)).toBe(0);expect(computeCost(rate,301)).toBe(150);expect(computeCost(rate,100000)).toBe(1000);});
});
