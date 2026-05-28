// src/api/storage.js
window.App = window.App || {};
App.storage = App.storage || {};

function checkResponse({ data, error }, actionName) {
    if (error) throw error;
    if (data && Array.isArray(data) && data.length === 0 && actionName === 'delete') {
        throw new Error('Нет прав на удаление');
    }
}

// ========== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ RETRY ==========
async function fetchWithRetry(fn, retries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            console.warn(`[Storage] Попытка ${i + 1}/${retries} не удалась:`, err.message);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }
    throw lastError;
}

// ========== ОФЛАЙН-ОЧЕРЕДЬ ==========
async function queueAction(action) {
    await App.store.addPendingAction(action);
    // Регистрация фоновой синхронизации (если поддерживается)
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('vesta-sync');
        } catch (err) {
            console.warn('[Storage] Background Sync registration failed:', err);
        }
    }
    // Если приложение онлайн – запускаем синхронизацию немедленно (улучшение UX)
    if (navigator.onLine && typeof App.db.sync.processSyncQueue === 'function') {
        setTimeout(() => App.db.sync.processSyncQueue(), 100);
    }
}

// ========== ОПЕРАЦИИ ==========
App.storage.saveOperation = async function(op) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'operation',
            entityId: op.id,
            data: op
        });
        await App.store.saveOperationToDB(op);
        if (op.id) {
            const idx = App.store.operations.findIndex(o => o.id == op.id);
            if (idx !== -1) App.store.operations[idx] = op;
            else App.store.operations.push(op);
        } else {
            // Временный ID для нового объекта (будет заменён при синхронизации)
            if (!op.id) op.id = crypto.randomUUID();
            App.store.operations.push(op);
        }
        App.toast('Операция сохранена локально', 'warning');
        return;
    }
    const res = await App.supa.saveOperation(op);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) op.id = res.data[0].id;
    await App.store.saveOperationToDB(op);
    const idx = App.store.operations.findIndex(o => o.id == op.id);
    if (idx !== -1) App.store.operations[idx] = op;
    else App.store.operations.push(op);
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
        return;
    }
    const res = await App.supabase.from('operations').delete().eq('id', operationId).select();
    checkResponse(res, 'delete');
    await App.db.delete('operations', operationId);
    App.store.operations = App.store.operations.filter(o => o.id != operationId);
};

// ========== ИСТОРИЯ (записи ТО) ==========
App.storage.addHistoryRecord = async function(rec) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'history',
            entityId: rec.id,
            data: rec
        });
        await App.store.saveHistoryRecordToDB(rec);
        App.store.serviceRecords.push(rec);
        App.toast('Запись сохранена локально', 'warning');
        return;
    }
    const res = await App.supa.saveHistoryRecord(rec);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) rec.id = res.data[0].id;
    await App.store.saveHistoryRecordToDB(rec);
    const idx = App.store.serviceRecords.findIndex(r => r.id == rec.id);
    if (idx !== -1) App.store.serviceRecords[idx] = rec;
    else App.store.serviceRecords.push(rec);
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
        return;
    }
    const res = await App.supabase.from('history').delete().eq('id', record.id).select();
    checkResponse(res, 'delete');
    await App.db.delete('service_records', record.id);
    App.store.serviceRecords = App.store.serviceRecords.filter(r => r.id != record.id);
};

// ========== ЗАПЧАСТИ ==========
App.storage.savePart = async function(part) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'part',
            entityId: part.id,
            data: part
        });
        await App.store.savePartToDB(part);
        const idx = App.store.parts.findIndex(p => p.id == part.id);
        if (idx !== -1) App.store.parts[idx] = part;
        else App.store.parts.push(part);
        App.toast('Запчасть сохранена локально', 'warning');
        return;
    }
    const res = await App.supa.savePart(part);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) part.id = res.data[0].id;
    await App.store.savePartToDB(part);
    const idx = App.store.parts.findIndex(p => p.id == part.id);
    if (idx !== -1) App.store.parts[idx] = part;
    else App.store.parts.push(part);
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
        return;
    }
    const res = await App.supabase.from('parts').delete().eq('id', partId).select();
    checkResponse(res, 'delete');
    await App.db.delete('parts', partId);
    App.store.parts = App.store.parts.filter(p => p.id != partId);
};

// ========== ТОПЛИВО ==========
App.storage.saveFuelRecord = async function(id, record) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'fuel',
            entityId: id,
            data: record
        });
        await App.store.saveFuelRecordToDB(record);
        const idx = App.store.fuelLog.findIndex(f => f.id == id);
        if (idx !== -1) App.store.fuelLog[idx] = record;
        else App.store.fuelLog.push(record);
        App.toast('Заправка сохранена локально', 'warning');
        return;
    }
    const res = await App.supa.saveFuelRecord(record);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    await App.store.saveFuelRecordToDB(record);
    const idx = App.store.fuelLog.findIndex(f => f.id == record.id);
    if (idx !== -1) App.store.fuelLog[idx] = record;
    else App.store.fuelLog.push(record);
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
        return;
    }
    const res = await App.supabase.from('fuel_log').delete().eq('id', id).select();
    checkResponse(res, 'delete');
    await App.db.delete('fuel_log', id);
    App.store.fuelLog = App.store.fuelLog.filter(f => f.id != id);
};

// ========== ШИНЫ ==========
App.storage.saveTireRecord = async function(id, record) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'tire',
            entityId: id,
            data: record
        });
        await App.store.saveTireRecordToDB(record);
        const idx = App.store.tireLog.findIndex(t => t.id == id);
        if (idx !== -1) App.store.tireLog[idx] = record;
        else App.store.tireLog.push(record);
        App.toast('Шины сохранены локально', 'warning');
        return;
    }
    const res = await App.supa.saveTireRecord(record);
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    await App.store.saveTireRecordToDB(record);
    const idx = App.store.tireLog.findIndex(t => t.id == record.id);
    if (idx !== -1) App.store.tireLog[idx] = record;
    else App.store.tireLog.push(record);
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
        return;
    }
    const res = await App.supabase.from('tires').delete().eq('id', id).select();
    checkResponse(res, 'delete');
    await App.db.delete('tires', id);
    App.store.tireLog = App.store.tireLog.filter(t => t.id != id);
};

// ========== ПРОБЕГ ==========
App.storage.addMileageRecord = async function(date, mileage, motohours) {
    const userId = await App.supa.getCurrentUserId();
    const record = { date, mileage, motohours, user_id: userId, car_id: App.store.activeCarId };
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'mileage',
            entityId: null,
            data: record
        });
        await App.store.saveMileageRecordToDB(record);
        App.store.mileageHistory.push(record);
        App.toast('Запись пробега сохранена локально', 'warning');
        return;
    }
    const res = await App.supabase.from('mileage_log').insert(record).select();
    checkResponse(res, 'save');
    if (res.data && res.data[0]) record.id = res.data[0].id;
    await App.store.saveMileageRecordToDB(record);
    App.store.mileageHistory.push(record);
};

// ========== НАСТРОЙКИ ==========
App.storage.saveSettings = async function(settings) {
    if (!navigator.onLine) {
        await queueAction({
            type: 'save',
            entityType: 'settings',
            entityId: 1,
            data: settings
        });
        Object.assign(App.store.settings, settings);
        await App.store.saveSettingsToDB();
        App.toast('Настройки сохранены локально', 'warning');
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
    await App.store.saveSettingsToDB();
    App.toast('Настройки сохранены', 'success');
};

// ========== ЗАГРУЗКА ВСЕХ ДАННЫХ (ОНЛАЙН) С RETRY ==========
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
        // Оборачиваем загрузку в fetchWithRetry (3 попытки, задержка 1, 2, 4 сек)
        const [operations, fuelLog, tireLog, parts, history, settings, mileageHistory] = await fetchWithRetry(
            () => Promise.all([
                App.supa.loadOperations(),
                App.supa.loadFuelLog(),
                App.supa.loadTires(),
                App.supa.loadParts(),
                App.supa.loadHistory(),
                App.supa.loadSettings(),
                App.supa.loadMileageHistory()
            ]),
            3,
            1000
        );

        // Сохраняем каждую сущность в IndexedDB
        for (const op of operations) await App.store.saveOperationToDB(op);
        for (const f of fuelLog) await App.store.saveFuelRecordToDB(f);
        for (const t of tireLog) await App.store.saveTireRecordToDB(t);
        for (const p of parts) await App.store.savePartToDB(p);
        for (const h of history) await App.store.saveHistoryRecordToDB(h);
        for (const m of mileageHistory) await App.store.saveMileageRecordToDB(m);
        if (settings) {
            Object.assign(App.store.settings, settings);
            await App.store.saveSettingsToDB();
        }

        // Обновляем App.store
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
        App.toast('Ошибка загрузки данных после нескольких попыток. Проверьте соединение.', 'error');
        // При ошибке всё равно пытаемся показать кэшированные данные, если они есть
        await App.store.loadFromIndexedDB();
        if (App.store.operations.length > 0 || App.store.fuelLog.length > 0) {
            document.getElementById('data-panel').style.display = 'block';
            if (typeof App.renderAll === 'function') App.renderAll();
            App.setSyncStatus('local');
            App.toast('Показываю ранее загруженные данные из кэша.', 'warning');
        } else {
            App.toast('Не удалось загрузить данные из сети и из кэша.', 'error');
        }
    }
};