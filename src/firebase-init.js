// src/firebase-init.js
console.log('[Firebase] Инициализация...');

if (typeof firebase === 'undefined') {
    console.error('[Firebase] Firebase не загружен');
} else {
    const firebaseConfig = {
        apiKey: "AIzaSyCKz1GKDdqxtK6NyLQAZ84QqUUCaqTQDWQ",
        authDomain: "car-k3eper.firebaseapp.com",
        projectId: "car-k3eper",
        storageBucket: "car-k3eper.firebasestorage.app",
        messagingSenderId: "826833638199",
        appId: "1:826833638199:web:647fedbe3eae5b605240b2"
    };
    
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('[Firebase] Инициализирован');
    } else {
        console.log('[Firebase] Уже инициализирован');
    }
    
    if ('serviceWorker' in navigator) {
        const swPath = window.location.pathname.includes('/Car-Logger/') 
            ? '/Car-Logger/firebase-messaging-sw.js' 
            : '/firebase-messaging-sw.js';
        console.log('[Firebase] Регистрация SW:', swPath);
        navigator.serviceWorker.register(swPath)
            .then(registration => {
                console.log('[Firebase] SW зарегистрирован успешно');
                window.firebaseSwRegistration = registration;
                // Оповещаем, что SW готов (можно вызвать событие)
                window.dispatchEvent(new CustomEvent('firebase-sw-ready'));
            })
            .catch(err => console.error('[Firebase] Ошибка регистрации SW:', err));
    } else {
        console.warn('[Firebase] Service Worker не поддерживается');
    }
}