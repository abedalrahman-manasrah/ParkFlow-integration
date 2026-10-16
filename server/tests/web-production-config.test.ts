import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

const fixture = {
  ...process.env, NODE_ENV: 'production', DEV_SKIP_EMAIL_OTP: 'false', DEV_SKIP_PHONE_OTP: 'false',
  SMS_PROVIDER: 'disabled', SMTP_PASSWORD: 'isolated-production-mail-fixture',
  PROFILE_ENCRYPTION_KEY: '4'.repeat(64), PAYMENT_PROVIDER: 'http',
  DATABASE_URL: 'postgresql://parkflow:isolated-production-database-password@postgres:5432/parkflow_test',
  S3_ENDPOINT: 'https://storage.example.test', S3_PUBLIC_ENDPOINT: 'https://storage.example.test',
  S3_ACCESS_KEY: 'isolated-production-access', S3_SECRET_KEY: 'isolated-production-storage-secret',
  PAYMENT_API_URL: 'https://payments.invalid', PAYMENT_API_KEY: 'isolated-payment-fixture',
  CORS_ORIGINS: 'https://app.example.test,https://staff.example.test',
  WEB_CUSTOMER_ORIGINS: 'https://app.example.test', WEB_MANAGEMENT_ORIGINS: 'https://staff.example.test',
};

it('issues host-only Secure HttpOnly Strict cookies with __Host prefix in production', () => {
  const script = `
    const {webBootstrap}=require('./src/modules/auth/webSession');
    const {redis}=require('./src/database/redis');
    const {db}=require('./src/database/client');
    const headers={Origin:'https://app.example.test','X-ParkFlow-App':'customer'};
    const req={get:name=>headers[name],res:{set(){return this;},cookie(name,_value,options){console.log(JSON.stringify({name,options}));}}};
    webBootstrap(req).finally(async()=>{await redis.quit();await db.$disconnect();});
  `;
  const output = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], { env: fixture, encoding: 'utf8', timeout: 10000 });
  const line = output.split('\n').find(value => value.startsWith('{"name"'))!;
  const cookie = JSON.parse(line);
  expect(cookie.name).toBe('__Host-parkflow-customer-browser');
  expect(cookie.options).toMatchObject({ secure: true, httpOnly: true, sameSite: 'strict', path: '/' });
  expect(cookie.options).not.toHaveProperty('domain');
});

it('refuses insecure production application origins', () => {
  expect(() => execFileSync(process.execPath, ['--import', 'tsx', '-e', "require('./src/config/env')"], {
    env: { ...fixture, WEB_CUSTOMER_ORIGINS: 'http://app.example.test' }, stdio: 'pipe', timeout: 10000,
  })).toThrow();
});

it('refuses overlapping customer and management origins', () => {
  expect(() => execFileSync(process.execPath, ['--import', 'tsx', '-e', "require('./src/config/env')"], {
    env: { ...fixture, WEB_MANAGEMENT_ORIGINS: fixture.WEB_CUSTOMER_ORIGINS }, stdio: 'pipe', timeout: 10000,
  })).toThrow();
});
