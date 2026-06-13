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
        navigator.serviceWorker.register(swPath)
            .then(registration => {
                console.log('[Firebase] SW зарегистрирован:', swPath);
                window.firebaseSwRegistration = registration;
            })
            .catch(err => console.error('[Firebase] Ошибка регистрации SW:', err));
    }
}