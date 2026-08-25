const CACHE = "level90-v27";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./cloud.js",
  "./notifications.js",
  "./app.js",
  "./data/initial-data.json",
  "./manifest.webmanifest",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.hostname.endsWith(".supabase.co")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {body:event.data?.text() || "You have a new Level90 notification."};
  }
  const title = payload.title || "Level90";
  const targetUrl = new URL(payload.url || "./index.html#today",self.registration.scope).href;
  const icon = new URL(payload.icon || "./icons/icon-192.png",self.registration.scope).href;
  const badge = new URL(payload.badge || "./icons/icon-192.png",self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title,{
    body:payload.body || "Your next level is waiting.",
    icon,
    badge,
    tag:payload.tag || "level90-notification",
    renotify:false,
    data:{url:targetUrl}
  }));
});

self.addEventListener("notificationclick", event => {
  const targetUrl = event.notification.data?.url || new URL("./index.html#today",self.registration.scope).href;
  event.notification.close();
  event.waitUntil((async()=>{
    const target = new URL(targetUrl);
    const view = target.hash.replace(/^#/,"") || "today";
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const appWindow = windows.find(client=>new URL(client.url).origin === target.origin);
    if (!appWindow) return self.clients.openWindow(targetUrl);
    try {
      if ("navigate" in appWindow) await appWindow.navigate(targetUrl);
    } catch {}
    appWindow.postMessage({type:"LEVEL90_OPEN_VIEW",view});
    return appWindow.focus();
  })());
});
