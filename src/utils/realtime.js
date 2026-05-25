// src/utils/realtime.js
window.App = window.App || {};
App.realtime = App.realtime || {};

App.realtime.channels = [];

App.realtime.subscribeToCar = function(carId) {
    App.realtime.unsubscribeAll();
    if (!carId) return;

    var tables = ['operations', 'fuel_log', 'tires', 'parts', 'history', 'settings', 'mileage_log'];

    tables.forEach(function(table) {
        var channel = App.supabase.channel('realtime-' + table + '-' + carId)
            .on('postgres_changes', { event: '*', schema: 'public', table: table, filter: 'car_id=eq.' + carId }, function(payload) {
                App.realtime.handleChange(table, payload);
            })
            .subscribe();

        App.realtime.channels.push(channel);
    });
};

App.realtime.unsubscribeAll = function() {
    App.realtime.channels.forEach(function(channel) {
        App.supabase.removeChannel(channel);
    });
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