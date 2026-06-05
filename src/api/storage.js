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
    // Обновляем UI после добавления в очередь
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

function refreshUIToFuel() {
    if (typeof App.ui.pages.renderFuelTab === 'function') App.ui.pages.renderFuelTab();
}
function refreshUIToTables() {
    if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
}
function refreshUIToParts() {
    if (typeof App.ui.pages.renderPartsTab === 'function') App.ui.pages.renderPartsTab();
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
}
function refreshUIToTires() {
    if (typeof App.ui.pages.renderTiresTab === 'function') App.ui.pages.renderTiresTab();
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
}
function refreshUIToMileage() {
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
    if (typeof App.ui.pages.renderTOStats === 'function') App.ui.pages.renderTOStats();
}
function refreshUIToSettings() {
    if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
}
function refreshUIToHistory() {
    if (typeof App.ui.pages.renderHistoryCards === 'function') App.ui.pages.renderHistoryCards();
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
}

// ========== АВТОМОБИЛИ ==========
App.storage.saveCar = async function(car) {
    const carWithId = { ...car };
    if (!carWithId.id) carWithId.id = crypto.randomUUID();
    await App.db.put('cars', carWithId);
    const idx = App.store.cars.findIndex(c => c.id == carWithId.id);
    if (idx !== -1) App.store.cars[idx] = carWithId;
    else App.store.cars.push(carWithId);
    await queueAction({
        type: 'save',
        entityType: 'car',
        entityId: carWithId.id,
        data: carWithId
    });
    App.toast('Автомобиль сохранён локально', 'warning');
    return carWithId;
};

App.storage.deleteCar = async function(carId) {
    await App.db.delete('cars', carId);
    App.store.cars = App.store.cars.filter(c => c.id != carId);
    await queueAction({
        type: 'delete',
        entityType: 'car',
        entityId: carId,
        data: { id: carId, car_id: carId }
    });
    App.toast('Удаление сохранено локально', 'warning');
    return true;
};

App.storage.renameCar = async function(carId, newName) {
    const car = App.store.cars.find(c => c.id == carId);
    if (!car) return false;
    const updatedCar = { ...car, name: newName };
    await App.db.put('cars', updatedCar);
    car.name = newName;
    await queueAction({
        type: 'save',
        entityType: 'car',
        entityId: carId,
        data: updatedCar
    });
    App.toast('Переименование сохранено локально', 'warning');
    return true;
};

// ========== ДОКУМЕНТЫ АВТОМОБИЛЯ ==========
App.storage.addCarDocument = async function(doc) {
    const carId = App.store.activeCarId;
    if (!carId) return null;
    const docWithCarId = { ...doc, car_id: carId };
    if (!docWithCarId.id) docWithCarId.id = crypto.randomUUID();
    await App.db.put('car_documents', docWithCarId);
    await queueAction({
        type: 'save',
        entityType: 'car_document',
        entityId: docWithCarId.id,
        data: docWithCarId
    });
    App.toast('Документ сохранён локально', 'warning');
    return docWithCarId;
};

App.storage.deleteCarDocument = async function(docId) {
    const carId = App.store.activeCarId;
    await App.db.delete('car_documents', docId);
    try {
        await queueAction({
            type: 'delete',
            entityType: 'car_document',
            entityId: docId,
            data: { id: docId, car_id: carId }
        });
    } catch (e) {
        console.warn('[Storage] Ошибка добавления удаления документа в очередь, но локально уже удалён', e);
    }
    App.toast('Удаление документа сохранено локально', 'warning');
    return true;
};

// ========== ОСНОВНЫЕ ПАРАМЕТРЫ АВТОМОБИЛЯ ==========
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
    App.toast('Параметры сохранены локально', 'warning');
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
    await queueAction({
        type: 'save',
        entityType: 'operation',
        entityId: opWithCarId.id,
        data: opWithCarId
    });
    App.toast('Операция сохранена локально', 'warning');
};

App.storage.deleteOperation = async function(operationId) {
    const carId = App.store.activeCarId;
    await App.db.delete('operations', operationId);
    App.store.operations = App.store.operations.filter(o => o.id != operationId);
    refreshUIToTables();
    try {
        await queueAction({
            type: 'delete',
            entityType: 'operation',
            entityId: operationId,
            data: { id: operationId, car_id: carId }
        });
    } catch (e) {
        console.warn('[Storage] Ошибка добавления удаления операции в очередь, но локально уже удалена', e);
    }
    App.toast('Удаление сохранено локально', 'warning');
};

// ========== ИСТОРИЯ ==========
App.storage.addHistoryRecord = async function(rec) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const recWithCarId = { ...rec, car_id: carId };
    if (!recWithCarId.id) recWithCarId.id = crypto.randomUUID();
    await App.store.saveHistoryRecordToDB(recWithCarId);
    App.store.serviceRecords.push(recWithCarId);
    await queueAction({
        type: 'save',
        entityType: 'history',
        entityId: recWithCarId.id,
        data: recWithCarId
    });
    App.toast('Запись сохранена локально', 'warning');
    refreshUIToHistory();
};

App.storage.deleteHistoryRecord = async function(rowIndex) {
    const record = App.store.serviceRecords.find(r => r.rowIndex == rowIndex);
    if (!record) return;
    const carId = App.store.activeCarId;
    await App.db.delete('service_records', record.id);
    App.store.serviceRecords = App.store.serviceRecords.filter(r => r.id != record.id);
    refreshUIToHistory();
    try {
        await queueAction({
            type: 'delete',
            entityType: 'history',
            entityId: record.id,
            data: { id: record.id, car_id: carId }
        });
    } catch (e) {
        console.warn('[Storage] Ошибка добавления удаления истории в очередь, но локально уже удалена', e);
    }
    App.toast('Удаление сохранено локально', 'warning');
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
    await queueAction({
        type: 'save',
        entityType: 'part',
        entityId: partWithCarId.id,
        data: partWithCarId
    });
    App.toast('Запчасть сохранена локально', 'warning');
};

App.storage.deletePart = async function(partId) {
    const carId = App.store.activeCarId;
    await App.db.delete('parts', partId);
    App.store.parts = App.store.parts.filter(p => p.id != partId);
    refreshUIToParts();
    try {
        await queueAction({
            type: 'delete',
            entityType: 'part',
            entityId: partId,
            data: { id: partId, car_id: carId }
        });
    } catch (e) {
        console.warn('[Storage] Ошибка добавления удаления запчасти в очередь, но локально уже удалена', e);
    }
    App.toast('Удаление сохранено локально', 'warning');
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
    await queueAction({
        type: 'save',
        entityType: 'fuel',
        entityId: recordWithCarId.id,
        data: recordWithCarId
    });
    App.toast('Заправка сохранена локально', 'warning');
};

App.storage.deleteFuelRecord = async function(id) {
    const carId = App.store.activeCarId;
    await App.db.delete('fuel_log', id);
    App.store.fuelLog = App.store.fuelLog.filter(f => f.id != id);
    refreshUIToFuel();
    try {
        await queueAction({
            type: 'delete',
            entityType: 'fuel',
            entityId: id,
            data: { id: id, car_id: carId }
        });
    } catch (e) {
        console.warn('[Storage] Ошибка добавления удаления топлива в очередь, но локально уже удалено', e);
    }
    App.toast('Удаление сохранено локально', 'warning');
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
    await queueAction({
        type: 'save',
        entityType: 'tire',
        entityId: recordWithCarId.id,
        data: recordWithCarId
    });
    App.toast('Шины сохранены локально', 'warning');
};

App.storage.deleteTireRecord = async function(id) {
    const carId = App.store.activeCarId;
    await App.db.delete('tires', id);
    App.store.tireLog = App.store.tireLog.filter(t => t.id != id);
    refreshUIToTires();
    try {
        await queueAction({
            type: 'delete',
            entityType: 'tire',
            entityId: id,
            data: { id: id, car_id: carId }
        });
    } catch (e) {
        console.warn('[Storage] Ошибка добавления удаления шины в очередь, но локально уже удалено', e);
    }
    App.toast('Удаление сохранено локально', 'warning');
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
    await queueAction({
        type: 'save',
        entityType: 'mileage',
        entityId: record.id,
        data: record
    });
    App.toast('Запись пробега сохранена локально', 'warning');
    refreshUIToMileage();
};

// ========== НАСТРОЙКИ ==========
App.storage.saveSettings = async function(settings) {
    const carId = App.store.activeCarId;
    if (!carId) return;
    const cleanedSettings = { ...settings };
    if (cleanedSettings.plateNumber !== undefined && cleanedSettings.plateNumber !== null) {
        cleanedSettings.plateNumber = (typeof cleanedSettings.plateNumber === 'object') ? '' : String(cleanedSettings.plateNumber);
    } else {
        cleanedSettings.plateNumber = '';
    }
    if (cleanedSettings.vin !== undefined && cleanedSettings.vin !== null) {
        cleanedSettings.vin = (typeof cleanedSettings.vin === 'object') ? '' : String(cleanedSettings.vin);
    } else {
        cleanedSettings.vin = '';
    }
    const settingsWithCar = { ...cleanedSettings, car_id: carId };
    Object.assign(App.store.settings, cleanedSettings);
    await App.db.put('car_settings', settingsWithCar);
    await queueAction({
        type: 'save',
        entityType: 'car_settings',
        entityId: carId,
        data: settingsWithCar
    });
    App.toast('Настройки сохранены локально', 'warning');
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
        defaultSettings.plateNumber = '';
        defaultSettings.vin = '';
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

// ========== ЗАГРУЗКА ВСЕХ ДАННЫХ (фоновая, неблокирующая, параллельная) ==========
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

    // 2. Параллельная загрузка всех таблиц (максимальная скорость)
    const loaders = [
        ['operations', App.supa.loadOperations],
        ['fuel_log', App.supa.loadFuelLog],
        ['tires', App.supa.loadTires],
        ['parts', App.supa.loadParts],
        ['history', App.supa.loadHistory],
        ['mileage', App.supa.loadMileageHistory],
        ['settings', App.supa.loadSettings]
    ];

    const results = await Promise.allSettled(
        loaders.map(([name, loader]) =>
            loader().then(data => ({ name, data })).catch(err => ({ name, data: null, error: err }))
        )
    );

    // Обновляем Store только для успешных загрузок
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.data) {
            const { name, data } = result.value;
            switch (name) {
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
    }

    if (typeof App.renderAll === 'function') App.renderAll();
    App.setSyncStatus('synced');
};