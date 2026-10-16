import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomic, lock } from '../../database/client';
import { redis } from '../../database/redis';
import { smsProvider } from '../../providers/sms';
import { twilioVerifyProvider } from '../../providers/twilioVerify';
import { env } from '../../config/env';
import { developmentPhoneLoginEnabled, requireAuthMethod, requireOtpEnabled } from '../../config/developmentAuth';
import { ApiError, assert } from '../../utils/errors';
import { userView } from '../users/service';
import { digest, issue, lockSessionFamily } from './service';
import { acquirePhoneOperation, releasePhoneOperation, consumeRemotePhoneChallenge } from './remotePhoneChallenge';

const lifetime = 300;
const challengeKey = (id: string) => `otp:phone:challenge:${id}`;
const phonePrefix = (phone: string) => `otp:phone:${digest(phone)}:`;

export function normalizePhone(value: string) {
  let phone = value.trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\s()-]/g, '');
  if (phone.startsWith('00')) phone = '+' + phone.slice(2);
  if (/^0?5[69]\d{7}$/.test(phone)) phone = '+970' + phone.replace(/^0/, '');
  if (/^\+9725[69]\d{7}$/.test(phone)) phone = '+970' + phone.slice(4);
  assert(/^\+9705[69]\d{7}$/.test(phone), 'INVALID_PHONE', 'Enter a valid Palestinian mobile number (+970)', 400);
  return phone;
}

export const phoneRequestSchema = z.object({
  phone: z.string().trim().min(1).max(40),
  purpose: z.enum(['register', 'login']),
  fullName: z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value, context) => {
  if (value.purpose === 'register' && !value.fullName) context.addIssue({code: 'custom', path: ['fullName'], message: 'Name is required to register'});
});
export const phoneVerifySchema = z.object({challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/)}).strict();

export async function devPhoneLogin(input: z.input<typeof phoneRequestSchema>, meta: {device?: string; ip?: string}) {
  requireAuthMethod('phone');
  assert(developmentPhoneLoginEnabled(), 'DEV_LOGIN_DISABLED', 'Development login is disabled', 403);
  const parsed = phoneRequestSchema.parse(input);
  const phone = normalizePhone(parsed.phone);
  return atomic(async tx => {
    await lock(tx, `phone:${phone}`);
    const national = phone.slice(4);
    const matches = await tx.user.findMany({where: {phone: {in: [phone, '+972' + national, '00970' + national, '00972' + national, '0' + national, national]}}});
    assert(matches.length <= 1 && matches.every(user => user.phone === phone), 'PHONE_MIGRATION_REQUIRED', 'Contact support to link your existing account to a verified phone', 409);
    let existing = matches[0];
    if (existing) {
      await lockSessionFamily(tx, existing.id);
      existing = await tx.user.findUniqueOrThrow({where: {id: existing.id}});
    }
    assert(!existing || existing.phoneVerifiedAt || existing.phoneVerificationPending, 'PHONE_MIGRATION_REQUIRED', 'Contact support to link your existing account to a verified phone', 409);
    assert(!existing || existing.status === 'ACTIVE', 'ACCOUNT_SUSPENDED', 'This account is suspended', 403);
    assert(existing || parsed.purpose === 'register', 'PHONE_ACCOUNT_NOT_FOUND', 'Create an account with this phone number first', 404);
    const user = existing
      ? await tx.user.update({where: {id: existing.id}, data: {lastLoginAt: new Date()}})
      : await tx.user.create({data: {
        phone, countryCode: '+970', phoneVerificationPending: true, fullName: parsed.fullName!,
        firstName: parsed.fullName!.split(/\s+/)[0]!, lastName: parsed.fullName!.split(/\s+/).slice(1).join(' '),
        lastLoginAt: new Date(), wallet: {create: {}},
      }});
    await tx.auditLog.create({data: {actorUserId: user.id, action: 'auth.development_phone_login', resourceType: 'user', resourceId: user.id, ip: meta.ip, userAgent: meta.device}});
    return {session: await issue(tx, user, meta, undefined, true), user: userView(user), isNewUser: !user.profileCompletedAt};
  }, 'ReadCommitted');
}

// The entire phone budget and challenge replacement is atomic across API processes.
const prepareChallenge = `
local operation = redis.call('GET', KEYS[7])
if operation and operation ~= ARGV[9] then return {'OTP_BUSY', 3} end
if ARGV[8] == 'twilio-verify' and operation ~= ARGV[9] then return {'OTP_BUSY', 3} end
local locked = redis.call('TTL', KEYS[1])
if locked > 0 then return {'OTP_LOCKED', locked} end
local cooldown = redis.call('TTL', KEYS[2])
if cooldown > 0 then return {'OTP_COOLDOWN', cooldown} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 5 then return {'OTP_SEND_LIMIT', redis.call('TTL', KEYS[3])} end
if tonumber(redis.call('GET', KEYS[4]) or '0') >= 10 then return {'OTP_SEND_LIMIT', redis.call('TTL', KEYS[4])} end
if redis.call('INCR', KEYS[3]) == 1 then redis.call('EXPIRE', KEYS[3], 3600) end
if redis.call('INCR', KEYS[4]) == 1 then redis.call('EXPIRE', KEYS[4], 86400) end
redis.call('SET', KEYS[2], '1', 'EX', 60)
local previous = redis.call('GET', KEYS[5])
if previous then redis.call('DEL', ARGV[6] .. previous) end
redis.call('SET', KEYS[5], ARGV[1], 'EX', ARGV[7])
redis.call('HSET', KEYS[6], 'phone', ARGV[2], 'purpose', ARGV[3], 'fullName', ARGV[4], 'hash', ARGV[5], 'ready', '0', 'provider', ARGV[8])
redis.call('EXPIRE', KEYS[6], ARGV[7])
return {'OK', 60}
`;

export async function requestPhoneOtp(input: z.input<typeof phoneRequestSchema>) {
  requireAuthMethod('phone');
  requireOtpEnabled();
  const parsed = phoneRequestSchema.parse(input);
  const phone = normalizePhone(parsed.phone), prefix = phonePrefix(phone);
  const remote = env.SMS_PROVIDER === 'twilio-verify';
  const challengeId = randomUUID(), code = remote ? '' : String(randomInt(0, 1000000)).padStart(6, '0');
  const token = remote ? await acquirePhoneOperation(prefix) : '';
  try {
    const prepared = await redis.eval(prepareChallenge, 7,
      prefix + 'lock', prefix + 'cooldown', prefix + 'hour', prefix + 'day', prefix + 'active', challengeKey(challengeId), prefix + 'operation',
      challengeId, phone, parsed.purpose, parsed.fullName ?? '', remote ? '' : digest(challengeId + code), 'otp:phone:challenge:', lifetime, remote ? 'twilio-verify' : 'local', token,
    ) as [string, number];
    if (prepared[0] !== 'OK') throw new ApiError(429, prepared[0], 'Please wait before trying again', {retryAfterSeconds: Math.max(1, Number(prepared[1]))});
    const expiresAt = new Date(Date.now() + lifetime * 1000).toISOString();
    try {
      let verificationSid = '';
      let delivery:'sms'|'development';
      if (remote) {
        ({verificationSid} = await twilioVerifyProvider.start(phone));
        delivery = 'sms';
      } else {
        delivery = await smsProvider.sendOtp(phone, code);
      }
      const activated = await redis.eval(`
        if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('EXISTS', KEYS[2]) == 0 then return 0 end
        if ARGV[2] ~= '' and redis.call('GET', KEYS[3]) ~= ARGV[2] then return 0 end
        redis.call('HSET', KEYS[2], 'ready', '1', 'verificationSid', ARGV[3]); return 1
      `, 3, prefix + 'active', challengeKey(challengeId), prefix + 'operation', challengeId, token, verificationSid);
      if (Number(activated) !== 1) throw new Error('Challenge superseded or expired during delivery');
      return {challengeId, phone, resendAfterSeconds: 60, expiresAt, delivery};
    } catch {
      await redis.eval(`
        redis.call('DEL', KEYS[2])
        if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
        return 1
      `, 2, prefix + 'active', challengeKey(challengeId), challengeId);
      // Retain send budgets/cooldown: repeated provider failures must not enable SMS floods.
      throw new ApiError(503, 'SMS_DELIVERY_FAILED', 'Unable to send the verification code. Please try again later.');
    }
  } finally {
    if (token) await releasePhoneOperation(prefix, token);
  }
}

const consumeChallenge = `
local locked = redis.call('TTL', KEYS[4])
if locked > 0 then return {'OTP_LOCKED', locked} end
if redis.call('GET', KEYS[2]) ~= ARGV[1] or redis.call('HGET', KEYS[1], 'ready') ~= '1' then return {'OTP_EXPIRED', 0} end
if redis.call('HGET', KEYS[1], 'provider') == 'twilio-verify' then return {'OTP_EXPIRED', 0} end
if redis.call('HGET', KEYS[1], 'hash') ~= ARGV[2] then
  local tries = redis.call('INCR', KEYS[3])
  redis.call('EXPIRE', KEYS[3], 900)
  if tries >= 5 then
    redis.call('SET', KEYS[4], '1', 'EX', 900)
    redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
    return {'OTP_LOCKED', 900}
  end
  return {'OTP_INVALID', 0}
end
local phone = redis.call('HGET', KEYS[1], 'phone')
local purpose = redis.call('HGET', KEYS[1], 'purpose')
local fullName = redis.call('HGET', KEYS[1], 'fullName')
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
return {'OK', phone, purpose, fullName}
`;

export async function verifyPhoneOtp(input: z.input<typeof phoneVerifySchema>, meta: {device?: string; ip?: string}) {
  requireAuthMethod('phone');
  requireOtpEnabled();
  const parsed = phoneVerifySchema.parse(input);
  const [storedPhone, provider] = await redis.hmget(challengeKey(parsed.challengeId), 'phone', 'provider');
  assert(storedPhone, 'OTP_EXPIRED', 'The code is invalid or expired', 401);
  const prefix = phonePrefix(storedPhone);
  const result = provider === 'twilio-verify'
    ? await consumeRemotePhoneChallenge({prefix, challengeId:parsed.challengeId, phone:storedPhone, code:parsed.code})
    : await redis.eval(consumeChallenge, 4,
    challengeKey(parsed.challengeId), prefix + 'active', prefix + 'attempts', prefix + 'lock',
    parsed.challengeId, digest(parsed.challengeId + parsed.code),
  ) as string[];
  if (result[0] === 'OTP_LOCKED') throw new ApiError(429, 'OTP_LOCKED', 'Too many incorrect codes. Try again later.', {retryAfterSeconds: Number(result[1])});
  assert(result[0] === 'OK', result[0]!, 'The code is invalid or expired', 401);
  const [, phone, purpose, fullName] = result;
  return atomic(async tx => {
    await lock(tx, `phone:${phone!}`);
    const national = phone!.slice(4);
    const matches = await tx.user.findMany({where: {phone: {in: [phone!, '+972' + national, '00970' + national, '00972' + national, '0' + national, national]}}});
    // Legacy aliases may belong to different historical accounts. Never guess which account to link.
    assert(matches.length <= 1 && matches.every(user => user.phone === phone), 'PHONE_MIGRATION_REQUIRED', 'Contact support to link your existing account to a verified phone', 409);
    let existing = matches[0];
    if (existing) {
      await lockSessionFamily(tx, existing.id);
      existing = await tx.user.findUniqueOrThrow({where: {id: existing.id}});
    }
    assert(!existing || existing.phoneVerifiedAt || existing.phoneVerificationPending, 'PHONE_MIGRATION_REQUIRED', 'Contact support to link your existing account to a verified phone', 409);
    assert(!existing || existing.status === 'ACTIVE', 'ACCOUNT_SUSPENDED', 'This account is suspended', 403);
    assert(existing || purpose === 'register', 'PHONE_ACCOUNT_NOT_FOUND', 'Create an account with this phone number first', 404);
    const user = existing
      ? await tx.user.update({where: {id: existing.id}, data: {lastLoginAt: new Date(), ...(existing.phoneVerificationPending ? {phoneVerifiedAt: new Date(), phoneVerificationPending: false} : {})}})
      : await tx.user.create({data: {
          phone: phone!, countryCode: '+970', phoneVerifiedAt: new Date(), fullName: fullName!,
          firstName: fullName!.split(/\s+/)[0]!, lastName: fullName!.split(/\s+/).slice(1).join(' '),
          lastLoginAt: new Date(), wallet: {create: {}},
        }});
    return {session: await issue(tx, user, meta), user: userView(user), isNewUser: !user.profileCompletedAt};
  }, 'ReadCommitted');
}
