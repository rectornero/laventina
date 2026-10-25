// Laventina's service worker: shows push notifications and opens the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "Laventina", {
    body: m.body || "",
    tag: m.tag || undefined,
    renotify: !!m.tag,
    // The bell should feel like a bell: a ring pattern, and it stays until someone looks.
    vibrate: m.tag === "bell" ? [180, 80, 180, 80, 400] : undefined,
    requireInteraction: m.tag === "bell",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { url: m.url || "/" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); try { await w.navigate(url); } catch {} return; }
    }
    await self.clients.openWindow(url);
  })());
});

// Shared from another app (the Share menu, see "share_target" in the manifest): keep it for the page and open Laventina.
// Only this one POST is handled here; every other request goes to the network as usual.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share-in") return;
  e.respondWith((async () => {
    try {
      const form = await e.request.formData();
      const cache = await caches.open("laventina-share");
      const meta = { title: form.get("title") || "", text: form.get("text") || "", url: form.get("url") || "" };
      await cache.put("/share/meta", new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
      const img = form.get("image");
      if (img && typeof img !== "string" && img.size) await cache.put("/share/image", new Response(img, { headers: { "content-type": img.type || "image/jpeg" } }));
      else await cache.delete("/share/image");
    } catch {}
    return Response.redirect("/?share=1", 303);
  })());
});
