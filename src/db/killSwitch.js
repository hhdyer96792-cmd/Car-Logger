// src/db/killSwitch.js (удаляем дубликат, оставляем один исправленный файл)
window.App = window.App || {};
App.db = App.db || {};
App.db.killSwitch = App.db.killSwitch || {};

const DB_NAME = 'CarLoggerDB';

// Проверка, не активирован ли kill-переключатель для текущего пользователя
App.db.killSwitch.check = async function() {
    if (!App.supabase || !App.store.activeCarId) return false;
    
    try {
        // Получаем текущего пользователя
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return false;
        
        // Вызываем RPC-функцию на сервере
        const { data, error } = await App.supabase.rpc('check_kill_switch', {
            p_user_id: user.id,
            p_database_id: App.store.activeCarId || 'default'
        });
        
        if (error) throw error;
        return data === true;
    } catch (err) {
        console.error('[KillSwitch] Ошибка проверки:', err);
        return false; // В случае ошибки не убиваем базу
    }
};

// Уничтожение локальной базы данных
App.db.killSwitch.destroyLocalDB = async function() {
    if (!App.db._db) return;
    
    try {
        // Закрываем соединение с БД
        App.db._db.close();
        
        // Удаляем всю базу данных
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
        
        // Очищаем localStorage (только данные приложения)
        const keysToKeep = ['vesta_theme', 'vesta_active_car_id']; // сохраняем настройки темы и ID авто
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !keysToKeep.includes(key)) {
                localStorage.removeItem(key);
            }
        }
        
        // Показываем сообщение пользователю
        if (typeof App.toast === 'function') {
            App.toast('Ваша локальная база данных уничтожена администратором. Обратитесь в поддержку.', 'error');
        }
        
        // Разлогиниваем пользователя
        await App.supabase.auth.signOut();
        
        // Перезагружаем страницу, чтобы приложение перешло в демо-режим
        setTimeout(() => {
            window.location.reload();
        }, 2000);
        
    } catch (err) {
        console.error('[KillSwitch] Не удалось уничтожить БД:', err);
        if (typeof App.toast === 'function') {
            App.toast('Ошибка при удалении базы данных. Обратитесь в поддержку.', 'error');
        }
    }
};

// Периодическая проверка kill-переключателя (каждые 5 минут)
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
    }, 5 * 60 * 1000); // каждые 5 минут
};

// Функция для остановки периодической проверки (при выходе из системы)
App.db.killSwitch.stopPeriodicCheck = function() {
    if (App.db.killSwitch._interval) {
        clearInterval(App.db.killSwitch._interval);
        App.db.killSwitch._interval = null;
    }
};