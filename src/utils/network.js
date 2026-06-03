// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

let _lastCheck = 0;
let _lastResult = false;
const CHECK_CACHE_MS = 1000;

App.network.isReallyOnline = async function() {
    // Быстрый путь: если браузер сообщает офлайн, сразу false
    if (!navigator.onLine) return false;
    // Используем кешированный результат на 1 секунду
    if (Date.now() - _lastCheck < CHECK_CACHE_MS) return _lastResult;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        // Используем анонимный ключ из App.supabase (он доступен глобально)
        const anonKey = App.supabase ? App.supabase.supabaseKey : null;
        const headers = anonKey ? {
            'apikey': anonKey,
            'Accept': 'application/json'
        } : {};

        // GET-запрос к публичному REST-эндпоинту (даже без авторизации он отвечает 200 или пустым массивом)
        const response = await fetch(
            'https://qbjlccdqaudyvedpysil.supabase.co/rest/v1/cars?limit=1',
            {
                method: 'GET',
                headers,
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);
        // Любой ответ (включая 200, 401, 404) означает, что сервер доступен
        _lastResult = true;
    } catch (err) {
        console.warn('[Network] Проверка реальной сети не удалась:', err.message);
        _lastResult = false;
    }
    _lastCheck = Date.now();
    return _lastResult;
};