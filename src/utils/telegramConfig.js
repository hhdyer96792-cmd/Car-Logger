// src/utils/telegramConfig.js
// Настройки Telegram-бота (замените BOT_USERNAME на актуальное)
window.App = window.App || {};
App.telegram = {
  botUsername: 'carloggermsbot', // Замените на имя вашего бота (без @)
  getStartLink(userId) {
    return `https://t.me/${this.botUsername}?start=${userId}`;
  }
};