import 'dotenv/config';
import { z } from 'zod';
const optional = z.string().optional();
export const env = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().default(4000),
 DEV_SKIP_EMAIL_OTP:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 DATABASE_URL:z.string().min(1), REDIS_URL:z.string().url(),
 GEMINI_API_KEY:optional, GEMINI_MODEL:z.string().regex(/^[a-zA-Z0-9._-]+$/).default('gemini-2.5-flash'),
 JWT_ACCESS_SECRET:z.string().min(32), JWT_REFRESH_SECRET:z.string().min(32),
 ACCESS_TOKEN_TTL:z.coerce.number().int().positive().default(900), REFRESH_TOKEN_TTL:z.coerce.number().int().positive().default(2592000),
 CORS_ORIGINS:z.string().default('http://localhost:8081'), OSRM_BASE_URL:z.string().url().default('https://router.project-osrm.org'), GOOGLE_ROUTES_API_KEY:optional,
 EMAIL_PROVIDER:z.enum(['smtp']).default('smtp'), EMAIL_FROM:z.email(),
 SMTP_HOST:z.string().min(1), SMTP_PORT:z.coerce.number().int().positive().default(465),
 SMTP_SECURE:z.enum(['true','false']).default('true').transform(v=>v==='true'), SMTP_USER:z.string().min(1), SMTP_PASSWORD:optional,
 PAYMENT_PROVIDER:z.enum(['development','http']).default('development'), PAYMENT_API_URL:optional, PAYMENT_API_KEY:optional,
 // Public demo hosting only: lets production run the built-in simulated provider, which never calls a gateway or charges a card.
 ALLOW_SIMULATED_PAYMENTS:z.enum(['true','false']).default('false').transform(v=>v==='true'),
 // Proxy hops in front of the API (1 on Render). Unset keeps Express's default, which ignores X-Forwarded-For.
 TRUST_PROXY:z.string().regex(/^\d*$/).optional().transform(v=>v?Number(v):undefined),
 PAYMENT_WEBHOOK_SECRET:z.string().min(32),
 S3_ENDPOINT:z.string().url(), S3_REGION:z.string().default('us-east-1'), S3_BUCKET:z.string(), S3_ACCESS_KEY:z.string(), S3_SECRET_KEY:z.string(),
 // Leave empty to keep crash calling off. Digits with an optional leading +.
 EMERGENCY_CALL_NUMBER:z.string().trim().regex(/^\+?[0-9]{2,15}$/).optional().or(z.literal('')), EMERGENCY_COUNTDOWN_SECONDS:z.coerce.number().int().min(5).max(60).default(15),
 FIREBASE_PROJECT_ID:optional,FIREBASE_CLIENT_EMAIL:optional,FIREBASE_PRIVATE_KEY:optional,EXPO_PUSH_ACCESS_TOKEN:optional,
}).parse(process.env);
if(env.NODE_ENV==='production'&&env.DEV_SKIP_EMAIL_OTP) {
 throw new Error('DEV_SKIP_EMAIL_OTP must be false in production');
}
if(env.NODE_ENV==='production') {
 if(!env.SMTP_PASSWORD) throw new Error('SMTP_PASSWORD is required');
 if(env.PAYMENT_PROVIDER==='development') {
  if(!env.ALLOW_SIMULATED_PAYMENTS) throw new Error('Production requires configured payment provider');
 } else {
  for(const name of ['PAYMENT_API_URL','PAYMENT_API_KEY'] as const) if(!env[name]) throw new Error(`${name} is required`);
  if(!env.PAYMENT_API_URL?.startsWith('https://')) throw new Error('Provider URLs must use HTTPS');
 }
 if([env.JWT_ACCESS_SECRET,env.JWT_REFRESH_SECRET,env.PAYMENT_WEBHOOK_SECRET].some(s=>s.startsWith('replace-'))) throw new Error('Replace example secrets');
}
export const origins = env.CORS_ORIGINS.split(',').map(s=>s.trim());
