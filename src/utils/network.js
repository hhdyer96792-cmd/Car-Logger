//src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

let _lastCheck = 0;
let _lastResult = false;
const CHECK_CACHE_MS = 1000;

App.network.isReallyOnline = async function() {
    if (!navigator.onLine) return false;
    if (Date.now() - _lastCheck < CHECK_CACHE_MS) return _lastResult;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        // HEAD-запрос к корню домена Supabase (самый легкий)
        const response = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/', {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        _lastResult = true;
    } catch (e) {
        console.warn('[Network] Проверка реальной сети:', e.message);
        _lastResult = false;
    }
    _lastCheck = Date.now();
    return _lastResult;
};
