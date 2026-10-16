# Frontend dependency security corrections — 2026-10-15

The frontend dependency distribution status below is historical. See the
[2026-10-16 distribution correction](2026-10-16-frontend-security-distributions.md)
for the immutable private forks, source verification and audit interpretation.

This follows the [2026-10-14 email/account isolation audit](2026-10-14-email-settings-audit.md).
The user authorized correction of the remaining frontend library issues while
preserving the existing application features.

## Current upstream state and reachability

Registry metadata checked on 2026-10-15 still reports `braces@3.0.3` and
`node-forge@1.4.0` as their newest published versions. The respective reviewed
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and
[Forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) show no patched
release. The official decoder has a fixed 0.5.0 release, but its ESM-only export
does not match the CommonJS caller in the current Router dependency chain.

| Chain | Exposure |
| --- | --- |
| Expo 57.0.27 → Expo Metro 56.0.2 → metro-file-map 0.84.5 → micromatch 4.0.8 → braces 3.0.3 | Build/development glob tooling; normal application endpoints do not expose raw patterns. |
| Expo 57.0.27 → Expo CLI 57.0.28 / code-signing-certificates 0.0.6 → node-forge 1.4.0 | Certificate, CSR and manifest signing verification in development/build tooling; no application login verification use observed. |
| Expo Router 57.0.25 → query-string 7.1.3 → decode-uri-component 0.2.2 | Runtime URL/query parsing, including attacker-controlled malformed URL input. |

Router's latest 57.x release checked, 57.0.27, still depends on query-string
`^7.1.3`. A forced Expo downgrade suggested by raw npm audit would remove
existing features. An ESM decoder override would break the current synchronous
CommonJS contract. Neither was applied.

## Implemented corrections

The repository carries narrowly scoped, source-hash-checked local backports.
Published package versions and advisory data remain unchanged. Installation
applies them automatically and development/build/test preflights verify them.
Unexpected package versions or source modifications require a deliberate review.

The braces correction bounds actual AST nesting and prevents external AST cycles
from reaching recursive walkers. Forge receives the exact canonical DigestInfo
encoding check from [upstream PR1159](https://github.com/digitalbazaar/forge/pull/1159)
at commit `db05494352dd3c9a5a07c5270333dcc78866cad2`. Counting nested children alone
was reproduced as insufficient: non-empty NULL parameters and non-minimal ASN.1
length encodings still passed the older proposed PR1152 guard. The decoder receives the official linear
UTF-8 scanner while retaining the existing CommonJS and plus normalization
contracts. A local single-pass callback also prevents full-input rescans for each
distinct malformed run in the official release's outer replacement-map loop.
See the [patch manifest and maintenance instructions](../../security/dependency-patches/README.md)
for hashes, provenance, licenses and removal conditions.

## Verification and audit interpretation

The initial targeted run passed three positive controls and failed five checks:
deep patterns and ASTs were accepted, malformed nested DigestAlgorithm content
was accepted by actual RSA verification, malformed URL decoding exceeded a
bounded child heap, and the required installation guard did not exist.
After the fixes, **fourteen targeted tests pass**, including positive Router,
globbing, certificate/CSR/signature behavior and reproducibility/drift checks.
Forge also interoperates with Node SHA-256/384/512 signatures for exponents 3
and 65537, and preserves RSA-PSS and NONE verification.
The repeated malformed URL child completed in approximately 120ms on this host.
A separate 24,000-distinct-run regression timed out at 2.5 seconds with the
upstream outer replacement loop and completed in approximately 435ms after
single-pass replacement, with every decoded value verified.

The current raw audit reports **22 findings: 19 high and three moderate** from
these three roots and propagated parents. It cannot identify a downstream source
backport from the unchanged published version numbers. That result is preserved
and disclosed; it is not reported as zero. The targeted regression tests verify
that the identified vulnerable code paths are corrected in this installation.

These corrections do not establish absence of every future issue in those
packages. Maintainers must replace temporary patches with compatible upstream
fixes when available, preserve the hash/version guard and rerun verification.
Full-suite, TypeScript and export evidence is recorded in the accompanying web
session security report after coordinated final checks.
