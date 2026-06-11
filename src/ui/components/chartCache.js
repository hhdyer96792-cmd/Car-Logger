// src/ui/components/chartCache.js
window.App = window.App || {};
App.chartCache = App.chartCache || {};

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

App.chartCache._store = {};

App.chartCache.get = function(key) {
    const entry = this._store[key];
    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
        return entry.data;
    }
    return null;
};

App.chartCache.set = function(key, data) {
    this._store[key] = {
        data: data,
        timestamp: Date.now()
    };
    // Очистка старых записей (ограничение 50)
    const keys = Object.keys(this._store);
    if (keys.length > 50) {
        const oldest = keys.sort((a, b) => this._store[a].timestamp - this._store[b].timestamp)[0];
        delete this._store[oldest];
    }
};

App.chartCache.clear = function() {
    this._store = {};
};