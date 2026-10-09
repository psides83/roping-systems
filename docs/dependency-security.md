# Dependency Security Review

Reviewed October 8, 2026.

- Next.js and eslint-config-next updated from 16.3.6 to 16.3.8. Their
  version ranges stay on the existing minor release (~16.3.8).
- source-map-js updated to 1.2.2.
- npm audit --omit=dev reports zero vulnerabilities after these updates.

The full audit still reports five development-only package warnings, all from
one unresolved braces advisory (GHSA-vfj7-8cjw-p6xm): braces -> micromatch ->
fast-glob -> @next/eslint-plugin-next -> eslint-config-next. The advisory and
package registry report no patched braces release. The current lint config does
not configure a Next.js rootDir glob; the plugin defaults to the known working
directory instead. Keep lint settings and glob inputs developer-controlled.

Do not use npm audit fix --force: its suggested framework-lint downgrade is not
compatible with this app's Next.js version. Recheck this advisory when an
upstream fix is published. This is a documented residual tooling risk, not a
claim that all dependency findings are resolved.

Sources:
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4

Verification: npm audit --json, npm audit --omit=dev --json, full lint,
application tests and production build.
