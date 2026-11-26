// Installable app + offline support.
//
// The service worker (site/sw.js) is network-first: online you always get the latest
// deploy, offline you get the last copy cached. Install prompts are offered from the
// ⋯ sheet when the browser supports them (Chrome/Edge/Android); iOS uses Share → Add
// to Home Screen.

let deferredPrompt = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // show our own button instead of the mini-infobar
  deferredPrompt = e;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
});

export const installAvailable = () => Boolean(deferredPrompt);
export const onInstallAvailable = (fn) => listeners.add(fn);

export async function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => {});
  deferredPrompt = null;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  // Resolved against this module so it works from any page in site/.
  navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch((err) => console.warn('[pwa] service worker failed', err));
}
