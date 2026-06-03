// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

let _lastCheck = 0;
let _lastResult = false;
const CHECK_CACHE_MS = 1000;

App.network.isReallyOnline = async function() {
    // Быстрый путь: браузер уже знает, что сети нет
    if (!navigator.onLine) return false;

    // Кеш на 1 секунду, чтобы не спамить сервер
    if (Date.now() - _lastCheck < CHECK_CACHE_MS) return _lastResult;

    // Если клиент Supabase ещё не готов – оптимистично считаем, что онлайн
    if (!App.supabase) {
        _lastResult = true;
        _lastCheck = Date.now();
        return true;
    }

    // Делаем легчайший запрос через Supabase: count(*) по таблице operations
    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 секунды

        try {
            const { error } = await App.supabase
                .from('operations')
                .select('count', { count: 'exact', head: true })
                .abortSignal(controller.signal);

            clearTimeout(timeoutId);

            // Если ошибка связана именно с сетью (fetch/network/abort) – пробуем ещё раз
            if (error) {
                const msg = error.message || '';
                if (msg.includes('fetch') || msg.includes('network') || msg.includes('abort')) {
                    throw error;   // уйдём в catch для повтора
                }
                // Любая другая ошибка (401, 403, etc) означает, что сервер ответил → сеть есть
            }

            _lastResult = true;
            _lastCheck = Date.now();
            return true;
        } catch (err) {
            clearTimeout(timeoutId);
            console.warn(`[Network] Попытка ${attempt + 1} не удалась:`, err.message);
        }
    }

    // После двух неудач считаем, что сеть недоступна
    _lastResult = false;
    _lastCheck = Date.now();
    return false;
};