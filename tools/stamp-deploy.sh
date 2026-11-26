#!/usr/bin/env bash
# Prepares a copy of site/ for deployment. Run by CI on the build runner; never on
# the working tree (it rewrites files in place).
#
#   tools/stamp-deploy.sh <site-dir> <version>
#
# 1. Versioned asset URLs: every CSS/JS reference in the pages and every relative
#    `import … from './x.js'` gets ?v=<version>. Each deploy therefore uses URLs no
#    cache has seen, so a CDN (Cloudflare) or browser can never mix files from two
#    deploys — which breaks ES modules and styles in confusing ways.
# 2. Build stamp: commit + date into js/core/version.js (shown in the app) and an
#    <meta name="app-version" content="<semver>+<build>"> on every page, so
#    `curl -s <site> | grep app-version` tells you what is live.
# 3. Service worker: VERSION and the precache list (with the same ?v= URLs) are
#    stamped into sw.js so one visit caches the whole app for offline use.
#
# Fails loudly if any rewrite didn't apply, so a half-stamped site never ships.
set -euo pipefail

dir=${1:?usage: stamp-deploy.sh <site-dir> <version>}
v=${2:?usage: stamp-deploy.sh <site-dir> <version>}
cd "$dir"

# --- 1. Versioned asset URLs -------------------------------------------------------
for f in *.html; do
  sed -E -i \
    -e "s#((href|src)=\")((css|js)/[^\"?]+\.(css|js))\"#\1\3?v=${v}\"#g" \
    -e "s#href=\"manifest\.webmanifest\"#href=\"manifest.webmanifest?v=${v}\"#" \
    "$f"
done
find js -name '*.js' -print0 | xargs -0 sed -E -i \
  -e "s#(from[[:space:]]+')(\.\.?/[^'?]+\.js)'#\1\2?v=${v}'#g"

# Every relative import and page asset must now be versioned.
if grep -rnE "from[[:space:]]+'\.\.?/[^'?]+\.js'" js; then
  echo "stamp-deploy: unversioned imports remain (above)" >&2
  exit 1
fi
if grep -nE "(href|src)=\"(css|js)/[^\"?]+\"" *.html; then
  echo "stamp-deploy: unversioned page assets remain (above)" >&2
  exit 1
fi

# --- 2. Build stamp -----------------------------------------------------------------
app=$(sed -nE "s/^export const APP_VERSION = '([^']+)';/\1/p" js/core/version.js)
[ -n "$app" ] || { echo "stamp-deploy: APP_VERSION not found in js/core/version.js" >&2; exit 1; }
sed -i \
  -e "s#^export const BUILD = 'dev';#export const BUILD = '${v}';#" \
  -e "s#^export const BUILD_DATE = '';#export const BUILD_DATE = '$(date -u +%Y-%m-%d)';#" \
  js/core/version.js
grep -q "^export const BUILD = '${v}';" js/core/version.js || { echo "stamp-deploy: BUILD not stamped" >&2; exit 1; }
for f in *.html; do
  sed -i "s#^  <meta charset=\"UTF-8\">#&\n  <meta name=\"app-version\" content=\"${app}+${v}\">#" "$f"
  grep -q "name=\"app-version\" content=\"${app}+${v}\"" "$f" || { echo "stamp-deploy: app-version meta missing in $f" >&2; exit 1; }
done

# --- 3. Service worker -------------------------------------------------------------
files=$(find . -type f ! -name sw.js ! -name CNAME | sed 's#^\./##' | sort |
  jq -R --arg v "$v" 'if test("\\.(js|css|webmanifest|json)$") then . + "?v=" + $v else . end' | jq -sc .)
sed -i \
  -e "s#^const VERSION = 'dev';#const VERSION = '${v}';#" \
  -e "s#^const PRECACHE = \[\];#const PRECACHE = ${files};#" \
  sw.js
grep -q "^const VERSION = '${v}';" sw.js || { echo "stamp-deploy: VERSION not stamped" >&2; exit 1; }
grep -q '^const PRECACHE = \["' sw.js || { echo "stamp-deploy: PRECACHE not stamped" >&2; exit 1; }

echo "stamped ${app}+${v}: $(grep -c "?v=${v}" -r . | awk -F: '{s+=$2} END {print s}') versioned references"
