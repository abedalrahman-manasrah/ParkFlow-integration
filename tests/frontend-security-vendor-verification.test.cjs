const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../scripts/verify-frontend-security-vendors.cjs');
const digest = (algorithm, content, encoding = 'hex') => crypto.createHash(algorithm).update(content).digest(encoding);
const sri = content => 'sha512-' + digest('sha512', content, 'base64');

function fixture(runTest) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'parkflow-security-vendors-'));
  const directory = 'security/vendor/example';
  const archive = 'security/vendor/archives/parkflow-security-example-1.0.0-parkflow.1.tgz';
  const sources = {
    'package.json': JSON.stringify({ name: '@parkflow/security-example', version: '1.0.0-parkflow.1', main: 'index.cjs', private: true }) + '\n',
    'index.cjs': 'module.exports = value => String(value);\n',
    'LICENSE': 'MIT fixture license\n',
  };
  const archiveBytes = Buffer.from('Reviewed immutable security fork archive fixture\n');
  const item = { originalName: 'example', name: '@parkflow/security-example', version: '1.0.0-parkflow.1', directory, archive,
    upstream: { name: 'example', version: '1.0.0', tarball: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity: sri(Buffer.from('upstream fixture')) },
    archiveSha256: digest('sha256', archiveBytes), archiveIntegrity: sri(archiveBytes),
    files: Object.fromEntries(Object.entries(sources).map(([name, content]) => [name, digest('sha256', content)])) };
  const manifest = { schemaVersion: 1, packages: [item] };
  const instance = { name: item.name, version: item.version, resolved: 'file:' + archive, integrity: item.archiveIntegrity };
  const lock = { lockfileVersion: 3, packages: { '': { name: 'fixture' }, 'node_modules/example': instance } };
  function addInstance(relative, metadata = sources['package.json']) {
    for (const [name, source] of Object.entries(sources)) {
      const target = path.join(root, relative, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, name === 'package.json' ? metadata : source);
    }
  }
  try {
    addInstance(directory);
    addInstance('node_modules/example');
    fs.mkdirSync(path.dirname(path.join(root, archive)), { recursive: true });
    fs.writeFileSync(path.join(root, archive), archiveBytes);
    fs.writeFileSync(path.join(root, 'security/vendor/manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, overrides: { example: 'file:' + archive } }));
    return runTest({ root, item, manifest, lock, sources, addInstance,
      saveLock: () => fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock)),
      saveManifest: () => fs.writeFileSync(path.join(root, 'security/vendor/manifest.json'), JSON.stringify(manifest)) });
  } finally {
    const resolved = path.resolve(root);
    if (!resolved.startsWith(temporaryRoot + path.sep) || !path.basename(resolved).startsWith('parkflow-security-vendors-')) throw new Error('Unsafe fixture cleanup path');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function verify(root) {
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return result;
}

function rejected(root, expected) {
  const result = verify(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, expected);
}

test('valid source archives and every installed nested fork instance verify without mutation', () => {
  fixture(({ root, lock, sources, addInstance, saveLock }) => {
    const nested = 'node_modules/parent/node_modules/example';
    addInstance(nested);
    lock.packages[nested] = { ...lock.packages['node_modules/example'] };
    saveLock();
    const nestedDependency = path.join(root, nested, 'node_modules/retained-dependency/index.js');
    fs.mkdirSync(path.dirname(nestedDependency), { recursive: true });
    fs.writeFileSync(nestedDependency, 'module.exports = true;\n');
    const result = verify(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 installed security fork packages/);
    for (const [name, content] of Object.entries(sources)) assert.equal(fs.readFileSync(path.join(root, nested, name), 'utf8'), content);
  });
});

test('vendored source drift is rejected even if installed code remains reviewed', () => {
  fixture(({ root, item }) => {
    fs.appendFileSync(path.join(root, item.directory, 'index.cjs'), '// unexpected source\n');
    rejected(root, /vendored source hash mismatch/i);
  });
});

test('archive byte drift is rejected independently of source and installed code', () => {
  fixture(({ root, item }) => {
    fs.appendFileSync(path.join(root, item.archive), 'changed archive');
    rejected(root, /archive integrity mismatch/i);
  });
});

test('installed fork source or unexpected distribution files are rejected', () => {
  fixture(({ root }) => {
    fs.appendFileSync(path.join(root, 'node_modules/example/index.cjs'), '// unexpected installed source\n');
    rejected(root, /installed source hash mismatch/i);
  });
  fixture(({ root }) => {
    fs.writeFileSync(path.join(root, 'node_modules/example/unreviewed.cjs'), 'module.exports = false;\n');
    rejected(root, /unexpected installed file/i);
  });
  fixture(({ root, item }) => {
    fs.writeFileSync(path.join(root, item.directory, 'unreviewed.cjs'), 'module.exports = false;\n');
    rejected(root, /unexpected vendored file/i);
  });
});

test('lock version identity archive location and integrity drift all fail closed', () => {
  const variants = [
    { name: 'example' },
    { version: '1.0.0' },
    { resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz' },
    { integrity: sri(Buffer.from('different archive')) },
  ];
  for (const variant of variants) fixture(({ root, lock, saveLock }) => {
    Object.assign(lock.packages['node_modules/example'], variant);
    saveLock();
    rejected(root, /locked security fork mismatch/i);
  });
});

test('unreviewed additional nested instances and missing required slots are rejected', () => {
  fixture(({ root, lock, addInstance, saveLock }) => {
    const nested = 'node_modules/parent/node_modules/example';
    addInstance(nested, JSON.stringify({ name: 'example', version: '1.0.0', main: 'index.cjs' }));
    lock.packages[nested] = { version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz' };
    saveLock();
    rejected(root, /locked security fork mismatch/i);
  });
  fixture(({ root, lock, saveLock }) => {
    delete lock.packages['node_modules/example'];
    saveLock();
    rejected(root, /required security fork dependency missing/i);
  });
});

test('missing source files and removed dependency override configuration fail closed', () => {
  fixture(({ root, item }) => {
    fs.unlinkSync(path.join(root, item.directory, 'LICENSE'));
    rejected(root, /vendored source missing/i);
  });
  fixture(({ root }) => {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true }));
    rejected(root, /security fork override missing or changed/i);
  });
});

test('manifest schema and paths cannot bypass distribution verification', () => {
  fixture(({ root, manifest, saveManifest }) => {
    manifest.schemaVersion = 999;
    saveManifest();
    rejected(root, /unsupported security vendor manifest/i);
  });
  fixture(({ root, item, saveManifest }) => {
    item.archive = '../outside.tgz';
    saveManifest();
    rejected(root, /unsafe security vendor path/i);
  });
});


test('unlocked physical nested forks cannot shadow a reviewed root dependency', () => {
  fixture(({ root, addInstance }) => {
    const nested = 'node_modules/parent/node_modules/example';
    addInstance(nested, JSON.stringify({ name: 'example', version: '1.0.0', main: 'index.cjs' }));
    fs.writeFileSync(path.join(root, nested, 'index.cjs'), "module.exports = () => 'unreviewed nested code';\n");
    const parent = path.join(root, 'node_modules/parent/index.cjs');
    fs.writeFileSync(parent, "module.exports = require('example');\n");
    assert.equal(require(parent)(), 'unreviewed nested code', 'real parent resolution uses the unlocked physical slot');
    rejected(root, /unlocked physical security fork instance/i);
  });
});

function workspace({ root, lock, saveLock }) {
  const directory = path.join(root, 'apps/customer');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: '@parkflow/customer', version: '1.0.0' }));
  const project = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  project.workspaces = ['apps/*'];
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(project));
  lock.packages['apps/customer'] = { name: '@parkflow/customer', version: '1.0.0' };
  lock.packages['node_modules/@parkflow/customer'] = { resolved: 'apps/customer', link: true };
  saveLock();
  const link = path.join(root, 'node_modules/@parkflow/customer');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(directory, link, 'junction');
}

test('known workspace links retain reviewed local forks and expose unlocked workspace slots', () => {
  fixture(context => {
    workspace(context);
    const relative = 'apps/customer/node_modules/example';
    context.addInstance(relative);
    context.lock.packages[relative] = { ...context.lock.packages['node_modules/example'] };
    context.saveLock();
    const result = verify(context.root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 installed security fork packages/);
    delete context.lock.packages[relative];
    context.saveLock();
    rejected(context.root, /unlocked physical security fork instance/i);
  });
});

test('dependency symlinks cannot hide security slots or create unbounded traversal', () => {
  for (const kind of ['security-slot', 'cyclic-package', 'cyclic-node-modules']) fixture(({ root }) => {
    const parent = path.join(root, 'node_modules/parent');
    const modules = path.join(parent, 'node_modules');
    fs.mkdirSync(kind === 'cyclic-node-modules' ? parent : modules, { recursive: true });
    const link = kind === 'security-slot' ? path.join(modules, 'example') : kind === 'cyclic-package' ? path.join(modules, 'cycle') : modules;
    const target = kind === 'security-slot' ? path.join(root, 'node_modules/example') : kind === 'cyclic-package' ? parent : path.join(root, 'node_modules');
    fs.symlinkSync(target, link, 'junction');
    rejected(root, /unsafe security vendor.*(?:symlink|link)/i);
  });
});

test('physical module files cannot precede an otherwise verified fork directory', () => {
  fixture(({ root }) => {
    const shadow = path.join(root, 'node_modules/example.js');
    fs.writeFileSync(shadow, "module.exports = () => 'unreviewed module file';\n");
    assert.equal(require(require.resolve('example', { paths: [root] }))(), 'unreviewed module file');
    rejected(root, /unreviewed physical security dependency file/i);
  });
});


test('Expo build main importer cannot resolve an unlocked internal node-forge slot', () => {
  fixture(({ root, item, lock, saveLock, saveManifest }) => {
    fs.renameSync(path.join(root, 'node_modules/example'), path.join(root, 'node_modules/node-forge'));
    item.originalName = 'node-forge';
    item.upstream.name = 'node-forge';
    saveManifest();
    lock.packages['node_modules/node-forge'] = lock.packages['node_modules/example'];
    delete lock.packages['node_modules/example'];
    saveLock();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, overrides: { 'node-forge': 'file:' + item.archive } }));
    const build = path.join(root, 'node_modules/@expo/code-signing-certificates/build');
    const nested = path.join(build, 'node_modules/node-forge');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'index.js'), "module.exports = 'unreviewed internal Forge';\n");
    const importer = path.join(build, 'main.js');
    fs.writeFileSync(importer, "module.exports = require('node-forge');\n");
    assert.equal(require(importer), 'unreviewed internal Forge');
    rejected(root, /unlocked physical security fork instance/i);
  });
});

test('internal workspace and root tooling importers expose their own node_modules slots', () => {
  for (const directory of ['apps/customer/src', 'scripts/tasks']) fixture(context => {
    if (directory.startsWith('apps/')) workspace(context);
    const nested = directory + '/node_modules/example';
    context.addInstance(nested);
    const importer = path.join(context.root, directory, 'importer.cjs');
    fs.writeFileSync(importer, "module.exports = require('example');\n");
    assert.equal(require(importer)('value'), 'value');
    rejected(context.root, /unlocked physical security fork instance/i);
  });
});

test('noncanonical protected slot case cannot bypass Windows module resolution checks', () => {
  for (const name of ['EXAMPLE', 'EXAMPLE.JS']) fixture(({ root, addInstance }) => {
    const parent = path.join(root, 'node_modules/parent');
    const nested = 'node_modules/parent/node_modules/' + name;
    if (name.endsWith('.JS')) {
      fs.mkdirSync(path.dirname(path.join(root, nested)), { recursive: true });
      fs.writeFileSync(path.join(root, nested), "module.exports = () => 'unreviewed case variant';\n");
    } else {
      addInstance(nested);
      fs.writeFileSync(path.join(root, nested, 'index.cjs'), "module.exports = () => 'unreviewed case variant';\n");
    }
    const importer = path.join(parent, 'index.cjs');
    fs.writeFileSync(importer, "module.exports = require('example');\n");
    if (process.platform === 'win32') assert.equal(require(importer)(), 'unreviewed case variant');
    rejected(root, /noncanonical security dependency slot/i);
  });
});
