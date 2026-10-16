# Reproducible frontend security distributions — 2026-10-16

The three reviewed source corrections now ship as immutable private npm
distributions. This replaces the previous postinstall-only correction mechanism
while retaining the existing Expo SDK, React Native versions, application
features and CommonJS require contracts.

## Upstream reassessment

A fresh unfiltered official-registry audit before the distribution change still
reported 22 findings: 19 high and three moderate, propagated from three roots.
Official registry metadata and primary advisories were checked again on
2026-10-16:

| Root | Current official release | Compatibility and remaining upstream issue |
| --- | --- | --- |
| braces | 3.0.3 | The nesting advisory has no published patched version; Metro still depends on it through micromatch. |
| node-forge | 1.4.0 | The DigestInfo advisory has no published patched version; the exact canonical-encoding correction in PR1159 remains open. |
| decode-uri-component | 0.5.0 | The fixed official release is ESM; current Router 57 uses query-string 7.1.3 and synchronous CommonJS namespace contracts. |

The current SDK57 tags are Expo 57.0.30 and Router 57.0.28. They retain the same
audited root chains. Registry metadata for Expo 58.0.11/Router 58.0.20 shows that
Router removes query-string, but the latest Expo CLI still depends on Forge and
Metro 0.87.1 still depends on micromatch/braces. Therefore a broad SDK58 migration
would not remove the two unresolved high-severity root advisories, while adding
native/module compatibility changes. No such migration or audit-force downgrade
was applied.

## Distribution correction

The forks are `@parkflow/security-braces@3.0.3-parkflow.1`,
`@parkflow/security-node-forge@1.4.0-parkflow.1` and
`@parkflow/security-decode-uri-component@0.2.2-parkflow.1`. Each starts from an
official npm archive whose SHA-512 was checked against both the original lockfile
and fresh registry metadata. Only the exact previously reviewed executable
corrections, explicit private fork metadata and provenance were added. Upstream
licenses and attribution remain. Every original file hash, reviewed changed-file
hash and complete fork archive hash is recorded.

Forge's full lib CommonJS API remains, including deep imports and the worker
source. Its obsolete prebuilt browser bundles/maps and Flash SWF are excluded;
the bundles contain an uncorrected copy of RSA code. Application and Expo
consumer searches found no references to these excluded paths. That legacy
browser-script/Flash distribution is outside this private CJS fork's scope.

The root lockfile and overrides resolve original require slots to checked-in
archives containing the corrected code. Installs with lifecycle scripts disabled
receive the same fixes. Normal lifecycle commands only verify; they do not mutate
dependencies. Source/archive hashes, exact lock identities/versions/local archive
paths/integrity and every installed file/instance fail closed on drift.

The original exploit and positive compatibility regressions remain. Additional
controlled filesystem regressions reject source/archive/installed drift,
unreviewed nested instances, lock changes, removed overrides, missing files and
unsafe paths. The new verifier was observed failing before implementation and
then passed its controlled regression tests. An additional physical-slot
regression reproduced actual parent resolution of an unlocked nested package
while the prior lock-only verifier incorrectly passed. The corrected verifier
discovers node_modules under installed build/lib/src importers, workspace
source and root tooling independently of lock entries. It rejects unlocked
slots, module-file shadows, noncanonical protected-name case and unreviewed
links, retaining valid workspace links without following arbitrary or cyclic
links. The separate server/runtime graphs and vendor-source area are excluded. The CI workflow is configured to perform a clean Linux install with
scripts disabled, immutable verification, the full frontend suite, workspace
typechecking and an unfiltered audit.

## Audit interpretation and maintenance

npm audit does not audit the source of private custom forks. Removing the
unpatched published distributions from the graph can clear their package-based
alerts, but is not evidence that custom code or upstream packages have no defects.
The source corrections and executable regressions provide the independent
evidence for these three known code paths. No advisory allowlist, severity
exemption, development-dependency omission or fictitious upstream fixed version
is used. The three upstream advisories remain open and must still be tracked.

Full installation, audit, complete-suite, typecheck and export results are
reported with the coordinated production-hardening verification. Repacking the
same source must reproduce each checked-in archive hash. Future changes require
reviewed source, a new honest fork version, updated provenance/source/archive
hashes, a synchronized override/lock update and the same complete verification.

See the [distribution and maintenance guide](../../security/vendor/README.md)
and [original reviewed corrections](../../security/dependency-patches/README.md).
Primary references: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[Forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr),
[Forge PR1159](https://github.com/digitalbazaar/forge/pull/1159), and
[query-string 9.5.1 export](https://raw.githubusercontent.com/sindresorhus/query-string/v9.5.1/index.js).
