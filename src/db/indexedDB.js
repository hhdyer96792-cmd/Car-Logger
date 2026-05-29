// src/db/indexedDB.js
window.App = window.App || {};
App.db = App.db || {};

const DB_NAME = 'CarLoggerDB';
const DB_VERSION = 2;

const STORES = {
    operations: { keyPath: 'id', indexes: ['car_id', 'category'] },
    fuel_log: { keyPath: 'id', indexes: ['car_id', 'date'] },
    tires: { keyPath: 'id', indexes: ['car_id', 'date', 'type'] },
    parts: { keyPath: 'id', indexes: ['car_id', 'operation'] },
    service_records: { keyPath: 'id', indexes: ['car_id', 'operation_id', 'date'] },
    mileage_log: { keyPath: 'id', indexes: ['car_id', 'date'] },
    settings: { keyPath: 'id', autoIncrement: true },
    car_settings: { keyPath: 'car_id' },  // НОВОЕ: настройки по car_id
    cars: { keyPath: 'id', indexes: ['user_id'] },
    car_documents: { keyPath: 'id', indexes: ['car_id', 'type'] },
    pending_actions: { keyPath: 'id', autoIncrement: true, indexes: ['timestamp'] },
    error_log: { keyPath: 'id', autoIncrement: true, indexes: ['timestamp'] },
    routes_history: { keyPath: 'id', indexes: ['timestamp'] },
    vin_info: { keyPath: 'id' },
    plate_info: { keyPath: 'id' },
    parts_cache: { keyPath: 'id' },
    encrypted_secrets: { keyPath: 'id' },
    local_auth: { keyPath: 'id' }
};

App.db.init = function() {
    return new Promise((resolve, reject) => {
        if (App.db._db) {
            resolve(App.db._db);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
        request.onsuccess = (event) => {
            App.db._db = event.target.result;
            resolve(App.db._db);
        };
        request.onupgradeneeded = async (event) => {
            const db = event.target.result;
            for (let [storeName, config] of Object.entries(STORES)) {
                if (!db.objectStoreNames.contains(storeName)) {
                    const store = db.createObjectStore(storeName, {
                        keyPath: config.keyPath,
                        autoIncrement: config.autoIncrement || false
                    });
                    if (config.indexes) {
                        config.indexes.forEach(indexName => {
                            store.createIndex(indexName, indexName, { unique: false });
                        });
                    }
                }
            }
        };
    });
};

App.db._getStore = function(storeName, mode = 'readonly') {
    if (!App.db._db) throw new Error('Database not initialized. Call App.db.init() first.');
    const tx = App.db._db.transaction(storeName, mode);
    return tx.objectStore(storeName);
};

App.db.getAll = async function(storeName) {
    const store = App.db._getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

App.db.getById = async function(storeName, id) {
    const store = App.db._getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

App.db.put = async function(storeName, item) {
    const store = App.db._getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// Пакетная запись
App.db.putMany = async function(storeName, items) {
    if (!items.length) return;
    const tx = App.db._db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        for (const item of items) {
            store.put(item);
        }
    });
};

App.db.delete = async function(storeName, id) {
    const store = App.db._getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

App.db.clear = async function(storeName) {
    const store = App.db._getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

App.db.clearAllStores = async function() {
    if (!App.db._db) {
        console.warn('[DB] База не инициализирована, очистка невозможна');
        return;
    }
    const storeNames = Object.keys(STORES);
    for (const storeName of storeNames) {
        try {
            await App.db.clear(storeName);
            console.log(`[DB] Очищено хранилище: ${storeName}`);
        } catch (e) {
            console.error(`[DB] Ошибка очистки хранилища ${storeName}:`, e);
        }
    }
};

App.db.migrateFromLocalStorage = async function() {
    console.log('[DB] Starting migration from localStorage');
    const cacheKey = App.config.CACHE_KEY;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) {
        console.log('[DB] No data in localStorage, skip migration');
        return;
    }
    let data;
    try {
        data = JSON.parse(cached);
    } catch (e) {
        console.error('[DB] Failed to parse localStorage data', e);
        return;
    }
    const mapping = {
        operations: 'operations',
        parts: 'parts',
        fuelLog: 'fuel_log',
        tireLog: 'tires',
        workCosts: null,
        baseMileage: null,
        baseMotohours: null,
        purchaseDate: null,
        settings: 'settings'
    };
    for (let [localKey, storeName] of Object.entries(mapping)) {
        if (storeName && data[localKey] && Array.isArray(data[localKey]) && data[localKey].length) {
            const items = data[localKey].map(item => {
                if (!item.id && storeName !== 'settings') {
                    item.id = item.uuid || crypto.randomUUID();
                }
                return item;
            });
            await App.db.putMany(storeName, items);
        }
    }
    if (data.settings) {
        const settingsItem = { id: 1, ...data.settings };
        await App.db.put('settings', settingsItem);
    }
    console.log('[DB] Migration completed');
    localStorage.setItem('vesta_migrated_to_indexeddb', 'true');
    const clearStorage = await App.ui.confirmModalAsync('Данные успешно перенесены в новую базу. Очистить старый localStorage для экономии места?');
    if (clearStorage) {
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(App.config.PENDING_KEY);
        localStorage.removeItem(App.config.CALENDAR_CACHE_KEY);
        localStorage.removeItem(App.config.PRICE_HISTORY_KEY);
        localStorage.removeItem(App.config.THEME_KEY);
        localStorage.removeItem(App.config.NOTIFICATION_METHOD_KEY);
        localStorage.removeItem(App.config.STATS_PERIOD_KEY);
        localStorage.removeItem('vesta_server_timestamps');
        localStorage.removeItem('vesta_active_car_id');
        localStorage.removeItem('vesta_username');
        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('vesta_migrated_to_indexeddb');
        console.log('[DB] localStorage cleared');
    }
};

App.db.transaction = async function(storeNames, mode, callback) {
    const db = App.db._db;
    if (!db) throw new Error('DB not initialized');
    const tx = db.transaction(storeNames, mode);
    const stores = {};
    for (let name of storeNames) {
        stores[name] = tx.objectStore(name);
    }
    let result;
    try {
        result = await callback(stores);
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        tx.abort();
        throw e;
    }
    return result;
};