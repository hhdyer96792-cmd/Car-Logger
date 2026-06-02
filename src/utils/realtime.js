// src/utils/realtime.js
window.App = window.App || {};
App.realtime = App.realtime || {};

App.realtime.channels = [];
App.realtime._currentCarId = null;

App.realtime._subscribeWithRetry = async function(carId) {
    if (!carId) return;
    const online = await App.network.isReallyOnline();
    if (!online) {
        console.log('[Realtime] Нет реальной сети, подписка отложена');
        return;
    }

    App.realtime.unsubscribeAll();

    const tables = ['operations', 'fuel_log', 'tires', 'parts', 'history', 'settings', 'mileage_log'];
    for (const table of tables) {
        try {
            const channel = App.supabase.channel('realtime-' + table + '-' + carId)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: 'car_id=eq.' + carId
                }, payload => {
                    App.realtime.handleChange(table, payload);
                })
                .subscribe(status => {
                    if (status === 'SUBSCRIBED') console.log(`[Realtime] Подписан на ${table}`);
                    else if (status === 'CHANNEL_ERROR') console.warn(`[Realtime] Ошибка подписки на ${table}`);
                });
            App.realtime.channels.push(channel);
        } catch (err) {
            console.error(`[Realtime] Не удалось создать канал ${table}:`, err);
        }
    }
};

App.realtime.subscribeToCar = function(carId) {
    App.realtime._currentCarId = carId;
    App.realtime._subscribeWithRetry(carId);
};

App.realtime.resubscribe = function() {
    if (App.realtime._currentCarId) {
        App.realtime._subscribeWithRetry(App.realtime._currentCarId);
    }
};

App.realtime.unsubscribeAll = function() {
    App.realtime.channels.forEach(ch => App.supabase.removeChannel(ch));
    App.realtime.channels = [];
};

App.realtime.handleChange = function(table, payload) {
    var eventType = payload.eventType;
    var newData = payload.new;
    var oldData = payload.old;
    
    if (table === 'settings') {
 if (eventType === 'INSERT' || eventType === 'UPDATE') {
 // Обновляем объект настроек
 App.store.settings = { ...App.store.settings, ...newData };
 // Перерисовка UI
 if (typeof App.ui.pages.renderDashboard === 'function') {
 App.ui.pages.renderDashboard();
 }
 }
 return; // Выходим, так как settings не массив
 }


    var storeKey = table;
    if (table === 'fuel_log') storeKey = 'fuelLog';
    else if (table === 'mileage_log') storeKey = 'mileageHistory';
    else if (table === 'history') storeKey = 'serviceRecords';
    else if (table === 'tires') storeKey = 'tireLog';
    else if (table === 'operations') storeKey = 'operations';
    else if (table === 'parts') storeKey = 'parts';
    else if (table === 'settings') storeKey = 'settings';

    if (eventType === 'INSERT') {
        var existingIdx = App.store[storeKey].findIndex(function(item) { return item.id === newData.id; });
        if (existingIdx === -1) {
            App.store[storeKey].push(newData);
        } else {
            App.store[storeKey][existingIdx] = newData;
        }
    } else if (eventType === 'UPDATE') {
        var idx = App.store[storeKey].findIndex(function(item) { return item.id === newData.id; });
        if (idx !== -1) App.store[storeKey][idx] = newData;
    } else if (eventType === 'DELETE') {
        App.store[storeKey] = App.store[storeKey].filter(function(item) { return item.id !== oldData.id; });
    }

    // Перерисовываем соответствующие UI-компоненты
    switch (table) {
        case 'operations':
            if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
            break;
        case 'fuel_log':
            if (typeof App.ui.pages.renderFuelTable === 'function') App.ui.pages.renderFuelTable();
            break;
        case 'tires':
            if (typeof App.ui.pages.renderTiresTable === 'function') App.ui.pages.renderTiresTable();
            break;
        case 'parts':
            if (typeof App.ui.pages.renderPartsTable === 'function') App.ui.pages.renderPartsTable();
            break;
        case 'history':
            if (typeof App.ui.pages.renderHistoryCards === 'function') App.ui.pages.renderHistoryCards();
            break;
        case 'settings':
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
            break;
        case 'mileage_log':
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
            break;
    }
};