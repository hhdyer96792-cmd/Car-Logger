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

    // 2. Параллельная загрузка всех таблиц (максимальная скорость)
    const loaders = [
        ['operations', App.supa.loadOperations],
        ['fuel_log', App.supa.loadFuelLog],
        ['tires', App.supa.loadTires],
        ['parts', App.supa.loadParts],
        ['history', App.supa.loadHistory],
        ['mileage', App.supa.loadMileageHistory],
        ['settings', App.supa.loadSettings]
    ];

    const results = await Promise.allSettled(
        loaders.map(([name, loader]) =>
            loader().then(data => ({ name, data })).catch(err => ({ name, data: null, error: err }))
        )
    );

    // Обновляем Store только для успешных загрузок
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.data) {
            const { name, data } = result.value;
            switch (name) {
                case 'operations':
                    App.store.operations = data.map(op => ({ ...op, car_id: carId }));
                    await App.db.putMany('operations', App.store.operations);
                    break;
                case 'fuel_log':
                    App.store.fuelLog = data.map(f => ({ ...f, car_id: carId }));
                    await App.db.putMany('fuel_log', App.store.fuelLog);
                    break;
                case 'tires':
                    App.store.tireLog = data.map(t => ({ ...t, car_id: carId }));
                    await App.db.putMany('tires', App.store.tireLog);
                    break;
                case 'parts':
                    App.store.parts = data.map(p => ({ ...p, car_id: carId }));
                    await App.db.putMany('parts', App.store.parts);
                    break;
                case 'history':
                    App.store.serviceRecords = data.map(h => ({ ...h, car_id: carId }));
                    await App.db.putMany('service_records', App.store.serviceRecords);
                    break;
                case 'mileage':
                    App.store.mileageHistory = data.map(m => ({ ...m, car_id: carId }));
                    await App.db.putMany('mileage_log', App.store.mileageHistory);
                    break;
                case 'settings':
                    Object.assign(App.store.settings, data);
                    await App.db.put('car_settings', { ...App.store.settings, car_id: carId });
                    break;
            }
        }
    }

    if (typeof App.renderAll === 'function') App.renderAll();
    App.setSyncStatus('synced');
};