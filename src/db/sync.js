// src/db/sync.js
window.App = window.App || {};
App.db = App.db || {};
App.db.sync = App.db.sync || {};

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

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
    
    // Проверяем сессию
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
            const cleanedData = { ...data };
            if (cleanedData.plateNumber !== undefined && cleanedData.plateNumber !== null) {
                cleanedData.plateNumber = (typeof cleanedData.plateNumber === 'object') ? '' : String(cleanedData.plateNumber);
            } else {
                cleanedData.plateNumber = '';
            }
            if (cleanedData.vin !== undefined && cleanedData.vin !== null) {
                cleanedData.vin = (typeof cleanedData.vin === 'object') ? '' : String(cleanedData.vin);
            } else {
                cleanedData.vin = '';
            }
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
            await App.db.put('car_settings', { ...App.store.settings, car_id: App.store.activeCarId });
            // Принудительно обновляем UI вкладки автомобиля
            if (typeof App.ui.pages.loadCarDetails === 'function') {
                App.ui.pages.loadCarDetails(App.store.activeCarId);
            }
            if (typeof App.ui.pages.renderBasicParams === 'function') {
                App.ui.pages.renderBasicParams();
            }
            if (typeof App.ui.pages.renderCarTab === 'function') {
                App.ui.pages.renderCarTab();
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
                const { error } = await App.supabase.from('cars').delete().eq('id', entityId);
                if (error && error.status !== 404) throw error;
                await App.db.delete('cars', entityId);
                await App.db.delete('car_settings', entityId);
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
    const { entityType, entityId, data } = action;
    let tableName;
    switch (entityType) {
        case 'operation': tableName = 'operations'; break;
        case 'fuel': tableName = 'fuel_log'; break;
        case 'tire': tableName = 'tires'; break;
        case 'part': tableName = 'parts'; break;
        case 'history': tableName = 'history'; break;
        default: throw new Error(`Unknown entityType for delete: ${entityType}`);
    }
    
    // Используем car_id из действия, если есть, иначе текущий активный автомобиль
    const carId = data.car_id || App.store.activeCarId;
    console.log(`[Sync] Удаление на сервере: ${tableName} id=${entityId}, car_id=${carId}`);
    
    let lastError = null;
    let deleted = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            let query = App.supabase.from(tableName).delete().eq('id', entityId);
            if (carId && tableName !== 'cars') {
                query = query.eq('car_id', carId);
            }
            const { error } = await query;
            if (error) {
                if (error.status === 404) {
                    console.log(`[Sync] Запись ${entityId} не найдена на сервере, считаем удалённой`);
                    deleted = true;
                    break;
                }
                throw error;
            }
            deleted = true;
            console.log(`[Sync] Удаление на сервере успешно для ${entityId}`);
            break;
        } catch (err) {
            lastError = err;
            console.error(`[Sync] Попытка ${attempt} удаления на сервере не удалась:`, err);
            if (attempt === MAX_RETRIES) {
                throw new Error(`Не удалось удалить запись ${entityId} на сервере после ${MAX_RETRIES} попыток: ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    
    if (!deleted) {
        console.warn(`[Sync] Запись ${entityId} не найдена на сервере, удаляем только локально`);
    }
    
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
    const idx = storeArray.findIndex(i => i.id == oldId);
    if (idx !== -1) {
        storeArray.splice(idx, 1);
        await App.db.delete(storeName, oldId);
    }
    storeArray.push(serverRecord);
    await App.db.put(storeName, serverRecord);
};

App.db.sync.processSyncQueue = async function() {
    if (!App.db._db) {
        console.log('[Sync] База не инициализирована, повтор через 1с');
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
        const pending = await App.db.getAll('pending_actions');
        if (!pending.length) {
            console.log('[Sync] Нет отложенных действий');
            return;
        }
        console.log(`[Sync] Начинаем синхронизацию ${pending.length} действий`);
        for (const action of pending) {
            try {
                await App.db.sync._executeAction(action);
                await App.db.delete('pending_actions', action.id);
                await App.store.loadFromIndexedDB();
                if (typeof App.events !== 'undefined' && App.events.currentActiveTab) {
                    App.events.switchToTab(App.events.currentActiveTab);
                }
                if (typeof App.renderAll === 'function') App.renderAll();
                console.log(`[Sync] Действие ${action.id} выполнено, UI обновлён`);
            } catch (err) {
                console.error(`[Sync] Ошибка действия ${action.id}:`, err);
                const newRetryCount = (action.retryCount || 0) + 1;
                await App.db.sync._updatePendingAction(action, newRetryCount, err.message);
                if (newRetryCount < MAX_RETRIES) {
                    const delay = App.db.sync._getDelay(newRetryCount);
                    setTimeout(() => { if (navigator.onLine) App.db.sync.processSyncQueue(); }, delay);
                }
            }
        }
        if (typeof App.renderAll === 'function') App.renderAll();
        App.toast('Данные синхронизированы', 'success');
    } finally {
        App.db.sync._isRunning = false;
    }
};

App.db.sync.forceSync = function() {
    if (navigator.onLine) App.db.sync.processSyncQueue();
    else App.toast('Нет сети. Синхронизация отложена.', 'warning');
};