// src/modules/premium/geolocation.js
let map = null;
let mapInitialized = false;
let currentPosition = null;
const geocodeCache = new Map();

export async function init() {
    console.log('[Geolocation] Premium module initialized');
    if (document.getElementById('map-container')) {
        await initMap();
    }
}

export async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Геолокация не поддерживается'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => {
                currentPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                resolve(currentPosition);
            },
            error => reject(error),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

async function geocode(query) {
    if (typeof query === 'object' && query.lat !== undefined) return query;
    const cacheKey = typeof query === 'string' ? query : JSON.stringify(query);
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);
    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
    );
    if (!response.ok) throw new Error('Ошибка геокодирования');
    const data = await response.json();
    if (!data.length) throw new Error('Адрес не найден');
    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    geocodeCache.set(cacheKey, result);
    return result;
}

export async function buildRoute(start, end) {
    const startCoords = await geocode(start);
    const endCoords = await geocode(end);
    const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?overview=full&geometries=geojson`
    );
    if (!response.ok) throw new Error('Ошибка построения маршрута');
    const data = await response.json();
    if (data.code !== 'Ok') throw new Error('Маршрут не найден');
    const route = data.routes[0];
    return {
        distance: route.distance / 1000,
        duration: route.duration / 60,
        geometry: route.geometry.coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }))
    };
}

async function initMap() {
    if (mapInitialized && map) return;
    try {
        const L = await import('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
        const container = document.getElementById('map-container');
        if (!container) return;
        if (map) map.remove();
        map = L.map(container).setView([55.751244, 37.618423], 10);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(map);
        mapInitialized = true;
    } catch (err) {
        console.error('[Geolocation] Failed to load Leaflet:', err);
        if (typeof App.toast === 'function') {
            App.toast('Не удалось загрузить карту. Проверьте подключение к интернету.', 'error');
        }
        throw err;
    }
}

export async function showRoute(start, end) {
    await initMap();
    const route = await buildRoute(start, end);
    const L = await import('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    const polyline = L.polyline(route.geometry, { color: 'blue' }).addTo(map);
    map.fitBounds(polyline.getBounds());
    const startPoint = typeof start === 'object' ? start : await geocode(start);
    const endPoint = typeof end === 'object' ? end : await geocode(end);
    L.marker([startPoint.lat, startPoint.lng]).addTo(map).bindPopup('Старт');
    L.marker([endPoint.lat, endPoint.lng]).addTo(map).bindPopup('Финиш');
    return route;
}

export async function saveRouteToHistory(routeData) {
    const routes = await App.db.getAll('routes_history');
    routes.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        start: routeData.start,
        end: routeData.end,
        distance: routeData.distance,
        duration: routeData.duration
    });
    // Оставляем только последние 50
    const toKeep = routes.slice(-50);
    await App.db.clear('routes_history');
    for (const route of toKeep) {
        await App.db.put('routes_history', route);
    }
}