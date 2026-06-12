// src/utils/errorHandler.js
window.App = window.App || {};
App.errorHandler = App.errorHandler || {};

let pendingErrors = [];
let sendTimer = null;

function sanitizeExtra(extra) {
    if (!extra) return {};
    const safe = {};
    for (const [key, value] of Object.entries(extra)) {
        if (value === undefined) continue;
        if (typeof value === 'function') continue;
        if (value instanceof Promise) continue;
        if (value && typeof value === 'object') {
            try {
                JSON.stringify(value);
                safe[key] = value;
            } catch {
                safe[key] = String(value);
            }
        } else {
            safe[key] = value;
        }
    }
    return safe;
}

App.errorHandler.logError = async function(error, context = 'general', extra = {}) {
    const errorMessage = typeof error === 'string' ? error : (error.message || String(error));
    const errorStack = error instanceof Error ? error.stack : null;
    
    const safeExtra = sanitizeExtra(extra);
    
    const errorRecord = {
        id: crypto.randomUUID(),
        type: 'client_error',
        context: context,
        message: errorMessage,
        stack: errorStack,
        extra: safeExtra,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: Date.now()
    };
    
    try {
        if (App.db && App.db._db) {
            await App.db.put('error_log', errorRecord);
        } else {
            const errors = JSON.parse(localStorage.getItem('vesta_error_log') || '[]');
            errors.push(errorRecord);
            if (errors.length > 50) errors.shift();
            localStorage.setItem('vesta_error_log', JSON.stringify(errors));
        }
    } catch (e) {
        console.error('Не удалось сохранить ошибку локально:', e);
    }
    
    if (navigator.onLine && App.supabase) {
        pendingErrors.push(errorRecord);
        if (!sendTimer) {
            sendTimer = setTimeout(() => App.errorHandler.flushErrors(), 5000);
        }
    }
    
    if (App.config && App.config.DEBUG) {
        console.error(`[${context}]`, errorMessage, safeExtra);
    }
};

App.errorHandler.flushErrors = async function() {
    if (sendTimer) {
        clearTimeout(sendTimer);
        sendTimer = null;
    }
    if (pendingErrors.length === 0) return;
    if (!App.supabase) return;
    
    const errorsToSend = [...pendingErrors];
    pendingErrors = [];
    
    try {
        const { error } = await App.supabase
            .from('error_logs')
            .insert(errorsToSend.map(err => ({
                error_message: err.message,
                error_stack: err.stack,
                filename: err.extra?.filename,
                lineno: err.extra?.lineno,
                colno: err.extra?.colno,
                user_agent: err.userAgent,
                url: err.url,
                user_id: err.extra?.userId || null,
                timestamp: new Date(err.timestamp).toISOString()
            })));
        if (error) throw error;
    } catch (err) {
        console.warn('Не удалось отправить ошибки на сервер:', err);
        pendingErrors = [...errorsToSend, ...pendingErrors].slice(0, 100);
        setTimeout(() => App.errorHandler.flushErrors(), 60000);
    }
};

App.errorHandler.setupGlobalHandlers = function() {
    window.addEventListener('unhandledrejection', (event) => {
        App.errorHandler.logError(event.reason, 'unhandledrejection', {
            promise: '[Promise]'
        });
    });
    
    window.onerror = function(message, source, lineno, colno, error) {
        App.errorHandler.logError(error || message, 'runtime', {
            filename: source,
            lineno: lineno,
            colno: colno
        });
        return false;
    };
    
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch.apply(this, args).catch(err => {
            App.errorHandler.logError(err, 'fetch', { url: args[0] });
            throw err;
        });
    };
};

App.errorHandler.cleanupOldErrors = async function() {
    try {
        if (App.db && App.db._db) {
            const allErrors = await App.db.getAll('error_log');
            const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
            const toDelete = allErrors.filter(e => e.timestamp < thirtyDaysAgo);
            for (const err of toDelete) {
                await App.db.delete('error_log', err.id);
            }
        } else {
            const errors = JSON.parse(localStorage.getItem('vesta_error_log') || '[]');
            const filtered = errors.filter(e => (e.timestamp || 0) > Date.now() - 30 * 24 * 3600 * 1000);
            localStorage.setItem('vesta_error_log', JSON.stringify(filtered));
        }
    } catch (e) {
        console.warn('Очистка старых ошибок не удалась:', e);
    }
};