const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const workspaceRoot = path.resolve(__dirname, '..');
const patchRoot = path.join(workspaceRoot, 'security', 'dependency-patches');
const normalize = source => source.replace(/\r\n/g, '\n');
const hash = source => crypto.createHash('sha256').update(normalize(source)).digest('hex');

function verifySource(source, expectedHash, label) {
  if (hash(source) !== expectedHash) throw new Error(`Security patch source hash mismatch: ${label}`);
}

function safePath(directory, relative) {
  const target = path.resolve(directory, relative);
  if (!target.startsWith(directory + path.sep)) throw new Error(`Unsafe security patch path: ${relative}`);
  return target;
}

function replacementSource(filePatch, before, label) {
  let after;
  if (filePatch.payload) {
    after = normalize(fs.readFileSync(safePath(patchRoot, filePatch.payload), 'utf8'));
  } else {
    after = normalize(before);
    for (const edit of filePatch.edits) {
      const count = after.split(edit.before).length - 1;
      if (count !== 1) throw new Error(`Security patch expected one source anchor (${count} found): ${label}`);
      after = after.replace(edit.before, edit.after);
    }
  }
  verifySource(after, filePatch.afterHash, `${label} patch payload`);
  return after;
}

function applyBackports({ verifyOnly = false, root = workspaceRoot } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(patchRoot, 'manifest.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const writes = [];
  let verifiedPackages = 0;
  for (const packagePatch of manifest.packages) {
    const suffix = `node_modules/${packagePatch.name}`;
    const instances = Object.keys(lock.packages).filter(key => key === suffix || key.endsWith('/' + suffix));
    if (instances.length === 0) throw new Error(`Required security patch dependency missing: ${packagePatch.name}`);
    for (const instance of instances) {
      const packageDirectory = safePath(root, instance);
      const installed = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
      if (installed.name !== packagePatch.name || installed.version !== packagePatch.version || lock.packages[instance].version !== packagePatch.version) {
        throw new Error(`Security patch requires reviewed ${packagePatch.name}@${packagePatch.version}; inspect and update backport before upgrading`);
      }
      for (const filePatch of packagePatch.files) {
        const target = safePath(packageDirectory, filePatch.path);
        const exists = fs.existsSync(target);
        const current = exists ? fs.readFileSync(target, 'utf8') : '';
        const label = `${instance}/${filePatch.path}`;
        if (exists && hash(current) === filePatch.afterHash) continue;
        if (verifyOnly) throw new Error(`Required security patch missing or modified: ${label}; run npm run security:patch`);
        if (filePatch.beforeHash === null) {
          if (exists) throw new Error(`Security patch source hash mismatch: ${label}`);
        } else {
          if (!exists) throw new Error(`Security patch source missing: ${label}`);
          verifySource(current, filePatch.beforeHash, label);
        }
        writes.push({ target, source: replacementSource(filePatch, current, label) });
      }
      verifiedPackages++;
    }
  }
  // Validate every version, pre-image and payload before touching installed files.
  for (const { target, source } of writes) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source, 'utf8');
  }
  if (!verifyOnly && writes.length) return applyBackports({ verifyOnly: true, root });
  return { verifiedPackages, changedFiles: writes.length };
}

// Compatibility entry point for existing Metro and maintenance callers.
// Installed distributions are immutable: normal commands only verify them.
function run(options) {
  return require('./verify-frontend-security-vendors.cjs').run(options);
}

module.exports = { run, applyBackports, hash, verifySource };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--verify')) {
    console.error('Usage: node scripts/apply-frontend-security-patches.cjs [--verify]');
    process.exitCode = 1;
  } else {
    try {
      const result = run({ verifyOnly: args.includes('--verify') });
      console.log(`Verified immutable security forks for ${result.verifiedPackages} installed dependency packages`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
