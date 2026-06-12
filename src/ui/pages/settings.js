// src/ui/pages/settings.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

let settingsListenersAttached = false;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
App.ui.pages.saveSettings = function() {
    const notificationMethodSelect = document.getElementById('notification-method');
    const reminderDaysInput = document.getElementById('reminder-days-input');
    let reminderDaysRaw = reminderDaysInput?.value.trim() || '7,2';
    let daysArray = reminderDaysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d > 0);
    if (daysArray.length === 0) daysArray = [7, 2];
    const reminderDays = daysArray.join(',');
    const telegramEnabled = document.getElementById('telegram-toggle')?.checked === true;

    const settings = {
        currentMileage: App.store.settings.currentMileage,
        currentMotohours: App.store.settings.currentMotohours,
        avgDailyMileage: App.store.settings.avgDailyMileage,
        avgDailyMotohours: App.store.settings.avgDailyMotohours,
        notificationMethod: notificationMethodSelect?.value || 'telegram',
        reminderDays: reminderDays,
        telegramEnabled: telegramEnabled
    };

    App.storage.saveSettings(settings).then(() => {
        if (notificationMethodSelect) {
            App.store.settings.notificationMethod = notificationMethodSelect.value;
            localStorage.setItem(App.config.NOTIFICATION_METHOD_KEY, notificationMethodSelect.value);
        }
        App.store.settings.currentMileage = settings.currentMileage;
        App.store.settings.currentMotohours = settings.currentMotohours;
        App.store.settings.reminderDays = settings.reminderDays;
        App.store.settings.telegramEnabled = settings.telegramEnabled;
        App.store.saveSettingsToDB().catch(console.warn);

        App.toast('Настройки сохранены', 'success');
    }).catch(err => {
        console.error(err);
        document.getElementById('settings-result').textContent = '⚠️ Ошибка сохранения';
        App.toast('Ошибка сохранения настроек', 'error');
    });
};

App.ui.pages.checkPushSubscriptionStatus = async function() {
    if (!App.supabase) return false;
    try {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return false;
        const { data, error } = await App.supabase
            .from('push_subscriptions')
            .select('player_id')
            .eq('user_id', user.id)
            .maybeSingle();
        if (error) throw error;
        const isSubscribed = data !== null;
        if (isSubscribed) localStorage.setItem('push_subscribed', 'true');
        else localStorage.removeItem('push_subscribed');
        if (document.getElementById('tab-settings')?.classList.contains('active')) {
            await App.ui.pages.populateSettingsFields();
        }
        return isSubscribed;
    } catch (err) {
        console.error('Ошибка проверки push-подписки:', err);
        return false;
    }
};

App.ui.pages.savePushSubscription = async function(playerId) {
    if (!App.supabase) return false;
    try {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        if (App.supa.savePushToken) {
            await App.supa.savePushToken(playerId);
        } else {
            const { error } = await App.supabase
                .from('push_subscriptions')
                .upsert({ user_id: user.id, player_id: playerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
            if (error) throw error;
        }
        
        localStorage.setItem('push_subscribed', 'true');
        await App.ui.pages.populateSettingsFields();
        return true;
    } catch (err) {
        console.error('Ошибка сохранения push-подписки:', err);
        localStorage.setItem('push_subscribed', 'true');
        await App.ui.pages.populateSettingsFields();
        return false;
    }
};

App.ui.pages.removePushSubscription = async function() {
    if (!App.supabase) return false;
    try {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        if (App.supa.removePushToken) {
            await App.supa.removePushToken();
        } else {
            const { error } = await App.supabase
                .from('push_subscriptions')
                .delete()
                .eq('user_id', user.id);
            if (error) throw error;
        }
        
        localStorage.removeItem('push_subscribed');
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            try {
                const messaging = firebase.messaging();
                if (messaging && typeof messaging.deleteToken === 'function') {
                    await messaging.deleteToken();
                }
            } catch(e) { console.warn('Token delete failed:', e); }
        }
        await App.ui.pages.populateSettingsFields();
        return true;
    } catch (err) {
        console.error('Ошибка удаления push-подписки:', err);
        localStorage.removeItem('push_subscribed');
        await App.ui.pages.populateSettingsFields();
        return false;
    }
};

// ==================== ОТДЕЛЬНЫЕ БЛОКИ ДЛЯ АККОРДЕОНА ====================
App.ui.pages.renderRecoveryCodesBlock = function(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <h3><i data-lucide="key"></i> Резервные коды</h3>
            <p class="hint">Коды генерируются один раз и показываются только при создании. Сохраните их сразу.</p>
            <button id="gen-new-codes-btn" class="secondary-btn">Сгенерировать новые коды</button>
            <div id="recovery-codes-list" style="margin-top:12px;"></div>
        </div>
    `;
    App.initIcons();
    if (typeof App.ui.pages.initRecoveryCodesUI === 'function') {
        App.ui.pages.initRecoveryCodesUI();
    }
};

App.ui.pages.renderEncryptionPasswordBlock = function(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <h3><i data-lucide="key"></i> Смена пароля шифрования</h3>
            <p class="hint">Используется для защиты чувствительных данных (токены Telegram, VIN, номер).</p>
            <button id="change-encryption-password-btn" class="secondary-btn">Сменить пароль шифрования</button>
            <div id="encryption-password-status" class="hint" style="margin-top:8px;"></div>
        </div>
    `;
    App.initIcons();
    const changeEncryptionBtn = document.getElementById('change-encryption-password-btn');
    if (changeEncryptionBtn && !changeEncryptionBtn.hasListener) {
        changeEncryptionBtn.addEventListener('click', async () => {
            const statusDiv = document.getElementById('encryption-password-status');
            try {
                const oldPwd = await App.ui.promptModalAsync('Смена пароля шифрования', 'Введите текущий пароль:');
                if (!oldPwd) return;
                const newPwd = await App.ui.promptModalAsync('Смена пароля шифрования', 'Введите новый пароль (мин. 6 символов):');
                if (!newPwd || newPwd.length < 6) {
                    statusDiv.innerHTML = '<span style="color: var(--danger);"><i data-lucide="alert-triangle"></i> Пароль должен быть не менее 6 символов</span>';
                    setTimeout(() => statusDiv.innerHTML = '', 3000);
                    return;
                }
                if (typeof App.db.encryption.changeMasterPassword === 'function') {
                    await App.db.encryption.changeMasterPassword(oldPwd, newPwd);
                    statusDiv.innerHTML = '<span style="color: var(--success);"><i data-lucide="check-circle"></i> Пароль шифрования успешно изменён</span>';
                } else {
                    throw new Error('Функция смены пароля шифрования не доступна');
                }
            } catch (err) {
                statusDiv.innerHTML = `<span style="color: var(--danger);"><i data-lucide="x-circle"></i> ${err.message}</span>`;
            } finally {
                setTimeout(() => statusDiv.innerHTML = '', 3000);
            }
            App.initIcons();
        });
        changeEncryptionBtn.hasListener = true;
    }
};

App.ui.pages.renderAccountPasswordBlock = function(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <h3><i data-lucide="log-in"></i> Смена пароля учётной записи</h3>
            <p class="hint">Пароль, который используется для входа в приложение (через Supabase).</p>
            <button id="change-account-password-btn" class="secondary-btn">Сменить пароль входа</button>
            <div id="account-password-status" class="hint" style="margin-top:8px;"></div>
        </div>
    `;
    App.initIcons();
    const changeAccountBtn = document.getElementById('change-account-password-btn');
    if (changeAccountBtn && !changeAccountBtn.hasListener) {
        changeAccountBtn.addEventListener('click', async () => {
            const statusDiv = document.getElementById('account-password-status');
            try {
                const currentPwd = await App.ui.promptModalAsync('Смена пароля входа', 'Введите текущий пароль:');
                if (!currentPwd) return;
                const { data: { user } } = await App.supabase.auth.getUser();
                if (!user) throw new Error('Пользователь не найден');
                const email = user.email;
                const { error: signInError } = await App.supabase.auth.signInWithPassword({ email, password: currentPwd });
                if (signInError) throw new Error('Неверный текущий пароль');
                
                const newPwd = await App.ui.promptModalAsync('Смена пароля входа', 'Введите новый пароль (мин. 8 символов):');
                if (!newPwd || newPwd.length < 8) {
                    statusDiv.innerHTML = '<span style="color: var(--danger);"><i data-lucide="alert-triangle"></i> Пароль должен быть не менее 8 символов</span>';
                    setTimeout(() => statusDiv.innerHTML = '', 3000);
                    return;
                }
                const { error } = await App.supabase.auth.updateUser({ password: newPwd });
                if (error) throw new Error(error.message);
                statusDiv.innerHTML = '<span style="color: var(--success);"><i data-lucide="check-circle"></i> Пароль входа успешно изменён. Используйте новый пароль при следующем входе.</span>';
            } catch (err) {
                statusDiv.innerHTML = `<span style="color: var(--danger);"><i data-lucide="x-circle"></i> ${err.message}</span>`;
            } finally {
                setTimeout(() => statusDiv.innerHTML = '', 5000);
            }
            App.initIcons();
        });
        changeAccountBtn.hasListener = true;
    }
};

App.ui.pages.renderDeleteAccountBlock = function(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="card" style="border-color: var(--danger);">
            <h3><i data-lucide="alert-triangle" style="color: var(--danger);"></i> Удаление аккаунта</h3>
            <p class="hint">Удаление аккаунта приведёт к безвозвратной потере всех ваших данных: истории ТО, заправок, шин, запчастей, документов и настроек.</p>
            <button id="delete-account-btn" class="danger-btn">Удалить мой аккаунт и все данные</button>
        </div>
    `;
    App.initIcons();
    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn && !deleteBtn.hasListener) {
        deleteBtn.addEventListener('click', async () => {
            const confirmed = await App.ui.confirmModalAsync('Вы уверены? Все ваши данные будут удалены навсегда. Это действие невозможно отменить.');
            if (!confirmed) return;
            const { data: { user } } = await App.supabase.auth.getUser();
            if (!user) {
                App.toast('Пользователь не найден', 'error');
                return;
            }
            try {
                const { error: fnError } = await App.supabase.functions.invoke('delete-account', { body: {} });
                if (fnError) throw new Error(fnError.message);
                await App.supabase.auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
            } catch (err) {
                console.error(err);
                App.toast('Ошибка при удалении аккаунта: ' + err.message, 'error');
            }
        });
        deleteBtn.hasListener = true;
    }
};

// ==================== PREMIUM БЛОК ====================
App.ui.pages.renderPremiumBlock = function() {
    const container = document.getElementById('premium-settings-container');
    if (!container) return;
    
    if (!App.store.isPremium) {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="crown"></i> Premium</h3>
                <p>Расширьте возможности приложения:</p>
                <ul style="margin: 12px 0 12px 20px;">
                    <li><i data-lucide="git-compare"></i> Сравнение автомобилей в автопарке</li>
                    <li><i data-lucide="map-pin"></i> Геолокация и построение маршрутов</li>
                    <li><i data-lucide="bluetooth"></i> Подключение ELM-адаптера (OBD2)</li>
                    <li><i data-lucide="search"></i> Поиск запчастей по VIN</li>
                    <li><i data-lucide="clock"></i> Автоматическое добавление истории ТО</li>
                    <li><i data-lucide="database"></i> Синхронизация с внешними базами</li>
                </ul>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="premium-key-input" placeholder="Введите ключ активации" style="flex: 1;">
                    <button id="premium-activate-btn" class="primary-btn">Активировать</button>
                </div>
                <div id="premium-status-message" style="margin-top: 8px;"></div>
                <p class="hint">Ключ можно приобрести на сайте или получить у администратора.</p>
            </div>
        `;
        const activateBtn = document.getElementById('premium-activate-btn');
        const keyInput = document.getElementById('premium-key-input');
        const statusDiv = document.getElementById('premium-status-message');
        if (activateBtn) {
            const newActivateBtn = activateBtn.cloneNode(true);
            activateBtn.parentNode.replaceChild(newActivateBtn, activateBtn);
            newActivateBtn.onclick = async () => {
                const key = keyInput.value.trim();
                if (!key) {
                    statusDiv.innerHTML = '<span style="color: var(--danger);"><i data-lucide="alert-triangle"></i> Введите ключ</span>';
                    App.initIcons();
                    return;
                }
                try {
                    const result = await App.premium.activateKey(key);
                    if (result.success) {
                        statusDiv.innerHTML = '<span style="color: var(--success);"><i data-lucide="check-circle"></i> Подписка активирована! Обновите страницу.</span>';
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        statusDiv.innerHTML = `<span style="color: var(--danger);"><i data-lucide="x-circle"></i> ${result.error}</span>`;
                    }
                } catch (err) {
                    statusDiv.innerHTML = `<span style="color: var(--danger);"><i data-lucide="x-circle"></i> Ошибка: ${err.message}</span>`;
                }
                App.initIcons();
            };
        }
    } else {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="crown"></i> Premium активно!</h3>
                <p>Ваши премиум-функции:</p>
                <ul id="premium-features-list" style="margin: 12px 0 12px 20px;"></ul>
                ${App.store.premiumExpiresAt ? `<p>Подписка действительна до: ${new Date(App.store.premiumExpiresAt).toLocaleDateString()}</p>` : ''}
                <button id="premium-deactivate-device-btn" class="secondary-btn">Отвязать это устройство</button>
            </div>
        `;
        const list = document.getElementById('premium-features-list');
        if (list && App.store.premiumFeatures) {
            const featureNames = {
                'fleet_comparison': 'Сравнение автомобилей',
                'geolocation_api': 'Геолокация и маршруты',
                'elm_integration': 'ELM-адаптер (OBD2)',
                'parts_search_by_vin': 'Поиск запчастей по VIN',
                'auto_service_history': 'Авто-история ТО',
                'external_sync': 'Синхронизация с внешними БД'
            };
            App.store.premiumFeatures.forEach(f => {
                const li = document.createElement('li');
                li.textContent = featureNames[f] || f;
                list.appendChild(li);
            });
        }
        const deactivateBtn = document.getElementById('premium-deactivate-device-btn');
        if (deactivateBtn) {
            const newDeactivateBtn = deactivateBtn.cloneNode(true);
            deactivateBtn.parentNode.replaceChild(newDeactivateBtn, deactivateBtn);
            newDeactivateBtn.onclick = async () => {
                await App.premium.deactivateDevice();
                window.location.reload();
            };
        }
    }
    App.initIcons();
};

// ==================== НОВЫЙ БЛОК РЕЗЕРВНОГО КОПИРОВАНИЯ ====================
App.ui.pages.renderBackupBlock = function() {
    const container = document.getElementById('backup-settings-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="card">
            <h3><i data-lucide="archive"></i> Резервное копирование</h3>
            <p class="hint">Экспорт всех данных в зашифрованный ZIP-архив (требуется мастер-пароль). Импорт из такого архива.</p>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button id="export-backup-btn" class="primary-btn"><i data-lucide="download"></i> Экспорт бэкапа</button>
                <button id="import-backup-btn" class="secondary-btn"><i data-lucide="upload"></i> Импорт бэкапа</button>
            </div>
            <div id="backup-message" class="hint" style="margin-top: 8px;"></div>
        </div>
    `;
    App.initIcons();
    
    const exportBtn = document.getElementById('export-backup-btn');
    const importBtn = document.getElementById('import-backup-btn');
    const msgDiv = document.getElementById('backup-message');
    
    if (exportBtn) {
        exportBtn.onclick = async () => {
            const masterPassword = await App.ui.promptModalAsync('Экспорт данных', 'Введите мастер-пароль для шифрования бэкапа', true);
            if (!masterPassword) return;
            
            msgDiv.innerHTML = '<span style="color: var(--warning);">Формирование архива... подождите.</span>';
            try {
                const blob = await App.backup.exportAllData(masterPassword);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `car_logger_backup_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                msgDiv.innerHTML = '<span style="color: var(--success);">Бэкап успешно создан и скачан.</span>';
            } catch (err) {
                msgDiv.innerHTML = `<span style="color: var(--danger);">Ошибка: ${err.message}</span>`;
                if (App.errorHandler) App.errorHandler.logError(err, 'backup_export');
            } finally {
                setTimeout(() => { msgDiv.innerHTML = ''; }, 5000);
            }
        };
    }
    
    if (importBtn) {
        importBtn.onclick = () => {
            if (typeof App.backup?.showImportModal === 'function') {
                App.backup.showImportModal();
            } else {
                App.toast('Модуль резервного копирования не загружен', 'error');
            }
        };
    }
};

// ==================== ОСНОВНАЯ ФУНКЦИЯ ЗАПОЛНЕНИЯ НАСТРОЕК ====================
App.ui.pages.populateSettingsFields = async function() {
    if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve));
    }
    
    const premiumContainer = document.getElementById('premium-settings-container');
    const notificationsContainer = document.getElementById('notifications-card-container');
    const pinContainer = document.getElementById('pin-settings-container');
    const accordionContainer = document.getElementById('settings-accordion-container');

    if (!premiumContainer || !notificationsContainer || !pinContainer || !accordionContainer) {
        console.warn('[Settings] Missing containers, retrying...');
        setTimeout(() => App.ui.pages.populateSettingsFields(), 100);
        return;
    }

    if (typeof App.ui.pages.renderPremiumBlock === 'function') {
        App.ui.pages.renderPremiumBlock();
    }

    notificationsContainer.innerHTML = `
        <div class="card">
            <h3><i data-lucide="bell"></i> Уведомления</h3>
            <label>Способ уведомлений:
                <select id="notification-method">
                    <option value="telegram">Только Telegram</option>
                    <option value="push">Только браузер (Push)</option>
                    <option value="both">Telegram + браузер</option>
                </select>
            </label>

            <div id="telegram-bind-area"></div>

            <div class="form-group">
                <label for="reminder-days-input">Дни напоминания (через запятую)</label>
                <input type="text" id="reminder-days-input" placeholder="7,2,1" value="7,2">
                <p class="hint">Уведомления придут за указанное количество дней до планового ТО</p>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" id="telegram-toggle" checked>
                    <i data-lucide="message-circle"></i> Получать уведомления в Telegram
                </label>
                <p class="hint">Отключите, если не хотите получать напоминания о ТО в Telegram</p>
            </div>

            <div id="push-settings" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
                <p><strong><i data-lucide="bell"></i> Push-уведомления в браузере</strong></p>
                <p id="push-status" class="hint">Push-уведомления не настроены.</p>
                <button id="subscribe-push-btn" class="secondary-btn"><i data-lucide="bell"></i> Подписаться на уведомления</button>
                <button id="unsubscribe-push-btn" class="secondary-btn" style="display:none;"><i data-lucide="bell-off"></i> Отписаться от уведомлений</button>
                <p class="hint" style="margin-top: 8px;">Push-уведомления работают только через защищённое соединение (HTTPS) и требуют разрешения браузера.</p>
            </div>

            <div style="display:flex; gap:8px; align-items:center; margin-top:12px;">
                <button id="save-settings-btn" class="primary-btn"><i data-lucide="save"></i> Сохранить настройки</button>
                <button id="telegram-info-btn" class="icon-btn" title="Как подключить Telegram"><i data-lucide="info"></i></button>
            </div>
            <div id="settings-result"></div>
        </div>
    `;
    App.initIcons();

    const notificationMethodSelect = document.getElementById('notification-method');
    if (notificationMethodSelect) notificationMethodSelect.value = App.store.settings.notificationMethod || 'telegram';
    const reminderInput = document.getElementById('reminder-days-input');
    if (reminderInput && App.store.settings.reminderDays) reminderInput.value = App.store.settings.reminderDays;
    const telegramToggle = document.getElementById('telegram-toggle');
    if (telegramToggle) telegramToggle.checked = App.store.settings.telegramEnabled !== false;

    const pushStatus = document.getElementById('push-status');
    const subscribeBtn = document.getElementById('subscribe-push-btn');
    const unsubscribeBtn = document.getElementById('unsubscribe-push-btn');
    if (pushStatus && subscribeBtn && unsubscribeBtn) {
        const isSubscribed = localStorage.getItem('push_subscribed') === 'true';
        pushStatus.innerHTML = isSubscribed 
            ? '<i data-lucide="check-circle" style="color: var(--success);"></i> Push-уведомления активны' 
            : '<i data-lucide="bell-off"></i> Push-уведомления не настроены';
        subscribeBtn.style.display = isSubscribed ? 'none' : 'inline-flex';
        unsubscribeBtn.style.display = isSubscribed ? 'inline-flex' : 'none';
        
        if (isSubscribed) {
            App.initIcons();
        } else {
            if (!('Notification' in window)) {
                pushStatus.innerHTML = '<i data-lucide="alert-triangle" style="color: var(--warning);"></i> Push-уведомления не поддерживаются вашим браузером.';
                subscribeBtn.disabled = true;
            } else if (Notification.permission === 'denied') {
                pushStatus.innerHTML = '<i data-lucide="alert-triangle" style="color: var(--danger);"></i> Разрешение на уведомления заблокировано. Измените в настройках браузера.';
                subscribeBtn.disabled = true;
            } else if (Notification.permission === 'granted') {
                pushStatus.innerHTML = '<i data-lucide="check-circle" style="color: var(--success);"></i> Разрешение есть. Нажмите "Подписаться" для активации.';
            }
        }
    }

  const telegramBindArea = document.getElementById('telegram-bind-area');
if (telegramBindArea) {
    if (App.store.isPremium) {
        const userId = await App.supa.getCurrentUserId();
        const status = await App.supa.getTelegramStatus();
        const isConnected = status.is_connected;
        const username = status.username;
        const telegramEnabled = status.telegram_enabled;
        
        if (isConnected && telegramEnabled) {
            telegramBindArea.innerHTML = `
                <div style="margin-top: 12px;">
                    <p><strong><i data-lucide="send"></i> Telegram-уведомления</strong></p>
                    <p class="hint" style="color: var(--success);">Подключено: @${username || 'Telegram'}</p>
                    <button id="unbind-telegram-btn" class="secondary-btn"><i data-lucide="bell-off"></i> Отписаться</button>
                    <div id="unbind-message" class="hint" style="margin-top: 8px;"></div>
                </div>
            `;
            const unbindBtn = telegramBindArea.querySelector('#unbind-telegram-btn');
            if (unbindBtn) {
                unbindBtn.onclick = async () => {
                    const confirmed = await App.ui.confirmModalAsync('Отписаться от Telegram-уведомлений? Вы перестанете получать напоминания в Telegram.');
                    if (!confirmed) return;
                    const msgDiv = telegramBindArea.querySelector('#unbind-message');
                    msgDiv.innerHTML = '<span style="color: var(--warning);">Отправка запроса...</span>';
                    try {
                        // Вызываем Edge Function для отписки (или удаляем запись напрямую)
                        const { error } = await App.supabase
                            .from('telegram_users')
                            .delete()
                            .eq('user_id', userId);
                        if (error) throw error;
                        await App.supabase
                            .from('user_settings')
                            .update({ telegram_enabled: false })
                            .eq('user_id', userId)
                            .eq('car_id', App.store.activeCarId);
                        msgDiv.innerHTML = '<span style="color: var(--success);">Вы отписались. Чтобы снова подключиться, нажмите кнопку привязки.</span>';
                        // Обновляем интерфейс
                        setTimeout(() => App.ui.pages.populateSettingsFields(), 2000);
                    } catch (err) {
                        msgDiv.innerHTML = `<span style="color: var(--danger);">Ошибка: ${err.message}</span>`;
                    }
                };
            }
        } else {
            const link = `https://t.me/CarLoggerDnCBot?start=${userId}`;
            telegramBindArea.innerHTML = `
                <div style="margin-top: 12px;">
                    <p><strong><i data-lucide="send"></i> Telegram-уведомления</strong></p>
                    <a href="${link}" target="_blank" class="primary-btn" style="display:inline-block; margin-bottom:8px;">
                        <i data-lucide="message-circle"></i> Привязать Telegram
                    </a>
                    <p class="hint">Нажмите на кнопку, чтобы связать аккаунт с официальным ботом. После привязки уведомления о ТО будут приходить в Telegram.</p>
                </div>
            `;
        }
    } else {
        telegramBindArea.innerHTML = `
            <div style="margin-top: 12px;">
                <p class="hint"><i data-lucide="lock"></i> Telegram-уведомления доступны в Premium и Ultra тарифах.</p>
                <button id="upgrade-to-premium-telegram" class="secondary-btn"><i data-lucide="crown"></i> Активировать Premium</button>
            </div>
        `;
        const upgradeBtn = document.getElementById('upgrade-to-premium-telegram');
        if (upgradeBtn) {
            upgradeBtn.onclick = () => App.modules.showUpgradeModal();
        }
    }
    App.initIcons();
}

    if (!settingsListenersAttached) {
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            newSaveBtn.addEventListener('click', App.ui.pages.saveSettings);
        }
        
        const subPushBtn = document.getElementById('subscribe-push-btn');
        if (subPushBtn) {
            const newSubBtn = subPushBtn.cloneNode(true);
            subPushBtn.parentNode.replaceChild(newSubBtn, subPushBtn);
            newSubBtn.addEventListener('click', async () => {
                await App.ui.pages.subscribeToPush();
            });
        }
        
        const unsubPushBtn = document.getElementById('unsubscribe-push-btn');
        if (unsubPushBtn) {
            const newUnsubBtn = unsubPushBtn.cloneNode(true);
            unsubPushBtn.parentNode.replaceChild(newUnsubBtn, unsubPushBtn);
            newUnsubBtn.addEventListener('click', async () => {
                await App.ui.pages.removePushSubscription();
                App.toast('Подписка на push отключена', 'success');
                const statusEl = document.getElementById('push-status');
                if (statusEl) statusEl.innerHTML = '<i data-lucide="bell-off"></i> Push-уведомления не настроены';
                const subscribeEl = document.getElementById('subscribe-push-btn');
                const unsubscribeEl = document.getElementById('unsubscribe-push-btn');
                if (subscribeEl) subscribeEl.style.display = 'inline-flex';
                if (unsubscribeEl) unsubscribeEl.style.display = 'none';
                App.initIcons();
            });
        }
        
        const infoBtn = document.getElementById('telegram-info-btn');
        if (infoBtn) {
            infoBtn.addEventListener('click', () => {
                App.ui.alertModal('Для привязки Telegram перейдите в раздел Premium (доступно после активации подписки).');
            });
        }
        settingsListenersAttached = true;
    }

    if (typeof App.ui.pages.renderPinSettings === 'function') {
        await App.ui.pages.renderPinSettings();
    }

    accordionContainer.innerHTML = `
        <div class="accordion-group settings-accordion">
            <div class="accordion-header" id="accordion-recovery-header">
                <i data-lucide="key"></i> Резервные коды
                <i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>
            </div>
            <div class="accordion-body" id="accordion-recovery-body"></div>

            <div class="accordion-header" id="accordion-encryption-header">
                <i data-lucide="key"></i> Смена пароля шифрования
                <i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>
            </div>
            <div class="accordion-body" id="accordion-encryption-body"></div>

            <div class="accordion-header" id="accordion-account-header">
                <i data-lucide="log-in"></i> Смена пароля учётной записи
                <i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>
            </div>
            <div class="accordion-body" id="accordion-account-body"></div>

            <div class="accordion-header" id="accordion-delete-header">
                <i data-lucide="alert-triangle" style="color: var(--danger);"></i> Удаление аккаунта
                <i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>
            </div>
            <div class="accordion-body" id="accordion-delete-body"></div>
        </div>
    `;
    App.initIcons();

    const recoveryBody = document.getElementById('accordion-recovery-body');
    const encryptionBody = document.getElementById('accordion-encryption-body');
    const accountBody = document.getElementById('accordion-account-body');
    const deleteBody = document.getElementById('accordion-delete-body');

    if (recoveryBody) await App.ui.pages.renderRecoveryCodesBlock(recoveryBody);
    if (encryptionBody) await App.ui.pages.renderEncryptionPasswordBlock(encryptionBody);
    if (accountBody) await App.ui.pages.renderAccountPasswordBlock(accountBody);
    if (deleteBody) await App.ui.pages.renderDeleteAccountBlock(deleteBody);

    document.querySelectorAll('.settings-accordion .accordion-header').forEach(header => {
        header.addEventListener('click', function() {
            const body = this.nextElementSibling;
            if (body && body.classList.contains('accordion-body')) {
                body.classList.toggle('open');
                const arrow = this.querySelector('.accordion-arrow');
                if (arrow) arrow.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    });

    // Добавляем блок резервного копирования
    if (typeof App.ui.pages.renderBackupBlock === 'function') {
        App.ui.pages.renderBackupBlock();
    }

    App.initIcons();
};

// ==================== РЕЗЕРВНЫЕ КОДЫ ====================
App.ui.pages.initRecoveryCodesUI = function() {
    let showBtn = document.getElementById('show-recovery-btn');
    let genBtn = document.getElementById('gen-new-codes-btn');
    if (!showBtn || !genBtn) return;

    // Удаляем старые клоны, чтобы избежать дублирования
    const newShowBtn = showBtn.cloneNode(true);
    const newGenBtn = genBtn.cloneNode(true);
    showBtn.parentNode.replaceChild(newShowBtn, showBtn);
    genBtn.parentNode.replaceChild(newGenBtn, genBtn);
    showBtn = newShowBtn;
    genBtn = newGenBtn;

    // Удаляем или отключаем кнопку "Показать" – она не нужна
    showBtn.style.display = 'none';

    genBtn.addEventListener('click', async function() {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        const confirmed = await App.ui.confirmModalAsync('Сгенерировать новые резервные коды? Старые коды будут аннулированы. Сохраните новые коды в надёжном месте.');
        if (!confirmed) return;
        
        const { data: codes, error } = await App.supabase.rpc('generate_recovery_codes', { p_user_id: user.id });
        if (error || !codes || codes.length === 0) {
            App.toast('Не удалось сгенерировать коды', 'error');
            return;
        }
        
        // Показываем коды в модальном окне (только один раз)
        let codesText = 'Ваши новые резервные коды (каждый можно использовать один раз):\n\n';
        codes.forEach((code, idx) => {
            codesText += `${idx+1}. ${code}\n`;
        });
        codesText += '\nСохраните их в надёжном месте. Эта страница больше не покажет эти коды.';
        await App.ui.alertModal(codesText);
        
        // Обновляем интерфейс (убираем список, показываем сообщение)
        const listEl = document.getElementById('recovery-codes-list');
        if (listEl) listEl.innerHTML = '<p class="hint">Новые коды сгенерированы и показаны. Сохраните их.</p>';
    });
};

// ==================== PIN-код ====================
App.ui.pages.renderPinSettings = async function() {
    const container = document.getElementById('pin-settings-container');
    if (!container) return;

    if (!App.db || !App.db._db) {
        setTimeout(() => App.ui.pages.renderPinSettings(), 500);
        return;
    }

    const hasPin = App.localAuth && await App.localAuth.isPinSet();
    const supported = App.localAuth && App.localAuth.isPinSupported();

    if (!supported) {
        container.innerHTML = '<p class="hint"><i data-lucide="info"></i> PIN-код не поддерживается вашим браузером.</p>';
        App.initIcons();
        return;
    }

    const attempts = localStorage.getItem('vesta_pin_attempts');
    let blockedMessage = '';
    if (attempts) {
        try {
            const data = JSON.parse(attempts);
            if (data.blockedUntil && Date.now() < data.blockedUntil) {
                const minutesLeft = Math.ceil((data.blockedUntil - Date.now()) / 60000);
                blockedMessage = `<p class="hint" style="color: var(--danger);">PIN временно заблокирован (${minutesLeft} мин.). Введите мастер-пароль для разблокировки.</p>`;
            }
        } catch(e) {}
    }

    if (hasPin) {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="lock"></i> Быстрый вход по PIN</h3>
                <p>PIN-код установлен. Вы можете сбросить его.</p>
                ${blockedMessage}
                <button id="pin-reset-btn" class="secondary-btn">Сбросить PIN</button>
            </div>
        `;
        const resetBtn = document.getElementById('pin-reset-btn');
        if (resetBtn) {
            const newResetBtn = resetBtn.cloneNode(true);
            resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
            newResetBtn.addEventListener('click', async () => {
                if (await App.ui.confirmModalAsync('Сбросить PIN? Придётся заново вводить мастер-пароль.')) {
                    await App.localAuth.resetPin();
                    await App.ui.pages.renderPinSettings();
                    App.toast('PIN сброшен', 'success');
                }
            });
        }
    } else {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="fingerprint"></i> Быстрый вход по PIN</h3>
                <p>Установите PIN-код (6+ цифр), чтобы не вводить мастер-пароль при каждом запуске.</p>
                ${blockedMessage}
                <button id="pin-setup-btn" class="primary-btn">Установить PIN</button>
            </div>
        `;
        const setupBtn = document.getElementById('pin-setup-btn');
        if (setupBtn) {
            const newSetupBtn = setupBtn.cloneNode(true);
            setupBtn.parentNode.replaceChild(newSetupBtn, setupBtn);
            newSetupBtn.addEventListener('click', async () => {
                const masterKey = App.db.encryption.getMasterKey();
                if (!masterKey) {
                    App.toast('Мастер-пароль не активен. Выйдите и войдите снова.', 'error');
                    return;
                }
                const masterPassword = await App.ui.promptModalAsync('Подтвердите мастер-пароль', '');
                if (!masterPassword) return;
                const salt = App.db.encryption.getStoredSalt();
                const isValid = await App.db.encryption.verifyMasterKey(masterPassword, salt);
                if (!isValid) {
                    App.toast('Неверный мастер-пароль', 'error');
                    return;
                }
                let pinSet = false;
                while (!pinSet) {
                    const pin = await App.ui.promptModalAsync('Установите PIN-код (минимум 6 цифр)', '');
                    if (pin && pin.length >= 6 && /^\d+$/.test(pin)) {
                        const confirmPin = await App.ui.promptModalAsync('Подтвердите PIN-код', '');
                        if (confirmPin === pin) {
                            try {
                                await App.localAuth.setPin(pin, masterPassword);
                                App.toast('PIN-код сохранён', 'success');
                                await App.ui.pages.renderPinSettings();
                                pinSet = true;
                            } catch (err) {
                                App.toast('Ошибка: ' + err.message, 'error');
                            }
                        } else {
                            App.toast('PIN-коды не совпадают', 'error');
                        }
                    } else {
                        App.toast('PIN должен содержать минимум 6 цифр', 'error');
                    }
                }
            });
        }
    }
    App.initIcons();
};

// ==================== PUSH-УВЕДОМЛЕНИЯ ====================
App.ui.pages.subscribeToPush = async function() {
    if (!('Notification' in window)) {
        App.ui.alertModal('Push-уведомления не поддерживаются вашим браузером.');
        return;
    }
    
    if (Notification.permission === 'denied') {
        App.ui.alertModal('Разрешение на уведомления заблокировано. Пожалуйста, измените настройки в браузере.');
        return;
    }
    
    try {
        if (Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                App.toast('Необходимо разрешить уведомления для работы Push', 'warning');
                return;
            }
        }
        
        if ('serviceWorker' in navigator) {
            let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
            if (!registration) {
                registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                console.log('[Push] Firebase SW registered:', registration);
            }
            
            if (typeof firebase !== 'undefined' && firebase.messaging) {
                const messaging = firebase.messaging();
                const vapidKey = 'BEUVrsWau5E4NvAwwAKmkjfK8yoDVntppWmZ2IdqseLVxuNNy47bV7eOLVYDmZ1b2P3F27eRqJLoAjW58Fh0tyY';
                const token = await messaging.getToken({ vapidKey });
                
                if (token) {
                    console.log('[Push] FCM Token получен:', token);
                    await App.ui.pages.savePushSubscription(token);
                    App.toast('Push-уведомления активированы', 'success');
                    
                    const statusEl = document.getElementById('push-status');
                    if (statusEl) statusEl.innerHTML = '<i data-lucide="check-circle" style="color: var(--success);"></i> Push-уведомления активны';
                    const subscribeEl = document.getElementById('subscribe-push-btn');
                    const unsubscribeEl = document.getElementById('unsubscribe-push-btn');
                    if (subscribeEl) subscribeEl.style.display = 'none';
                    if (unsubscribeEl) unsubscribeEl.style.display = 'inline-flex';
                    App.initIcons();
                } else {
                    throw new Error('Не удалось получить токен FCM');
                }
            } else {
                throw new Error('Firebase не инициализирован');
            }
        } else {
            throw new Error('Service Worker не поддерживается');
        }
    } catch (err) {
        console.error('[Push] Ошибка подписки:', err);
        App.toast('Ошибка активации push-уведомлений: ' + err.message, 'error');
    }
};
