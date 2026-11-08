/* Service worker mínimo: cache do shell para abrir offline e instalar como PWA.
   Não interfere nas chamadas do Firebase (essas sempre vão para a rede). */
const CACHE = 'rifas-audita-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Firebase, APIs e qualquer domínio externo: sempre rede.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  // Navegação (rotas do Angular): network-first, caindo para o index em cache.
  if (req.mode === 'navigate') {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copia)).catch(() => undefined);
          return resp;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Estáticos: cache-first com atualização em segundo plano.
  evento.respondWith(
    caches.match(req).then((emCache) => {
      if (emCache) return emCache;
      return fetch(req).then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => undefined);
        }
        return resp;
      });
    }),
  );
});
