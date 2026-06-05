// src/api/storage.js (фрагмент – функция loadAllData)
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

    // Функция загрузки таблицы с проверкой доступности сервера
    const loadTable = async (name, loader) => {
        // Если сервер недоступен – не пытаемся
        const online = await App.network.isReallyOnline();
        if (!online) {
            console.warn(`[Storage] Сервер недоступен, пропускаем загрузку ${name}`);
            return null;
        }
        try {
            const data = await loader();
            return data || [];
        } catch (err) {
            console.warn(`[Storage] Не удалось загрузить ${name}:`, err.message);
            return null;   // null = не обновляем
        }
    };

    const updates = {};
    for (const [key, loader] of [
        ['operations', App.supa.loadOperations],
        ['fuel_log', App.supa.loadFuelLog],
        ['tires', App.supa.loadTires],
        ['parts', App.supa.loadParts],
        ['history', App.supa.loadHistory],
        ['mileage', App.supa.loadMileageHistory],
        ['settings', App.supa.loadSettings]
    ]) {
        updates[key] = await loadTable(key, loader);
    }

    // 3. Аккуратно обновляем Store и IndexedDB только успешными данными
    if (updates.operations) {
        App.store.operations = updates.operations.map(op => ({ ...op, car_id: carId }));
        await App.db.putMany('operations', App.store.operations);
    }
    if (updates.fuel_log) {
        App.store.fuelLog = updates.fuel_log.map(f => ({ ...f, car_id: carId }));
        await App.db.putMany('fuel_log', App.store.fuelLog);
    }
    if (updates.tires) {
        App.store.tireLog = updates.tires.map(t => ({ ...t, car_id: carId }));
        await App.db.putMany('tires', App.store.tireLog);
    }
    if (updates.parts) {
        App.store.parts = updates.parts.map(p => ({ ...p, car_id: carId }));
        await App.db.putMany('parts', App.store.parts);
    }
    if (updates.history) {
        App.store.serviceRecords = updates.history.map(h => ({ ...h, car_id: carId }));
        await App.db.putMany('service_records', App.store.serviceRecords);
    }
    if (updates.mileage) {
        App.store.mileageHistory = updates.mileage.map(m => ({ ...m, car_id: carId }));
        await App.db.putMany('mileage_log', App.store.mileageHistory);
    }
    if (updates.settings) {
        Object.assign(App.store.settings, updates.settings);
        await App.db.put('car_settings', { ...App.store.settings, car_id: carId });
    }

    if (typeof App.renderAll === 'function') App.renderAll();
    App.setSyncStatus('synced');
};