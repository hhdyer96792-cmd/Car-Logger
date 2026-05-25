// src/ui/pages/settings.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

let settingsListenersAttached = false;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (сохранение, push, шифрование и т.д.) ====================
App.ui.pages.saveSettings = function() {
    var notificationMethodSelect = document.getElementById('notification-method');
    var reminderDaysInput = document.getElementById('reminder-days-input');
    var reminderDaysRaw = reminderDaysInput?.value.trim() || '7,2';
    var daysArray = reminderDaysRaw.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d > 0);
    if (daysArray.length === 0) daysArray = [7, 2];
    var reminderDays = daysArray.join(',');
    var telegramEnabled = document.getElementById('telegram-toggle')?.checked === true;

    var settings = {
        currentMileage: App.store.settings.currentMileage,
        currentMotohours: App.store.settings.currentMotohours,
        avgDailyMileage: App.store.settings.avgDailyMileage,
        avgDailyMotohours: App.store.settings.avgDailyMotohours,
        notificationMethod: notificationMethodSelect?.value || 'telegram',
        reminderDays: reminderDays,
        telegramEnabled: telegramEnabled
    };

    App.storage.saveSettings(settings).then(function() {
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
    }).catch(function(err) {
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
            App.ui.pages.populateSettingsFields();
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
        const { error } = await App.supabase
            .from('push_subscriptions')
            .upsert({ user_id: user.id, player_id: playerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
        localStorage.setItem('push_subscribed', 'true');
        App.ui.pages.populateSettingsFields();
        return true;
    } catch (err) {
        console.error('Ошибка сохранения push-подписки:', err);
        localStorage.setItem('push_subscribed', 'true');
        App.ui.pages.populateSettingsFields();
        return false;
    }
};

App.ui.pages.removePushSubscription = async function() {
    if (!App.supabase) return false;
    try {
        const { data: { user } } = await App.supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        const { error } = await App.supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id);
        if (error) throw error;
        localStorage.removeItem('push_subscribed');
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            try {
                const messaging = firebase.messaging();
                if (messaging && typeof messaging.deleteToken === 'function') {
                    await messaging.deleteToken();
                }
            } catch(e) { console.warn('Token delete failed:', e); }
        }
        App.ui.pages.populateSettingsFields();
        return true;
    } catch (err) {
        console.error('Ошибка удаления push-подписки:', err);
        localStorage.removeItem('push_subscribed');
        App.ui.pages.populateSettingsFields();
        return false;
    }
};

// ==================== ОТДЕЛЬНЫЕ БЛОКИ ДЛЯ АККОРДЕОНА ====================
App.ui.pages.renderRecoveryCodesBlock = function(container) {
    if (!container) return;
    container.innerHTML = `
        <div class="card">
            <h3><i data-lucide="key"></i> Резервные коды</h3>
            <div id="recovery-codes-container">
                <button id="show-recovery-btn" class="secondary-btn">Показать неиспользованные коды</button>
                <button id="gen-new-codes-btn" class="secondary-btn" style="margin-left:8px;">Сгенерировать новые</button>
                <div id="recovery-codes-list" style="margin-top:12px;"></div>
            </div>
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
                await App.db.encryption.changeMasterPassword(oldPwd, newPwd);
                statusDiv.innerHTML = '<span style="color: var(--success);"><i data-lucide="check-circle"></i> Пароль шифрования успешно изменён</span>';
                setTimeout(() => statusDiv.innerHTML = '', 3000);
            } catch (err) {
                statusDiv.innerHTML = `<span style="color: var(--danger);"><i data-lucide="x-circle"></i> ${err.message}</span>`;
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
                let isValid = false;
                try {
                    const { error } = await App.supabase.auth.reauthenticate();
                    if (!error) isValid = true;
                } catch(e) { /* fallback */ }
                if (!isValid) {
                    const { data: { user } } = await App.supabase.auth.getUser();
                    const email = user.email;
                    const { error } = await App.supabase.auth.signInWithPassword({ email, password: currentPwd });
                    if (error) throw new Error('Неверный текущий пароль');
                }
                const newPwd = await App.ui.promptModalAsync('Смена пароля входа', 'Введите новый пароль (мин. 6 символов):');
                if (!newPwd || newPwd.length < 6) {
                    statusDiv.innerHTML = '<span style="color: var(--danger);"><i data-lucide="alert-triangle"></i> Пароль должен быть не менее 6 символов</span>';
                    setTimeout(() => statusDiv.innerHTML = '', 3000);
                    return;
                }
                const { error } = await App.supabase.auth.updateUser({ password: newPwd });
                if (error) throw new Error(error.message);
                statusDiv.innerHTML = '<span style="color: var(--success);"><i data-lucide="check-circle"></i> Пароль входа успешно изменён. Используйте новый пароль при следующем входе.</span>';
                setTimeout(() => statusDiv.innerHTML = '', 5000);
            } catch (err) {
                statusDiv.innerHTML = `<span style="color: var(--danger);"><i data-lucide="x-circle"></i> ${err.message}</span>`;
                setTimeout(() => statusDiv.innerHTML = '', 3000);
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
    // Вызываем единую Edge Function для удаления аккаунта (user_id берётся из JWT)
    const { error: fnError } = await App.supabase.functions.invoke('delete-account', {
        body: {} // user_id не передаём, он берётся из JWT
    });
    if (fnError) throw new Error(fnError.message);

    // Выходим из системы и очищаем локальное хранилище
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

// ==================== PREMIUM БЛОК (отдельная карточка) ====================
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
            activateBtn.onclick = async () => {
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
            deactivateBtn.onclick = async () => {
                await App.premium.deactivateDevice();
                window.location.reload();
            };
        }
    }
    App.initIcons();
};

// ==================== ОСНОВНАЯ ФУНКЦИЯ ЗАПОЛНЕНИЯ НАСТРОЕК ====================
App.ui.pages.populateSettingsFields = async function() {
    // Контейнеры
    const premiumContainer = document.getElementById('premium-settings-container');
    const notificationsContainer = document.getElementById('notifications-card-container');
    const pinContainer = document.getElementById('pin-settings-container');
    const accordionContainer = document.getElementById('settings-accordion-container');

    if (!premiumContainer || !notificationsContainer || !pinContainer || !accordionContainer) {
        console.warn('[Settings] Missing containers in index.html');
        return;
    }

    // 0. Premium карточка (отдельно, сверху)
    if (typeof App.ui.pages.renderPremiumBlock === 'function') {
        App.ui.pages.renderPremiumBlock();
    }

    // 1. Карточка уведомлений (без Premium внутри)
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

            <div id="push-settings">
                <p id="push-status">Push-уведомления не настроены.</p>
                <button id="subscribe-push-btn" class="secondary-btn"><i data-lucide="bell"></i> Подписаться на уведомления</button>
                <button id="unsubscribe-push-btn" class="secondary-btn" style="display:none;"><i data-lucide="bell-off"></i> Отписаться от уведомлений</button>
            </div>

            <div style="display:flex; gap:8px; align-items:center; margin-top:12px;">
                <button id="save-settings-btn" class="primary-btn"><i data-lucide="save"></i> Сохранить настройки</button>
                <button id="telegram-info-btn" class="icon-btn" title="Как подключить Telegram"><i data-lucide="info"></i></button>
            </div>
            <div id="settings-result"></div>
        </div>
    `;
    App.initIcons();

    // Заполнение текущих значений уведомлений
    const notificationMethodSelect = document.getElementById('notification-method');
    if (notificationMethodSelect) notificationMethodSelect.value = App.store.settings.notificationMethod || 'telegram';

    const reminderInput = document.getElementById('reminder-days-input');
    if (reminderInput && App.store.settings.reminderDays) {
        reminderInput.value = App.store.settings.reminderDays;
    }
    const telegramToggle = document.getElementById('telegram-toggle');
    if (telegramToggle) {
        telegramToggle.checked = App.store.settings.telegramEnabled !== false;
    }

    // Push-статус
    const pushStatus = document.getElementById('push-status');
    const subscribeBtn = document.getElementById('subscribe-push-btn');
    const unsubscribeBtn = document.getElementById('unsubscribe-push-btn');
    if (pushStatus && subscribeBtn && unsubscribeBtn) {
        const isSubscribed = localStorage.getItem('push_subscribed') === 'true';
        pushStatus.innerHTML = isSubscribed ? '<i data-lucide="check-circle" style="color: var(--success);"></i> Push активны' : '<i data-lucide="bell-off"></i> Push-уведомления не настроены';
        subscribeBtn.style.display = isSubscribed ? 'none' : 'inline-block';
        unsubscribeBtn.style.display = isSubscribed ? 'inline-block' : 'none';
        if (isSubscribed) App.initIcons();
    }

    // Привязка Telegram
    const telegramBindArea = document.getElementById('telegram-bind-area');
    if (telegramBindArea) {
        if (App.store.isPremium) {
            const userId = await App.supa.getCurrentUserId();
            if (userId) {
                const link = `https://t.me/CarLoggerRobot?start=${userId}`;
                telegramBindArea.innerHTML = `
                    <div style="margin-top: 12px;">
                        <p><strong><i data-lucide="send"></i> Telegram-уведомления</strong></p>
                        <a href="${link}" target="_blank" class="primary-btn" style="display:inline-block; margin-bottom:8px;">
                            <i data-lucide="message-circle"></i> Привязать Telegram
                        </a>
                        <p class="hint">Нажмите на кнопку, чтобы связать аккаунт с официальным ботом. После привязки уведомления о ТО будут приходить в Telegram.</p>
                    </div>
                `;
            } else {
                telegramBindArea.innerHTML = '<p class="hint">Ошибка получения ID пользователя</p>';
            }
        } else {
            telegramBindArea.innerHTML = `
                <div style="margin-top: 12px;">
                    <p class="hint"><i data-lucide="lock"></i> Telegram-уведомления доступны в Premium и Ultra тарифах.</p>
                    <button id="upgrade-to-premium-telegram" class="secondary-btn"><i data-lucide="crown"></i> Активировать Premium</button>
                </div>
            `;
            const upgradeBtn = document.getElementById('upgrade-to-premium-telegram');
            if (upgradeBtn) upgradeBtn.onclick = () => App.modules.showUpgradeModal();
        }
        App.initIcons();
    }

    // Обработчики уведомлений (только один раз)
    if (!settingsListenersAttached) {
        const saveBtn = document.getElementById('save-settings-btn');
        if (saveBtn) saveBtn.addEventListener('click', App.ui.pages.saveSettings);

        const subPushBtn = document.getElementById('subscribe-push-btn');
        if (subPushBtn) {
            subPushBtn.addEventListener('click', async function() {
                if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                    App.ui.alertModal('Push-уведомления не поддерживаются вашим браузером.');
                    return;
                }
                Notification.requestPermission().then(async function(perm) {
                    if (perm === 'granted') {
                        let token = '';
                        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                            try {
                                const messaging = firebase.messaging();
                                if (messaging && typeof messaging.getToken === 'function') {
                                    const fbToken = await messaging.getToken();
                                    if (fbToken) token = fbToken;
                                }
                            } catch(err) { console.warn(err); }
                        }
                        await App.ui.pages.savePushSubscription(token);
                        App.toast('Подписка на push оформлена', 'success');
                    } else {
                        App.toast('Нет разрешения на уведомления', 'warning');
                    }
                });
            });
        }
        const unsubPushBtn = document.getElementById('unsubscribe-push-btn');
        if (unsubPushBtn) {
            unsubPushBtn.addEventListener('click', async function() {
                await App.ui.pages.removePushSubscription();
                App.toast('Подписка на push отключена', 'success');
            });
        }
        settingsListenersAttached = true;
    }

    // 2. PIN
    if (typeof App.ui.pages.renderPinSettings === 'function') {
        await App.ui.pages.renderPinSettings();
    }

    // 3. Аккордеон
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

    // Инициализация аккордеона
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

    App.initIcons();
};

// ==================== ОСТАЛЬНЫЕ ФУНКЦИИ (экспорт, резервные коды, PIN и т.д.) ====================
App.ui.pages.initRecoveryCodesUI = function() {
    var showBtn = document.getElementById('show-recovery-btn');
    var genBtn = document.getElementById('gen-new-codes-btn');
    if (!showBtn || !genBtn) return;

    const newShowBtn = showBtn.cloneNode(true);
    const newGenBtn = genBtn.cloneNode(true);
    showBtn.parentNode.replaceChild(newShowBtn, showBtn);
    genBtn.parentNode.replaceChild(newGenBtn, genBtn);
    showBtn = newShowBtn;
    genBtn = newGenBtn;

    showBtn.addEventListener('click', async function() {
        var { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        var { data: codes } = await App.supabase.from('recovery_codes')
            .select('code_hash, used')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        var unused = codes.filter(c => !c.used);
        var listEl = document.getElementById('recovery-codes-list');
        if (!listEl) return;
        if (unused.length === 0) {
            listEl.innerHTML = '<p class="hint">Все коды использованы. Сгенерируйте новые.</p>';
            return;
        }
        listEl.innerHTML = '<p>Неиспользованные коды:</p><ul>' +
            unused.map(c => '<li>' + c.code_hash + '</li>').join('') + '</ul>';
    });

    genBtn.addEventListener('click', async function() {
        var { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        const confirmed = await App.ui.confirmModalAsync('Старые коды будут удалены. Продолжить?');
        if (!confirmed) return;
        await App.supabase.from('recovery_codes').delete().eq('user_id', user.id);
        var codes = [];
        for (var i = 0; i < 8; i++) {
            var code = Array.from({length: 8}, () => Math.floor(Math.random() * 10)).join('');
            codes.push(code);
            await App.supabase.from('recovery_codes').insert({ user_id: user.id, code_hash: code });
        }
        App.ui.alertModal('Новые коды:\n\n' + codes.join('\n'));
        showBtn.click();
    });
};

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

    if (hasPin) {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="lock"></i> Быстрый вход по PIN</h3>
                <p>PIN-код установлен. Вы можете сбросить его.</p>
                <button id="pin-reset-btn" class="secondary-btn">Сбросить PIN</button>
            </div>
        `;
        document.getElementById('pin-reset-btn')?.addEventListener('click', async () => {
            if (await App.ui.confirmModalAsync('Сбросить PIN? Придётся заново вводить мастер-пароль.')) {
                await App.localAuth.resetPin();
                App.ui.pages.renderPinSettings();
                App.toast('PIN сброшен', 'success');
            }
        });
    } else {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="fingerprint"></i> Быстрый вход по PIN</h3>
                <p>Установите PIN-код (4+ цифр), чтобы не вводить мастер-пароль при каждом запуске.</p>
                <button id="pin-setup-btn" class="primary-btn">Установить PIN</button>
            </div>
        `;
        document.getElementById('pin-setup-btn')?.addEventListener('click', async () => {
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
                const pin = await App.ui.promptModalAsync('Установите PIN-код (минимум 4 цифры)', '');
                if (pin && pin.length >= 4 && /^\d+$/.test(pin)) {
                    const confirmPin = await App.ui.promptModalAsync('Подтвердите PIN-код', '');
                    if (confirmPin === pin) {
                        try {
                            await App.localAuth.setPin(pin, masterPassword);
                            App.toast('PIN-код сохранён', 'success');
                            App.ui.pages.renderPinSettings();
                            pinSet = true;
                        } catch (err) {
                            App.toast('Ошибка: ' + err.message, 'error');
                        }
                    } else {
                        App.toast('PIN-коды не совпадают', 'error');
                    }
                } else {
                    App.toast('PIN должен содержать минимум 4 цифры', 'error');
                }
            }
        });
    }
    App.initIcons();
};

// Заглушка
App.ui.pages.subscribeToPush = function() {};

// ==================== ЭКСПОРТ ====================
App.ui.pages.openPhotoFolder = function() {
    App.toast('Фотографии теперь хранятся в Supabase Storage', 'info');
};

App.ui.pages.shareTable = function() {
    window.open('https://docs.google.com/spreadsheets/d/' + App.store.spreadsheetId + '/edit', '_blank');
};

App.ui.pages.handleExport = function() {
    var type = document.getElementById('export-type-select')?.value || 'to';
    var format = document.getElementById('export-format-select')?.value || 'csv';

    if (format === 'csv') {
        var exportData = App.ui.pages.getExportData(type);
        if (exportData && exportData.data) {
            App.ui.pages.exportToCSV(exportData.data, exportData.filename, exportData.headers);
        }
    } else if (format === 'xlsx') {
        if (type === 'all') {
            App.ui.pages.exportToExcelAll();
        } else {
            App.ui.pages.exportToExcelForType(type);
        }
    }
};

App.ui.pages.getExportData = function(type) {
    switch (type) {
        case 'to':
            return {
                data: App.store.operations.map(function(op) {
                    return [op.category, op.name, op.lastDate || '', op.lastMileage || '', op.lastMotohours || '', op.intervalKm, op.intervalMonths, op.intervalMotohours ?? ''];
                }),
                headers: ['Категория', 'Операция', 'Последняя дата', 'Последний пробег', 'Последние моточасы', 'Интервал км', 'Интервал мес', 'Интервал м/ч'],
                filename: 'vesta_operations'
            };
        case 'fuel':
            return {
                data: App.store.fuelLog.map(function(f) {
                    return [f.date, f.mileage, f.liters, f.pricePerLiter, (f.fullTank === 'TRUE' || f.fullTank === true) ? 'Да' : 'Нет', f.fuelType, f.notes || ''];
                }),
                headers: ['Дата', 'Пробег', 'Литры', 'Цена/л', 'Полный бак', 'Тип топлива', 'Примечание'],
                filename: 'vesta_fuel'
            };
        case 'tires':
            return {
                data: App.store.tireLog.map(function(t) {
                    return [t.date, t.type, t.mileage, t.model || '', t.size || '', t.wear || '', t.notes || '', t.purchaseCost || '', t.mountCost || '', t.isDIY ? 'Да' : 'Нет'];
                }),
                headers: ['Дата', 'Тип', 'Пробег', 'Модель', 'Размер', 'Износ', 'Примечание', 'Стоимость покупки', 'Стоимость монтажа', 'DIY'],
                filename: 'vesta_tires'
            };
        case 'parts':
            return {
                data: App.store.parts.map(function(p) {
                    return [p.operation, p.oem, p.analog, p.price, p.supplier, p.link, p.comment, p.inStock || 0, p.location || ''];
                }),
                headers: ['Операция', 'OEM', 'Аналог', 'Цена', 'Поставщик', 'Ссылка', 'Комментарий', 'В наличии (шт.)', 'Место хранения'],
                filename: 'vesta_parts'
            };
        case 'history':
            var filtered = App.ui.pages.getFilteredHistory();
            return {
                data: filtered.map(function(record) {
                    var op = App.store.operations.find(function(o) { return o.id == record.operation_id; });
                    return [record.date || '', op ? op.name : 'Неизвестно', record.mileage || '', record.motohours || '', record.parts_cost || '', record.work_cost || '', record.notes || '', (record.is_diy === 'TRUE' || record.is_diy === true) ? 'Да' : 'Нет'];
                }),
                headers: ['Дата', 'Операция', 'Пробег', 'Моточасы', 'Запчасти (₽)', 'Работа (₽)', 'Примечание', 'DIY'],
                filename: 'vesta_history'
            };
        case 'all':
            App.toast('Функция "Все данные" скачает несколько файлов по очереди.', 'info');
            var types = ['to', 'fuel', 'tires', 'parts', 'history'];
            types.forEach(function(t) {
                var d = App.ui.pages.getExportData(t);
                if (d && d.data.length) App.ui.pages.exportToCSV(d.data, d.filename, d.headers);
            });
            return null;
        default:
            return null;
    }
};

App.ui.pages.exportToCSV = function(data, filename, headers) {
    if (!data || data.length === 0) {
        App.toast('Нет данных для экспорта', 'warning');
        return;
    }
    var csvRows = [];
    if (headers) csvRows.push(headers.join(';'));
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var values = row.map(function(cell) {
            var cellStr = String(cell ?? '').replace(/"/g, '""');
            if (cellStr.indexOf(';') !== -1 || cellStr.indexOf('\n') !== -1 || cellStr.indexOf('"') !== -1) {
                return '"' + cellStr + '"';
            }
            return cellStr;
        });
        csvRows.push(values.join(';'));
    }
    var blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename + '_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    App.toast('Экспорт CSV выполнен', 'success');
};

App.ui.pages.exportToExcelForType = function(type) {
    var wsData, sheetName;
    switch (type) {
        case 'to':
            wsData = XLSX.utils.json_to_sheet(App.store.operations.map(function(op) {
                return { 'Категория': op.category, 'Операция': op.name, 'Последняя дата': op.lastDate || '', 'Последний пробег': op.lastMileage || '', 'Последние моточасы': op.lastMotohours || '', 'Интервал км': op.intervalKm || '', 'Интервал мес': op.intervalMonths || '', 'Интервал м/ч': op.intervalMotohours || '' };
            }));
            sheetName = 'Журнал ТО';
            break;
        case 'fuel':
            wsData = XLSX.utils.json_to_sheet(App.store.fuelLog.map(function(f) {
                return { 'Дата': f.date, 'Пробег': f.mileage, 'Литры': f.liters, 'Цена/л': f.pricePerLiter, 'Полный бак': (f.fullTank === 'TRUE' || f.fullTank === true) ? 'Да' : 'Нет', 'Тип топлива': f.fuelType || 'Бензин', 'Примечание': f.notes || '' };
            }));
            sheetName = 'Топливо';
            break;
        case 'tires':
            wsData = XLSX.utils.json_to_sheet(App.store.tireLog.map(function(t) {
                return { 'Дата': t.date, 'Тип': t.type, 'Пробег': t.mileage, 'Модель': t.model || '', 'Размер': t.size || '', 'Износ': t.wear || '', 'Примечание': t.notes || '', 'Стоимость покупки': t.purchaseCost || '', 'Стоимость монтажа': t.mountCost || '', 'DIY': t.isDIY ? 'Да' : 'Нет' };
            }));
            sheetName = 'Шины';
            break;
        case 'parts':
            wsData = XLSX.utils.json_to_sheet(App.store.parts.map(function(p) {
                return { 'Операция': p.operation, 'OEM': p.oem, 'Аналог': p.analog, 'Цена': p.price, 'Поставщик': p.supplier, 'Ссылка': p.link, 'Комментарий': p.comment, 'В наличии (шт.)': p.inStock || 0, 'Место хранения': p.location || '' };
            }));
            sheetName = 'Запчасти';
            break;
        case 'history':
            wsData = XLSX.utils.json_to_sheet(App.ui.pages.getFilteredHistory().map(function(record) {
                var op = App.store.operations.find(function(o) { return o.id == record.operation_id; });
                return { 'Дата': record.date || '', 'Операция': op ? op.name : 'Неизвестно', 'Пробег': record.mileage || '', 'Моточасы': record.motohours || '', 'Запчасти (₽)': record.parts_cost || '', 'Работа (₽)': record.work_cost || '', 'DIY': (record.is_diy === 'TRUE' || record.is_diy === true) ? 'Да' : 'Нет', 'Примечание': record.notes || '' };
            }));
            sheetName = 'История ТО';
            break;
        default:
            return false;
    }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsData, sheetName);
    var fileName = 'vesta_' + sheetName + '_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.xlsx';
    XLSX.writeFile(wb, fileName);
    return true;
};

App.ui.pages.exportToExcelAll = function() {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.operations.map(function(op) { return { 'Категория': op.category, 'Операция': op.name, 'Последняя дата': op.lastDate || '', 'Последний пробег': op.lastMileage || '', 'Последние моточасы': op.lastMotohours || '', 'Интервал км': op.intervalKm || '', 'Интервал мес': op.intervalMonths || '', 'Интервал м/ч': op.intervalMotohours || '' }; })), 'Журнал ТО');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.parts.map(function(p) { return { 'Операция': p.operation, 'OEM': p.oem, 'Аналог': p.analog, 'Цена': p.price, 'Поставщик': p.supplier, 'Ссылка': p.link, 'Комментарий': p.comment, 'В наличии (шт.)': p.inStock || 0, 'Место хранения': p.location || '' }; })), 'Запчасти');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.fuelLog.map(function(f) { return { 'Дата': f.date, 'Пробег': f.mileage, 'Литры': f.liters, 'Цена/л': f.pricePerLiter, 'Полный бак': (f.fullTank === 'TRUE' || f.fullTank === true) ? 'Да' : 'Нет', 'Тип топлива': f.fuelType || 'Бензин', 'Примечание': f.notes || '' }; })), 'Топливо');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.tireLog.map(function(t) { return { 'Дата': t.date, 'Тип': t.type, 'Пробег': t.mileage, 'Модель': t.model || '', 'Размер': t.size || '', 'Износ': t.wear || '', 'Примечание': t.notes || '', 'Стоимость покупки': t.purchaseCost || '', 'Стоимость монтажа': t.mountCost || '', 'DIY': t.isDIY ? 'Да' : 'Нет' }; })), 'Шины');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.ui.pages.getFilteredHistory().map(function(rec) { var op = App.store.operations.find(function(o) { return o.id == rec.operation_id; }); return { 'Дата': rec.date || '', 'Операция': op ? op.name : 'Неизвестно', 'Пробег': rec.mileage || '', 'Моточасы': rec.motohours || '', 'Запчасти (₽)': rec.parts_cost || '', 'Работа (₽)': rec.work_cost || '', 'DIY': (rec.is_diy === 'TRUE' || rec.is_diy === true) ? 'Да' : 'Нет', 'Примечание': rec.notes || '' }; })), 'История');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.mileageHistory.map(function(m) { return { 'Дата': m.date, 'Пробег': m.mileage, 'Моточасы': m.motohours || '' }; })), 'Пробег');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Пробег': App.store.settings.currentMileage, 'Моточасы': App.store.settings.currentMotohours, 'Ср. пробег/день': App.store.settings.avgDailyMileage, 'Ср. моточасы/день': App.store.settings.avgDailyMotohours, 'Способ уведомлений': App.store.settings.notificationMethod || 'telegram', 'Базовый пробег': App.store.baseMileage, 'Базовые моточасы': App.store.baseMotohours, 'Дата покупки': App.store.purchaseDate }]), 'Настройки');
    var fileName = 'vesta_backup_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.xlsx';
    XLSX.writeFile(wb, fileName);
    App.toast('Экспорт в Excel выполнен', 'success');
};

App.ui.pages.generateServiceReport = function() {
    if (typeof html2pdf === 'undefined') {
        App.toast('Библиотека html2pdf не загружена', 'error');
        return;
    }
    var totalMaintenance = App.store.serviceRecords.reduce(function(s, r) { return s + (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0); }, 0);
    var totalFuel = App.store.fuelLog.reduce(function(s, f) { return s + (f.liters * f.pricePerLiter); }, 0);
    var totalCost = totalMaintenance + totalFuel;
    var avgCostPerKm = App.store.settings.currentMileage ? totalCost / App.store.settings.currentMileage : 0;
    var reportHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Сервисная история</title><style>body{font-family:sans-serif;margin:20px}h1{color:#3498db}h2{border-bottom:1px solid #ccc}table{width:100%;border-collapse:collapse;margin-bottom:20px}td,th{border:1px solid #ddd;padding:8px}th{background:#f2f2f2}.stat-card{display:inline-block;background:#f9f9f9;padding:10px;margin:5px;border-radius:8px}</style></head><body><h1>Сервисная история</h1><p><strong>Дата:</strong>' + new Date().toLocaleDateString('ru-RU') + '</p><p><strong>Пробег:</strong>' + App.store.settings.currentMileage.toLocaleString() + ' км</p><h2>Расходы</h2><div>' +
        '<div class="stat-card">ТО: ' + totalMaintenance.toFixed(2) + ' ₽</div><div class="stat-card">Топливо: ' + totalFuel.toFixed(2) + ' ₽</div><div class="stat-card">Всего: ' + totalCost.toFixed(2) + ' ₽</div><div class="stat-card">1 км: ' + avgCostPerKm.toFixed(2) + ' ₽</div></div><h2>Операции</h2><table><thead><tr><th>Категория</th><th>Операция</th><th>Интервал км</th><th>Интервал мес</th><th>Последнее ТО</th><th>Последний пробег</th></tr></thead><tbody>';
    App.store.operations.forEach(function(op) { reportHtml += '<tr><td>' + App.utils.escapeHtml(op.category) + '</td><td>' + App.utils.escapeHtml(op.name) + '</td><td>' + (op.intervalKm || '—') + '</td><td>' + (op.intervalMonths || '—') + '</td><td>' + (op.lastDate || '—') + '</td><td>' + (op.lastMileage || '—') + '</td></tr>'; });
    reportHtml += '</tbody></table><h2>История ТО</h2><table><thead><tr><th>Дата</th><th>Операция</th><th>Пробег</th><th>Запчасти</th><th>Работа</th><th>DIY</th><th>Прим.</th></tr></thead><tbody>';
    App.store.serviceRecords.sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(rec){ var op=App.store.operations.find(function(o){return o.id==rec.operation_id;}); reportHtml+='<tr><td>'+ (rec.date||'')+'</td><td>'+ App.utils.escapeHtml(op?op.name:'Неизвестно')+'</td><td>'+ (rec.mileage||'')+'</td><td>'+ (rec.parts_cost||'0')+'</td><td>'+ (rec.work_cost||'0')+'</td><td>'+ (rec.is_diy===true?'Да':'Нет')+'</td><td>'+ (rec.notes||'')+'</td></tr>'; });
    reportHtml += '</tbody></table></body></html>';
    var element = document.createElement('div');
    element.innerHTML = reportHtml;
    document.body.appendChild(element);
    html2pdf().from(element).set({
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: 'servisnaya_istoriya_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).save().finally(function() {
        document.body.removeChild(element);
    });
};

App.ui.pages.forceSync = function() {
    App.toast('Данные уже синхронизированы с Supabase', 'info');
};

// ==================== РЕЗЕРВНЫЕ КОДЫ ====================
App.ui.pages.initRecoveryCodesUI = function() {
    var showBtn = document.getElementById('show-recovery-btn');
    var genBtn = document.getElementById('gen-new-codes-btn');
    if (!showBtn || !genBtn) return;

    showBtn.addEventListener('click', async function() {
        var { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        var { data: codes } = await App.supabase.from('recovery_codes')
            .select('code_hash, used')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        var unused = codes.filter(c => !c.used);
        var listEl = document.getElementById('recovery-codes-list');
        if (!listEl) return;
        if (unused.length === 0) {
            listEl.innerHTML = '<p class="hint">Все коды использованы. Сгенерируйте новые.</p>';
            return;
        }
        listEl.innerHTML = '<p>Неиспользованные коды:</p><ul>' +
            unused.map(c => '<li>' + c.code_hash + '</li>').join('') + '</ul>';
    });

    genBtn.addEventListener('click', async function() {
        var { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        App.ui.confirmModalAsync('Старые коды будут удалены. Продолжить?').then(async function(confirmed) {
            if (!confirmed) return;
            await App.supabase.from('recovery_codes').delete().eq('user_id', user.id);
            var codes = [];
            for (var i = 0; i < 8; i++) {
                var code = Array.from({length: 8}, () => Math.floor(Math.random() * 10)).join('');
                codes.push(code);
                await App.supabase.from('recovery_codes').insert({ user_id: user.id, code_hash: code });
            }
            App.ui.alertModal('Новые коды:\n\n' + codes.join('\n'));
            document.getElementById('show-recovery-btn').click();
        });
    });
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
            activateBtn.onclick = async () => {
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
            deactivateBtn.onclick = async () => {
                await App.premium.deactivateDevice();
                window.location.reload();
            };
        }
    }
    App.initIcons();
};

// ==================== PIN-код (быстрый вход) ====================
App.ui.pages.renderPinSettings = async function() {
    const container = document.getElementById('pin-settings-container');
    if (!container) return;
    
     if (!App.db || !App.db._db) {
        // База данных ещё не инициализирована – ждём и пробуем снова через 500 мс
        console.log('[PIN] Database not ready, retrying in 500ms');
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

    if (hasPin) {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="lock"></i> Быстрый вход по PIN</h3>
                <p>PIN-код установлен. Вы можете сбросить его.</p>
                <button id="pin-reset-btn" class="secondary-btn">Сбросить PIN</button>
            </div>
        `;
        document.getElementById('pin-reset-btn')?.addEventListener('click', async () => {
            if (await App.ui.confirmModalAsync('Сбросить PIN? Придётся заново вводить мастер-пароль.')) {
                await App.localAuth.resetPin();
                App.ui.pages.renderPinSettings();
                App.toast('PIN сброшен', 'success');
            }
        });
    } else {
        container.innerHTML = `
            <div class="card">
                <h3><i data-lucide="fingerprint"></i> Быстрый вход по PIN</h3>
                <p>Установите PIN-код (4+ цифр), чтобы не вводить мастер-пароль при каждом запуске.</p>
                <button id="pin-setup-btn" class="primary-btn">Установить PIN</button>
            </div>
        `;
        document.getElementById('pin-setup-btn')?.addEventListener('click', async () => {
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
                const pin = await App.ui.promptModalAsync('Установите PIN-код (минимум 4 цифры)', '');
                if (pin && pin.length >= 4 && /^\d+$/.test(pin)) {
                    const confirmPin = await App.ui.promptModalAsync('Подтвердите PIN-код', '');
                    if (confirmPin === pin) {
                        try {
                            await App.localAuth.setPin(pin, masterPassword);
                            App.toast('PIN-код сохранён', 'success');
                            App.ui.pages.renderPinSettings();
                            pinSet = true;
                        } catch (err) {
                            App.toast('Ошибка: ' + err.message, 'error');
                        }
                    } else {
                        App.toast('PIN-коды не совпадают', 'error');
                    }
                } else {
                    App.toast('PIN должен содержать минимум 4 цифры', 'error');
                }
            }
        });
    }
    App.initIcons();
};

// Инициализация UI
if (document.getElementById('tab-settings')) {
    App.ui.pages.initRecoveryCodesUI();
}