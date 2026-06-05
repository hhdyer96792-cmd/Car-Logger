// src/api/storage.js
window.App = window.App || {};
App.storage = App.storage || {};

console.log('[Storage] Модуль загружен');

function checkResponse({ data, error }, actionName) {
    if (error) throw error;
    if (actionName === 'delete') return;
}

async function queueAction(action) {
    await App.store.addPendingAction(action);
    if (action.entityType === 'fuel') refreshUIToFuel();
    else if (action.entityType === 'operation') refreshUIToTables();
    else if (action.entityType === 'part') refreshUIToParts();
    else if (action.entityType === 'tire') refreshUIToTires();
    else if (action.entityType === 'history') refreshUIToHistory();
    else if (action.entityType === 'mileage') refreshUIToMileage();
    else if (action.entityType === 'car_settings') refreshUIToSettings();
    else if (action.entityType === 'car') {
        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
    }
        
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('vesta-sync');
        } catch (err) {
            console.warn('[Storage] Background Sync registration failed:', err);
        }
    }
    if (typeof App.db.sync.processSyncQueue === 'function') {
        setTimeout(() => App.db.sync.processSyncQueue(), 50);
    }
}

function refreshUIToFuel() { if (typeof App.ui.pages.renderFuelTab === 'function') App.ui.pages.renderFuelTab(); }
function refreshUIToTables() { if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable(); if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard(); }
function refreshUIToParts() { if (typeof App.ui.pages.renderPartsTab === 'function') App.ui.pages.renderPartsTab(); if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard(); }
function refreshUIToTires() { if (typeof App.ui.pages.renderTiresTab === 'function') App.ui.pages.renderTiresTab(); if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard(); }
function refreshUIToMileage() { if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard(); if (typeof App.ui.pages.renderTOStats === 'function') App.ui.pages.renderTOStats(); }
function refreshUIToSettings() { if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields(); if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard(); }
function refreshUIToHistory() { if (typeof App.ui.pages.renderHistoryCards === 'function') App.ui.pages.renderHistoryCards(); if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard(); }

// ... все функции сохранения/удаления без изменений (те же, что в предыдущей версии) ...

// ========== ЗАГРУЗКА ВСЕХ ДАННЫХ (последовательная) ==========
App.storage.loadAllData = async function() {
    // 1. Мгновенно загружаем локальные данные и отображаем
    await App.store.loadFromIndexedDB();
    document.getElementById('data-panel').style.display = 'block';
    if (typeof App.renderAll === 'function') App.renderAll();
    App.setSyncStatus('local');

    if (!navigator.onLine) {
        App.toast('Вы офлайн. Работаем с локальными данными.', 'warning');
        return;
    }

    const carId = App.store.activeCarId;
    if (!carId) return;

    const loadTable = async (name, loader) => {
        try {
            const data = await loader();
            return data || [];
        } catch (err) {
            console.warn(`[Storage] Не удалось загрузить ${name}:`, err.message);
            return null;
        }
    };

    const tables = [
        ['operations', App.supa.loadOperations],
        ['fuel_log', App.supa.loadFuelLog],
        ['tires', App.supa.loadTires],
        ['parts', App.supa.loadParts],
        ['history', App.supa.loadHistory],
        ['mileage', App.supa.loadMileageHistory],
        ['settings', App.supa.loadSettings]
    ];

    for (const [key, loader] of tables) {
        const data = await loadTable(key, loader);
        if (data) {
            switch (key) {
                case 'operations':
                    App.store.operations = data.map(op => ({ ...op, car_id: carId }));
                    await App.db.putMany('operations', App.store.operations);
                    break;
                case 'fuel_log':
                    App.store.fuelLog = data.map(f => ({ ...f, car_id: carId }));
                    await App.db.putMany('fuel_log', App.store.fuelLog);
                    break;
                case 'tires':
                    App.store.tireLog = data.map(t => ({ ...t, car_id: carId }));
                    await App.db.putMany('tires', App.store.tireLog);
                    break;
                case 'parts':
                    App.store.parts = data.map(p => ({ ...p, car_id: carId }));
                    await App.db.putMany('parts', App.store.parts);
                    break;
                case 'history':
                    App.store.serviceRecords = data.map(h => ({ ...h, car_id: carId }));
                    await App.db.putMany('service_records', App.store.serviceRecords);
                    break;
                case 'mileage':
                    App.store.mileageHistory = data.map(m => ({ ...m, car_id: carId }));
                    await App.db.putMany('mileage_log', App.store.mileageHistory);
                    break;
                case 'settings':
                    Object.assign(App.store.settings, data);
                    await App.db.put('car_settings', { ...App.store.settings, car_id: carId });
                    break;
            }
        }
        // Небольшая пауза между таблицами для стабильности сети
        await new Promise(r => setTimeout(r, 200));
    }

    if (typeof App.renderAll === 'function') App.renderAll();
    App.setSyncStatus('synced');
};