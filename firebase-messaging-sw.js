// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyCKz1GKDdqxtK6NyLQAZ84QqUUCaqTQDWQ",
    authDomain: "car-k3eper.firebaseapp.com",
    projectId: "car-k3eper",
    storageBucket: "car-k3eper.firebasestorage.app",
    messagingSenderId: "826833638199",
    appId: "1:826833638199:web:647fedbe3eae5b605240b2"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
    console.log('[Firebase SW] Получено фоновое сообщение:', payload);
    const notificationTitle = payload.notification?.title || 'Напоминание о ТО';
    const notificationOptions = {
        body: payload.notification?.body || 'Проверьте план технического обслуживания',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'vesta-maintenance',
        data: payload.data || {},
        actions: [
            { action: 'open', title: 'Открыть приложение' },
            { action: 'dismiss', title: 'Позже' }
        ]
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    if (event.action === 'dismiss') return;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url.includes('/index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/index.html');
            }
        })
    );
});