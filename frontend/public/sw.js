/* Service worker do VittaHub — SEM cache (atualização nunca "gruda") + push
   real: recebe o aviso mesmo com o app fechado e abre a tela certa no clique.

   Não existe handler de `fetch` de propósito (03/09, "melhorar o desempenho"):
   o antigo só repassava a chamada (`respondWith(fetch(req))`), e isso fazia
   CADA requisição do CRM dar um pulo a mais pelo worker — aparecia duas vezes
   no Network e custava alguns ms por chamada, sem cachear nada. Sem handler o
   navegador fala direto com o servidor; o push e o clique na notificação
   continuam iguais. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titulo: 'VittaHub', texto: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.titulo || 'VittaHub', {
    body: d.texto || '',
    icon: '/logos/icone-color.png',
    badge: '/logos/icone-color.png',
    vibrate: [120, 60, 120],
    tag: d.url || 'vittahub',
    renotify: true,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of janelas) {
      if ('focus' in c) { try { await c.navigate(alvo); } catch {} return c.focus(); }
    }
    return self.clients.openWindow(alvo);
  })());
});
