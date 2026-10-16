# Private frontend security distributions

These source distributions are private ParkFlow forks of three upstream libraries.
They carry the exact previously reviewed executable corrections under explicit
scoped names and honest ParkFlow prerelease versions. The root npm overrides
install the checked-in immutable archives into the original require slots, so
`require('braces')`, `require('node-forge')` and
`require('decode-uri-component')` keep their CommonJS contracts.

The fixes are present inside each archive. An install with `--ignore-scripts`
therefore receives corrected code too. The normal lifecycle verifies artifacts
and installed code; it does not patch dependencies after installation.

| Private package | Original source | Executable correction |
| --- | --- | --- |
| `@parkflow/security-braces@3.0.3-parkflow.1` | `braces@3.0.3` | Parser nesting limit and iterative AST depth/cycle validation before recursive walkers. |
| `@parkflow/security-node-forge@1.4.0-parkflow.1` | `node-forge@1.4.0` | Canonical RSA DigestInfo validation from upstream PR1159, commit `db05494352dd3c9a5a07c5270333dcc78866cad2`. |
| `@parkflow/security-decode-uri-component@0.2.2-parkflow.1` | `decode-uri-component@0.2.2` API with the official 0.5.0 scanner | CommonJS and plus normalization retained; a single-pass malformed-run replacement removes repeated full-input rescans. |

The forks were reconstructed from official npm archives whose SHA-512 integrity
was checked against the original lockfile and fresh official registry metadata.
Each package retains its upstream license, README and source attribution. Its
`PROVENANCE.json` records the official archive URL, integrity and SHA-256, every
original source hash, the exact reviewed pre/post patch hashes, metadata changes
and excluded artifacts. The root `manifest.json` records every distributed
source hash and the complete immutable fork archive SHA-256 and SHA-512.

Forge retains its full `lib` CommonJS main and deep-source API, including
`lib/prime.worker.js`. Its obsolete precompiled browser bundles and maps under
`dist` and the Flash SWF are excluded. The browser bundles duplicate the
unpatched RSA implementation and cannot be shipped as fixed code. The ParkFlow
applications and Expo consumers import the CommonJS main; a search of those
consumers found no references to the excluded browser or Flash paths. This fork
does not provide those legacy browser-script/Flash distributions.

## Verification

`scripts/verify-frontend-security-vendors.cjs` is dependency-free and never writes.
It checks every source file, archive hash, root override, locked identity/version/
local archive location/integrity, and every installed instance including nested
instances. Missing, changed, extra or symlinked distribution files fail closed.
Physical original-name slots are also discovered independently of the lockfile
by walking frontend source/tooling, installed-package and declared-workspace
directories to find node_modules at every importer level, including build/lib/src
subdirectories. Unlocked slots, module-file shadows, noncanonical protected-name
case and unreviewed dependency links fail closed.
Known declared/locked workspace links are scanned through their actual workspace
paths; arbitrary links are never followed. The separate server install is outside
this frontend graph. Other dependency contents remain governed by the lockfile
and npm audit.
Vendor bytes are preserved across Git checkouts by `.gitattributes`.

The original exploit/compatibility regressions in
`tests/frontend-dependency-security.test.cjs` load the installed forks through
the original require slots. The original source patch manifest and installer
remain as maintainer reconstruction tools, with fixture regressions; normal
installation and startup use the distribution verifier. Separate verifier tests
exercise source/archive/installed drift and extra unreviewed nested instances.

## Maintenance and reproducibility

These archives are repository artifacts, not registry publications. Do not edit
the version or package name of an uncorrected upstream archive to clear an audit.
Do not remove executable regressions, add advisory exemptions, or omit development
dependencies from the reported audit.

1. Fetch the exact upstream version with `npm pack <name>@<version> --ignore-scripts`
   using the official registry. Verify its SHA-512 against the recorded upstream
   integrity before extracting. Compare the original files with the provenance
   hashes.
2. Apply the reviewed source corrections from
   `security/dependency-patches/manifest.json` in an isolated staging install.
   The existing installer module supports `applyBackports({ root: stagingRoot })` and checks
   all pre/post-image hashes before any write. Review new upstream sources before
   changing any hash or patch. Preserve licenses and record any API scope changes.
3. Reconstruct the explicit private fork metadata and provenance. All distributed
   bytes must match the reviewed source manifest. For a changed fork, increment
   its ParkFlow prerelease version and update the provenance and source hashes.
4. Pack each source directory with `npm pack ./security/vendor/<name> --ignore-scripts
   --pack-destination ./security/vendor/archives --json`. Packing the same source
   twice must reproduce the same archive bytes. Record the archive SHA-256 and
   SHA-512 in the manifest. Update the root override and lockfile together.
   npm 11 can resolve a newly added relative file override from an existing
   transitive parent directory while migrating an old installed tree. A fresh
   three-parent graph and repeated installs use the correct portable root paths.
   For that migration, obtain the fork lock entries from a fresh isolated
   install, transplant only those genuine scoped package entries with the root
   relative archive paths, and validate the resulting lock through a clean
   `npm ci --ignore-scripts`. Keep all unrelated locked versions unchanged. Do
   not commit machine-specific absolute paths or work around this by forging
   package versions. The actual three-parent fresh, old-tree failure, minimal
   lock migration, clean-install and repeat-install cases were reproduced.
5. Run a clean install with scripts disabled, the distribution verifier, executable
   dependency regressions, the complete suites, TypeScript and customer web/native
   plus management web exports. Record the full unfiltered npm audit separately.

The upstream braces and Forge advisories still have no published fixed release.
The decoder has an official 0.5.0 fix, but its ESM export does not match the current
Router dependency chain's CommonJS contract. npm audit does not review custom fork
source code. A clean audit after installing these forks therefore means the
unpatched published package identities were removed from this dependency graph;
it is not proof that custom forks or all upstream issues are free of defects.
Continue tracking the three upstream advisories and replace a fork with a
compatible verified upstream correction when available.

References: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[Forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
[decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr),
[Forge correction](https://github.com/digitalbazaar/forge/pull/1159).
