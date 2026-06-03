// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

const SUPABASE_URL = 'https://qbjlccdqaudyvedpysil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU';

let _lastCheck = 0;
let _lastResult = false;
const CHECK_CACHE_MS = 1000;

App.network.isReallyOnline = async function () {
    if (!navigator.onLine) return false;
    // Используем кеш только для быстрых вызовов (UI)
    if (Date.now() - _lastCheck < CHECK_CACHE_MS) return _lastResult;

    // Две попытки с таймаутом 3 секунды
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
                method: 'HEAD',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'apikey': SUPABASE_ANON_KEY   // публичный ключ
                }
            });
            clearTimeout(timeoutId);
            // любой ответ (даже 200 или 401) означает, что сервер доступен
            _lastResult = true;
            _lastCheck = Date.now();
            return true;
        } catch (err) {
            console.warn(`[Network] Попытка ${attempt + 1} проверки не удалась:`, err.message);
        }
    }
    _lastResult = false;
    _lastCheck = Date.now();
    return false;
};

// Сброс кеша (вызывается при событии online)
App.network.resetCache = function () {
    _lastCheck = 0;
};