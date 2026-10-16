const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const workspaceRoot = path.resolve(__dirname, '..');
const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const integrity = content => 'sha512-' + crypto.createHash('sha512').update(content).digest('base64');

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe security vendor path: ' + relative);
  }
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Unsafe security vendor path: ' + relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Unsafe security vendor symlink: ' + relative);
  }
  return target;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function filesIn(directory, { installed = false } = {}) {
  const files = [];
  function visit(current, relative = '') {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Unsafe security vendor symlink: ' + name);
      if (entry.isDirectory()) {
        if (installed && entry.name === 'node_modules') continue;
        visit(path.join(current, entry.name), name);
      } else if (entry.isFile()) {
        files.push(name);
      } else {
        throw new Error('Unsupported security vendor file: ' + name);
      }
    }
  }
  visit(directory);
  return files.sort();
}

function verifyFiles(directory, expected, label, installed = false) {
  for (const [relative, expectedHash] of Object.entries(expected)) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Invalid reviewed security vendor source hash: ' + relative);
    const target = safePath(directory, relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(label + ' source missing: ' + relative);
    if (hash(fs.readFileSync(target)) !== expectedHash) throw new Error(label + ' source hash mismatch: ' + relative);
  }
  for (const relative of filesIn(directory, { installed })) {
    if (!Object.hasOwn(expected, relative)) throw new Error('Unexpected ' + label.toLowerCase() + ' file: ' + relative);
  }
}

function lstatIfPresent(filename) {
  try { return fs.lstatSync(filename); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function workspaceDirectories(root, project) {
  const patterns = Array.isArray(project.workspaces) ? project.workspaces : project.workspaces?.packages || [];
  const directories = new Map();
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.includes('\\') || path.isAbsolute(pattern) || pattern.split('/').some(part => !part || part === '.' || part === '..' || (part !== '*' && /[*?\[\]{}]/.test(part)))) throw new Error('Unsupported security vendor workspace pattern: ' + pattern);
    function expand(current, parts) {
      if (parts.length === 0) {
        const metadata = path.join(current, 'package.json');
        if (fs.existsSync(metadata)) directories.set(fs.realpathSync(current), { relative: path.relative(root, current).split(path.sep).join('/'), name: readJson(metadata).name });
        return;
      }
      const [part, ...rest] = parts;
      const entries = part === '*' ? (fs.existsSync(current) ? fs.readdirSync(current, { withFileTypes: true }).map(entry => entry.name) : []) : [part];
      for (const name of entries) {
        const directory = path.join(current, name);
        const stat = lstatIfPresent(directory);
        if (stat?.isSymbolicLink()) throw new Error('Unsafe security vendor workspace symlink: ' + directory);
        if (stat?.isDirectory()) expand(directory, rest);
      }
    }
    expand(root, pattern.split('/'));
  }
  return directories;
}

function physicalInstances(root, project, lock, names) {
  const instances = new Map([...names].map(name => [name, []]));
  const canonicalNames = new Map([...names].map(name => [name.toLowerCase(), name]));
  const workspaces = workspaceDirectories(root, project);
  const visited = new Set();
  const relative = directory => path.relative(root, directory).split(path.sep).join('/');
  const excludedRoots = new Set(['server', '.runtime', '.git', '.superpowers', '.codex', '.npm-cache', '.prisma-cache']);
  function excluded(directory) {
    const slot = relative(directory);
    return excludedRoots.has(slot.split('/')[0]) || slot === 'security/vendor' || slot.startsWith('security/vendor/');
  }
  function visitPackage(directory, name, stat) {
    const slot = relative(directory);
    const folded = name.toLowerCase();
    const canonical = canonicalNames.get(folded);
    if (canonical) {
      if (name !== canonical) throw new Error('Noncanonical security dependency slot: ' + slot);
      if (stat.isSymbolicLink()) throw new Error('Unsafe security vendor dependency symlink: ' + slot);
      instances.get(canonical).push(slot);
    }
    for (const extension of ['.js', '.json', '.node']) {
      const original = folded.endsWith(extension) && canonicalNames.get(folded.slice(0, -extension.length));
      if (original) {
        if (name !== original + extension) throw new Error('Noncanonical security dependency slot: ' + slot);
        throw new Error('Unreviewed physical security dependency file: ' + slot);
      }
    }
    if (stat.isSymbolicLink()) {
      let target;
      try { target = workspaces.get(fs.realpathSync(directory)); } catch { /* Reject dangling and cyclic links below. */ }
      const locked = lock.packages[slot];
      if (!target || target.name !== name || locked?.link !== true || locked.resolved !== target.relative) throw new Error('Unsafe security vendor dependency link: ' + slot);
      // Declared workspace source roots are scanned directly, never through links.
      return;
    }
    if (stat.isDirectory()) visitSourceDirectory(directory);
  }
  function visitModules(directory) {
    const stat = lstatIfPresent(directory);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error('Unsafe security vendor node_modules symlink: ' + relative(directory));
    if (!stat.isDirectory()) throw new Error('Unsafe security vendor node_modules path: ' + relative(directory));
    if (visited.has(directory)) return;
    visited.add(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.bin') continue;
      const target = path.join(directory, entry.name);
      if (entry.name.startsWith('@')) {
        if (entry.isSymbolicLink()) throw new Error('Unsafe security vendor scope symlink: ' + relative(target));
        if (!entry.isDirectory()) continue;
        for (const scoped of fs.readdirSync(target, { withFileTypes: true })) visitPackage(path.join(target, scoped.name), entry.name + '/' + scoped.name, scoped);
      } else {
        visitPackage(target, entry.name, entry);
      }
    }
  }
  function visitSourceDirectory(directory) {
    if (visited.has(directory) || excluded(directory)) return;
    visited.add(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (excluded(target)) continue;
      // Node importers can live in build/, lib/, src/, or root tooling folders.
      // Inspect directories, not their file contents, to discover every local slot.
      if (entry.name.toLowerCase() === 'node_modules') visitModules(target);
      else if (entry.isSymbolicLink()) throw new Error('Unsafe security vendor source link: ' + relative(target));
      else if (entry.isDirectory()) visitSourceDirectory(target);
    }
  }
  visitSourceDirectory(root);
  for (const directory of workspaces.keys()) visitSourceDirectory(directory);
  return instances;
}

function run({ root = workspaceRoot } = {}) {
  root = path.resolve(root);
  const manifest = readJson(safePath(root, 'security/vendor/manifest.json'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.packages) || manifest.packages.length === 0) throw new Error('Unsupported security vendor manifest');
  const lock = readJson(safePath(root, 'package-lock.json'));
  const project = readJson(safePath(root, 'package.json'));
  if (!lock.packages || lock.lockfileVersion !== 3) throw new Error('Unsupported security vendor lockfile');
  const physical = physicalInstances(root, project, lock, new Set(manifest.packages.map(item => item.originalName)));
  let verifiedPackages = 0;
  const names = new Set();
  for (const item of manifest.packages) {
    if (!item.originalName || !item.name?.startsWith('@parkflow/security-') || !item.version?.includes('-parkflow.') || names.has(item.originalName) || !item.files || !item.files['package.json']) throw new Error('Invalid security vendor package manifest');
    names.add(item.originalName);
    if (item.upstream?.name !== item.originalName || !item.upstream.version || !item.upstream.tarball?.startsWith('https://registry.npmjs.org/') || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.upstream.integrity || '')) throw new Error('Invalid official security vendor provenance: ' + item.originalName);
    const sourceDirectory = safePath(root, item.directory);
    const archive = safePath(root, item.archive);
    verifyFiles(sourceDirectory, item.files, 'Vendored');
    const metadata = readJson(path.join(sourceDirectory, 'package.json'));
    if (metadata.name !== item.name || metadata.version !== item.version || metadata.private !== true || !metadata.main || !Object.hasOwn(item.files, metadata.main.replace(/^\.\//, ''))) throw new Error('Vendored security fork metadata mismatch: ' + item.originalName);
    const archiveBytes = fs.readFileSync(archive);
    if (hash(archiveBytes) !== item.archiveSha256 || integrity(archiveBytes) !== item.archiveIntegrity) throw new Error('Security fork archive integrity mismatch: ' + item.archive);
    if (project.overrides?.[item.originalName] !== 'file:' + item.archive) throw new Error('Security fork override missing or changed: ' + item.originalName);
    const suffix = 'node_modules/' + item.originalName;
    const instances = Object.entries(lock.packages).filter(([relative, locked]) => relative === suffix || relative.endsWith('/' + suffix) || locked.name === item.name);
    if (instances.length === 0) throw new Error('Required security fork dependency missing: ' + item.originalName);
    const lockedSlots = new Set(instances.map(([relative]) => relative));
    for (const relative of physical.get(item.originalName)) {
      if (!lockedSlots.has(relative)) throw new Error('Unlocked physical security fork instance: ' + relative);
    }
    for (const [relative, locked] of instances) {
      if (locked.name !== item.name || locked.version !== item.version || locked.resolved !== 'file:' + item.archive || locked.integrity !== item.archiveIntegrity) throw new Error('Locked security fork mismatch: ' + relative);
      const directory = safePath(root, relative);
      verifyFiles(directory, item.files, 'Installed', true);
      verifiedPackages++;
    }
  }
  return { verifiedPackages, verifiedArchives: manifest.packages.length, changedFiles: 0 };
}

module.exports = { run, hash, integrity, safePath, filesIn, verifyFiles };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root')) throw new Error('Usage: node scripts/verify-frontend-security-vendors.cjs [--root directory]');
    const result = run(args.length ? { root: args[1] } : undefined);
    console.log('Verified ' + result.verifiedPackages + ' installed security fork packages and ' + result.verifiedArchives + ' immutable archives');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
