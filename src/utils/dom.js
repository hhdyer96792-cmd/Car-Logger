// src/utils/dom.js
window.App = window.App || {};
App.utils = App.utils || {};

/**
 * Показывает тост-уведомление.
 * @param {string} message - Текст сообщения.
 * @param {string} [type='info'] - Тип: 'info', 'success', 'error', 'warning'.
 */
App.toast = function(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = App.utils.sanitizeHtml(message);
    container.appendChild(toast);
    setTimeout(function() {
        toast.classList.add('fade-out');
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
};

/**
 * Безопасная вставка HTML (санитизация).
 * @param {string} text - Исходная строка.
 * @returns {string} Очищенная строка.
 */
App.utils.sanitizeHtml = function(text) {
    if (!text) return '';
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(text);
    }
    // Ручное экранирование основных символов
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
};

/**
 * Экранирование HTML (алиас).
 * @param {string} str
 * @returns {string}
 */
App.utils.escapeHtml = function(str) {
    return App.utils.sanitizeHtml(str);
};

/**
 * Инициализация иконок Lucide (вызывать после изменений DOM).
 */
App.initIcons = function() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
};

/**
 * Установка статуса синхронизации в индикаторе.
 * @param {string} status - 'synced', 'syncing', 'local', 'error'
 */
App.setSyncStatus = function(status) {
    var syncIndicator = document.getElementById('sync-indicator');
    if (!syncIndicator) return;
    var syncIcon = syncIndicator.querySelector('i');
    if (!syncIcon) return;

    switch (status) {
        case 'synced':
            syncIndicator.className = 'synced';
            syncIndicator.title = 'Синхронизировано с Google';
            syncIcon.setAttribute('data-lucide', 'cloud');
            break;
        case 'syncing':
            syncIndicator.className = 'syncing';
            syncIndicator.title = 'Синхронизация...';
            syncIcon.setAttribute('data-lucide', 'cloud');
            break;
        case 'local':
            syncIndicator.className = 'local';
            syncIndicator.title = 'Локальный режим (данные только в браузере)';
            syncIcon.setAttribute('data-lucide', 'cloud-off');
            break;
        case 'error':
            syncIndicator.className = 'error';
            syncIndicator.title = 'Ошибка соединения';
            syncIcon.setAttribute('data-lucide', 'cloud-off');
            break;
        default:
            syncIndicator.className = '';
            syncIcon.setAttribute('data-lucide', 'cloud');
    }
    App.initIcons();
};
App.log = function() {
    if (App.config.DEBUG) {
        console.log.apply(console, arguments);
    }
};