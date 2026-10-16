import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const fixture = {
 ...process.env, NODE_ENV:'production', DEV_SKIP_EMAIL_OTP:'false', DEV_SKIP_PHONE_OTP:'false', SMS_PROVIDER:'disabled',
 DATABASE_URL:'postgresql://parkflow:isolated-db-private-fixture@db.example.test:5432/parkflow',
 REDIS_URL:'redis://127.0.0.1:6379/15',
 JWT_ACCESS_SECRET:'isolated-access-private-fixture-with-length', JWT_REFRESH_SECRET:'isolated-refresh-private-fixture-with-length',
 PAYMENT_WEBHOOK_SECRET:'isolated-webhook-private-fixture-with-length', PROFILE_ENCRYPTION_KEY:'4'.repeat(64),
 SMTP_HOST:'smtp.example.test', SMTP_USER:'sender@example.test', SMTP_PASSWORD:'isolated-mail-fixture', EMAIL_FROM:'sender@example.test', SMTP_SECURE:'true',
 OSRM_BASE_URL:'https://routing.example.test', PAYMENT_PROVIDER:'http', PAYMENT_API_URL:'https://payments.example.test', PAYMENT_API_KEY:'isolated-provider-fixture',
 WEB_CUSTOMER_ORIGINS:'https://app.example.test', WEB_MANAGEMENT_ORIGINS:'https://staff.example.test', CORS_ORIGINS:'https://app.example.test',
 S3_ENDPOINT:'https://storage.example.test', S3_PUBLIC_ENDPOINT:'https://storage.example.test', S3_BUCKET:'parkflow',
 S3_ACCESS_KEY:'isolated-access-fixture', S3_SECRET_KEY:'isolated-private-storage-fixture',
};
function load(changes:Record<string,string>) {
 return spawnSync(process.execPath,['--import','tsx','-e',"const {origins,env}=require('./src/config/env'); console.log('CONFIG_ACCEPTED'); console.log(JSON.stringify(origins)); console.log('TRUST_PROXY='+env.TRUST_PROXY)"],{
  env:{...fixture,...changes},encoding:'utf8',timeout:10000,
 });
}
describe('production settings fail closed without disclosing credentials',()=>{
 it('accepts configured HTTPS services and STARTTLS mail',()=>{
  const result=load({SMTP_SECURE:'false'});
  expect(result.status,result.stderr).toBe(0); expect(result.stdout).toContain('CONFIG_ACCEPTED');
 });
 it.each([
  ['insecure extra CORS origin',{CORS_ORIGINS:'http://app.example.test'}],
  ['wildcard extra CORS origin',{CORS_ORIGINS:'*'}],
  ['CORS URL containing credentials',{CORS_ORIGINS:'https://user:password@app.example.test'}],
  ['default database password',{DATABASE_URL:'postgresql://parkflow:local-parkflow@db.example.test:5432/parkflow'}],
  ['default storage access key',{S3_ACCESS_KEY:'parkflow-local'}],
  ['default storage password',{S3_SECRET_KEY:'parkflow-local-storage'}],
  ['empty storage password',{S3_SECRET_KEY:''}],
  ['default object storage admin',{S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'}],
  ['shared session signing keys',{JWT_REFRESH_SECRET:fixture.JWT_ACCESS_SECRET}],
  ['shared payment and session key',{PAYMENT_WEBHOOK_SECRET:fixture.JWT_ACCESS_SECRET}],
  ['insecure routing provider',{OSRM_BASE_URL:'http://routing.example.test'}],
  ['routing provider embedded credentials',{OSRM_BASE_URL:'https://user:password@routing.example.test'}],
  ['insecure object storage API',{S3_ENDPOINT:'http://storage.example.test'}],
  ['insecure public download API',{S3_PUBLIC_ENDPOINT:'http://storage.example.test'}],
 ])('rejects %s',(_name,changes)=>{
  const result=load(changes as Record<string,string>);
  expect(result.status).not.toBe(0); expect(result.stdout).not.toContain('CONFIG_ACCEPTED');
  expect(result.stderr).not.toContain(fixture.JWT_ACCESS_SECRET); expect(result.stderr).not.toContain(fixture.S3_SECRET_KEY);
 });
 it('uses the exact application origins when optional extra CORS origins are empty',()=>{
  const result=load({CORS_ORIGINS:''});
  expect(result.status,result.stderr).toBe(0);
  expect(result.stdout).toContain(JSON.stringify([fixture.WEB_CUSTOMER_ORIGINS,fixture.WEB_MANAGEMENT_ORIGINS]));
 });
 it('preserves HTTP and known local infrastructure credentials in development',()=>{
  const result=load({NODE_ENV:'development',DATABASE_URL:'postgresql://parkflow:local-parkflow@127.0.0.1:5434/parkflow',
   CORS_ORIGINS:'http://localhost:8081',WEB_CUSTOMER_ORIGINS:'http://localhost:8081',WEB_MANAGEMENT_ORIGINS:'http://localhost:8082',
   S3_ENDPOINT:'http://localhost:9002',S3_PUBLIC_ENDPOINT:'http://localhost:9002',S3_ACCESS_KEY:'parkflow-local',S3_SECRET_KEY:'parkflow-local-storage'});
  expect(result.status,result.stderr).toBe(0);
 });
});


describe('cloud demo and explicit proxy configuration',()=>{
 it('permits a deliberately opted-in simulated demo while retaining production services',()=>{
  const result=load({PAYMENT_PROVIDER:'development',ALLOW_SIMULATED_PAYMENTS:'true',PAYMENT_API_URL:'',PAYMENT_API_KEY:''});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('CONFIG_ACCEPTED');
 });
 it('refuses simulated production payments without an explicit opt-in',()=>{
  const result=load({PAYMENT_PROVIDER:'development',ALLOW_SIMULATED_PAYMENTS:'false'});
  expect(result.status).not.toBe(0);
 });
 it.each([
  ['missing payment URL',{PAYMENT_PROVIDER:'http',PAYMENT_API_URL:''}],
  ['missing payment credentials',{PAYMENT_PROVIDER:'http',PAYMENT_API_KEY:''}],
  ['insecure provider URL',{PAYMENT_API_URL:'http://payments.example.test'}],
  ['missing profile encryption',{PAYMENT_PROVIDER:'development',PROFILE_ENCRYPTION_KEY:''}],
  ['authentication shortcut',{PAYMENT_PROVIDER:'development',DEV_SKIP_EMAIL_OTP:'true'}],
  ['shared signing secrets',{PAYMENT_PROVIDER:'development',JWT_REFRESH_SECRET:fixture.JWT_ACCESS_SECRET}],
 ])('does not let the demo opt-in bypass %s',(_label,changes)=>{
  const result=load({ALLOW_SIMULATED_PAYMENTS:'true',...changes} as Record<string,string>);
  expect(result.status).not.toBe(0);expect(result.stdout).not.toContain('CONFIG_ACCEPTED');
 });
 it.each([['','undefined'],['0','0'],['1','1'],['10','10']])('accepts explicit proxy hop count %s',(value,expected)=>{
  const result=load({TRUST_PROXY:value});expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('TRUST_PROXY='+expected);
 });
 it.each(['-1','11','100','Infinity','1.5','true','1e2'])('refuses unsafe proxy configuration %s',value=>{
  const result=load({TRUST_PROXY:value});expect(result.status).not.toBe(0);expect(result.stdout).not.toContain('CONFIG_ACCEPTED');
 });
});
