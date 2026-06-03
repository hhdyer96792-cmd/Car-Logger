// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

App.network.isReallyOnline = async function() {
    if (!navigator.onLine) return false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch('https://qbjlccdqaudyvedpysil.supabase.co/rest/v1/', {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return true;
    } catch (e) {
        return false;
    }
};