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
        console.error(`[Sync] Действие ${action.id} окончательно провалилось после ${MAX_RETRIES} попыток:`, errorMessage);
    } else {
        await App.db.put('pending_actions', action);
    }
};

App.db.sync._executeAction = async function(action) {
    const { type, entityType, entityId, data } = action;
    console.log(`[Sync] Выполнение действия ${action.id}, тип=${type}, сущность=${entityType}, данные:`, data);
    
    // Ожидание сессии
    let session = null;
    for (let i = 0; i < 20; i++) {
        const { data: { session: s } } = await App.supabase.auth.getSession();
        if (s) {
            session = s;
            break;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    if (!session) throw new Error('Нет активной сессии после ожидания');
    
    switch (entityType) {
        case 'operation':
        case 'fuel':
        case 'tire':
        case 'part':
        case 'history':
        case 'mileage': {
            const map = {
                'operation': () => App.supa.saveOperation(data),
                'fuel': () => App.supa.saveFuelRecord(data),
                'tire': () => App.supa.saveTireRecord(data),
                'part': () => App.supa.savePart(data),
                'history': () => App.supa.saveHistoryRecord(data),
                'mileage': () => App.supa.addMileageRecord(data.date, data.mileage, data.motohours, data.car_id)
            };
            const supabaseMethodCall = map[entityType];
            if (!supabaseMethodCall) throw new Error(`No method for ${entityType}`);
            const result = await supabaseMethodCall();
            if (result.error) throw result.error;
            if (result.data && result.data[0] && result.data[0].id !== entityId) {
                await App.db.sync._updateLocalId(entityType, entityId, result.data[0]);
            }
            return { success: true };
        }
        case 'car_document': {
            const { data: docData, error: docError } = await App.supabase
                .from('car_documents')
                .upsert(data, { onConflict: 'id' })
                .select()
                .single();
            if (docError) throw docError;
            if (docData.id !== entityId) {
                await App.db.sync._updateLocalId(entityType, entityId, docData);
            }
            return { success: true };
        }
        case 'car_state_settings':
        case 'car_settings': {
            // Очищаем данные от возможных объектов
            const cleanedData = { ...data };
            if (cleanedData.plateNumber && typeof cleanedData.plateNumber !== 'string') cleanedData.plateNumber = String(cleanedData.plateNumber);
            if (cleanedData.vin && typeof cleanedData.vin !== 'string') cleanedData.vin = String(cleanedData.vin);
            // Сохраняем в Supabase
            await App.supa.saveVehicleState({
                currentMileage: cleanedData.currentMileage,
                currentMotohours: cleanedData.currentMotohours,
                avgDailyMileage: cleanedData.avgDailyMileage,
                avgDailyMotohours: cleanedData.avgDailyMotohours,
                carBrand: cleanedData.carBrand,
                carModel: cleanedData.carModel,
                carYear: cleanedData.carYear,
                plateNumber: cleanedData.plateNumber,
                vin: cleanedData.vin,
                baseMileage: cleanedData.baseMileage,
                baseMotohours: cleanedData.baseMotohours,
                purchaseDate: cleanedData.purchaseDate,
                purchaseCost: cleanedData.purchaseCost
            });
            await App.supa.saveUserSettings({
                telegramToken: cleanedData.telegramToken,
                telegramChatId: cleanedData.telegramChatId,
                notificationMethod: cleanedData.notificationMethod,
                reminderDays: cleanedData.reminderDays
            });
            // Обновляем локальные настройки
            Object.assign(App.store.settings, cleanedData);
            // Дополнительно перезагружаем настройки из БД (на случай, если сервер изменил значения)
            if (typeof App.storage.loadSettingsForCar === 'function') {
                await App.storage.loadSettingsForCar(App.store.activeCarId);
            }
            return { success: true };
        }
        case 'car': {
            if (type === 'save') {
                const { data: carData, error: carError } = await App.supabase
                    .from('cars')
                    .upsert(data, { onConflict: 'id' })
                    .select()
                    .single();
                if (carError) throw carError;
                if (carData.id !== entityId) {
                    await App.db.sync._updateLocalId(entityType, entityId, carData);
                } else {
                    const idx = App.store.cars.findIndex(c => c.id == carData.id);
                    if (idx !== -1) App.store.cars[idx] = carData;
                    else App.store.cars.push(carData);
                    await App.db.put('cars', carData);
                }
            } else if (type === 'delete') {
                // Удаляем на сервере (игнорируем 404)
                const { error } = await App.supabase.from('cars').delete().eq('id', entityId);
                if (error && error.status !== 404) throw error;
                // Удаляем локально
                await App.db.delete('cars', entityId);
                const idx = App.store.cars.findIndex(c => c.id == entityId);
                if (idx !== -1) App.store.cars.splice(idx, 1);
            }
            return { success: true };
        }
        case 'delete':
            return await App.db.sync._executeDelete(action);
        default:
            throw new Error(`Unknown entityType: ${entityType}`);
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
    
    // ВСЕГДА пытаемся удалить на сервере, даже если записи нет (ошибка 404 не фатальна)
    try {
        const { error } = await App.supabase.from(tableName).delete().eq('id', entityId);
        if (error && error.status !== 404) throw error;
    } catch (err) {
        console.warn(`[Sync] Ошибка при удалении на сервере ${entityType} ${entityId}:`, err);
        // Не прерываем синхронизацию, пробуем удалить локально
    }
    
    // Удаляем локально в любом случае
    await App.db.delete(tableName, entityId);
    const storeKey = {
        'operations': 'operations',
        'fuel_log': 'fuelLog',
        'tires': 'tireLog',
        'parts': 'parts',
        'history': 'serviceRecords'
    }[tableName];
    if (storeKey && App.store[storeKey]) {
        App.store[storeKey] = App.store[storeKey].filter(i => i.id != entityId);
    }
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
    // Удаляем старую запись (если существует)
    const idx = storeArray.findIndex(i => i.id == oldId);
    if (idx !== -1) {
        storeArray.splice(idx, 1);
        await App.db.delete(storeName, oldId);
    }
    // Добавляем новую запись
    storeArray.push(serverRecord);
    await App.db.put(storeName, serverRecord);
};

App.db.sync._resolveConflict = async function(action) {
    const { entityType, entityId } = action;
    let tableName;
    try {
        switch (entityType) {
            case 'operation': tableName = 'operations'; break;
            case 'fuel': tableName = 'fuel_log'; break;
            case 'tire': tableName = 'tires'; break;
            case 'part': tableName = 'parts'; break;
            case 'history': tableName = 'history'; break;
            case 'mileage': tableName = 'mileage_log'; break;
            default: return;
        }
        let session = null;
        for (let i = 0; i < 20; i++) {
            const { data: { session: s } } = await App.supabase.auth.getSession();
            if (s) {
                session = s;
                break;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        if (!session) throw new Error('Нет активной сессии');
        
        const { data, error } = await App.supabase.from(tableName).select('*').eq('id', entityId).single();
        if (error && error.status === 404) {
            // На сервере нет — удаляем локально
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
        if (error) throw error;
        if (data) {
            await App.db.sync._updateLocalFromServer(entityType, data);
        }
    } catch (err) {
        console.error(`[Sync] Не удалось загрузить серверную версию:`, err);
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
    if (idx !== -1) {
        storeArray[idx] = serverData;
    } else {
        storeArray.push(serverData);
    }
    await App.db.put(storeName, serverData);
};

App.db.sync.processSyncQueue = async function() {
    if (!App.db._db) {
        console.log('[Sync] База данных не инициализирована, повтор через 1с');
        setTimeout(() => App.db.sync.processSyncQueue(), 1000);
        return;
    }
    if (!navigator.onLine) {
        console.log('[Sync] Нет сети, синхронизация отложена');
        return;
    }
    if (App.db.sync._isRunning) {
        console.log('[Sync] Синхронизация уже выполняется');
        return;
    }
    App.db.sync._isRunning = true;
    try {
        let pending = await App.db.getAll('pending_actions');
        if (!pending.length) {
            console.log('[Sync] Нет отложенных действий');
            return;
        }
        console.log(`[Sync] Начинаем синхронизацию ${pending.length} действий`);
        for (const action of pending) {
            try {
                await App.db.sync._executeAction(action);
                await App.db.delete('pending_actions', action.id);
                // Обновляем локальную копию pendingActions
                const idx = App.store.pendingActions.findIndex(a => a.id === action.id);
                if (idx !== -1) App.store.pendingActions.splice(idx, 1);
                
                // Принудительно перезагружаем store (включая pendingActions) из IndexedDB
                await App.store.loadFromIndexedDB();
                
                // Полная перерисовка UI
                if (typeof App.renderAll === 'function') App.renderAll();
                if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
                if (typeof App.ui.pages.renderFuelTab === 'function') App.ui.pages.renderFuelTab();
                if (typeof App.ui.pages.renderPartsTab === 'function') App.ui.pages.renderPartsTab();
                if (typeof App.ui.pages.renderTiresTab === 'function') App.ui.pages.renderTiresTab();
                if (typeof App.ui.pages.renderHistoryCards === 'function') App.ui.pages.renderHistoryCards();
                if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
                if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                if (typeof App.ui.pages.updateCarSelectorOnCarTab === 'function') App.ui.pages.updateCarSelectorOnCarTab();
                if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
                
                console.log(`[Sync] Действие ${action.id} удалено из очереди, UI обновлён`);
            } catch (err) {
                console.error(`[Sync] Ошибка действия ${action.id}:`, err);
                if (err.status === 409 || (err.message && err.message.includes('conflict'))) {
                    console.log('[Sync] Конфликт, разрешаем...');
                    await App.db.sync._resolveConflict(action);
                    await App.db.delete('pending_actions', action.id);
                    const idx = App.store.pendingActions.findIndex(a => a.id === action.id);
                    if (idx !== -1) App.store.pendingActions.splice(idx, 1);
                    await App.store.loadFromIndexedDB();
                    if (typeof App.renderAll === 'function') App.renderAll();
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
