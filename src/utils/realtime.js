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
                .on('postgres_changes', { event: '*', schema: 'public', table, filter: 'car_id=eq.' + carId }, payload => {
                    App.realtime.handleChange(table, payload);
                })
                .subscribe();
            App.realtime.channels.push(channel);
        } catch (err) {
            console.error(`[Realtime] Ошибка подписки на ${table}:`, err);
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

// handleChange (вставьте текущую реализацию)
App.realtime.handleChange = function(table, payload) {
    // существующий код без изменений
};