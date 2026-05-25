// src/db/sync.js
window.App = window.App || {};
App.db = App.db || {};
App.db.sync = App.db.sync || {};

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const MAX_DELAY = 300000;

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
    const { type, entityType, entityId, data, id: actionId } = action;
    let supabaseMethod, tableName;
    switch (entityType) {
        case 'operation':
            tableName = 'operations';
            supabaseMethod = App.supa.saveOperation;
            break;
        case 'fuel':
            tableName = 'fuel_log';
            supabaseMethod = App.supa.saveFuelRecord;
            break;
        case 'tire':
            tableName = 'tires';
            supabaseMethod = App.supa.saveTireRecord;
            break;
        case 'part':
            tableName = 'parts';
            supabaseMethod = App.supa.savePart;
            break;
        case 'history':
            tableName = 'history';
            supabaseMethod = App.supa.saveHistoryRecord;
            break;
        case 'mileage':
            tableName = 'mileage_log';
            // Используем добавленный метод App.supa.addMileageRecord
            supabaseMethod = (record) => App.supa.addMileageRecord(record.date, record.mileage, record.motohours);
            break;
        case 'delete':
            return await App.db.sync._executeDelete(action);
        default:
            throw new Error(`Unknown entityType: ${entityType}`);
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
    let deleteMethod;
    switch (entityType) {
        case 'operation': deleteMethod = () => App.storage.deleteOperation(entityId); break;
        case 'fuel': deleteMethod = () => App.storage.deleteFuelRecord(entityId); break;
        case 'tire': deleteMethod = () => App.storage.deleteTireRecord(entityId); break;
        case 'part': deleteMethod = () => App.storage.deletePart(entityId); break;
        case 'history': deleteMethod = () => App.storage.deleteHistoryRecord(entityId); break;
        default: throw new Error(`Unknown entityType for delete: ${entityType}`);
    }
    const result = await deleteMethod();
    if (result && result.error) throw result.error;
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
        case 'mileage':
        storeArray = App.store.mileageHistory;
        storeName = 'mileage_log';
        break;
        default: return;
    }
    const item = storeArray.find(i => i.id == oldId);
    if (item) {
        item.id = newId;
        await App.db.put(storeName, item);
    }
};

// ========== РАСШИРЕННЫЙ _resolveConflict ==========
App.db.sync._resolveConflict = async function(action) {
    const { entityType, entityId } = action;
    let serverData;
    try {
        switch (entityType) {
            case 'operation':
                const { data: opData } = await App.supabase.from('operations').select('*').eq('id', entityId).single();
                serverData = opData;
                break;
            case 'fuel':
                const { data: fuelData } = await App.supabase.from('fuel_log').select('*').eq('id', entityId).single();
                serverData = fuelData;
                break;
            case 'tire':
                const { data: tireData } = await App.supabase.from('tires').select('*').eq('id', entityId).single();
                serverData = tireData;
                break;
            case 'part':
                const { data: partData } = await App.supabase.from('parts').select('*').eq('id', entityId).single();
                serverData = partData;
                break;
            case 'history':
                const { data: histData } = await App.supabase.from('history').select('*').eq('id', entityId).single();
                serverData = histData;
                break;
                case 'mileage':
        const { data: mileageData } = await App.supabase
            .from('mileage_log')
            .select('*')
            .eq('id', entityId)
            .single();
        serverData = mileageData;
        break;
            default:
                return;
        }
        if (serverData) {
            await App.db.sync._updateLocalFromServer(entityType, serverData);
        }
    } catch (err) {
        console.error(`[Sync] Не удалось загрузить серверную версию для разрешения конфликта:`, err);
    }
};

// ========== РАСШИРЕННЫЙ _updateLocalFromServer ==========
App.db.sync._updateLocalFromServer = async function(entityType, serverData) {
    let storeArray, storeName;
    switch (entityType) {
        case 'operation':
            storeArray = App.store.operations;
            storeName = 'operations';
            break;
        case 'fuel':
            storeArray = App.store.fuelLog;
            storeName = 'fuel_log';
            break;
        case 'tire':
            storeArray = App.store.tireLog;
            storeName = 'tires';
            break;
        case 'part':
            storeArray = App.store.parts;
            storeName = 'parts';
            break;
        case 'history':
            storeArray = App.store.serviceRecords;
            storeName = 'service_records';
            break;
        default:
            return;
    }
    const idx = storeArray.findIndex(i => i.id == serverData.id);
    if (idx !== -1) {
        storeArray[idx] = serverData;
    } else {
        storeArray.push(serverData);
    }
    await App.db.put(storeName, serverData);
};

// Основная функция синхронизации
App.db.sync.processSyncQueue = async function() {
    if (!navigator.onLine) {
        console.log('[Sync] Нет сети, синхронизация отложена');
        return;
    }
    if (App.db.sync._isRunning) return;
    App.db.sync._isRunning = true;
    try {
        const pending = await App.db.getAll('pending_actions');
        if (!pending.length) return;
        console.log(`[Sync] Начинаем синхронизацию ${pending.length} действий`);
        for (const action of pending) {
            try {
                await App.db.sync._executeAction(action);
                await App.db.delete('pending_actions', action.id);
                const idx = App.store.pendingActions.findIndex(a => a.id === action.id);
                if (idx !== -1) App.store.pendingActions.splice(idx, 1);
            } catch (err) {
                console.error(`[Sync] Ошибка действия ${action.id}:`, err);
                if (err.status === 409 || (err.message && err.message.includes('conflict'))) {
                    await App.db.sync._resolveConflict(action);
                    await App.db.delete('pending_actions', action.id);
                    const idx = App.store.pendingActions.findIndex(a => a.id === action.id);
                    if (idx !== -1) App.store.pendingActions.splice(idx, 1);
                } else {
                    const newRetryCount = (action.retryCount || 0) + 1;
                    await App.db.sync._updatePendingAction(action, newRetryCount, err.message);
                    if (newRetryCount < MAX_RETRIES) {
                        const delay = App.db.sync._getDelay(newRetryCount);
                        setTimeout(() => { if (navigator.onLine) App.db.sync.processSyncQueue(); }, delay);
                    }
                }
            }
        }
        if (typeof App.renderAll === 'function') App.renderAll();
        if (typeof App.toast === 'function') App.toast('Данные синхронизированы', 'success');
    } finally {
        App.db.sync._isRunning = false;
    }
};

App.db.sync.forceSync = function() {
    if (navigator.onLine) App.db.sync.processSyncQueue();
    else App.toast('Нет сети. Синхронизация отложена.', 'warning');
};