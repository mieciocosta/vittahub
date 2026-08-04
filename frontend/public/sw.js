/* Service worker MÍNIMO do VittaHub — só para o app ser instalável no celular.
   NÃO faz cache de nada (passthrough): atualização do CRM chega na hora,
   sem risco de versão velha "grudada" na equipe. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });
