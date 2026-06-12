// src/firebase-init.js
// Инициализация Firebase для клиентской части (для получения токена push)
(function() {
  if (typeof firebase === 'undefined') {
    console.warn('[Firebase] Firebase не загружен, push-уведомления недоступны');
    return;
  }
  if (firebase.apps.length === 0) {
    firebase.initializeApp({
      apiKey: "AIzaSyCKz1GKDdqxtK6NyLQAZ84QqUUCaqTQDWQ",
      authDomain: "car-k3eper.firebaseapp.com",
      projectId: "car-k3eper",
      storageBucket: "car-k3eper.firebasestorage.app",
      messagingSenderId: "826833638199",
      appId: "1:826833638199:web:647fedbe3eae5b605240b2"
    });
    console.log('[Firebase] Инициализирован в основном потоке');
  } else {
    console.log('[Firebase] Уже инициализирован');
  }
})();