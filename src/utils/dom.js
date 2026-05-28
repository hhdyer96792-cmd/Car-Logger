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

App.utils.sanitizeHtml = function(text) {
    if (!text) return '';
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(text);
    }
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
};

App.utils.escapeHtml = function(str) {
    return App.utils.sanitizeHtml(str);
};

App.initIcons = function() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
};

App.setSyncStatus = function(status) {
    var syncIndicator = document.getElementById('sync-indicator');
    if (!syncIndicator) return;
    var syncIcon = syncIndicator.querySelector('i');
    if (!syncIcon) return;

    // Удаляем старые классы
    syncIndicator.classList.remove('synced', 'syncing', 'local', 'error');

    switch (status) {
        case 'synced':
            syncIndicator.classList.add('synced');
            syncIndicator.title = 'Синхронизировано с сервером';
            syncIcon.setAttribute('data-lucide', 'cloud');
            break;
        case 'syncing':
            syncIndicator.classList.add('syncing');
            syncIndicator.title = 'Синхронизация...';
            syncIcon.setAttribute('data-lucide', 'cloud');
            break;
        case 'local':
            syncIndicator.classList.add('local');
            syncIndicator.title = 'Локальный режим (данные не синхронизированы)';
            syncIcon.setAttribute('data-lucide', 'cloud-off');
            break;
        case 'error':
            syncIndicator.classList.add('error');
            syncIndicator.title = 'Ошибка соединения';
            syncIcon.setAttribute('data-lucide', 'cloud-off');
            break;
        default:
            syncIndicator.classList.add('synced');
            syncIcon.setAttribute('data-lucide', 'cloud');
    }
    App.initIcons();
};

App.log = function() {
    if (App.config.DEBUG) {
        console.log.apply(console, arguments);
    }
};