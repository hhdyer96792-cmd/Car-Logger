// src/db/killSwitch.js (исправленная версия)
window.App = window.App || {};
App.db = App.db || {};
App.db.killSwitch = App.db.killSwitch || {};

(function() {
    const DB_NAME = 'CarLoggerDB';  // локальная константа, не глобальная

    App.db.killSwitch.check = async function() {
        if (!App.supabase || !App.store.activeCarId) return false;
        try {
            const { data: { user } } = await App.supabase.auth.getUser();
            if (!user) return false;
            const { data, error } = await App.supabase.rpc('check_kill_switch', {
                p_user_id: user.id,
                p_database_id: App.store.activeCarId || 'default'
            });
            if (error) throw error;
            return data === true;
        } catch (err) {
            console.error('[KillSwitch] Ошибка проверки:', err);
            return false;
        }
    };

    App.db.killSwitch.destroyLocalDB = async function() {
        if (!App.db._db) return;
        try {
            App.db._db.close();
            await new Promise((resolve, reject) => {
                const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
                deleteRequest.onsuccess = () => {
                    console.log('[KillSwitch] База данных удалена');
                    resolve();
                };
                deleteRequest.onerror = (event) => {
                    console.error('[KillSwitch] Ошибка удаления БД:', event.target.error);
                    reject(event.target.error);
                };
            });
            const keysToKeep = ['vesta_theme', 'vesta_active_car_id'];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && !keysToKeep.includes(key)) localStorage.removeItem(key);
            }
            if (typeof App.toast === 'function') {
                App.toast('Ваша локальная база данных уничтожена администратором. Обратитесь в поддержку.', 'error');
            }
            await App.supabase.auth.signOut();
            setTimeout(() => { window.location.reload(); }, 2000);
        } catch (err) {
            console.error('[KillSwitch] Не удалось уничтожить БД:', err);
            if (typeof App.toast === 'function') {
                App.toast('Ошибка при удалении базы данных. Обратитесь в поддержку.', 'error');
            }
        }
    };

    App.db.killSwitch.startPeriodicCheck = function() {
        if (App.db.killSwitch._interval) return;
        App.db.killSwitch._interval = setInterval(async () => {
            const isKilled = await App.db.killSwitch.check();
            if (isKilled) {
                console.warn('[KillSwitch] Обнаружена команда на уничтожение!');
                await App.db.killSwitch.destroyLocalDB();
                clearInterval(App.db.killSwitch._interval);
                App.db.killSwitch._interval = null;
            }
        }, 5 * 60 * 1000);
    };

    App.db.killSwitch.stopPeriodicCheck = function() {
        if (App.db.killSwitch._interval) {
            clearInterval(App.db.killSwitch._interval);
            App.db.killSwitch._interval = null;
        }
    };
})();