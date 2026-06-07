// service-worker.js
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
messaging.onBackgroundMessage(payload => console.log('[SW] Фоновое сообщение:', payload));
// =====================================

const APP_VERSION = '2.1.0';
const CACHE_NAME = `car-logger-v${APP_VERSION}`;
const basePath = self.location.pathname.replace(/\/service-worker\.js$/, '');

// Установка – сразу активируемся, ничего не кэшируем заранее
self.addEventListener('install', e => {
    self.skipWaiting();
});

// Активация – удаляем старые кэши
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Перехват запросов
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Пропускаем внешние хосты
    if (url.hostname !== self.location.hostname) return;

    // Навигация – сначала сеть, при провале index.html из кэша
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(basePath + '/index.html'))
        );
        return;
    }

    // Все остальные запросы с нашего origin: динамический кэш
    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetchPromise = fetch(e.request).then(networkResponse => {
                if (networkResponse.ok) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return networkResponse;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});

// Очистка кэша по запросу
self.addEventListener('message', e => {
    if (e.data?.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => console.log('[SW] Кэш очищен'));
    }
    
    // Обработка сообщения о запуске синхронизации от клиента
    if (e.data?.type === 'SYNC_TRIGGER') {
        e.waitUntil(
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'SYNC_TRIGGERED' }));
            })
        );
    }
});

// Background Sync
self.addEventListener('sync', e => {
    if (e.tag === 'vesta-sync') {
        e.waitUntil(
            self.clients.matchAll().then(clients =>
                clients.forEach(client => client.postMessage({ type: 'SYNC_TRIGGER' }))
            )
        );
    }
});