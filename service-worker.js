// ===== Firebase Cloud Messaging =====
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCKz1GKDdqxtK6NyLQAZ84QqUUCaqTQDWQ",
    authDomain: "car-k3eeper.firebaseapp.com",
    projectId: "car-k3eeper",
    storageBucket: "car-k3eeper.firebasestorage.app",
    messagingSenderId: "826833638199",
    appId: "1:826833638199:web:647fedbe3eae5b605240b2"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] Получено фоновое сообщение:', payload);
});
// =====================================================================

const APP_VERSION = '2.1.0'; // должна совпадать с App.config.APP_VERSION
const CACHE_NAME = `car-logger-static-v${APP_VERSION}`;

const basePath = self.location.pathname.replace(/\/service-worker\.js$/, '');


// Все локальные файлы приложения (без начального basePath, он добавится при проверке)
const localFiles = [
    '/index.html',
    '/style.css',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/src/config/constants.js',
    '/src/config/defaults.js',
    '/src/utils/dom.js',
    '/src/utils/dates.js',
    '/src/utils/validate.js',
    '/src/api/supabase.js',
    '/src/api/storage.js',
    '/src/state/store.js',
    '/src/logic/planner.js',
    '/src/logic/statistics.js',
    '/src/logic/operations.js',
    '/src/ui/components/modal.js',
    '/src/ui/components/charts.js',
    '/src/ui/pages/dashboard.js',
    '/src/ui/pages/maintenance.js',
    '/src/ui/pages/stats.js',
    '/src/ui/pages/history.js',
    '/src/ui/pages/fuel.js',
    '/src/ui/pages/tires.js',
    '/src/ui/pages/parts.js',
    '/src/ui/pages/importCsv.js',
    '/src/ui/pages/settings.js',
    '/src/ui/pages/cars.js',
    '/src/utils/realtime.js',
    '/src/events.js',
    '/src/main.js',
    '/src/vendor/supabase.min.js'
];

// Важные CDN-ресурсы
const cdnFiles = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js',
    'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            const addAllWithCatch = urls => Promise.all(urls.map(url => cache.add(url).catch(err => console.warn('Cache add failed:', url, err))));
            return Promise.all([addAllWithCatch(localFiles.map(f => basePath + f)), addAllWithCatch(cdnFiles)]);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const requestPath = url.pathname;
    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match(basePath + '/index.html')));
        return;
    }
    if (requestPath === basePath + '/' || requestPath === basePath + '/index.html') {
        event.respondWith(fetch(event.request).catch(() => caches.match(basePath + '/index.html')));
        return;
    }
    if (localFiles.some(file => requestPath === basePath + file)) {
        event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
        return;
    }
    if (cdnFiles.includes(event.request.url)) {
        event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
        return;
    }
});

// Обработка сообщений от клиента
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => console.log('[SW] Кэш очищен'));
    }
});

// Background Sync (опционально)
self.addEventListener('sync', function(event) {
    if (event.tag === 'vesta-sync') {
        event.waitUntil((async () => {
            const clients = await self.clients.matchAll();
            clients.forEach(client => client.postMessage({ type: 'SYNC_TRIGGER' }));
        })());
    }
});