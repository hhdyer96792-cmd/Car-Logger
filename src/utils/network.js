// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

let _lastCheck = 0;
let _lastResult = false;
const CHECK_CACHE_MS = 1000;

App.network.isReallyOnline = async function() {
    // Быстрый путь: браузер точно знает, что сети нет
    if (!navigator.onLine) return false;

    // Кеш на 1 секунду, чтобы не спамить
    if (Date.now() - _lastCheck < CHECK_CACHE_MS) return _lastResult;

    // Если клиент Supabase ещё не готов, доверяем navigator.onLine
    if (!App.supabase) {
        _lastResult = true;
        _lastCheck = Date.now();
        return true;
    }

    // Лёгкий запрос через Supabase: count(*) с head: true
    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const { error } = await App.supabase
                .from('operations')
                .select('count', { count: 'exact', head: true })
                .abortSignal(controller.signal);

            clearTimeout(timeoutId);

            // Ошибки, связанные с сетью (fetch/network/abort) – пробуем ещё раз
            if (error) {
                const msg = error.message || '';
                if (msg.includes('fetch') || msg.includes('network') || msg.includes('abort')) {
                    throw error;   // уйдёт в catch для повтора
                }
                // Любая другая ошибка (401, 403, etc) – сервер ответил → сеть есть
            }

            _lastResult = true;
            _lastCheck = Date.now();
            return true;
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[Network] Попытка ${attempt + 1} не удалась:`, err.message);
        }
    }

    _lastResult = false;
    _lastCheck = Date.now();
    return false;
};

// Сброс кеша (вызывается при событии online, чтобы не ждать старый false)
App.network.resetCache = function() {
    _lastCheck = 0;
};