// src/db/sync.js
window.App = window.App || {};
App.db = App.db || {};
App.db.sync = App.db.sync || {};

const SYNC_MAX_RETRIES = 5;
const SYNC_BASE_DELAY = 1000;
const SYNC_MAX_DELAY = 300000;

App.db.sync._getDelay = function(retryCount) {
    const delay = Math.min(SYNC_BASE_DELAY * Math.pow(2, retryCount), SYNC_MAX_DELAY);
    const jitter = delay * 0.1 * (Math.random() - 0.5);
    return Math.max(0, delay + jitter);
};

App.db.sync._updatePendingAction = async function(action, retryCount, errorMessage) {
    action.retryCount = retryCount;
    action.lastError = errorMessage;
    action.lastAttempt = Date.now();
    if (retryCount >= SYNC_MAX_RETRIES) {
        await App.db.put('error_log', {
            id: crypto.randomUUID(),
            type: 'sync_failed',
            action: action,
            timestamp: Date.now(),
            message: errorMessage
        });
        await App.db.delete('pending_actions', action.id);
    } else {
        await App.db.put('pending_actions', action);
    }
};

App.db.sync._executeAction = async function(action) {
    const { type, entityType, entityId, data } = action;
    let supabaseMethod;
    switch (entityType) {
        case 'operation': supabaseMethod = App.supa.saveOperation; break;
        case 'fuel': supabaseMethod = App.supa.saveFuelRecord; break;
        case 'tire': supabaseMethod = App.supa.saveTireRecord; break;
        case 'part': supabaseMethod = App.supa.savePart; break;
        case 'history': supabaseMethod = App.supa.saveHistoryRecord; break;
        case 'mileage': supabaseMethod = (rec) => App.supa.addMileageRecord(rec.date, rec.mileage, rec.motohours); break;
        case 'delete': return await App.db.sync._executeDelete(action);
        default: throw new Error(`Unknown entityType: ${entityType}`);
    }
    if (type === 'save' || type === 'update') {
        const result = await supabaseMethod(data);
        if (result.error) throw result.error;
        if (result.data && result.data[0] && result.data[0].id !== entityId) {
            await App.db.sync._updateLocalId(entityType, entityId, result.data[0].id);
        }
        return { success: true };
    }
};

App.db.sync._executeDelete = async function(action) {
    const { entityType, entityId } = action;
    let tableName;
    switch (entityType) {
        case 'operation': tableName = 'operations'; break;
        case 'fuel': tableName = 'fuel_log'; break;
        case 'tire': tableName = 'tires'; break;
        case 'part': tableName = 'parts'; break;
        case 'history': tableName = 'history'; break;
        default: throw new Error(`Unknown entityType for delete: ${entityType}`);
    }
    const { error } = await App.supabase.from(tableName).delete().eq('id', entityId);
    if (error) throw error;
    await App.db.delete(tableName, entityId);
    let storeKey;
    switch (entityType) {
        case 'operation': storeKey = 'operations'; break;
        case 'fuel': storeKey = 'fuelLog'; break;
        case 'tire': storeKey = 'tireLog'; break;
        case 'part': storeKey = 'parts'; break;
        case 'history': storeKey = 'serviceRecords'; break;
    }
    if (storeKey && App.store[storeKey]) {
        App.store[storeKey] = App.store[storeKey].filter(item => item.id != entityId);
    }
    return { success: true };
};

App.db.sync._updateLocalId = async function(entityType, oldId, newId) {
    let storeArray, storeName;
    switch (entityType) {
        case 'operation': storeArray = App.store.operations; storeName = 'operations'; break;
        case 'fuel': storeArray = App.store.fuelLog; storeName = 'fuel_log'; break;
        case 'tire': storeArray = App.store.tireLog; storeName = 'tires'; break;
        case 'part': storeArray = App.store.parts; storeName = 'parts'; break;
        case 'history': storeArray = App.store.serviceRecords; storeName = 'service_records'; break;
        case 'mileage': storeArray = App.store.mileageHistory; storeName = 'mileage_log'; break;
        default: return;
    }
    const item = storeArray.find(i => i.id == oldId);
    if (item) {
        item.id = newId;
        await App.db.put(storeName, item);
    }
    if (entityType === 'operation') {
        const historyRecords = App.store.serviceRecords.filter(rec => rec.operation_id == oldId);
        for (const rec of historyRecords) {
            rec.operation_id = newId;
            await App.db.put('service_records', rec);
        }
    }
};

App.db.sync._resolveConflict = async function(action) {
    const { entityType, entityId } = action;
    let tableName;
    switch (entityType) {
        case 'operation': tableName = 'operations'; break;
        case 'fuel': tableName = 'fuel_log'; break;
        case 'tire': tableName = 'tires'; break;
        case 'part': tableName = 'parts'; break;
        case 'history': tableName = 'history'; break;
        case 'mileage': tableName = 'mileage_log'; break;
        default: return;
    }
    try {
        const { data, error } = await App.supabase.from(tableName).select('*').eq('id', entityId).single();
        if (error) {
            if (error.status === 404) {
                await App.db.delete(tableName, entityId);
                const storeKey = {
                    'operations': 'operations',
                    'fuel_log': 'fuelLog',
                    'tires': 'tireLog',
                    'parts': 'parts',
                    'history': 'serviceRecords',
                    'mileage_log': 'mileageHistory'
                }[tableName];
                if (storeKey && App.store[storeKey]) {
                    App.store[storeKey] = App.store[storeKey].filter(i => i.id != entityId);
                }
                return;
            }
            throw error;
        }
        await App.db.sync._updateLocalFromServer(entityType, data);
    } catch (err) {
        console.error('[Sync] Не удалось разрешить конфликт:', err);
    }
};

App.db.sync._updateLocalFromServer = async function(entityType, serverData) {
    let storeArray, storeName;
    switch (entityType) {
        case 'operation': storeArray = App.store.operations; storeName = 'operations'; break;
        case 'fuel': storeArray = App.store.fuelLog; storeName = 'fuel_log'; break;
        case 'tire': storeArray = App.store.tireLog; storeName = 'tires'; break;
        case 'part': storeArray = App.store.parts; storeName = 'parts'; break;
        case 'history': storeArray = App.store.serviceRecords; storeName = 'service_records'; break;
        case 'mileage': storeArray = App.store.mileageHistory; storeName = 'mileage_log'; break;
        default: return;
    }
    const idx = storeArray.findIndex(i => i.id == serverData.id);
    if (idx !== -1) storeArray[idx] = serverData;
    else storeArray.push(serverData);
    await App.db.put(storeName, serverData);
};

App.db.sync.processSyncQueue = async function() {
    if (!navigator.onLine) {
        console.log('[Sync] Нет сети, синхронизация отложена');
        return;
    }
    if (App.db.sync._isRunning) return;
    App.db.sync._isRunning = true;
    
    // Индикатор синхронизации
    if (typeof App.setSyncStatus === 'function') {
        App.setSyncStatus('syncing');
    }
    
    let successCount = 0;
    let errorCount = 0;
    let hasPermanentErrors = false;
    
    try {
        const pending = await App.db.getAll('pending_actions');
        if (!pending.length) {
            if (typeof App.setSyncStatus === 'function') {
                App.setSyncStatus('synced');
            }
            return;
        }
        console.log(`[Sync] Начинаем синхронизацию ${pending.length} действий`);
        
        for (const action of pending) {
            try {
                await App.db.sync._executeAction(action);
                await App.db.delete('pending_actions', action.id);
                const idx = App.store.pendingActions.findIndex(a => a.id === action.id);
                if (idx !== -1) App.store.pendingActions.splice(idx, 1);
                successCount++;
            } catch (err) {
                console.error(`[Sync] Ошибка действия ${action.id}:`, err);
                errorCount++;
                const newRetryCount = (action.retryCount || 0) + 1;
                await App.db.sync._updatePendingAction(action, newRetryCount, err.message);
                if (newRetryCount < SYNC_MAX_RETRIES) {
                    hasPermanentErrors = false;
                    const delay = App.db.sync._getDelay(newRetryCount);
                    setTimeout(() => {
                        if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                            App.db.sync.processSyncQueue();
                        }
                    }, delay);
                } else {
                    hasPermanentErrors = true;
                }
            }
        }
        
        // Улучшенный тост с детализацией
        if (typeof App.toast === 'function') {
            if (errorCount === 0 && successCount > 0) {
                App.toast(`Синхронизировано ${successCount} записей`, 'success');
            } else if (errorCount > 0 && successCount > 0) {
                App.toast(`Синхронизировано ${successCount} из ${pending.length} записей. Ошибок: ${errorCount}.`, 'warning');
            } else if (errorCount > 0 && successCount === 0) {
                App.toast(`Не удалось синхронизировать ${errorCount} записей. Повторная попытка через несколько секунд.`, 'error');
            }
        }
        
        if (typeof App.renderAll === 'function') App.renderAll();
        
        // Финальный статус
        if (typeof App.setSyncStatus === 'function') {
            if (errorCount === 0) App.setSyncStatus('synced');
            else if (hasPermanentErrors) App.setSyncStatus('error');
            else App.setSyncStatus('synced'); // временные ошибки, статус всё равно synced, так как будут повторы
        }
        
    } finally {
        App.db.sync._isRunning = false;
    }
};

App.db.sync.forceSync = function() {
    if (navigator.onLine) App.db.sync.processSyncQueue();
    else App.toast('Нет сети. Синхронизация отложена.', 'warning');
};