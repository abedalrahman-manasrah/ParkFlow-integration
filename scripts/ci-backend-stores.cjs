'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class SafetyError extends Error {}
function requireSafe(condition, message) {
  if (!condition) throw new SafetyError(message);
}

function validateStores(env) {
  requireSafe(env.GITHUB_ACTIONS === 'true', 'GitHub Actions is required.');
  requireSafe(env.NODE_ENV === 'test', 'NODE_ENV must be test.');
  requireSafe(typeof env.DATABASE_URL === 'string' && env.DATABASE_URL.length > 0 && env.DATABASE_URL === env.TEST_DATABASE_URL,
    'DATABASE_URL and TEST_DATABASE_URL must identify the same dedicated test database.');
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new SafetyError('The test database URL is invalid.'); }
  requireSafe(['postgres:', 'postgresql:'].includes(database.protocol) && database.hostname === '127.0.0.1'
    && database.pathname === '/parkflow_test' && !env.DATABASE_URL.includes('#')
    && ['', '?connection_limit=5'].includes(database.search),
  'Only the loopback parkflow_test database and optional connection_limit=5 are allowed.');
  requireSafe(env.REDIS_URL === 'redis://127.0.0.1:6379/15', 'Only the loopback Redis test database 15 is allowed.');
  requireSafe(env.S3_ENDPOINT === 'http://127.0.0.1:9000', 'Only the loopback S3 test endpoint is allowed.');
  requireSafe(!env.S3_PUBLIC_ENDPOINT || env.S3_PUBLIC_ENDPOINT === env.S3_ENDPOINT, 'The public S3 test endpoint must also be loopback.');
  requireSafe(env.S3_BUCKET === 'parkflow-ci-test', 'Only the dedicated CI test bucket is allowed.');
}

function appendKeys(env) {
  requireSafe(typeof env.GITHUB_ENV === 'string' && path.isAbsolute(env.GITHUB_ENV), 'An absolute GITHUB_ENV output file is required.');
  const random = () => crypto.randomBytes(48).toString('base64url');
  const keys = {
    JWT_ACCESS_SECRET: `ci-access-${random()}`,
    JWT_REFRESH_SECRET: `ci-refresh-${random()}`,
    PAYMENT_WEBHOOK_SECRET: `ci-webhook-${random()}`,
    PROFILE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    S3_ACCESS_KEY: `PF${crypto.randomBytes(8).toString('hex')}`,
    S3_SECRET_KEY: crypto.randomBytes(24).toString('base64url'),
    SMTP_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  };
  // Workflow commands register masking before GitHub exposes these values to
  // later steps. Ordinary output and errors never include generated credentials.
  for (const value of Object.values(keys)) process.stdout.write(`::add-mask::${value}\n`);
  fs.appendFileSync(env.GITHUB_ENV, Object.entries(keys).map(([key, value]) => `${key}=${value}\n`).join(''), {encoding:'utf8', mode:0o600});
  console.log('CI backend stores: isolated test credentials appended.');
}

async function prepareStorage(env) {
  requireSafe(/^[A-Za-z0-9]{3,20}$/.test(env.S3_ACCESS_KEY || '') && /^[A-Za-z0-9_-]{32,}$/.test(env.S3_SECRET_KEY || ''),
    'Generated test storage credentials are required.');
  // Load only the installed backend SDK after every store guard has passed. No
  // application config, dotenv file or credential discovery provider is loaded.
  const {S3Client, HeadBucketCommand, CreateBucketCommand} = require('../server/node_modules/@aws-sdk/client-s3');
  const client = new S3Client({
    region:'us-east-1', endpoint:env.S3_ENDPOINT, forcePathStyle:true,
    credentials:{accessKeyId:env.S3_ACCESS_KEY, secretAccessKey:env.S3_SECRET_KEY},
    maxAttempts:1, retryMode:'standard', defaultsMode:'standard', useFipsEndpoint:false, useDualstackEndpoint:false,
  });
  try {
    try { await client.send(new HeadBucketCommand({Bucket:env.S3_BUCKET})); }
    catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404) throw new SafetyError('The dedicated test bucket could not be checked.');
      // Omit ACL and bucket policies: new buckets are private by default.
      await client.send(new CreateBucketCommand({Bucket:env.S3_BUCKET}));
    }
    console.log('CI backend stores: dedicated test bucket ready.');
  } finally { client.destroy(); }
}

async function main() {
  const mode = process.argv[2];
  requireSafe(process.argv.length === 3 && ['keys', 'storage'].includes(mode), 'Usage: node scripts/ci-backend-stores.cjs keys|storage');
  validateStores(process.env);
  if (mode === 'keys') appendKeys(process.env);
  else await prepareStorage(process.env);
}
main().catch(error => {
  console.error(`CI backend stores: ${error instanceof SafetyError ? error.message : 'The isolated CI store operation failed.'}`);
  process.exitCode = 1;
});
