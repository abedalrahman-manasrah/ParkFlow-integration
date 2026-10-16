const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../scripts/ci-backend-stores.cjs');
const database = 'postgresql://ci-user:ci-password@127.0.0.1:5432/parkflow_test?connection_limit=5';
const keyNames = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'PAYMENT_WEBHOOK_SECRET', 'PROFILE_ENCRYPTION_KEY', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'SMTP_PASSWORD'];

function scenario(run) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'parkflow-ci-stores-'));
  const envFile = path.join(directory, 'github-env');
  const traceFile = path.join(directory, 'sdk-trace');
  const preload = path.join(directory, 'fake-sdk.cjs');
  // Only AWS I/O is replaced. The real command, URL guards, crypto, environment
  // output and filesystem writes run in their own Node process.
  fs.writeFileSync(preload, `
const Module = require('node:module');
const fs = require('node:fs');
const original = Module._load;
const masked = new Set();
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...args) => {
  for (const line of String(chunk).split(/\\r?\\n/)) if (line.startsWith('::add-mask::')) masked.add(line.slice('::add-mask::'.length));
  return originalWrite(chunk, ...args);
};
const originalAppend = fs.appendFileSync;
fs.appendFileSync = (target, contents, ...args) => {
  if (target === process.env.GITHUB_ENV) {
    for (const line of String(contents).trim().split('\\n')) {
      if (!masked.has(line.slice(line.indexOf('=')+1))) throw new Error('Credentials must be masked before appending');
    }
  }
  return originalAppend(target, contents, ...args);
};
const trace = event => fs.appendFileSync(process.env.CI_SDK_TRACE, JSON.stringify(event) + '\\n');
Module._load = function(name, ...args) {
  if (!name.includes('@aws-sdk/client-s3')) return original.call(this, name, ...args);
  trace({event:'load'});
  class HeadBucketCommand { constructor(input) {this.input=input; this.kind='head';} }
  class CreateBucketCommand { constructor(input) {this.input=input; this.kind='create';} }
  class S3Client {
    constructor(options) {trace({event:'client', options});}
    async send(command) {
      trace({event:command.kind, input:command.input});
      if (command.kind === 'create' && process.env.CI_BUCKET_RESULT === 'create-error') throw new Error('Provider error with ' + process.env.S3_SECRET_KEY);
      if (command.kind === 'head' && process.env.CI_BUCKET_RESULT !== 'exists') {
        const error = new Error('Private test storage request failed');
        error.$metadata = {httpStatusCode:process.env.CI_BUCKET_RESULT === 'forbidden' ? 403 : 404};
        throw error;
      }
      return {};
    }
    destroy() {trace({event:'destroy'});}
  }
  return {S3Client, HeadBucketCommand, CreateBucketCommand};
};
`);
  const env = {
    PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '',
    GITHUB_ACTIONS: 'true', NODE_ENV: 'test', GITHUB_ENV: envFile,
    DATABASE_URL: database, TEST_DATABASE_URL: database,
    REDIS_URL: 'redis://127.0.0.1:6379/15',
    S3_ENDPOINT: 'http://127.0.0.1:9000', S3_BUCKET: 'parkflow-ci-test',
    S3_ACCESS_KEY: 'CIUnitAccessKey123', S3_SECRET_KEY: 'ci-unit-secret-key-with-at-least-32-characters',
    CI_SDK_TRACE: traceFile, CI_BUCKET_RESULT: 'missing',
  };
  const invoke = (mode, overrides = {}, extraArgs = []) => {
    const configured = {...env, ...overrides};
    for (const name of Object.keys(configured)) if (configured[name] === undefined) delete configured[name];
    return spawnSync(process.execPath, ['--max-old-space-size=512', '--require', preload, script, ...(mode === undefined ? [] : [mode]), ...extraArgs], {env:configured, encoding:'utf8', timeout:10000});
  };
  const trace = () => fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  try { run({invoke, envFile, trace}); }
  finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), temporaryRoot);
    assert.ok(path.basename(resolved).startsWith('parkflow-ci-stores-'));
    fs.rmSync(resolved, {recursive:true, force:true});
  }
}

const rejectedEnvironments = [
  ['outside GitHub Actions', {GITHUB_ACTIONS:undefined}],
  ['false GitHub Actions flag', {GITHUB_ACTIONS:'false'}],
  ['production mode', {NODE_ENV:'production'}],
  ['missing test mode', {NODE_ENV:undefined}],
  ['different databases', {TEST_DATABASE_URL:'postgresql://other:password@127.0.0.1:5432/parkflow_test'}],
  ['remote PostgreSQL', {DATABASE_URL:'postgresql://user:password@database.example/parkflow_test', TEST_DATABASE_URL:'postgresql://user:password@database.example/parkflow_test'}],
  ['production database name', {DATABASE_URL:'postgresql://user:password@127.0.0.1:5432/parkflow', TEST_DATABASE_URL:'postgresql://user:password@127.0.0.1:5432/parkflow'}],
  ['query host override', {DATABASE_URL:'postgresql://user:password@127.0.0.1:5432/parkflow_test?host=database.example', TEST_DATABASE_URL:'postgresql://user:password@127.0.0.1:5432/parkflow_test?host=database.example'}],
  ['duplicate PostgreSQL options', {DATABASE_URL:database+'&connection_limit=5', TEST_DATABASE_URL:database+'&connection_limit=5'}],
  ['PostgreSQL fragment', {DATABASE_URL:database+'#remote', TEST_DATABASE_URL:database+'#remote'}],
  ['empty PostgreSQL fragment', {DATABASE_URL:database+'#', TEST_DATABASE_URL:database+'#'}],
  ['malformed PostgreSQL', {DATABASE_URL:'not-a-url', TEST_DATABASE_URL:'not-a-url'}],
  ['remote Redis', {REDIS_URL:'redis://redis.example:6379/15'}],
  ['production Redis database', {REDIS_URL:'redis://127.0.0.1:6379/0'}],
  ['Redis query', {REDIS_URL:'redis://127.0.0.1:6379/15?host=remote'}],
  ['remote storage', {S3_ENDPOINT:'https://storage.example'}],
  ['remote signing storage', {S3_PUBLIC_ENDPOINT:'https://signing-storage.example'}],
  ['missing PostgreSQL', {DATABASE_URL:undefined, TEST_DATABASE_URL:undefined}],
  ['missing Redis', {REDIS_URL:undefined}],
  ['missing storage', {S3_ENDPOINT:undefined}],
  ['storage query', {S3_ENDPOINT:'http://127.0.0.1:9000?redirect=remote'}],
  ['different bucket', {S3_BUCKET:'production-bucket'}],
];
for (const mode of ['keys', 'storage']) {
  test(`${mode} rejects unsafe CI/store settings before any write or SDK access`, () => {
    scenario(({invoke, envFile, trace}) => {
      fs.writeFileSync(envFile, 'KEEP_EXISTING_ENV=1\n');
      for (const [reason, overrides] of rejectedEnvironments) {
        const result = invoke(mode, overrides);
        assert.equal(result.status, 1, reason);
        assert.match(result.stderr, /CI backend stores:/, reason);
        assert.equal(fs.readFileSync(envFile, 'utf8'), 'KEEP_EXISTING_ENV=1\n', reason);
        assert.deepEqual(trace(), [], reason);
        assert.equal(result.stdout.includes('::add-mask::'), false, reason);
      }
    });
  });
}

test('keys appends fresh distinct test credentials and masks every value before ordinary output', () => {
  scenario(({invoke, envFile, trace}) => {
    fs.writeFileSync(envFile, 'KEEP_EXISTING_ENV=1\n');
    const first = invoke('keys');
    assert.equal(first.status, 0, first.stderr);
    const firstLines = fs.readFileSync(envFile, 'utf8').trim().split('\n');
    assert.equal(firstLines[0], 'KEEP_EXISTING_ENV=1');
    const credentials = Object.fromEntries(firstLines.slice(1).map(line => {const at=line.indexOf('='); return [line.slice(0,at), line.slice(at+1)];}));
    assert.deepEqual(Object.keys(credentials).sort(), [...keyNames].sort());
    assert.equal(new Set(Object.values(credentials)).size, 7);
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'PAYMENT_WEBHOOK_SECRET', 'S3_SECRET_KEY', 'SMTP_PASSWORD']) assert.ok(credentials[key].length >= 32, key);
    assert.match(credentials.PROFILE_ENCRYPTION_KEY, /^[a-f0-9]{64}$/);
    assert.match(credentials.S3_ACCESS_KEY, /^[A-Za-z0-9]{3,20}$/);
    const lines = first.stdout.trim().split(/\r?\n/);
    const masks = lines.filter(line => line.startsWith('::add-mask::')).map(line => line.slice('::add-mask::'.length));
    assert.deepEqual(new Set(masks), new Set(Object.values(credentials)));
    const ordinaryOutput = lines.filter(line => !line.startsWith('::add-mask::')).join('\n') + first.stderr;
    for (const value of Object.values(credentials)) assert.equal(ordinaryOutput.includes(value), false);
    const second = invoke('keys');
    assert.equal(second.status, 0, second.stderr);
    const appended = fs.readFileSync(envFile, 'utf8').trim().split('\n').slice(firstLines.length);
    assert.equal(appended.length, 7);
    for (const line of appended) {const at=line.indexOf('='); assert.notEqual(line.slice(at+1), credentials[line.slice(0,at)]);}
    assert.deepEqual(trace(), []);
  });
});

test('keys accepts a dedicated loopback PostgreSQL URL without optional pool settings', () => {
  scenario(({invoke}) => {
    const plain = database.split('?')[0];
    const result = invoke('keys', {DATABASE_URL:plain, TEST_DATABASE_URL:plain});
    assert.equal(result.status, 0, result.stderr);
  });
});

test('unknown, absent and extra CLI arguments never write or initialize storage', () => {
  scenario(({invoke, envFile, trace}) => {
    for (const [mode, extra] of [[undefined, []], ['unknown', []], ['keys', ['extra']], ['storage\nkeys', []]]) {
      const result = invoke(mode, {}, extra);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /CI backend stores:/);
      assert.equal(fs.existsSync(envFile), false);
      assert.deepEqual(trace(), []);
    }
    assert.equal(invoke('keys', {GITHUB_ENV:undefined}).status, 1);
    assert.equal(fs.existsSync(envFile), false);
  });
});

test('storage prepares only the private dedicated bucket at the loopback endpoint', () => {
  scenario(({invoke, trace, envFile}) => {
    const result = invoke('storage');
    assert.equal(result.status, 0, result.stderr);
    const events = trace();
    const options = events.find(event => event.event === 'client').options;
    assert.equal(options.endpoint, 'http://127.0.0.1:9000');
    assert.equal(options.forcePathStyle, true);
    assert.deepEqual(options.credentials, {accessKeyId:'CIUnitAccessKey123', secretAccessKey:'ci-unit-secret-key-with-at-least-32-characters'});
    assert.deepEqual(events.filter(event => ['head','create'].includes(event.event)), [{event:'head', input:{Bucket:'parkflow-ci-test'}}, {event:'create', input:{Bucket:'parkflow-ci-test'}}]);
    assert.equal(events.at(-1).event, 'destroy');
    assert.equal(fs.existsSync(envFile), false);
    assert.equal((result.stdout+result.stderr).includes(options.credentials.secretAccessKey), false);
  });
});

test('storage leaves an existing bucket intact and does not create after an authorization failure', () => {
  for (const [state, expected] of [['exists',0], ['forbidden',1]]) {
    scenario(({invoke, trace}) => {
      const result = invoke('storage', {CI_BUCKET_RESULT:state});
      assert.equal(result.status, expected);
      assert.deepEqual(trace().filter(event => ['head','create'].includes(event.event)), [{event:'head', input:{Bucket:'parkflow-ci-test'}}]);
    });
  }
});
test('storage errors never expose credential-bearing provider messages', () => {
  scenario(({invoke, trace}) => {
    const result = invoke('storage', {CI_BUCKET_RESULT:'create-error'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /CI backend stores:/);
    assert.equal((result.stdout+result.stderr).includes('ci-unit-secret-key-with-at-least-32-characters'), false);
    assert.equal(trace().at(-1).event, 'destroy');
  });
});
