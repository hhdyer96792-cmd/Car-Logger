// src/modules/premium/imageCache.js
export const CACHE_NAME = 'vesta-images-v1';
export const MAX_IMAGES = 200;

const DB_NAME = 'ImageCacheMeta';
const STORE_NAME = 'metadata';

let metadataDb = null;
let pendingOperation = Promise.resolve();

async function openMetadataDB() {
    if (metadataDb) return metadataDb;
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('size', 'size', { unique: false });
            }
        };
        request.onsuccess = () => {
            metadataDb = request.result;
            resolve(metadataDb);
        };
        request.onerror = () => reject(request.error);
    });
}

async function saveMetadata(url, size) {
    const db = await openMetadataDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ url, timestamp: Date.now(), size });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function getAllMetadata() {
    const db = await openMetadataDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const req = index.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function deleteMetadata(url) {
    const db = await openMetadataDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(url);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function enforceCacheLimit() {
    if (typeof caches === 'undefined') return;
    const metadata = await getAllMetadata();
    if (metadata.length <= MAX_IMAGES) return;
    const toDelete = metadata.slice(0, metadata.length - MAX_IMAGES);
    const cache = await caches.open(CACHE_NAME);
    for (const item of toDelete) {
        // Исправление: обрабатываем ошибки удаления из кэша индивидуально
        try {
            await cache.delete(item.url);
        } catch (e) {
            console.warn('[ImageCache] Failed to delete from cache:', item.url, e);
        }
        await deleteMetadata(item.url);
    }
}

export async function init() {
    console.log('[ImageCache] Premium module initialized');
    if (typeof caches === 'undefined') {
        console.warn('[ImageCache] Cache API not supported');
    }
    // Инициализация БД метаданных (опционально, сразу открываем для ускорения)
    await openMetadataDB().catch(e => console.warn('[ImageCache] Failed to open metadata DB:', e));
}

export async function cacheImage(url, blob) {
    if (typeof caches === 'undefined') return;
    if (!url || !blob) return;
    await (pendingOperation = pendingOperation.then(async () => {
        try {
            const cache = await caches.open(CACHE_NAME);
            const response = new Response(blob, {
                headers: {
                    'Content-Type': blob.type,
                    'Cache-Control': 'max-age=31536000'
                }
            });
            await cache.put(url, response);
            await saveMetadata(url, blob.size);
            await enforceCacheLimit();
        } catch (e) {
            console.warn('[ImageCache] Failed to cache image:', url, e);
        }
    }));
}

export async function getCachedImage(url) {
    if (typeof caches === 'undefined') return null;
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(url);
        if (response && response.ok) {
            return await response.blob();
        }
    } catch (e) {
        console.warn('[ImageCache] Failed to get cached image:', e);
    }
    return null;
}

export async function clearImageCache() {
    if (typeof caches === 'undefined') return;
    await caches.delete(CACHE_NAME);
    if (metadataDb) {
        metadataDb.close();
        metadataDb = null;
    }
    await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function cachePhotoAfterUpload(photoUrl) {
    if (typeof caches === 'undefined') return;
    try {
        const response = await fetch(photoUrl);
        if (response.ok) {
            const blob = await response.blob();
            await cacheImage(photoUrl, blob);
        }
    } catch (e) {
        console.warn('[ImageCache] Failed to cache uploaded photo:', e);
    }
}