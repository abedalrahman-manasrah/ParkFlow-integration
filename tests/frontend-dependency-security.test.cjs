const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const braces = require('braces');
const forge = require('node-forge');
const decode = require('decode-uri-component');
const queryString = require('query-string');

function externalNestedAst(depth) {
  const rootNode = { type: 'root', nodes: [] };
  let current = rootNode;
  for (let index = 0; index < depth; index++) {
    const next = { type: 'paren', nodes: [], parent: current };
    current.nodes.push(next);
    current = next;
  }
  current.nodes.push({ type: 'text', value: 'ok', parent: current });
  return rootNode;
}

test('braces rejects excessive brace and parenthesis nesting before recursive walkers', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const input = open.repeat(130) + 'a,b' + close.repeat(130);
    for (const operation of ['parse', 'compile', 'expand', 'stringify']) {
      assert.throws(() => braces[operation](input), { name: 'SyntaxError', message: /nesting.*safety limit/i }, `${operation} must reject excessive ${open} nesting`);
    }
  }
});

test('braces rejects deep externally supplied ASTs and cycles without stack exhaustion', () => {
  for (const operation of ['compile', 'expand', 'stringify']) {
    assert.throws(() => braces[operation](externalNestedAst(130)), { name: 'SyntaxError', message: /nesting.*safety limit/i });
    const cycle = { type: 'root', nodes: [] };
    cycle.nodes.push(cycle);
    assert.throws(() => braces[operation](cycle), { name: 'SyntaxError', message: /cyclic.*AST/i });
  }
});

test('ordinary braces, ranges, regexes, escaping and allowed nesting preserve Metro glob contracts', () => {
  assert.deepEqual(braces.expand('app/{customer,management}/{1..3}'), ['app/customer/1', 'app/customer/2', 'app/customer/3', 'app/management/1', 'app/management/2', 'app/management/3']);
  assert.equal(braces.compile('a/{b,{c,d}}/e'), 'a/(b|(c|d))/e');
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.deepEqual(braces.expand('file-\\{literal\\}.js'), ['file-{literal}.js']);
  assert.equal(braces.compile('('.repeat(100) + 'ok' + ')'.repeat(100)), '('.repeat(100) + 'ok' + ')'.repeat(100));
  assert.deepEqual(braces.expand('"' + '{'.repeat(130) + '"'), ['{'.repeat(130)]);
  assert.equal(braces.compile('[' + '{'.repeat(130) + ']'), '[' + '{'.repeat(130) + ']');
  assert.equal(braces.stringify(externalNestedAst(100)), 'ok');
  const micromatch = require('micromatch');
  assert.deepEqual(micromatch(['app/a.ts', 'app/a.tsx', 'app/a.js', 'other/a.ts'], 'app/*.{ts,tsx}'), ['app/a.ts', 'app/a.tsx']);
});

const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const publicKey = forge.pki.publicKeyFromPem(pair.publicKey.export({ format: 'pem', type: 'spki' }).toString());
const privateKey = forge.pki.privateKeyFromPem(pair.privateKey.export({ format: 'pem', type: 'pkcs1' }).toString());

function digestInfoBytes(digest, children) {
  const asn1 = forge.asn1;
  const algorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children);
  const info = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [algorithm, asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest)]);
  return Buffer.from(asn1.toDer(info).getBytes(), 'binary');
}

function signEncodedInfo(der) {
  const encoded = Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(128 - der.length - 3, 0xff), Buffer.from([0]), der]);
  return crypto.privateEncrypt({ key: pair.privateKey, padding: crypto.constants.RSA_NO_PADDING }, encoded).toString('binary');
}

function signDigestInfo(digest, children) {
  return signEncodedInfo(digestInfoBytes(digest, children));
}

function algorithmChildren() {
  const asn1 = forge.asn1;
  return [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()), asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '')];
}

test('Forge rejects extra nested DigestAlgorithm children in actual RSA verification', () => {
  const digest = forge.md.sha256.create().update('ParkFlow verification regression').digest().getBytes();
  const children = algorithmChildren();
  children.push(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, 'unconsumed padding'));
  assert.throws(() => publicKey.verify(digest, signDigestInfo(digest, children)), /does not contain a valid.*DigestInfo/i);
});

test('Forge rejects NULL parameter content even when nested element count is correct', () => {
  const digest = forge.md.sha256.create().update('NULL parameter regression').digest().getBytes();
  const children = algorithmChildren();
  children[1] = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, 'hidden attacker-controlled bytes');
  assert.throws(() => publicKey.verify(digest, signDigestInfo(digest, children)), /does not contain a valid.*DigestInfo/i);
});

test('Forge rejects non-minimal outer and inner DigestInfo length encodings', () => {
  const digest = forge.md.sha256.create().update('length encoding regression').digest().getBytes();
  const der = digestInfoBytes(digest, algorithmChildren());
  const nonMinimalOuter = Buffer.concat([Buffer.from([der[0], 0x81, der[1]]), der.subarray(2)]);
  const nonMinimalInner = Buffer.concat([Buffer.from([der[0], der[1] + 1, der[2], 0x81, der[3]]), der.subarray(4)]);
  for (const nonCanonical of [nonMinimalOuter, nonMinimalInner]) {
    assert.throws(() => publicKey.verify(digest, signEncodedInfo(nonCanonical)), /does not contain a valid.*DigestInfo/i);
  }
});

test('Forge valid SHA256 signatures with optional NULL and Expo certificate/CSR operations still work', () => {
  const digest = forge.md.sha256.create().update('valid message').digest().getBytes();
  for (const children of [algorithmChildren(), algorithmChildren().slice(0, 1)]) {
    assert.equal(publicKey.verify(digest, signDigestInfo(digest, children)), true);
  }
  const signing = require('@expo/code-signing-certificates');
  const keyPair = { publicKey, privateKey };
  const certificate = signing.generateSelfSignedCodeSigningCertificate({ keyPair, commonName: 'ParkFlow security test', validityNotBefore: new Date(Date.now() - 60000), validityNotAfter: new Date(Date.now() + 3600000) });
  signing.validateSelfSignedCertificate(certificate, keyPair);
  const signature = signing.signBufferRSASHA256AndVerify(privateKey, certificate, Buffer.from('manifest'));
  assert.equal(publicKey.verify(forge.md.sha256.create().update('manifest').digest().getBytes(), forge.util.decode64(signature)), true);
  assert.equal(signing.generateCSR(keyPair, 'ParkFlow test CSR').verify(), true);
});

test('canonical Forge verification interoperates with Node SHA256/384/512, RSA-PSS and NONE', () => {
  const message = Buffer.from('ParkFlow valid signature compatibility');
  for (const publicExponent of [3, 65537]) {
    const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 1024, publicExponent });
    const key = forge.pki.publicKeyFromPem(keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString());
    for (const algorithm of ['sha256', 'sha384', 'sha512']) {
      const digest = crypto.createHash(algorithm).update(message).digest('binary');
      const signature = crypto.sign(algorithm, message, keyPair.privateKey).toString('binary');
      assert.equal(key.verify(digest, signature), true, `${algorithm} exponent ${publicExponent}`);
      assert.equal(key.verify('x'.repeat(digest.length), signature), false);
    }
  }
  const signature = crypto.sign('sha256', message, { key: pair.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString('binary');
  const scheme = forge.pss.create({ md: forge.md.sha256.create(), mgf: forge.mgf.mgf1.create(forge.md.sha256.create()), saltLength: 32 });
  assert.equal(publicKey.verify(crypto.createHash('sha256').update(message).digest('binary'), signature, scheme), true);
  const digest = 'raw test digest';
  assert.equal(publicKey.verify(digest, privateKey.sign(digest, 'NONE'), 'NONE'), true);
});

test('malformed percent-encoded URL decoding completes in a bounded child process', () => {
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', "const d=require('decode-uri-component');const s='%FF'.repeat(6000);if(d(s)!==s)process.exit(2);"], { cwd: root, timeout: 2500, encoding: 'utf8' });
  assert.equal(result.error, undefined, `decoder must not stall: ${result.error?.code}`);
  assert.equal(result.status, 0, result.stderr);
});

test('many distinct malformed URL runs do not repeatedly rescan the entire input', () => {
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', "const d=require('decode-uri-component');const s=Array.from({length:24000},(_,i)=>'%FF'+Array.from(String(i),c=>'%'+c.charCodeAt(0).toString(16)).join('')).join('|');const expected=Array.from({length:24000},(_,i)=>'%FF'+i).join('|');if(d(s)!==expected)process.exit(2);"], { cwd: root, timeout: 2500, encoding: 'utf8' });
  assert.equal(result.error, undefined, `decoder must not stall on distinct runs: ${result.error?.code}`);
  assert.equal(result.status, 0, result.stderr);
});

test('decoder CommonJS, Arabic UTF8, literal plus and query-string router contracts remain compatible', () => {
  assert.equal(typeof decode, 'function');
  assert.equal(decode('%D8%A7%D9%84%D9%85%D9%88%D9%82%D9%81'), 'الموقف');
  assert.equal(decode('a+b%2Bc'), 'a b+c');
  assert.equal(decode('%E2%82%AC%FF%41'), '€%FFA');
  assert.equal(decode('%FE%FF'), '\uFFFD\uFFFD');
  assert.equal(decode('%C2'), '\uFFFD');
  assert.throws(() => decode(123), TypeError);
  assert.deepEqual({ ...queryString.parse('name=%D9%85%D9%88%D9%82%D9%81+%D8%AC%D8%AF%D9%8A%D8%AF&tag=a%2Bb&tag=c&empty=') }, { empty: '', name: 'موقف جديد', tag: ['a+b', 'c'] });
  const { getStateFromPath } = require('expo-router/build/react-navigation/core/getStateFromPath');
  const state = getStateFromPath('/map?name=%D9%85%D9%88%D9%82%D9%81+%D8%AC%D8%AF%D9%8A%D8%AF&tag=a%2Bb', { screens: { map: 'map' } });
  assert.equal(state.routes[0].params.name, 'موقف جديد');
  assert.equal(state.routes[0].params.tag, 'a+b');
});

test('dependency patch verification fails closed for missing or modified installed source', () => {
  const script = path.join(root, 'scripts/verify-frontend-security-vendors.cjs');
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { verifySource } = require('../scripts/apply-frontend-security-patches.cjs');
  assert.throws(() => verifySource('altered source', '0'.repeat(64), 'fixture'), /source.*mismatch/i);
});

function installedFixture(runTest) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(temporaryRoot, 'parkflow-security-patches-'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'security/dependency-patches/manifest.json'), 'utf8'));
  const packages = {};
  try {
    for (const item of manifest.packages) {
      const instance = 'node_modules/' + item.name;
      const directory = path.join(fixture, instance);
      fs.mkdirSync(directory, { recursive: true });
      // Maintainer backport fixtures model the verified original npm package,
      // while executable controls above load the actual installed scoped fork.
      const installedMetadata = JSON.parse(fs.readFileSync(path.join(root, instance, 'package.json'), 'utf8'));
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ ...installedMetadata, name: item.name, version: item.version }));
      packages[instance] = { version: item.version };
      for (const file of item.files) {
        const target = path.join(directory, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, instance, file.path), target);
      }
    }
    fs.writeFileSync(path.join(fixture, 'package-lock.json'), JSON.stringify({ packages }));
    return runTest(fixture, manifest);
  } finally {
    const resolved = path.resolve(fixture);
    if (!resolved.startsWith(temporaryRoot + path.sep) || !path.basename(resolved).startsWith('parkflow-security-patches-')) throw new Error('Unsafe fixture cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('patch installation is repeatable, restores reviewed pre-images and handles CRLF source', () => {
  const { applyBackports: run, hash } = require('../scripts/apply-frontend-security-patches.cjs');
  installedFixture((fixture, manifest) => {
    for (const packagePatch of manifest.packages.filter(item => item.name !== 'decode-uri-component')) {
      for (const file of packagePatch.files) {
        const target = path.join(fixture, 'node_modules', packagePatch.name, file.path);
        if (file.beforeHash === null) {
          fs.unlinkSync(target);
          continue;
        }
        let source = fs.readFileSync(target, 'utf8');
        for (const edit of file.edits.slice().reverse()) source = source.replace(edit.after, edit.before);
        assert.equal(hash(source), file.beforeHash);
        fs.writeFileSync(target, source.replace(/\n/g, '\r\n'));
      }
    }
    assert.throws(() => run({ root: fixture, verifyOnly: true }), /patch missing or modified/);
    run({ root: fixture });
    assert.equal(run({ root: fixture }).changedFiles, 0);
    assert.equal(run({ root: fixture, verifyOnly: true }).verifiedPackages, 3);
  });
});

test('unexpected dependency versions, modified source and missing packages fail closed without partial writes', () => {
  const { applyBackports: run } = require('../scripts/apply-frontend-security-patches.cjs');
  installedFixture(fixture => {
    const guard = path.join(fixture, 'node_modules/braces/lib/security-depth.cjs');
    const rsa = path.join(fixture, 'node_modules/node-forge/lib/rsa.js');
    fs.unlinkSync(guard);
    fs.appendFileSync(rsa, '\n// unexpected installed modification\n');
    assert.throws(() => run({ root: fixture }), /source hash mismatch/);
    assert.equal(fs.existsSync(guard), false, 'all pre-images must validate before any write');
    assert.throws(() => run({ root: fixture, verifyOnly: true }), /patch missing or modified/);
  });
  installedFixture(fixture => {
    const metadata = path.join(fixture, 'node_modules/braces/package.json');
    const item = JSON.parse(fs.readFileSync(metadata, 'utf8'));
    fs.writeFileSync(metadata, JSON.stringify({ ...item, version: '3.0.4' }));
    assert.throws(() => run({ root: fixture }), /requires reviewed braces@3\.0\.3/);
  });
  installedFixture(fixture => {
    const lockfile = path.join(fixture, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockfile, 'utf8'));
    delete lock.packages['node_modules/node-forge'];
    fs.writeFileSync(lockfile, JSON.stringify(lock));
    assert.throws(() => run({ root: fixture }), /dependency missing: node-forge/);
  });
});
