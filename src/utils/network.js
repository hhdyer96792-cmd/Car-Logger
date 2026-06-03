// Используется ТОЛЬКО в realtime.js
window.App = window.App || {};
App.network = App.network || {};

App.network.isReallyOnline = async function() {
    if (!navigator.onLine) return false;
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
            // Действие полностью выполнено — можно удалить из очереди
            await App.db.delete('pending_actions', action.id);
            console.log(`[Sync] Действие ${action.id} выполнено и удалено из очереди`);
        } catch (err) {
            console.error(`[Sync] Ошибка действия ${action.id}:`, err);
            const newRetryCount = (action.retryCount || 0) + 1;
            await App.db.sync._updatePendingAction(action, newRetryCount, err.message);
            // Даже при ошибке продолжаем обрабатывать остальные действия
        }
    }
    // После обработки всех действий обновляем UI
    await App.store.loadFromIndexedDB();
    if (typeof App.events !== 'undefined' && App.events.currentActiveTab) {
        App.events.switchToTab(App.events.currentActiveTab);
    }
    if (typeof App.renderAll === 'function') App.renderAll();
    App.toast('Данные синхронизированы', 'success');
} finally {
    App.db.sync._isRunning = false;
    clearTimeout(App.db.sync._retryTimeout);
    App.db.sync._retryTimeout = setTimeout(() => {
        if (navigator.onLine) App.db.sync.processSyncQueue();
    }, 60000);
}