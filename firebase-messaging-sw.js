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
  const notificationTitle = payload.notification.title || 'Напоминание о ТО';
  const notificationOptions = {
    body: payload.notification.body || '',
    icon: 'icon-192.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});