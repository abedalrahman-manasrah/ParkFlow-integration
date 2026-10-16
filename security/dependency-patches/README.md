# Reviewed frontend dependency backports

These reviewed source corrections preserve the installed Expo SDK and CommonJS
interfaces. They originally shipped as guarded postinstall backports; they are
now embedded in the immutable private security distributions under
[security/vendor](../vendor/README.md). The original manifest, payloads and
licenses remain as auditable provenance and maintainer reconstruction tools.

| Original upstream source | Advisory | Source correction and provenance |
| --- | --- | --- |
| `braces@3.0.3` | GHSA-vfj7-8cjw-p6xm | Bound actual parser nesting to 100; iterative preflight also bounds externally supplied ASTs and rejects node cycles before compile, expand and stringify. This is a local implementation of the guard suggested in the [upstream issue](https://github.com/micromatch/braces/issues/70), not an upstream released fix. |
| `node-forge@1.4.0` | GHSA-86w9-cpqp-85rv | Exact `lib/rsa.js` security change from [upstream PR1159](https://github.com/digitalbazaar/forge/pull/1159), commit `db05494352dd3c9a5a07c5270333dcc78866cad2`. It requires canonical DigestInfo encoding, rejecting extra elements, content inside NULL parameters and non-minimal lengths while accepting optional empty NULL. The PR remains unmerged at verification time. |
| `decode-uri-component@0.2.2` | GHSA-vcc3-ghjq-m6fr | [Official v0.5.0 UTF-8 scanner](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0), with CommonJS export and retained 0.2.2 plus-to-space normalization. A local single-pass callback also removes the upstream replacement-map loop, which otherwise rescans all input for each distinct malformed run. `manifest.json` records the normalized upstream source hash and the adapted payload hash. |

The parser limit applies to actual nested containers, including parentheses;
escaped braces and quoted/bracketed literals retain their existing behavior.
This bound addresses stack exhaustion. It is not a general promise that arbitrary
untrusted regular expressions or combinatorial glob expansion are safe.

Upstream licenses are retained in this directory. Braces and the decoder use MIT;
Forge's original dual license includes the BSD license used for this backport.

## Installation and drift protection

The root npm overrides install private scoped forks from checked-in local
archives. The reviewed corrections are inside those archives, including for
`npm ci --ignore-scripts`. Normal postinstall, root test/typecheck/start/export
preflights and direct Metro entry verify the immutable distributions with
`scripts/verify-frontend-security-vendors.cjs`. No dependency source is rewritten
after installation. `npm run security:patch` remains a compatibility verification
command; `npm run security:verify` performs the same non-mutating checks.

The distribution verifier checks every source and installed file, each archive's
SHA-256 and SHA-512, root overrides, locked scoped identities/versions/local
archive paths/integrity, and all nested instances. Unexpected/missing files,
symlinks and source/archive/lock drift fail closed. See the
[vendor maintenance guide](../vendor/README.md) for provenance and repacking.

For reconstruction from verified original npm archives in an isolated staging
root, `scripts/apply-frontend-security-patches.cjs` exports
`applyBackports({ root: stagingRoot })`. It validates every reviewed upstream
version, source pre-image and payload hash before any source write, then verifies
the post-images. Its default `run()` and CLI entry points now delegate to the
immutable distribution verifier for compatibility with existing callers.

The original published upstream advisories remain open. npm audit does not
review private fork source, so the raw result must be reported separately from
the executable-code regression and distribution-integrity results. Removing the
unpatched published distributions is a reproducible source correction, not an
advisory suppression or a claim that an upstream fixed release exists.

## Verification

`tests/frontend-dependency-security.test.cjs` exercises the installed libraries:

- Excessive brace/parenthesis strings, deeply nested external ASTs and cycles are
  rejected; ranges, ordinary glob filtering, nesting within the limit, escaping
  and literal quoting retain their behavior.
- Actual RSA verification rejects extra DigestAlgorithm children, non-empty NULL
  parameters, and non-minimal inner and outer ASN.1 lengths. A count-only guard
  from the older upstream PR1152 was reproduced as insufficient and replaced
  with PR1159's canonical encoding check.
  Valid SHA-256/384/512 signatures with exponents 3 and 65537, optional NULL
  parameters, RSA-PSS/NONE, Expo certificates and CSR verification remain usable.
- Malformed URL corpora, including 24,000 distinct runs, complete in child
  processes with bounded time and heap.
  Arabic UTF-8, plus semantics, query-string arrays and real Expo Router path
  parsing retain their behavior.
- Fresh reviewed source can be reapplied, CRLF source is supported, and missing,
  changed or unreviewed dependency source is rejected before partial writes.

The negative cases were observed failing on the unpatched dependencies, then all
fourteen targeted tests passed on the patched dependencies. These are defensive
regression checks on local fixtures, with no provider requests or real accounts.
