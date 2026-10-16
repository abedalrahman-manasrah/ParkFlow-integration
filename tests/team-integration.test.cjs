const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('team sharing and gate routes are reachable in the active customer application', () => {
  for (const route of ['(tabs)/share.tsx', 'rides/[id].tsx', 'rides/new.tsx', 'rides/mine.tsx', 'spots/[id].tsx', 'spots/new.tsx', 'spots/mine.tsx', 'gate/index.tsx', 'gate/pass.tsx', 'gate/patrol.tsx']) {
    assert.ok(fs.existsSync(path.join(root, 'apps/customer/app', route)), 'Active customer route missing: ' + route);
  }
});

test('legacy root routes and source cannot silently shadow the split applications', () => {
  // Git preserves files rather than empty directories left by a moved route.
  for (const legacy of ['app', 'src']) {
    const directory=path.join(root,legacy);
    const files=fs.existsSync(directory)?fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()):[];
    assert.equal(files.length,0,'Inactive legacy source remains: '+legacy);
  }
});

test('new customer native features retain workspace dependencies and local module discovery', () => {
  const customer = json('apps/customer/package.json');
  for (const dependency of ['expo-intent-launcher', 'expo-sensors', 'expo-speech', 'expo-speech-recognition']) assert.ok(customer.dependencies[dependency], 'Missing native feature dependency: ' + dependency);
  const nativeDirectory = customer.expo?.autolinking?.nativeModulesDir;
  assert.equal(path.resolve(root, 'apps/customer', nativeDirectory || 'modules'), path.join(root, 'modules'));
  assert.ok(fs.existsSync(path.join(root, 'modules/crash-detection/expo-module.config.json')));
});

test('both applications retain immutable security verification and separate launch targets', () => {
  const workspace = json('package.json');
  assert.ok(workspace.workspaces.includes('apps/*')); assert.ok(workspace.workspaces.includes('packages/*'));
  assert.equal(workspace.scripts.postinstall, 'node scripts/verify-frontend-security-vendors.cjs');
  assert.match(workspace.scripts['dev:customer'], /@parkflow\/customer/);
  assert.match(workspace.scripts['dev:management'], /@parkflow\/management/);
});