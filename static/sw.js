// TaskFlow Service Worker
const CACHE = "taskflow-v2";
const ASSETS = [
  "/",
  "/static/css/style.css",
  "/static/js/app.js",
  "/manifest.json"
];

// Instalar — pré-cache dos assets estáticos
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Ativar — limpar caches antigos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch:
//  - APIs: network-first com fallback para erro JSON
//  - Estáticos: cache-first com atualização em background (stale-while-revalidate)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Não interceptar requests para outras origens (Google, CDN Chart.js, etc)
  if (url.origin !== self.location.origin) return;

  // Rotas de API — sempre network-first
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(req).catch(() =>
        new Response(
          JSON.stringify({ error: "Sem ligação. Verifica a tua internet." }),
          { headers: { "Content-Type": "application/json" }, status: 503 }
        )
      )
    );
    return;
  }

  // Estáticos — cache-first com revalidação
  e.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Push notifications (opcional)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow("/");
    })
  );
});
