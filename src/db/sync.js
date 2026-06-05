// src/db/sync.js
window.App = window.App || {};
App.db = App.db || {};
App.db.sync = App.db.sync || {};

const MAX_RETRIES = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const ACTION_TIMEOUT = 10000;   // 10 секунд на действие

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
        console.error(`[Sync] Действие ${action.id} временно провалилось (${retryCount} попыток), оставлено в очереди:`, errorMessage);
        await App.db.put('error_log', {
            id: crypto.randomUUID(),
            type: 'sync_failed_retry_later',
            action: action,
            timestamp: Date.now(),
            message: errorMessage
        });
        if (typeof App.toast === 'function') {
            App.toast('Некоторые действия не синхронизированы — попробуйте позже', 'warning');
        }
    }

    await App.db.put('pending_actions', action);
};

App.db.sync._executeAction = async function(action) {
    const { type, entityType, entityId, data } = action;
    console.log(`[Sync] Выполнение действия ${action.id}, тип=${type}, сущность=${entityType}`);

    // Быстрая проверка доступности сервера
    const online = await App.network.isReallyOnline();
    if (!online) {
        console.warn(`[Sync] Сервер недоступен, действие ${action.id} отложено`);
        throw new Error('Сервер недоступен');
    }

    if (type === 'delete' && entityType !== 'car') {
        return await App.db.sync._executeDelete(action);
    }

    // Основная логика с защитным таймаутом
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Действие ${action.id} превысило таймаут`)), ACTION_TIMEOUT);
    });

    try {
        const result = await Promise.race([
            (async () => {
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
                        const res = await supabaseMethodCall();
                        if (res.error) throw res.error;
                        if (res.data && res.data[0] && res.data[0].id !== entityId) {
                            await App.db.sync._updateLocalId(entityType, entityId, res.data[0]);
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
                        await App.supa.saveVehicleState({ ...cleanedData });
                        await App.supa.saveUserSettings({ ...cleanedData });
                        Object.assign(App.store.settings, cleanedData);
                        await App.db.put('car_settings', { ...App.store.settings, car_id: App.store.activeCarId });
                        if (typeof App.ui.pages.loadCarDetails === 'function') App.ui.pages.loadCarDetails(App.store.activeCarId);
                        if (typeof App.ui.pages.renderBasicParams === 'function') App.ui.pages.renderBasicParams();
                        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
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
                    default:
                        throw new Error(`Unknown entityType: ${entityType}`);
                }
            })(),
            timeoutPromise
        ]);
        return result;
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timer);
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

    const carId = data.car_id || App.store.activeCarId;
    console.log(`[Sync] Удаление на сервере: ${tableName} id=${entityId}, car_id=${carId}`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const { data: deleted, error } = await App.supabase
                .from(tableName)
                .delete()
                .eq('id', entityId)
                .eq('car_id', carId)
                .select('id');

            if (error) {
                if (error.status === 404) {
                    console.log(`[Sync] Запись ${entityId} не найдена на сервере, считаем удалённой`);
                    break;
                }
                throw error;
            }

            console.log(`[Sync] Удаление на сервере успешно для ${entityId}, удалено записей: ${deleted?.length || 0}`);
            break;
        } catch (err) {
            console.error(`[Sync] Попытка ${attempt} удаления на сервере не удалась:`, err.message);
            if (attempt === MAX_RETRIES) {
                console.error(`[Sync] Удаление ${entityId} не удалось после ${MAX_RETRIES} попыток, оставляем в очереди`);
                action.retryCount = MAX_RETRIES;
                action.lastError = err.message;
                action.lastAttempt = Date.now();
                await App.db.put('pending_actions', action);
                throw new Error(`Удаление отложено, будет повторено при следующей синхронизации`);
            }
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }

    // Локальная очистка
    try { await App.db.delete(tableName, entityId); } catch (e) { /* ignore */ }
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
    console.log('[Sync] Старт');

    try {
        // Даём IndexedDB завершить транзакции
        await new Promise(r => setTimeout(r, 100));

        let pending = await App.db.getAll('pending_actions');
        // Защита от ложного пустого чтения
        if (!pending.length && App.store.pendingActions?.length) {
            console.warn('[Sync] Очередь в БД пуста, но store.pendingActions не пуст, пробуем снова...');
            await new Promise(r => setTimeout(r, 500));
            pending = await App.db.getAll('pending_actions');
        }

        if (!pending.length) {
            console.log('[Sync] Действий нет');
            return;
        }

        console.log(`[Sync] Действий: ${pending.length}`);
        for (let i = 0; i < pending.length; i++) {
            const action = pending[i];
            console.log(`[Sync] ${i+1}/${pending.length}: ${action.id}`);
            try {
                await App.db.sync._executeAction(action);
                await App.db.delete('pending_actions', action.id);
                console.log(`[Sync] Действие ${action.id} выполнено и удалено из очереди`);
            } catch (err) {
                const retry = (action.retryCount || 0) + 1;
                await App.db.sync._updatePendingAction(action, retry, err.message);
            }
            await new Promise(r => setTimeout(r, 200));
        }

        await App.store.loadFromIndexedDB();
        if (typeof App.renderAll === 'function') App.renderAll();
        App.toast('Синхронизация завершена', 'success');
    } catch (outerErr) {
        console.error('[Sync] Критическая ошибка:', outerErr);
    } finally {
        App.db.sync._isRunning = false;
        clearTimeout(App.db.sync._retryTimeout);
        App.db.sync._retryTimeout = setTimeout(() => App.db.sync.processSyncQueue(), 60000);
    }
};

App.db.sync.forceSync = async function() {
    await App.db.sync.processSyncQueue();
};