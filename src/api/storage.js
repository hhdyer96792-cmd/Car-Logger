// src/api/storage.js (исправленная версия с сохранением базовых параметров)
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

// ========== АВТОМОБИЛИ ==========
App.storage.saveCar = async function(car) {
    const carWithId = { ...car };
    if (!carWithId.id) carWithId.id = crypto.randomUUID();
    await App.db.put('cars', carWithId);
    const idx = App.store.cars.findIndex(c => c.id == carWithId.id);
    if (idx !== -1) App.store.cars[idx] = carWithId;
    else App.store.cars.push(carWithId);
    await queueAction({ type: 'save', entityType: 'car', entityId: carWithId.id, data: carWithId });
    return carWithId;
};

App.storage.deleteCar = async function(carId) {
    await App.db.delete('cars', carId);
    App.store.cars = App.store.cars.filter(c => c.id != carId);
    await queueAction({ type: 'delete', entityType: 'car', entityId: carId, data: { id: carId, car_id: carId } });
    return true;
};

App.storage.renameCar = async function(carId, newName) {
    const car = App.store.cars.find(c => c.id == carId);
    if (!car) return false;
    const updatedCar = { ...car, name: newName };
    await App.db.put('cars', updatedCar);
    car.name = newName;
    await queueAction({ type: 'save', entityType: 'car', entityId: carId, data: updatedCar });
    return true;
};

// ========== ДОКУМЕНТЫ АВТОМОБИЛЯ ==========
App.storage.addCarDocument = async function(doc) {
    const carId = App.store.activeCarId;
    if (!carId) return null;
    const docWithCarId = { ...doc, car_id: carId };
    if (!docWithCarId.id) docWithCarId.id = crypto.randomUUID();
    await App.db.put('car_documents', docWithCarId);
    await queueAction({ type: 'save', entityType: 'car_document', entityId: docWithCarId.id, data: docWithCarId });
    return docWithCarId;
};

App.storage.deleteCarDocument = async function(docId) {
    const carId = App.store.activeCarId;
    await App.db.delete('car_documents', docId);
    try { await queueAction({ type: 'delete', entityType: 'car_document', entityId: docId, data: { id: docId, car_id: carId } }); } catch (e) {}
    return true;
};

// ========== ОСНОВНЫЕ ПАРАМЕТРЫ (сохраняем и в vehicle_state и в car_settings) ==========
App.storage.saveVehicleStateAndSettings = async function(state, settings) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const cleanState = { ...state };
    if (cleanState.plateNumber && typeof cleanState.plateNumber !== 'string') cleanState.plateNumber = String(cleanState.plateNumber);
    if (cleanState.vin && typeof cleanState.vin !== 'string') cleanState.vin = String(cleanState.vin);
    const data = { car_id: carId, ...cleanState, ...settings };
    Object.assign(App.store.settings, cleanState, settings);
    await App.db.put('car_settings', { ...App.store.settings, car_id: carId });
    await queueAction({ type: 'save', entityType: 'car_settings', entityId: carId, data });
};

// ========== ОПЕРАЦИИ ==========
App.storage.saveOperation = async function(op) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const opWithCarId = { ...op, car_id: carId };
    if (!opWithCarId.id) opWithCarId.id = crypto.randomUUID();
    await App.store.saveOperationToDB(opWithCarId);
    const idx = App.store.operations.findIndex(o => o.id == opWithCarId.id);
    if (idx !== -1) App.store.operations[idx] = opWithCarId;
    else App.store.operations.push(opWithCarId);
    await queueAction({ type: 'save', entityType: 'operation', entityId: opWithCarId.id, data: opWithCarId });
};

App.storage.deleteOperation = async function(operationId) {
    const carId = App.store.activeCarId;
    await App.db.delete('operations', operationId);
    App.store.operations = App.store.operations.filter(o => o.id != operationId);
    refreshUIToTables();
    try { await queueAction({ type: 'delete', entityType: 'operation', entityId: operationId, data: { id: operationId, car_id: carId } }); } catch (e) {}
};

// ========== ИСТОРИЯ ==========
App.storage.addHistoryRecord = async function(rec) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const recWithCarId = { ...rec, car_id: carId };
    if (!recWithCarId.id) recWithCarId.id = crypto.randomUUID();
    await App.store.saveHistoryRecordToDB(recWithCarId);
    App.store.serviceRecords.push(recWithCarId);
    await queueAction({ type: 'save', entityType: 'history', entityId: recWithCarId.id, data: recWithCarId });
    refreshUIToHistory();
};

App.storage.deleteHistoryRecord = async function(rowIndex) {
    const record = App.store.serviceRecords.find(r => r.rowIndex == rowIndex);
    if (!record) return;
    const carId = App.store.activeCarId;
    await App.db.delete('service_records', record.id);
    App.store.serviceRecords = App.store.serviceRecords.filter(r => r.id != record.id);
    refreshUIToHistory();
    try { await queueAction({ type: 'delete', entityType: 'history', entityId: record.id, data: { id: record.id, car_id: carId } }); } catch (e) {}
};

// ========== ЗАПЧАСТИ ==========
App.storage.savePart = async function(part) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const partWithCarId = { ...part, car_id: carId };
    if (!partWithCarId.id) partWithCarId.id = crypto.randomUUID();
    await App.store.savePartToDB(partWithCarId);
    const idx = App.store.parts.findIndex(p => p.id == partWithCarId.id);
    if (idx !== -1) App.store.parts[idx] = partWithCarId;
    else App.store.parts.push(partWithCarId);
    await queueAction({ type: 'save', entityType: 'part', entityId: partWithCarId.id, data: partWithCarId });
};

App.storage.deletePart = async function(partId) {
    const carId = App.store.activeCarId;
    await App.db.delete('parts', partId);
    App.store.parts = App.store.parts.filter(p => p.id != partId);
    refreshUIToParts();
    try { await queueAction({ type: 'delete', entityType: 'part', entityId: partId, data: { id: partId, car_id: carId } }); } catch (e) {}
};

// ========== ТОПЛИВО ==========
App.storage.saveFuelRecord = async function(id, record) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const recordWithCarId = { ...record, car_id: carId };
    if (!recordWithCarId.id) recordWithCarId.id = crypto.randomUUID();
    await App.store.saveFuelRecordToDB(recordWithCarId);
    const idx = App.store.fuelLog.findIndex(f => f.id == recordWithCarId.id);
    if (idx !== -1) App.store.fuelLog[idx] = recordWithCarId;
    else App.store.fuelLog.push(recordWithCarId);
    await queueAction({ type: 'save', entityType: 'fuel', entityId: recordWithCarId.id, data: recordWithCarId });
};

App.storage.deleteFuelRecord = async function(id) {
    const carId = App.store.activeCarId;
    await App.db.delete('fuel_log', id);
    App.store.fuelLog = App.store.fuelLog.filter(f => f.id != id);
    refreshUIToFuel();
    try { await queueAction({ type: 'delete', entityType: 'fuel', entityId: id, data: { id: id, car_id: carId } }); } catch (e) {}
};

// ========== ШИНЫ ==========
App.storage.saveTireRecord = async function(id, record) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const recordWithCarId = { ...record, car_id: carId };
    if (!recordWithCarId.id) recordWithCarId.id = crypto.randomUUID();
    await App.store.saveTireRecordToDB(recordWithCarId);
    const idx = App.store.tireLog.findIndex(t => t.id == recordWithCarId.id);
    if (idx !== -1) App.store.tireLog[idx] = recordWithCarId;
    else App.store.tireLog.push(recordWithCarId);
    await queueAction({ type: 'save', entityType: 'tire', entityId: recordWithCarId.id, data: recordWithCarId });
};

App.storage.deleteTireRecord = async function(id) {
    const carId = App.store.activeCarId;
    await App.db.delete('tires', id);
    App.store.tireLog = App.store.tireLog.filter(t => t.id != id);
    refreshUIToTires();
    try { await queueAction({ type: 'delete', entityType: 'tire', entityId: id, data: { id: id, car_id: carId } }); } catch (e) {}
};

// ========== ПРОБЕГ ==========
App.storage.addMileageRecord = async function(date, mileage, motohours) {
    const userId = await App.supa.getCurrentUserId();
    const carId = App.store.activeCarId;
    if (!carId) return;
    const record = { date, mileage, motohours, user_id: userId, car_id: carId };
    if (!record.id) record.id = crypto.randomUUID();
    await App.store.saveMileageRecordToDB(record);
    App.store.mileageHistory.push(record);
    await queueAction({ type: 'save', entityType: 'mileage', entityId: record.id, data: record });
    refreshUIToMileage();
};

// ========== НАСТРОЙКИ ==========
App.storage.saveSettings = async function(settings) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const cleanedSettings = { ...settings };
    if (cleanedSettings.plateNumber !== undefined && cleanedSettings.plateNumber !== null) {
        cleanedSettings.plateNumber = (typeof cleanedSettings.plateNumber === 'object') ? '' : String(cleanedSettings.plateNumber);
    } else cleanedSettings.plateNumber = '';
    if (cleanedSettings.vin !== undefined && cleanedSettings.vin !== null) {
        cleanedSettings.vin = (typeof cleanedSettings.vin === 'object') ? '' : String(cleanedSettings.vin);
    } else cleanedSettings.vin = '';
    const settingsWithCar = { ...cleanedSettings, car_id: carId };
    Object.assign(App.store.settings, cleanedSettings);
    await App.db.put('car_settings', settingsWithCar);
    await queueAction({ type: 'save', entityType: 'car_settings', entityId: carId, data: settingsWithCar });
    refreshUIToSettings();
};

App.storage.loadSettingsForCar = async function(carId) {
    if (!carId) return null;
    try {
        let cached = await App.db.getById('car_settings', carId);
        if (cached) {
            let decrypted = cached;
            const masterKey = App.db.encryption.getMasterKey();
            if (masterKey && cached.telegramToken && typeof cached.telegramToken === 'object') {
                decrypted = await App.db.encryption.decryptSettings(cached, masterKey);
            }
            decrypted.plateNumber = (decrypted.plateNumber && typeof decrypted.plateNumber !== 'object') ? String(decrypted.plateNumber) : '';
            decrypted.vin = (decrypted.vin && typeof decrypted.vin !== 'object') ? String(decrypted.vin) : '';
            Object.assign(App.store.settings, decrypted);
            return decrypted;
        }
        if (navigator.onLine) {
            const settings = await App.supa.loadSettings();
            if (settings) {
                const settingsWithCar = { ...settings, car_id: carId };
                settingsWithCar.plateNumber = String(settingsWithCar.plateNumber || '');
                settingsWithCar.vin = String(settingsWithCar.vin || '');
                const masterKey = App.db.encryption.getMasterKey();
                if (masterKey) {
                    const encrypted = await App.db.encryption.encryptSettings(settingsWithCar, masterKey);
                    await App.db.put('car_settings', encrypted);
                } else {
                    await App.db.put('car_settings', settingsWithCar);
                }
                Object.assign(App.store.settings, settings);
                return settingsWithCar;
            }
        }
        const defaultSettings = { ...App.defaults.settings, car_id: carId };
        defaultSettings.plateNumber = ''; defaultSettings.vin = '';
        Object.assign(App.store.settings, defaultSettings);
        await App.db.put('car_settings', defaultSettings);
        return defaultSettings;
    } catch (err) {
        console.error('Ошибка загрузки настроек для автомобиля:', err);
        const defaultSettings = { ...App.defaults.settings, car_id: carId };
        Object.assign(App.store.settings, defaultSettings);
        return defaultSettings;
    }
};

// ========== ФОНОВАЯ ЗАГРУЗКА ПЕРВЫХ СТРАНИЦ ==========
const methodMap = {
    operations: 'loadOperations',
    fuel_log: 'loadFuelLog',
    tires: 'loadTires',
    parts: 'loadParts',
    history: 'loadHistory',
    mileage: 'loadMileageHistory'
};

const storeMap = {
    operations: 'operations',
    fuel_log: 'fuelLog',
    tires: 'tireLog',
    parts: 'parts',
    history: 'serviceRecords',
    mileage: 'mileageHistory'
};

App.storage.loadFirstPage = async function(table, pageSize = 50) {
    if (!navigator.onLine) return;
    const methodName = methodMap[table];
    if (!methodName || typeof App.supa[methodName] !== 'function') {
        console.warn(`[Storage] Метод ${methodName} не найден для таблицы ${table}`);
        return;
    }
    try {
        const result = await App.supa[methodName](1, pageSize);
        let data, error;
        if (result && typeof result === 'object' && 'data' in result && 'error' in result) {
            data = result.data;
            error = result.error;
        } else {
            data = result;
            error = null;
        }
        if (error) throw error;
        const carId = App.store.activeCarId;
        const items = (data || []).map(item => ({ ...item, car_id: carId }));
        await App.db.putMany(table, items);
        
        const storeKey = storeMap[table];
        if (storeKey && App.store[storeKey]) {
            const newMap = new Map(items.map(i => [i.id, i]));
            App.store[storeKey] = App.store[storeKey].filter(old => !newMap.has(old.id)).concat(items);
        }
    } catch (err) {
        console.warn(`[Storage] Не удалось загрузить ${table}:`, err.message);
    }
};

App.storage.loadAllData = async function() {
    await App.store.loadFromIndexedDB();
    const dataPanel = document.getElementById('data-panel');
    if (dataPanel) dataPanel.style.display = 'block';
    if (typeof App.renderAll === 'function') App.renderAll();
    const syncIndicator = document.getElementById('sync-indicator');
    if (syncIndicator) {
        syncIndicator.className = 'pending';
        if (typeof App.setSyncStatus === 'function') App.setSyncStatus('pending');
    }

    if (!navigator.onLine) return;

    const tables = ['operations', 'fuel_log', 'tires', 'parts', 'history', 'mileage'];
    const chunkSize = 3;
    for (let i = 0; i < tables.length; i += chunkSize) {
        await Promise.all(
            tables.slice(i, i + chunkSize).map(table =>
                App.storage.loadFirstPage(table, 50).catch(() => {})
            )
        );
        await new Promise(r => setTimeout(r, 100));
    }
    await App.storage.loadSettingsForCar(App.store.activeCarId).catch(() => {});

    if (typeof App.renderAll === 'function') App.renderAll();
    if (syncIndicator) {
        syncIndicator.className = 'synced';
        if (typeof App.setSyncStatus === 'function') App.setSyncStatus('synced');
    }
};