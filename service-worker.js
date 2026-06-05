// service-worker.js
const APP_VERSION = '2.1.0';
const CACHE_NAME = `car-logger-v${APP_VERSION}`;
const basePath = self.location.pathname.replace(/\/service-worker\.js$/, '');

// Локальные ресурсы для кэширования
const LOCAL_ASSETS = [
    '/index.html', '/style.css', '/manifest.json', '/icon-192.png', '/icon-512.png',
    '/src/main.js', '/src/events.js', '/src/state/store.js', '/src/api/supabase.js',
    '/src/api/storage.js', '/src/db/sync.js', '/src/db/indexedDB.js',
    '/src/db/encryption.js', '/src/db/killSwitch.js', '/src/utils/network.js',
    '/src/utils/realtime.js', '/src/utils/dom.js', '/src/utils/dates.js',
    '/src/utils/validate.js', '/src/config/constants.js', '/src/config/defaults.js',
    '/src/logic/planner.js', '/src/logic/statistics.js', '/src/logic/operations.js',
    '/src/logic/timeline.js', '/src/ui/components/modal.js', '/src/ui/components/charts.js',
    '/src/ui/components/timelineCharts.js', '/src/ui/pages/dashboard.js',
    '/src/ui/pages/maintenance.js', '/src/ui/pages/stats.js', '/src/ui/pages/history.js',
    '/src/ui/pages/fuel.js', '/src/ui/pages/tires.js', '/src/ui/pages/parts.js',
    '/src/ui/pages/importCsv.js', '/src/ui/pages/settings.js', '/src/ui/pages/cars.js',
    '/src/modules/moduleLoader.js', '/src/modules/premium.js', '/src/modules/localAuth.js',
    '/src/modules/auth.js',
    '/lib/supabase.min.js', '/lib/chart.umd.min.js', '/lib/hammer.min.js',
    '/lib/chartjs-plugin-zoom.min.js', '/lib/lucide.min.js', '/lib/html2pdf.bundle.min.js',
    '/lib/xlsx.full.min.js', '/lib/purify.min.js', '/lib/firebase-app-compat.js',
    '/lib/firebase-messaging-compat.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                LOCAL_ASSETS.map(url =>
                    cache.add(new Request(url)).catch(err => console.warn('[SW] Cache add failed:', url, err))
                )
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // Ничего не делаем с внешними запросами – они идут напрямую
    if (!e.request.url.startsWith(self.location.origin)) return;

    // Для навигации (HTML) пытаемся загрузить из сети, иначе кэш
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(basePath + '/index.html'))
        );
        return;
    }

    // Для локальных ресурсов – кэш -> сеть
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});

self.addEventListener('message', e => {
    if (e.data?.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => console.log('[SW] Кэш очищен'));
    }
});

self.addEventListener('sync', e => {
    if (e.tag === 'vesta-sync') {
        e.waitUntil(
            self.clients.matchAll().then(clients =>
                clients.forEach(client => client.postMessage({ type: 'SYNC_TRIGGER' }))
            )
        );
    }
});