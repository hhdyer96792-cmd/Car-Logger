// src/db/sync.js
window.App = window.App || {};
App.db = App.db || {};
App.db.sync = App.db.sync || {};

// Увеличенные таймауты и задержки для стабильности при плохой сети
const MAX_RETRIES = 10;
const BASE_DELAY = 2000;
const MAX_DELAY = 60000;
const ACTION_TIMEOUT = 30000;

App.db.sync._getDelay = function(retryCount) {
    const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    return Math.max(0, delay + jitter);
};

App.db.sync._updatePendingAction = async function(action, retryCount, errorMessage) {
    action.retryCount = retryCount;
    action.lastError = errorMessage;
    action.lastAttempt = Date.now();
    if (retryCount >= MAX_RETRIES) {
        console.error(`[Sync] Действие ${action.id} окончательно не удалось после ${retryCount} попыток`);
        await App.db.put('error_log', { id: crypto.randomUUID(), type: 'sync_failed_retry_later', action: action, timestamp: Date.now(), message: errorMessage });
    }
    await App.db.put('pending_actions', action);
};

App.db.sync._executeAction = async function(action) {
    const { type, entityType, entityId, data } = action;
    console.log(`[Sync] Выполнение действия ${action.id}, тип=${type}, сущность=${entityType}`);

    const controller = new AbortController();
    const signal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), ACTION_TIMEOUT);

    try {
        const result = await (async () => {
            if (type === 'delete' && entityType !== 'car') {
                return await App.db.sync._executeDelete(action, signal);
            }
            switch (entityType) {
                case 'operation': return await App.supa.saveOperation(data, signal);
                case 'fuel':      return await App.supa.saveFuelRecord(data, signal);
                case 'tire':      return await App.supa.saveTireRecord(data, signal);
                case 'part':      return await App.supa.savePart(data, signal);
                case 'history':   return await App.supa.saveHistoryRecord(data, signal);
                case 'mileage':   return await App.supa.addMileageRecord(data.date, data.mileage, data.motohours, data.car_id, signal);
                case 'car_document': {
                    const { data: docData, error: docError } = await App.supabase.from('car_documents').upsert(data, { onConflict: 'id' }).select().single().abortSignal(signal);
                    if (docError) throw docError;
                    if (docData.id !== entityId) await App.db.sync._updateLocalId(entityType, entityId, docData);
                    return { success: true };
                }
                case 'car_state_settings':
                case 'car_settings': {
                    const cleanedData = { ...data };
                    if (cleanedData.plateNumber !== undefined && cleanedData.plateNumber !== null) cleanedData.plateNumber = String(cleanedData.plateNumber);
                    if (cleanedData.vin !== undefined && cleanedData.vin !== null) cleanedData.vin = String(cleanedData.vin);
                    await App.supa.saveVehicleState(cleanedData);
                    await App.supa.saveUserSettings(cleanedData);
                    Object.assign(App.store.settings, cleanedData);
                    await App.db.put('car_settings', { ...App.store.settings, car_id: App.store.activeCarId });
                    return { success: true };
                }
                case 'car': {
                    if (type === 'save') {
                        const { data: carData, error: carError } = await App.supabase.from('cars').upsert(data, { onConflict: 'id' }).select().single().abortSignal(signal);
                        if (carError) throw carError;
                        if (carData.id !== entityId) await App.db.sync._updateLocalId(entityType, entityId, carData);
                        else { const idx = App.store.cars.findIndex(c => c.id == carData.id); if (idx !== -1) App.store.cars[idx] = carData; else App.store.cars.push(carData); await App.db.put('cars', carData); }
                    } else if (type === 'delete') {
                        const { error } = await App.supabase.from('cars').delete().eq('id', entityId).abortSignal(signal);
                        if (error && error.status !== 404) throw error;
                        await App.db.delete('cars', entityId);
                        await App.db.delete('car_settings', entityId);
                        const idx = App.store.cars.findIndex(c => c.id == entityId);
                        if (idx !== -1) App.store.cars.splice(idx, 1);
                    }
                    return { success: true };
                }
                default: throw new Error(`Unknown entityType: ${entityType}`);
            }
        })();
        return result;
    } finally {
        clearTimeout(timeoutId);
    }
};

App.db.sync._executeDelete = async function(action, signal) {
    const { entityType, entityId, data } = action;
    const tableName = { operation: 'operations', fuel: 'fuel_log', tire: 'tires', part: 'parts', history: 'history' }[entityType];
    if (!tableName) throw new Error(`Unknown entityType for delete: ${entityType}`);
    const carId = data.car_id || App.store.activeCarId;
    console.log(`[Sync] Удаление на сервере: ${tableName} id=${entityId}, car_id=${carId}`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { data: deleted, error } = await App.supabase.from(tableName).delete().eq('id', entityId).eq('car_id', carId).select('id').abortSignal(signal);
            if (error) {
                if (error.status === 404) break;
                throw error;
            }
            break;
        } catch (err) {
            console.error(`[Sync] Попытка ${attempt} удаления:`, err.message);
            if (attempt === MAX_RETRIES) {
                action.retryCount = MAX_RETRIES;
                action.lastError = err.message;
                action.lastAttempt = Date.now();
                await App.db.put('pending_actions', action);
                throw new Error('Удаление отложено');
            }
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    try { await App.db.delete(tableName, entityId); } catch (e) {}
    const storeKey = { operations: 'operations', fuel_log: 'fuelLog', tires: 'tireLog', parts: 'parts', history: 'serviceRecords' }[tableName];
    if (storeKey && App.store[storeKey]) App.store[storeKey] = App.store[storeKey].filter(i => i.id != entityId);
    return { success: true };
};

App.db.sync._updateLocalId = async function(entityType, oldId, serverRecord) {
    let storeArray, storeName;
    switch (entityType) {
        case 'operation': storeArray = App.store.operations; storeName = 'operations'; break;
        case 'fuel': storeArray = App.store.fuelLog; storeName = 'fuel_log'; break;
        case 'tire': storeArray = App.store.tireLog; storeName = 'tires'; break;
        case 'part': storeArray = App.store.parts; storeName = 'parts'; break;
        case 'history': storeArray = App.store.serviceRecords; storeName = 'service_records'; break;
        case 'mileage': storeArray = App.store.mileageHistory; storeName = 'mileage_log'; break;
        case 'car': storeArray = App.store.cars; storeName = 'cars'; break;
        default: return;
    }
    const idx = storeArray.findIndex(i => i.id == oldId);
    if (idx !== -1) { storeArray.splice(idx, 1); await App.db.delete(storeName, oldId); }
    storeArray.push(serverRecord);
    await App.db.put(storeName, serverRecord);
};

// ИСПРАВЛЕНА: улучшенная обработка очереди с повторными попытками и сетевыми ошибками
App.db.sync.processSyncQueue = async function() {
    if (!App.db._db) { setTimeout(() => App.db.sync.processSyncQueue(), 1000); return; }
    if (!navigator.onLine) {
        setTimeout(() => App.db.sync.processSyncQueue(), 30000);
        return;
    }
    if (App.db.sync._isRunning) return;

    App.db.sync._isRunning = true;
    let errorCount = 0;
    try {
        await new Promise(r => setTimeout(r, 100));
        let pending = await App.db.getAll('pending_actions');
        pending = pending.filter(action => !action.nextRetry || action.nextRetry <= Date.now());
        if (!pending.length) {
            if (typeof App.setSyncStatus === 'function') App.setSyncStatus('synced');
            return;
        }
        if (typeof App.setSyncStatus === 'function') App.setSyncStatus('syncing');

        for (let i = 0; i < pending.length; i++) {
            const action = pending[i];
            try {
                await App.db.sync._executeAction(action);
                await App.db.delete('pending_actions', action.id);

                // ========== [CLOUD BACKUP] Сохраняем бэкап после успешной синхронизации ==========
                if (typeof App.db.cloudBackup?.savePendingActionToCloud === 'function') {
                    await App.db.cloudBackup.savePendingActionToCloud(action);
                }
                if (typeof App.db.cloudBackup?.markActionAsSyncedAndCleanup === 'function') {
                    App.db.cloudBackup.markActionAsSyncedAndCleanup(action).catch(e => console.warn('[Sync] Ошибка маркировки бэкапа:', e));
                }
                // =================================================================================

            } catch (err) {
                errorCount++;
                const retry = (action.retryCount || 0) + 1;
                const isNetworkError = err.message && (err.message.includes('timeout') || err.message.includes('fetch') || err.message.includes('network') || err.message.includes('abort'));
                if (retry >= MAX_RETRIES || !isNetworkError) {
                    console.error(`[Sync] Действие ${action.id} окончательно не удалось:`, err.message);
                    await App.db.put('error_log', { id: crypto.randomUUID(), type: 'sync_failed', action: action, timestamp: Date.now(), message: err.message });
                    await App.db.delete('pending_actions', action.id);
                } else {
                    console.warn(`[Sync] Действие ${action.id} не удалось (${retry}/${MAX_RETRIES}), повторим позже:`, err.message);
                    await App.db.sync._updatePendingAction(action, retry, err.message);
                }
            }
            await new Promise(r => setTimeout(r, 300));
        }
        await App.store.loadFromIndexedDB();
        if (typeof App.renderAll === 'function') App.renderAll();
        const pendingRemaining = await App.db.getAll('pending_actions');
        if (typeof App.setSyncStatus === 'function') {
            App.setSyncStatus(pendingRemaining.length === 0 ? 'synced' : 'pending');
        }
    } catch (outerErr) {
        console.error('[Sync] Критическая ошибка:', outerErr);
        if (typeof App.setSyncStatus === 'function') App.setSyncStatus('error');
    } finally {
        App.db.sync._isRunning = false;
        clearTimeout(App.db.sync._retryTimeout);
        App.db.sync._retryTimeout = setTimeout(() => App.db.sync.processSyncQueue(), 30000);
    }
};

App.db.sync.forceSync = async function() {
    await App.db.sync.processSyncQueue();
};