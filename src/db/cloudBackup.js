// src/db/cloudBackup.js
window.App = window.App || {};
App.db.cloudBackup = App.db.cloudBackup || {};

/**
 * Сохраняет действие в облачное резервное хранилище (после успешной синхронизации)
 * @param {Object} action - действие из очереди (с полями type, entityType, entityId, data, timestamp)
 */
App.db.cloudBackup.savePendingActionToCloud = async function(action) {
    if (!App.supabase || !App.store.activeCarId) return;
    try {
        // Не сохраняем старые действия, только недавние (например, не старше 7 дней)
        if (action.timestamp && Date.now() - action.timestamp > 7 * 24 * 3600 * 1000) return;
        
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        
        // Убираем лишние поля, которые не нужны в бэкапе (например, id действия может быть другим)
        const backupAction = {
            type: action.type,
            entityType: action.entityType,
            entityId: action.entityId,
            data: action.data,
            timestamp: action.timestamp || Date.now()
        };
        
        const { error } = await App.supabase
            .from('pending_actions_backup')
            .insert({ user_id: user.id, action: backupAction });
        
        if (error) console.warn('[CloudBackup] Не удалось сохранить бэкап действия:', error);
    } catch (err) {
        console.warn('[CloudBackup] Ошибка сохранения бэкапа:', err);
    }
};

/**
 * Загружает несинхронизированные действия из облака и добавляет их в локальную очередь
 * @returns {Promise<number>} количество восстановленных действий
 */
App.db.cloudBackup.restorePendingActionsFromCloud = async function() {
    if (!App.supabase || !App.store.activeCarId) return 0;
    try {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return 0;
        
        // Запрашиваем бэкапы за последние 30 дней, отсортированные по времени создания
        const { data, error } = await App.supabase
            .from('pending_actions_backup')
            .select('action')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(500);
        
        if (error) throw error;
        if (!data || data.length === 0) return 0;
        
        let restored = 0;
        for (const row of data) {
            const action = row.action;
            // Проверяем, нет ли уже такого действия в локальной очереди (по entityId + type)
            const exists = App.store.pendingActions.some(a => 
                a.entityId === action.entityId && a.type === action.type && a.entityType === action.entityType
            );
            if (!exists) {
                // Добавляем в локальную очередь (аналогично App.store.addPendingAction)
                const newAction = {
                    id: crypto.randomUUID(),
                    type: action.type,
                    entityType: action.entityType,
                    entityId: action.entityId,
                    data: action.data,
                    timestamp: action.timestamp || Date.now(),
                    retryCount: 0
                };
                App.store.pendingActions.push(newAction);
                await App.db.put('pending_actions', newAction);
                restored++;
            }
            // Удаляем бэкап после восстановления (чтобы не дублировать)
            await App.supabase
                .from('pending_actions_backup')
                .delete()
                .eq('user_id', user.id)
                .eq('action->>entityId', action.entityId)
                .eq('action->>type', action.type);
        }
        
        if (restored > 0) {
            console.log(`[CloudBackup] Восстановлено ${restored} действий из облака`);
            if (typeof App.setSyncStatus === 'function') App.setSyncStatus('pending');
            // Запускаем синхронизацию для новых действий
            setTimeout(() => App.db.sync.processSyncQueue(), 500);
        }
        return restored;
    } catch (err) {
        console.error('[CloudBackup] Ошибка восстановления из облака:', err);
        return 0;
    }
};

/**
 * Удаляет все бэкапы для текущего пользователя (при выходе из системы)
 */
App.db.cloudBackup.clearAllBackups = async function() {
    if (!App.supabase) return;
    try {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        await App.supabase
            .from('pending_actions_backup')
            .delete()
            .eq('user_id', user.id);
    } catch (err) {
        console.warn('[CloudBackup] Ошибка очистки бэкапов:', err);
    }
};