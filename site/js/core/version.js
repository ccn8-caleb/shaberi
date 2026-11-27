// App version.
//
// APP_VERSION: bump the patch number for every release (0.1.1, 0.1.2, …), and add a
//   matching "## [x.y.z]" entry to CHANGELOG.md — CI fails without one.
// BUILD / BUILD_DATE: stamped by tools/stamp-deploy.sh at deploy time
//   (commit hash and UTC date). They stay 'dev' / '' when running locally.

export const APP_VERSION = '0.1.8';
export const BUILD = 'dev';
export const BUILD_DATE = '';

export function versionLabel() {
  if (BUILD === 'dev') return `v${APP_VERSION} · dev build`;
  return `v${APP_VERSION} · build ${BUILD.slice(0, 7)}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}`;
}
