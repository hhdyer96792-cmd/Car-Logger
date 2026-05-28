// src/utils/dom.js
window.App = window.App || {};
App.utils = App.utils || {};

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

    switch (status) {
        case 'synced':
            syncIndicator.className = 'synced';
            syncIndicator.title = 'Данные синхронизированы';
            syncIcon.setAttribute('data-lucide', 'cloud');
            break;
        case 'syncing':
            syncIndicator.className = 'syncing';
            syncIndicator.title = 'Синхронизация...';
            syncIcon.setAttribute('data-lucide', 'cloud');
            break;
        case 'local':
            syncIndicator.className = 'local';
            syncIndicator.title = 'Локальный режим (офлайн)';
            syncIcon.setAttribute('data-lucide', 'cloud-off');
            break;
        case 'error':
            syncIndicator.className = 'error';
            syncIndicator.title = 'Ошибка синхронизации';
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