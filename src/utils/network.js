// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

let _lastCheck = 0;
let _lastResult = false;
const CHECK_CACHE_MS = 1000;

App.network.isReallyOnline = async function() {
    if (!navigator.onLine) return false;
    if (Date.now() - _lastCheck < CHECK_CACHE_MS) return _lastResult;

    // Пробуем дважды на случай кратковременного сбоя
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 секунды

            // HEAD-запрос к публичному REST-эндпоинту Supabase
            const response = await fetch(
                'https://qbjlccdqaudyvedpysil.supabase.co/rest/v1/',
                {
                    method: 'HEAD',
                    signal: controller.signal,
                    // Не отправляем заголовки авторизации, чтобы не зависеть от сессии
                    headers: { 'Accept': 'application/json' }
                }
            );

            clearTimeout(timeoutId);
            // Любой ответ (даже 401/404) означает, что сервер доступен
            _lastResult = true;
            _lastCheck = Date.now();
            return true;
        } catch (err) {
            console.warn(`[Network] Попытка ${attempt + 1} не удалась:`, err.message);
            if (attempt === 1) {
                _lastResult = false;
                _lastCheck = Date.now();
            }
        }
    }
    return false;
};