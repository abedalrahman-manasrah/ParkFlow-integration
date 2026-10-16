import 'dotenv/config';
import { z } from 'zod';
const optional = z.string().optional();
export const env = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().default(4000),
 AUTH_LOGIN_METHOD:z.enum(['email','phone']).default('email'),
 DEV_SKIP_EMAIL_OTP:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 DEV_SKIP_PHONE_OTP:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 SMS_PROVIDER:z.enum(['disabled','development','twilio','twilio-verify']).default('disabled'),
 TWILIO_ACCOUNT_SID:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^AC[0-9a-fA-F]{32}$/).optional()), TWILIO_AUTH_TOKEN:optional, TWILIO_FROM:optional,
 TWILIO_VERIFY_SERVICE_SID:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^VA[0-9a-fA-F]{32}$/).optional()),
 PROFILE_ENCRYPTION_KEY:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^[a-fA-F0-9]{64}$/).optional()),
 DATABASE_URL:z.string().min(1), REDIS_URL:z.string().url(),
 GEMINI_API_KEY:optional, GEMINI_MODEL:z.string().regex(/^[a-zA-Z0-9._-]+$/).default('gemini-2.5-flash'),
 JWT_ACCESS_SECRET:z.string().min(32), JWT_REFRESH_SECRET:z.string().min(32),
 ACCESS_TOKEN_TTL:z.coerce.number().int().positive().default(900), REFRESH_TOKEN_TTL:z.coerce.number().int().positive().default(2592000),
 CORS_ORIGINS:z.string().default('http://localhost:8081,http://127.0.0.1:8081'), OSRM_BASE_URL:z.string().url().default('https://router.project-osrm.org'),
 WEB_CUSTOMER_ORIGINS:z.string().default('http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006'),
 WEB_MANAGEMENT_ORIGINS:z.string().default('http://localhost:8082,http://127.0.0.1:8082'),
 GOOGLE_ROUTES_API_KEY:optional,
 EMAIL_PROVIDER:z.enum(['smtp']).default('smtp'), EMAIL_FROM:z.email(),
 SMTP_HOST:z.string().min(1), SMTP_PORT:z.coerce.number().int().positive().default(465),
 SMTP_SECURE:z.enum(['true','false']).default('true').transform(v=>v==='true'), SMTP_USER:z.string().min(1), SMTP_PASSWORD:optional,
 PAYMENT_PROVIDER:z.enum(['development','http']).default('development'), PAYMENT_API_URL:optional, PAYMENT_API_KEY:optional,
 // Public demo hosting only: lets production run the built-in simulated provider, which never calls a gateway or charges a card.
 ALLOW_SIMULATED_PAYMENTS:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 // Proxy hops in front of the API (1 on Render). Unset keeps Express's default, which ignores X-Forwarded-For.
 TRUST_PROXY:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^\d{1,2}$/).optional().transform(v=>v===undefined?undefined:Number(v)).refine(v=>v===undefined||v<=10,'Trusted proxy hop count must be between 0 and 10')),
 PAYMENT_WEBHOOK_SECRET:z.string().min(32),
 S3_ENDPOINT:z.string().url(), S3_PUBLIC_ENDPOINT:z.preprocess(v=>v===''?undefined:v,z.string().url().optional()), S3_REGION:z.string().default('us-east-1'), S3_BUCKET:z.string(), S3_ACCESS_KEY:z.string(), S3_SECRET_KEY:z.string(),
 // Leave empty to keep crash calling off. Digits with an optional leading +.
 EMERGENCY_CALL_NUMBER:z.string().trim().regex(/^\+?[0-9]{2,15}$/).optional().or(z.literal('')), EMERGENCY_COUNTDOWN_SECONDS:z.coerce.number().int().min(5).max(60).default(15),
 FIREBASE_PROJECT_ID:optional,FIREBASE_CLIENT_EMAIL:optional,FIREBASE_PRIVATE_KEY:optional,EXPO_PUSH_ACCESS_TOKEN:optional,
}).parse(process.env);
if(env.NODE_ENV==='production'&&env.DEV_SKIP_PHONE_OTP) {
 throw new Error('DEV_SKIP_PHONE_OTP must be false in production');
}
if(env.NODE_ENV==='production'&&env.DEV_SKIP_EMAIL_OTP) {
 throw new Error('DEV_SKIP_EMAIL_OTP must be false in production');
}
if(env.NODE_ENV==='production') {
 if(env.SMS_PROVIDER==='development') throw new Error('Development SMS is forbidden in production');
 if(env.SMS_PROVIDER==='twilio'&&(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!env.TWILIO_FROM)) throw new Error('Twilio SMS credentials are required');
 if(env.SMS_PROVIDER==='twilio-verify'&&(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!env.TWILIO_VERIFY_SERVICE_SID)) throw new Error('Twilio Verify credentials and service SID are required');
 if(!env.PROFILE_ENCRYPTION_KEY) throw new Error('PROFILE_ENCRYPTION_KEY is required in production');
 if(!env.SMTP_PASSWORD) throw new Error('SMTP_PASSWORD is required');
 if(env.PAYMENT_PROVIDER==='development') {
  if(!env.ALLOW_SIMULATED_PAYMENTS) throw new Error('Production requires configured payment provider');
 } else {
  for(const name of ['PAYMENT_API_URL','PAYMENT_API_KEY'] as const) if(!env[name]) throw new Error(`${name} is required`);
  if(!env.PAYMENT_API_URL?.startsWith('https://')) throw new Error('Provider URLs must use HTTPS');
 }
 if([env.JWT_ACCESS_SECRET,env.JWT_REFRESH_SECRET,env.PAYMENT_WEBHOOK_SECRET].some(s=>s.startsWith('replace-'))) throw new Error('Replace example secrets');
 const signingKeys=[env.JWT_ACCESS_SECRET,env.JWT_REFRESH_SECRET,env.PAYMENT_WEBHOOK_SECRET];
 if(new Set(signingKeys).size!==signingKeys.length) throw new Error('Session and payment signing keys must be distinct');
 const knownDefaults=new Set(['local-parkflow','parkflow','password','postgres','changeme','replace-me','minioadmin','parkflow-local','parkflow-local-storage']);
 let databasePassword:string;
 try { databasePassword=decodeURIComponent(new URL(env.DATABASE_URL).password); } catch { throw new Error('Invalid production database configuration'); }
 if(!databasePassword||knownDefaults.has(databasePassword)||databasePassword.startsWith('replace-')) throw new Error('Production database credentials must replace local examples');
 for(const name of ['S3_ACCESS_KEY','S3_SECRET_KEY'] as const) {
  if(!env[name].trim()||knownDefaults.has(env[name])||env[name].startsWith('replace-')) throw new Error('Production storage credentials must replace local examples');
 }
 if(env.S3_SECRET_KEY.length<20) throw new Error('Production storage secret must contain at least 20 characters');
 for(const value of [env.PAYMENT_API_URL,env.S3_ENDPOINT,env.S3_PUBLIC_ENDPOINT,env.OSRM_BASE_URL].filter((value):value is string=>Boolean(value))) {
  let url:URL; try { url=new URL(value); } catch { throw new Error('Invalid production service URL'); }
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('Production payment, storage and routing URLs must use HTTPS without embedded credentials');
 }
}
export type WebApplication = 'customer' | 'management';
function browserOrigins(value:string):readonly string[]{
 const entries=value.split(',').map(s=>s.trim()).filter(Boolean);
 if(!entries.length||entries.some(value=>{try{const url=new URL(value);return url.origin!==value||!['http:','https:'].includes(url.protocol);}catch{return true;}}))throw new Error('Web origins must be exact HTTP(S) origins');
 if(env.NODE_ENV==='production'&&entries.some(value=>!value.startsWith('https://')))throw new Error('Production web origins must use HTTPS');
 return entries;
}
export const webOrigins:Record<WebApplication,readonly string[]>={customer:browserOrigins(env.WEB_CUSTOMER_ORIGINS),management:browserOrigins(env.WEB_MANAGEMENT_ORIGINS)};
if(webOrigins.customer.some(origin=>webOrigins.management.includes(origin)))throw new Error('Customer and management web origins must be disjoint');
export const origins = [...new Set([...(env.CORS_ORIGINS.trim()?browserOrigins(env.CORS_ORIGINS):[]), ...webOrigins.customer, ...webOrigins.management])];
