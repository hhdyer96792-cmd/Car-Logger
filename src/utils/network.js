// src/utils/network.js
window.App = window.App || {};
App.network = App.network || {};

const SUPABASE_URL = 'https://qbjlccdqaudyvedpysil.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU';

App.network.isReallyOnline = async function () {
    if (!navigator.onLine) return false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'HEAD',
            signal: controller.signal,
            headers: { 'apikey': SUPABASE_ANON_KEY }
        });
        clearTimeout(timeoutId);
        return true;
    } catch (e) {
        return false;
    }
};