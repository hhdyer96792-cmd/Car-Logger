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

     if (typeof App.events !== 'undefined' && App.events.currentActiveTab) {
        App.events.switchToTab(App.events.currentActiveTab);
    }
    
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

// ========== АВТОМОБИЛИ (офлайн-поддержка) ==========
App.storage.saveCar = async function(car) {
    const carWithId = { ...car };
    if (!carWithId.id) carWithId.id = crypto.randomUUID();
    if (!navigator.onLine) {
        // Сначала обновляем локальные данные
        await App.db.put('cars', carWithId);
        const idx = App.store.cars.findIndex(c => c.id == carWithId.id);
        if (idx !== -1) App.store.cars[idx] = carWithId;
        else App.store.cars.push(carWithId);
        // Затем добавляем в очередь и обновляем UI
        await queueAction({
            type: 'save',
            entityType: 'car',
            entityId: carWithId.id,
            data: carWithId
        });
        App.toast('Автомобиль сохранён локально', 'warning');
        return carWithId;
    }
    try {
        const userId = await App.supa.getCurrentUserId();
        if (!userId) throw new Error('User not authenticated');
        const record = { ...carWithId, user_id: userId };
        const { data, error } = await App.supabase
            .from('cars')
            .upsert(record, { onConflict: 'id' })
            .select()
            .single();
        if (error) throw error;
        const finalCar = { ...data };
        await App.db.put('cars', finalCar);
        const idx = App.store.cars.findIndex(c => c.id == finalCar.id);
        if (idx !== -1) App.store.cars[idx] = finalCar;
        else App.store.cars.push(finalCar);
        App.toast('Автомобиль сохранён', 'success');
        return finalCar;
    } catch (err) {
        console.error('[Storage] Ошибка сохранения автомобиля:', err);
        App.toast('Ошибка сохранения автомобиля', 'error');
        return null;
    }
};

App.storage.deleteCar = async function(carId) {
    if (!navigator.onLine) {
        // Сначала удаляем локально
        await App.db.delete('cars', carId);
        App.store.cars = App.store.cars.filter(c => c.id != carId);
        // Затем добавляем в очередь
        await queueAction({
            type: 'delete',
            entityType: 'car',
            entityId: carId,
            data: { id: carId }
        });
        App.toast('Удаление сохранено локально', 'warning');
        return true;
    }
    try {
        const { error } = await App.supabase.from('cars').delete().eq('id', carId);
        if (error) throw error;
        await App.db.delete('cars', carId);
        App.store.cars = App.store.cars.filter(c => c.id != carId);
        return true;
    } catch (err) {
        App.toast('Ошибка удаления автомобиля', 'error');
        return false;
    }
};

App.storage.renameCar = async function(carId, newName) {
    if (!navigator.onLine) {
        const car = App.store.cars.find(c => c.id == carId);
        if (car) {
            const updatedCar = { ...car, name: newName };
            // Сначала обновляем локально
            await App.db.put('cars', updatedCar);
            car.name = newName;
            // Затем добавляем в очередь
            await queueAction({
                type: 'save',
                entityType: 'car',
                entityId: carId,
                data: updatedCar
            });
            App.toast('Переименование сохранено локально', 'warning');
            return true;
        }
        return false;
    }
    try {
        const { data, error } = await App.supabase
            .from('cars')
            .update({ name: newName })
            .eq('id', carId)
            .select()
            .single();
        if (error) throw error;
        const car = App.store.cars.find(c => c.id == carId);
        if (car) car.name = newName;
        await App.db.put('cars', data);
        return true;
    } catch (err) {
        App.toast('Ошибка переименования автомобиля', 'error');
        return false;
    }
};

// ========== ДОКУМЕНТЫ АВТОМОБИЛЯ ==========
App.storage.addCarDocument = async function(doc) {
    const carId = App.store.activeCarId;
    if (!carId) {
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return null;
    }
    const docWithCarId = { ...doc, car_id: carId };
    if (!docWithCarId.id) docWithCarId.id = crypto.randomUUID();
    if (!navigator.onLine) {
        await App.db.put('car_documents', docWithCarId);
        await queueAction({
            type: 'save',
            entityType: 'car_document',
            entityId: docWithCarId.id,
            data: docWithCarId
        });
        App.toast('Документ сохранён локально', 'warning');
        return docWithCarId;
    }
    try {
        const newDoc = await App.supa.addCarDocument(doc);
        const finalDoc = { ...newDoc, car_id: carId };
        await App.db.put('car_documents', finalDoc);
        return finalDoc;
    } catch (err) {
        App.toast('Ошибка сохранения документа', 'error');
        return null;
    }
};

App.storage.deleteCarDocument = async function(docId) {
    if (!navigator.onLine) {
        await App.db.delete('car_documents', docId);
        await queueAction({
            type: 'delete',
            entityType: 'car_document',
            entityId: docId,
            data: { id: docId }
        });
        App.toast('Удаление документа сохранено локально', 'warning');
        return true;
    }
    try {
        await App.supa.deleteCarDocument(docId);
        await App.db.delete('car_documents', docId);
        return true;
    } catch (err) {
        App.toast('Ошибка удаления документа', 'error');
        return false;
    }
};

// ========== ОСНОВНЫЕ ПАРАМЕТРЫ АВТОМОБИЛЯ ==========
App.storage.saveVehicleStateAndSettings = async function(state, settings) {
    const carId = App.store.activeCarId;
    if (!carId) {
        App.toast('Нет активного автомобиля', 'error');
        return;
    }
    const cleanState = { ...state };
    if (cleanState.plateNumber && typeof cleanState.plateNumber !== 'string') cleanState.plateNumber = String(cleanState.plateNumber);
    if (cleanState.vin && typeof cleanState.vin !== 'string') cleanState.vin = String(cleanState.vin);
    const data = { car_id: carId, ...cleanState, ...settings };
    if (!navigator.onLine) {
        Object.assign(App.store.settings, cleanState, settings);
        await App.db.put('car_settings', { ...App.store.settings, car_id: carId });
        await queueAction({ type: 'save', entityType: 'car_settings', entityId: carId, data });
        App.toast('Параметры сохранены локально', 'warning');
        return;
    }
    try {
        await App.supa.saveVehicleState(cleanState);
        await App.supa.saveUserSettings(settings);
        Object.assign(App.store.settings, cleanState, settings);
        await App.db.put('car_settings', { ...App.store.settings, car_id: carId });
        App.toast('Параметры сохранены', 'success');
    } catch (err) {
        App.toast('Ошибка сохранения параметров', 'error');
    }
};

// ========== ОПЕРАЦИИ ==========
App.storage.saveOperation = async function(op) {
    const carId = App.store.activeCarId;
    if (!carId) {
        console.error('[Storage] Нельзя сохранить операцию: нет активного автомобиля');
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return;
    }
    const opWithCarId = { ...op, car_id: carId };
    if (!opWithCarId.id) opWithCarId.id = crypto.randomUUID();
    console.log('[Storage] saveOperation, carId=' + carId + ', id=' + opWithCarId.id + ', online=' + navigator.onLine);
    
    if (!navigator.onLine) {
        // Сначала обновляем локальные данные
        await App.store.saveOperationToDB(opWithCarId);
        const idx = App.store.operations.findIndex(o => o.id == opWithCarId.id);
        if (idx !== -1) App.store.operations[idx] = opWithCarId;
        else App.store.operations.push(opWithCarId);
        // Затем добавляем в очередь и обновляем UI
        await queueAction({
            type: 'save',
            entityType: 'operation',
            entityId: opWithCarId.id,
            data: opWithCarId
        });
        App.toast('Операция сохранена локально', 'warning');
        return;
    }
    
    try {
        const res = await App.supa.saveOperation(op);
        checkResponse(res, 'save');
        if (res.data && res.data[0]) op.id = res.data[0].id;
        const finalOp = { ...op, car_id: carId };
        await App.store.saveOperationToDB(finalOp);
        const idx = App.store.operations.findIndex(o => o.id == op.id);
        if (idx !== -1) App.store.operations[idx] = op;
        else App.store.operations.push(op);
        refreshUIToTables();
        App.toast('Операция сохранена', 'success');
    } catch (err) {
        console.error('[Storage] Ошибка сохранения операции онлайн:', err);
        App.toast('Ошибка сохранения операции', 'error');
    }
};

App.storage.deleteOperation = async function(operationId) {
    if (!navigator.onLine) {
        // Сначала удаляем локально
        await App.db.delete('operations', operationId);
        App.store.operations = App.store.operations.filter(o => o.id != operationId);
        // Затем добавляем в очередь
        await queueAction({
            type: 'delete',
            entityType: 'operation',
            entityId: operationId,
            data: { id: operationId }
        });
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
    if (!carId) {
        console.error('[Storage] Нельзя добавить запись истории: нет активного автомобиля');
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return;
    }
    const recWithCarId = { ...rec, car_id: carId };
    if (!recWithCarId.id) recWithCarId.id = crypto.randomUUID();
    if (!navigator.onLine) {
        // Сначала обновляем локально
        await App.store.saveHistoryRecordToDB(recWithCarId);
        App.store.serviceRecords.push(recWithCarId);
        // Затем добавляем в очередь
        await queueAction({
            type: 'save',
            entityType: 'history',
            entityId: recWithCarId.id,
            data: recWithCarId
        });
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
        await App.db.delete('service_records', record.id);
        App.store.serviceRecords = App.store.serviceRecords.filter(r => r.id != record.id);
        await queueAction({
            type: 'delete',
            entityType: 'history',
            entityId: record.id,
            data: { id: record.id }
        });
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
    if (!carId) {
        console.error('[Storage] Нельзя сохранить запчасть: нет активного автомобиля');
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return;
    }
    const partWithCarId = { ...part, car_id: carId };
    if (!partWithCarId.id) partWithCarId.id = crypto.randomUUID();
    if (!navigator.onLine) {
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
        await App.db.delete('parts', partId);
        App.store.parts = App.store.parts.filter(p => p.id != partId);
        await queueAction({
            type: 'delete',
            entityType: 'part',
            entityId: partId,
            data: { id: partId }
        });
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
    if (!carId) {
        console.error('[Storage] Нельзя сохранить заправку: нет активного автомобиля');
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return;
    }
    const recordWithCarId = { ...record, car_id: carId };
    if (!recordWithCarId.id) recordWithCarId.id = crypto.randomUUID();
    if (!navigator.onLine) {
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
        await App.db.delete('fuel_log', id);
        App.store.fuelLog = App.store.fuelLog.filter(f => f.id != id);
        await queueAction({
            type: 'delete',
            entityType: 'fuel',
            entityId: id,
            data: { id: id }
        });
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
    if (!carId) {
        console.error('[Storage] Нельзя сохранить шины: нет активного автомобиля');
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return;
    }
    const recordWithCarId = { ...record, car_id: carId };
    if (!recordWithCarId.id) recordWithCarId.id = crypto.randomUUID();
    if (!navigator.onLine) {
        // Сначала обновляем локальные данные
        await App.store.saveTireRecordToDB(recordWithCarId);
        const idx = App.store.tireLog.findIndex(t => t.id == recordWithCarId.id);
        if (idx !== -1) App.store.tireLog[idx] = recordWithCarId;
        else App.store.tireLog.push(recordWithCarId);
        // Затем добавляем в очередь и обновляем UI
        await queueAction({
            type: 'save',
            entityType: 'tire',
            entityId: recordWithCarId.id,
            data: recordWithCarId
        });
        App.toast('Шины сохранены локально', 'warning');
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
        await App.db.delete('tires', id);
        App.store.tireLog = App.store.tireLog.filter(t => t.id != id);
        await queueAction({
            type: 'delete',
            entityType: 'tire',
            entityId: id,
            data: { id: id }
        });
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
    if (!carId) {
        console.error('[Storage] Нельзя добавить пробег: нет активного автомобиля');
        App.toast('Ошибка: не выбран автомобиль', 'error');
        return;
    }
    const record = { date, mileage, motohours, user_id: userId, car_id: carId };
    if (!record.id) record.id = crypto.randomUUID();
    if (!navigator.onLine) {
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
        return;
    }
    const res = await App.supabase.from('mileage_log').insert(record).select();
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    await App.store.saveMileageRecordToDB(record);
    App.store.mileageHistory.push(record);
    refreshUIToMileage();
};

// ========== НАСТРОЙКИ ==========
App.storage.saveSettings = async function(settings) {
    const carId = App.store.activeCarId;
    if (!carId) {
        App.toast('Нет активного автомобиля', 'error');
        return;
    }
    const settingsWithCar = { ...settings, car_id: carId };
    
    if (!navigator.onLine) {
        Object.assign(App.store.settings, settings);
        await App.db.put('car_settings', settingsWithCar);
        await queueAction({
            type: 'save',
            entityType: 'car_settings',
            entityId: carId,
            data: settingsWithCar
        });
        App.toast('Настройки сохранены локально', 'warning');
        refreshUIToSettings();
        return;
    }
    
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
        let cached = await App.db.getById('car_settings', carId);
        if (cached) {
            let decrypted = cached;
            const masterKey = App.db.encryption.getMasterKey();
            if (masterKey && cached.telegramToken && typeof cached.telegramToken === 'object') {
                decrypted = await App.db.encryption.decryptSettings(cached, masterKey);
            }
            decrypted.plateNumber = decrypted.plateNumber && typeof decrypted.plateNumber === 'object' ? '' : String(decrypted.plateNumber || '');
            decrypted.vin = decrypted.vin && typeof decrypted.vin === 'object' ? '' : String(decrypted.vin || '');
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

// ========== ЗАГРУЗКА ВСЕХ ДАННЫХ ==========
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
        
        const opsWithCar = operations.map(op => ({ ...op, id: op.id || crypto.randomUUID(), car_id: carId }));
        const fuelWithCar = fuelLog.map(f => ({ ...f, id: f.id || crypto.randomUUID(), car_id: carId }));
        const tiresWithCar = tireLog.map(t => ({ ...t, id: t.id || crypto.randomUUID(), car_id: carId }));
        const partsWithCar = parts.map(p => ({ ...p, id: p.id || crypto.randomUUID(), car_id: carId }));
        const historyWithCar = history.map(h => ({ ...h, id: h.id || crypto.randomUUID(), car_id: carId }));
        const mileageWithCar = mileageHistory.map(m => ({ ...m, id: m.id || crypto.randomUUID(), car_id: carId }));

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
    if (App.events.currentActiveTab) {
        App.events.switchToTab(App.events.currentActiveTab);
    }
};
