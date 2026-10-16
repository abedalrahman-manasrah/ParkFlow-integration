const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function runVercelBuild(application, status = 0) {
  const config = JSON.parse(read('vercel.json'));
  const command = /^node -e "([\s\S]*)"$/.exec(config.buildCommand);
  assert.ok(command, 'Build must validate and select one workspace before publishing its export');
  const calls = [];
  const context = {
    require(name) {
      if (name === 'node:child_process') return { spawnSync: (...args) => { calls.push(['spawn', ...args]); return { status }; } };
      if (name === 'node:fs') return { rmSync: (...args) => calls.push(['remove', ...args]), cpSync: (...args) => calls.push(['copy', ...args]) };
      throw new Error(`Unexpected build dependency ${name}`);
    },
    process: { env: { PARKFLOW_WEB_APPLICATION: application }, platform: 'linux', exit(code) { throw new Error(`Build exited ${code}`); } },
  };
  vm.runInNewContext(command[1], context);
  return { config, calls };
}

for (const app of ['customer', 'management']) {
  test(`Vercel publishes only the selected ${app} workspace through security-verified scripts`, () => {
    const { config, calls } = runVercelBuild(app);
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.equal(config.installCommand, 'npm ci');
    assert.equal(scripts.postinstall, 'node scripts/verify-frontend-security-vendors.cjs');
    assert.equal(config.outputDirectory, 'dist');
    const build = calls.find(call => call[0] === 'spawn');
    assert.equal(build[1], 'npm');
    const workspaceScripts = JSON.parse(read(`apps/${app}/package.json`)).scripts;
    const selectedScript = /^npm run ([\w:-]+) --workspace @parkflow\/(customer|management)$/.exec(scripts[build[2][1]]);
    assert.ok(selectedScript, 'Selected root command must resolve to one application workspace');
    assert.equal(selectedScript[2], app);
    assert.equal(workspaceScripts[selectedScript[1]], 'expo export --platform web --max-workers 1 --output-dir dist');
    assert.deepEqual(Array.from(build[2]), ['run', `export:${app}:web`]);
    assert.equal(scripts[`preexport:${app}:web`], 'npm run security:verify');
    assert.equal(scripts[`export:${app}:web`], `npm run export:web --workspace @parkflow/${app}`);
    assert.equal(workspaceScripts['export:web'], 'expo export --platform web --max-workers 1 --output-dir dist');
    // Dedicated deployment commands must not change the existing native/all-platform exports.
    assert.equal(scripts[`export:${app}`], `npm run export --workspace @parkflow/${app}`);
    assert.equal(workspaceScripts.export, app === 'customer'
      ? 'expo export --platform all --max-workers 1 --output-dir dist'
      : 'expo export --platform web --max-workers 1 --output-dir dist');
    const copy = calls.find(call => call[0] === 'copy');
    assert.equal(copy[1], `apps/${app}/dist`);
    assert.equal(copy[2], config.outputDirectory);
  });
}

test('Vercel refuses missing or invalid application selection and failed exports', () => {
  for (const selection of [undefined, '', 'admin', '../server']) {
    assert.throws(() => runVercelBuild(selection), /PARKFLOW_WEB_APPLICATION/);
  }
  assert.throws(() => runVercelBuild('management', 3), /Build exited 3/);
});

test('Render requires both exact web origin lists and profile encryption alongside supervised startup', () => {
  const render = read('render.yaml');
  assert.match(render, /plan: free/);
  assert.match(render, /rootDir: server/);
  assert.match(render, /dockerCommand: node dist\/src\/start\.js/);
  assert.match(render, /healthCheckPath: \/health/);
  assert.match(render, /maxmemoryPolicy: noeviction/);
  for (const key of ['PROFILE_ENCRYPTION_KEY', 'WEB_CUSTOMER_ORIGINS', 'WEB_MANAGEMENT_ORIGINS', 'CORS_ORIGINS']) {
    assert.match(render, new RegExp(`- key: ${key}\\r?\\n\\s+sync: false`));
  }
  assert.match(render, /- key: ALLOW_SIMULATED_PAYMENTS\r?\n\s+value: "true"/);
});

test('deployment example keeps customer, management, and API on one HTTPS site with disjoint origins', () => {
  const docs = read('DEPLOYMENT.md');
  const setting = key => {
    const match = docs.match(new RegExp(`^${key}=(https:\\/\\/[^\\s]+)$`, 'm'));
    assert.ok(match, `${key} must have a concrete HTTPS example`);
    return match[1].split(',');
  };
  const customer = setting('WEB_CUSTOMER_ORIGINS');
  const management = setting('WEB_MANAGEMENT_ORIGINS');
  const api = setting('EXPO_PUBLIC_API_BASE_URL')[0];
  const sameSite = url => new URL(url).hostname.split('.').slice(-2).join('.');
  assert.equal(sameSite(api), 'example.com');
  for (const origin of [...customer, ...management]) {
    assert.equal(new URL(origin).origin, origin);
    assert.equal(sameSite(origin), sameSite(api));
  }
  assert.ok(customer.every(origin => !management.includes(origin)));
  assert.match(docs, /SameSite=Strict/);
  assert.match(docs, /25 migrations/);
  assert.match(docs, /PARKFLOW_WEB_APPLICATION/);
  assert.match(read('.env.example'), /EXPO_PUBLIC_SIMULATED_PAYMENTS=false/);
});


test('free-domain routing sends API and realtime requests to the shared API before the SPA', () => {
  const config = JSON.parse(read('vercel.json'));
  const spa = config.rewrites.findIndex(route => route.destination === '/index.html');
  assert.ok(spa > 0, 'API proxy routes must be considered before the SPA fallback');
  for (const prefix of ['/api/v1', '/socket.io']) {
    const position = config.rewrites.findIndex(route => route.source === prefix + '/:path*');
    assert.ok(position >= 0 && position < spa, prefix + ' must not be swallowed by the SPA');
    assert.equal(config.rewrites[position].destination, 'https://parkflow-api-m19q.onrender.com' + prefix + '/:path*');
    const policy = config.headers.find(rule => rule.source === prefix + '/(.*)');
    assert.ok(policy?.headers.some(header => header.key.toLowerCase() === 'cache-control' && header.value === 'no-store'), 'Private proxy responses must never be cached');
  }
  const document = config.headers.find(rule => rule.source === '/(.*)');
  assert.ok(document?.headers.some(header => header.key.toLowerCase() === 'referrer-policy' && header.value === 'strict-origin-when-cross-origin'), 'Same-origin browser reads require a trusted referrer');
});
