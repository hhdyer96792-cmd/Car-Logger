// src/api/storage.js
window.App = window.App || {};
App.storage = App.storage || {};

function checkResponse({ data, error }, actionName) {
    if (error) throw error;
    if (actionName === 'delete') return;
}

async function queueAction(action) {
    await App.store.addPendingAction(action);
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('vesta-sync');
        } catch (err) {
            console.warn('[Storage] Background Sync registration failed:', err);
        }
    }
    if (navigator.onLine && typeof App.db.sync.processSyncQueue === 'function') {
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

// ========== ОПЕРАЦИИ ==========
App.storage.saveOperation = async function(op) {
    const carId = App.store.activeCarId;
    const opWithCarId = { ...op, car_id: carId };
    if (!navigator.onLine) {
        if (!opWithCarId.id) opWithCarId.id = crypto.randomUUID();
        await queueAction({
            type: 'save',
            entityType: 'operation',
            entityId: opWithCarId.id,
            data: opWithCarId
        });
        await App.store.saveOperationToDB(opWithCarId);
        const idx = App.store.operations.findIndex(o => o.id == opWithCarId.id);
        if (idx !== -1) App.store.operations[idx] = op;
        else App.store.operations.push(op);
        App.toast('Операция сохранена локально', 'warning');
        refreshUIToTables();
        return;
    }
    const res = await App.supa.saveOperation(op);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) op.id = res.data[0].id;
    const finalOp = { ...op, car_id: carId };
    await App.store.saveOperationToDB(finalOp);
    const idx = App.store.operations.findIndex(o => o.id == op.id);
    if (idx !== -1) App.store.operations[idx] = op;
    else App.store.operations.push(op);
    refreshUIToTables();
};

App.storage.deleteOperation = async function(operationId) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'delete',
            entityType: 'operation',
            entityId: operationId,
            data: { id: operationId }
        });
        await App.db.delete('operations', operationId);
        App.store.operations = App.store.operations.filter(o => o.id != operationId);
        App.toast('Удаление сохранено локально', 'warning');
        refreshUIToTables();
        return;
    }
    const res = await App.supabase.from('operations').delete().eq('id', operationId).select();
    checkResponse(res, 'delete');
    await App.db.delete('operations', operationId);
    App.store.operations = App.store.operations.filter(o => o.id != operationId);
    refreshUIToTables();
};

// ========== ИСТОРИЯ ==========
App.storage.addHistoryRecord = async function(rec) {
    const carId = App.store.activeCarId;
    const recWithCarId = { ...rec, car_id: carId };
    if (!navigator.onLine) {
        if (!recWithCarId.id) recWithCarId.id = crypto.randomUUID();
        await queueAction({
            type: 'save',
            entityType: 'history',
            entityId: recWithCarId.id,
            data: recWithCarId
        });
        await App.store.saveHistoryRecordToDB(recWithCarId);
        App.store.serviceRecords.push(rec);
        App.toast('Запись сохранена локально', 'warning');
        refreshUIToHistory();
        return;
    }
    const res = await App.supa.saveHistoryRecord(rec);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) rec.id = res.data[0].id;
    const finalRec = { ...rec, car_id: carId };
    await App.store.saveHistoryRecordToDB(finalRec);
    const idx = App.store.serviceRecords.findIndex(r => r.id == rec.id);
    if (idx !== -1) App.store.serviceRecords[idx] = rec;
    else App.store.serviceRecords.push(rec);
    refreshUIToHistory();
};

App.storage.updateHistoryRecord = async function(rowIndex, record) {
    return App.storage.addHistoryRecord(record);
};

App.storage.deleteHistoryRecord = async function(rowIndex) {
    const record = App.store.serviceRecords.find(r => r.rowIndex == rowIndex);
    if (!record) return;
    if (!navigator.onLine) {
        await queueAction({
            type: 'delete',
            entityType: 'history',
            entityId: record.id,
            data: { id: record.id }
        });
        await App.db.delete('service_records', record.id);
        App.store.serviceRecords = App.store.serviceRecords.filter(r => r.id != record.id);
        App.toast('Удаление сохранено локально', 'warning');
        refreshUIToHistory();
        return;
    }
    const res = await App.supabase.from('history').delete().eq('id', record.id).select();
    checkResponse(res, 'delete');
    await App.db.delete('service_records', record.id);
    App.store.serviceRecords = App.store.serviceRecords.filter(r => r.id != record.id);
    refreshUIToHistory();
};

// ========== ЗАПЧАСТИ ==========
App.storage.savePart = async function(part) {
    const carId = App.store.activeCarId;
    const partWithCarId = { ...part, car_id: carId };
    if (!navigator.onLine) {
        if (!partWithCarId.id) partWithCarId.id = crypto.randomUUID();
        await queueAction({
            type: 'save',
            entityType: 'part',
            entityId: partWithCarId.id,
            data: partWithCarId
        });
        await App.store.savePartToDB(partWithCarId);
        const idx = App.store.parts.findIndex(p => p.id == part.id);
        if (idx !== -1) App.store.parts[idx] = part;
        else App.store.parts.push(part);
        App.toast('Запчасть сохранена локально', 'warning');
        refreshUIToParts();
        return;
    }
    const res = await App.supa.savePart(part);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) part.id = res.data[0].id;
    const finalPart = { ...part, car_id: carId };
    await App.store.savePartToDB(finalPart);
    const idx = App.store.parts.findIndex(p => p.id == part.id);
    if (idx !== -1) App.store.parts[idx] = part;
    else App.store.parts.push(part);
    refreshUIToParts();
};

App.storage.deletePart = async function(partId) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'delete',
            entityType: 'part',
            entityId: partId,
            data: { id: partId }
        });
        await App.db.delete('parts', partId);
        App.store.parts = App.store.parts.filter(p => p.id != partId);
        App.toast('Удаление сохранено локально', 'warning');
        refreshUIToParts();
        return;
    }
    const res = await App.supabase.from('parts').delete().eq('id', partId).select();
    checkResponse(res, 'delete');
    await App.db.delete('parts', partId);
    App.store.parts = App.store.parts.filter(p => p.id != partId);
    refreshUIToParts();
};

// ========== ТОПЛИВО ==========
App.storage.saveFuelRecord = async function(id, record) {
    const carId = App.store.activeCarId;
    const recordWithCarId = { ...record, car_id: carId };
    if (!navigator.onLine) {
        if (!recordWithCarId.id) recordWithCarId.id = crypto.randomUUID();
        await queueAction({
            type: 'save',
            entityType: 'fuel',
            entityId: recordWithCarId.id,
            data: recordWithCarId
        });
        await App.store.saveFuelRecordToDB(recordWithCarId);
        const idx = App.store.fuelLog.findIndex(f => f.id == recordWithCarId.id);
        if (idx !== -1) App.store.fuelLog[idx] = record;
        else App.store.fuelLog.push(record);
        App.toast('Заправка сохранена локально', 'warning');
        refreshUIToFuel();
        return;
    }
    const res = await App.supa.saveFuelRecord(record);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    const finalRecord = { ...record, car_id: carId };
    await App.store.saveFuelRecordToDB(finalRecord);
    const idx = App.store.fuelLog.findIndex(f => f.id == record.id);
    if (idx !== -1) App.store.fuelLog[idx] = record;
    else App.store.fuelLog.push(record);
    refreshUIToFuel();
};

App.storage.deleteFuelRecord = async function(id) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'delete',
            entityType: 'fuel',
            entityId: id,
            data: { id: id }
        });
        await App.db.delete('fuel_log', id);
        App.store.fuelLog = App.store.fuelLog.filter(f => f.id != id);
        App.toast('Удаление сохранено локально', 'warning');
        refreshUIToFuel();
        return;
    }
    const res = await App.supabase.from('fuel_log').delete().eq('id', id).select();
    checkResponse(res, 'delete');
    await App.db.delete('fuel_log', id);
    App.store.fuelLog = App.store.fuelLog.filter(f => f.id != id);
    refreshUIToFuel();
};

// ========== ШИНЫ ==========
App.storage.saveTireRecord = async function(id, record) {
    const carId = App.store.activeCarId;
    const recordWithCarId = { ...record, car_id: carId };
    if (!navigator.onLine) {
        if (!recordWithCarId.id) recordWithCarId.id = crypto.randomUUID();
        await queueAction({
            type: 'save',
            entityType: 'tire',
            entityId: recordWithCarId.id,
            data: recordWithCarId
        });
        await App.store.saveTireRecordToDB(recordWithCarId);
        const idx = App.store.tireLog.findIndex(t => t.id == recordWithCarId.id);
        if (idx !== -1) App.store.tireLog[idx] = record;
        else App.store.tireLog.push(record);
        App.toast('Шины сохранены локально', 'warning');
        refreshUIToTires();
        return;
    }
    const res = await App.supa.saveTireRecord(record);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    const finalRecord = { ...record, car_id: carId };
    await App.store.saveTireRecordToDB(finalRecord);
    const idx = App.store.tireLog.findIndex(t => t.id == record.id);
    if (idx !== -1) App.store.tireLog[idx] = record;
    else App.store.tireLog.push(record);
    refreshUIToTires();
};

App.storage.deleteTireRecord = async function(id) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'delete',
            entityType: 'tire',
            entityId: id,
            data: { id: id }
        });
        await App.db.delete('tires', id);
        App.store.tireLog = App.store.tireLog.filter(t => t.id != id);
        App.toast('Удаление сохранено локально', 'warning');
        refreshUIToTires();
        return;
    }
    const res = await App.supabase.from('tires').delete().eq('id', id).select();
    checkResponse(res, 'delete');
    await App.db.delete('tires', id);
    App.store.tireLog = App.store.tireLog.filter(t => t.id != id);
    refreshUIToTires();
};

// ========== ПРОБЕГ ==========
App.storage.addMileageRecord = async function(date, mileage, motohours) {
    const userId = await App.supa.getCurrentUserId();
    const carId = App.store.activeCarId;
    const record = { date, mileage, motohours, user_id: userId, car_id: carId };
    if (!navigator.onLine) {
        if (!record.id) record.id = crypto.randomUUID();
        await queueAction({
            type: 'save',
            entityType: 'mileage',
            entityId: record.id,
            data: record
        });
        await App.store.saveMileageRecordToDB(record);
        App.store.mileageHistory.push(record);
        App.toast('Запись пробега сохранена локально', 'warning');
        refreshUIToMileage();
        return;
    }
    const res = await App.supabase.from('mileage_log').insert(record).select();
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    await App.store.saveMileageRecordToDB(record);
    App.store.mileageHistory.push(record);
    refreshUIToMileage();
};

// ========== НАСТРОЙКИ (с привязкой к автомобилю) ==========
App.storage.saveSettings = async function(settings) {
    const carId = App.store.activeCarId;
    if (!carId) {
        App.toast('Нет активного автомобиля', 'error');
        return;
    }
    const settingsWithCar = { ...settings, car_id: carId };
    
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'car_settings',
            entityId: carId,
            data: settingsWithCar
        });
        Object.assign(App.store.settings, settings);
        await App.db.put('car_settings', settingsWithCar);
        App.toast('Настройки сохранены локально', 'warning');
        refreshUIToSettings();
        return;
    }
    
    // Онлайн: сохраняем в Supabase
    await App.supa.saveVehicleState({
        currentMileage: settings.currentMileage,
        currentMotohours: settings.currentMotohours,
        avgDailyMileage: settings.avgDailyMileage,
        avgDailyMotohours: settings.avgDailyMotohours,
        carBrand: settings.carBrand,
        carModel: settings.carModel,
        carYear: settings.carYear,
        plateNumber: settings.plateNumber,
        vin: settings.vin
    });
    await App.supa.saveUserSettings({
        telegramToken: settings.telegramToken,
        telegramChatId: settings.telegramChatId,
        notificationMethod: settings.notificationMethod,
        reminderDays: settings.reminderDays || '7,2'
    });
    Object.assign(App.store.settings, settings);
    await App.db.put('car_settings', settingsWithCar);
    App.toast('Настройки сохранены', 'success');
    refreshUIToSettings();
};

App.storage.loadSettingsForCar = async function(carId) {
    if (!carId) return null;
    try {
        // Сначала пробуем из кэша
        let cached = await App.db.getById('car_settings', carId);
        if (cached) {
            // Если в кэше есть, расшифровываем при необходимости
            let decrypted = cached;
            const masterKey = App.db.encryption.getMasterKey();
            if (masterKey && cached.telegramToken && typeof cached.telegramToken === 'object') {
                decrypted = await App.db.encryption.decryptSettings(cached, masterKey);
            }
            Object.assign(App.store.settings, decrypted);
            return decrypted;
        }
        // Если нет в кэше и есть сеть – загружаем с сервера
        if (navigator.onLine) {
            const settings = await App.supa.loadSettings();
            if (settings) {
                const settingsWithCar = { ...settings, car_id: carId };
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
        // Если ничего нет – используем дефолтные настройки
        const defaultSettings = { ...App.defaults.settings, car_id: carId };
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

// ========== ЗАГРУЗКА ВСЕХ ДАННЫХ (ОНЛАЙН) ==========
App.storage.loadAllData = async function() {
    if (!navigator.onLine) {
        App.toast('Нет подключения к интернету. Показываю кэшированные данные.', 'warning');
        await App.store.loadFromIndexedDB();
        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.renderAll === 'function') App.renderAll();
        App.setSyncStatus('local');
        return;
    }

    try {
        const [operations, fuelLog, tireLog, parts, history, settings, mileageHistory] = await Promise.all([
            App.supa.loadOperations(),
            App.supa.loadFuelLog(),
            App.supa.loadTires(),
            App.supa.loadParts(),
            App.supa.loadHistory(),
            App.supa.loadSettings(),
            App.supa.loadMileageHistory()
        ]);

        const carId = App.store.activeCarId;
        
        const opsWithCar = operations.map(op => ({ 
            ...op, 
            id: op.id || crypto.randomUUID(), 
            car_id: carId 
        }));
        const fuelWithCar = fuelLog.map(f => ({ 
            ...f, 
            id: f.id || crypto.randomUUID(), 
            car_id: carId 
        }));
        const tiresWithCar = tireLog.map(t => ({ 
            ...t, 
            id: t.id || crypto.randomUUID(), 
            car_id: carId 
        }));
        const partsWithCar = parts.map(p => ({ 
            ...p, 
            id: p.id || crypto.randomUUID(), 
            car_id: carId 
        }));
        const historyWithCar = history.map(h => ({ 
            ...h, 
            id: h.id || crypto.randomUUID(), 
            car_id: carId 
        }));
        const mileageWithCar = mileageHistory.map(m => ({ 
            ...m, 
            id: m.id || crypto.randomUUID(), 
            car_id: carId 
        }));

        await App.db.putMany('operations', opsWithCar);
        await App.db.putMany('fuel_log', fuelWithCar);
        await App.db.putMany('tires', tiresWithCar);
        await App.db.putMany('parts', partsWithCar);
        await App.db.putMany('service_records', historyWithCar);
        await App.db.putMany('mileage_log', mileageWithCar);
        if (settings) {
            const settingsWithCar = { ...settings, car_id: carId };
            await App.db.put('car_settings', settingsWithCar);
            Object.assign(App.store.settings, settings);
        }

        App.store.operations = operations;
        App.store.fuelLog = fuelLog;
        App.store.tireLog = tireLog;
        App.store.parts = parts;
        App.store.serviceRecords = history;
        if (settings) Object.assign(App.store.settings, settings);
        App.store.mileageHistory = mileageHistory;

        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.renderAll === 'function') App.renderAll();
        App.setSyncStatus('synced');
    } catch (e) {
        console.error(e);
        App.toast('Ошибка загрузки данных', 'error');
    }
};