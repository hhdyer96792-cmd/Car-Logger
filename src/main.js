// src/main.js
// ===== Полифил crypto.randomUUID для старых браузеров =====
(function() {
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
        crypto.randomUUID = function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };
    }
})();

(function() {
    let isLoggedIn = false;
    let deferredPrompt = null;
    let authSubscribed = false;
    let isDemoMode = false;
    let demoModeInitialized = false;
    let dbInitialized = false;
    let syncInterval = null;
    let premiumCheckInterval = null;

    const sidebarLoginBtn = document.getElementById('sidebar-login');
    const drawerLoginBtn = document.getElementById('drawer-login');

    function setInstallButtonVisible(visible) {
        const installBtn = document.getElementById('pwa-install-btn');
        if (!installBtn) return;
        if (window.matchMedia('(display-mode: standalone)').matches) {
            installBtn.style.display = 'none';
            return;
        }
        installBtn.style.display = (visible && deferredPrompt) ? 'block' : 'none';
    }

    function updateUsernameDisplay(username) {
        const displayEl = document.getElementById('username-display');
        const sidebarUsernameEl = document.getElementById('sidebar-username');
        let name = username || '';
        if (!name) {
            name = localStorage.getItem('vesta_username') || '';
        }
        if (displayEl) displayEl.innerHTML = name ? `<i data-lucide="user"></i> ${name}` : '';
        if (sidebarUsernameEl) sidebarUsernameEl.innerHTML = name ? `<i data-lucide="user"></i> ${name}` : '';
        App.initIcons();
    }

    function clearDemoArtefacts() {
        console.log('[DEBUG] clearDemoArtefacts: очистка демо-данных');
        App.store.operations = [];
        App.store.fuelLog = [];
        App.store.tireLog = [];
        App.store.parts = [];
        App.store.serviceRecords = [];
        App.store.mileageHistory = [];
        App.store.cars = [];
        App.store.activeCarId = null;
        localStorage.removeItem('vesta_active_car_id');
        localStorage.removeItem('vesta_username');
        if (App.db && App.db._db) {
            const stores = ['operations', 'fuel_log', 'tires', 'parts', 'service_records', 'mileage_log', 'cars', 'settings'];
            stores.forEach(store => App.db.clear(store).catch(e => console.warn(`[DEBUG] Ошибка очистки ${store}:`, e)));
        }
        demoModeInitialized = false;
        isDemoMode = false;
    }

    function enterDemoMode() {
        if (demoModeInitialized) return;
        demoModeInitialized = true;
        isDemoMode = true;
        clearDemoArtefacts();

        const demoCarId = crypto.randomUUID();
        App.store.cars = [{ id: demoCarId, name: 'Мой автомобиль', user_id: 'demo' }];
        App.store.activeCarId = demoCarId;
        localStorage.setItem('vesta_active_car_id', demoCarId);

        App.store.operations = [
            { id: 'demo1', category: 'ДВС', name: 'Масло', intervalKm: 10000, intervalMonths: 12, lastMileage: 0, lastDate: null },
            { id: 'demo2', category: 'Тормозная система', name: 'Тормозные колодки', intervalKm: 30000, lastMileage: 0 }
        ];
        App.store.fuelLog = [
            { date: new Date().toISOString().split('T')[0], mileage: 1000, liters: 45, pricePerLiter: 50, fuelType: 'Бензин' }
        ];
        App.store.settings = {
            currentMileage: 5000,
            currentMotohours: 100,
            avgDailyMileage: 45,
            avgDailyMotohours: 1.8,
            telegramToken: '',
            telegramChatId: '',
            notificationMethod: 'telegram',
            reminderDays: '7,2',
            carBrand: '',
            carModel: '',
            carYear: null,
            plateNumber: '',
            vin: ''
        };

        if (App.realtime && typeof App.realtime.unsubscribeAll === 'function') {
            App.realtime.unsubscribeAll();
        }
        App.store.saveToLocalStorage();
        if (App.db && App.db._db) {
            App.store.saveSettingsToDB().catch(console.warn);
        }

        const dataPanel = document.getElementById('data-panel');
        if (dataPanel) dataPanel.style.display = 'block';

        if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
        if (typeof App.renderAll === 'function') App.renderAll();
        if (typeof App.toast === 'function') App.toast('Демо-режим. Войдите, чтобы сохранить данные.', 'info');
    }

    function initAuthFormEvents(container) {
        const tabLogin = container.querySelector('#tab-login');
        const tabSocial = container.querySelector('#tab-social');
        const authLoginDiv = container.querySelector('#auth-login');
        const authSocialDiv = container.querySelector('#auth-social');
        if (tabLogin) {
            tabLogin.addEventListener('click', () => {
                tabLogin.classList.add('active');
                tabSocial.classList.remove('active');
                authLoginDiv.style.display = 'block';
                authSocialDiv.style.display = 'none';
            });
        }
        if (tabSocial) {
            tabSocial.addEventListener('click', () => {
                tabSocial.classList.add('active');
                tabLogin.classList.remove('active');
                authSocialDiv.style.display = 'block';
                authLoginDiv.style.display = 'none';
            });
        }

        const googleBtn = container.querySelector('#supabase-auth-btn');
        if (googleBtn) {
            googleBtn.addEventListener('click', () => {
                const redirectUrl = window.location.origin + window.location.pathname;
                App.supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: redirectUrl }
                }).catch(err => {
                    console.error('Google OAuth error:', err);
                    App.toast('Ошибка входа через Google: ' + err.message, 'error');
                });
            });
        }

        const loginForm = container.querySelector('#login-form');
        const loginMessage = container.querySelector('#login-message');
        const passwordConfirmLabel = container.querySelector('#password-confirm-label');
        const passwordConfirmInput = container.querySelector('#password-confirm-input');
        const modal = container.closest('.modal');

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(loginForm);
                const username = (formData.get('username') || '').toString().trim();
                const password = formData.get('password') || '';
                if (!username || !password) {
                    App.toast('Введите логин и пароль', 'error');
                    return;
                }
                const email = username + '@vesta.internal';
                const { error } = await App.supabase.auth.signInWithPassword({ email, password });
                if (error) {
                    if (loginMessage) loginMessage.textContent = 'Неверный логин или пароль.';
                    App.toast('Ошибка входа: ' + error.message, 'error');
                } else {
                    if (modal) modal.remove();
                    document.body.classList.remove('auth-modal-open');
                    App.toast('Вход выполнен', 'success');
                }
            });

            const signUpBtn = container.querySelector('#login-sign-up-btn');
            if (signUpBtn) {
                signUpBtn.addEventListener('click', async () => {
                    if (passwordConfirmLabel) passwordConfirmLabel.style.display = 'block';
                    if (passwordConfirmInput) {
                        passwordConfirmInput.style.display = 'block';
                        passwordConfirmInput.required = true;
                    }

                    const formData = new FormData(loginForm);
                    const username = (formData.get('username') || '').toString().trim();
                    const password = formData.get('password') || '';
                    const passwordConfirm = formData.get('password_confirm') || '';
                    if (!username || !password || !passwordConfirm) {
                        App.toast('Все поля обязательны', 'error');
                        return;
                    }
                    if (password !== passwordConfirm) {
                        App.toast('Пароли не совпадают', 'error');
                        return;
                    }
                    if (password.length < 6) {
                        App.toast('Пароль должен содержать минимум 6 символов', 'error');
                        return;
                    }

                    const email = username + '@vesta.internal';
                    const { data, error } = await App.supabase.auth.signUp({
                        email,
                        password,
                        options: { data: { username } }
                    });
                    if (error) {
                        App.toast('Ошибка регистрации: ' + error.message, 'error');
                        return;
                    }
                    if (data.session) {
                        if (modal) modal.remove();
                        document.body.classList.remove('auth-modal-open');
                        App.toast('Регистрация успешна! Выполнен вход.', 'success');
                        if (data.user && typeof window.generateAndShowRecoveryCodes === 'function') {
                            await window.generateAndShowRecoveryCodes(data.user.id, username);
                        }
                    } else {
                        App.toast('Регистрация успешна! Подтвердите email, чтобы войти.', 'info');
                        if (modal) modal.remove();
                        document.body.classList.remove('auth-modal-open');
                    }
                    loginForm.reset();
                    if (passwordConfirmInput) {
                        passwordConfirmInput.style.display = 'none';
                        passwordConfirmInput.required = false;
                    }
                    if (passwordConfirmLabel) passwordConfirmLabel.style.display = 'none';
                    if (loginMessage) loginMessage.textContent = '';
                });
            }
        }

        const forgotLink = container.querySelector('#forgot-access-link');
        const recoveryBlock = container.querySelector('#recovery-options');
        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (recoveryBlock) recoveryBlock.style.display = 'block';
            });
        }

        const btnTelegram = container.querySelector('#recover-telegram');
        if (btnTelegram) btnTelegram.addEventListener('click', () => window.recoverViaTelegram());

        const btnCode = container.querySelector('#recover-code');
        if (btnCode) btnCode.addEventListener('click', () => window.recoverViaRecoveryCode());

        const btnRecoverGoogle = container.querySelector('#recover-google');
        if (btnRecoverGoogle) {
            btnRecoverGoogle.addEventListener('click', () => {
                const redirectUrl = window.location.origin + window.location.pathname;
                App.supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: redirectUrl }
                });
            });
        }
    }

    function openAuthModal() {
        const template = document.getElementById('auth-template');
        if (!template) {
            console.error('Шаблон auth-template не найден');
            return;
        }
        const content = template.content.cloneNode(true);
        if (typeof App.ui.createModal !== 'function') {
            console.error('App.ui.createModal не определён');
            return;
        }
        const modal = App.ui.createModal('Аккаунт', '');
        if (!modal) return;
        const modalContent = modal.querySelector('.modal-content');
        if (!modalContent) return;
        modalContent.appendChild(content);
        document.body.classList.add('auth-modal-open');
        initAuthFormEvents(modalContent);
        const closeBtn = modalContent.querySelector('.close');
        if (closeBtn) closeBtn.onclick = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        modal.style.display = 'flex';
        if (typeof App.initIcons === 'function') App.initIcons();
    }

    async function doLogout() {
        console.log('[DEBUG] doLogout вызвана');
        App.store.operations = [];
        App.store.fuelLog = [];
        App.store.tireLog = [];
        App.store.parts = [];
        App.store.serviceRecords = [];
        App.store.mileageHistory = [];
        App.store.cars = [];
        App.store.activeCarId = null;
        localStorage.removeItem('vesta_active_car_id');
        localStorage.removeItem('vesta_username');

        if (App.db && App.db._db) {
            const stores = ['operations', 'fuel_log', 'tires', 'parts', 'service_records', 'mileage_log', 'cars'];
            for (const store of stores) {
                try {
                    await App.db.clear(store);
                } catch (e) {
                    console.warn(`[DEBUG] Ошибка очистки ${store}:`, e);
                }
            }
        }

        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
        if (premiumCheckInterval) {
            clearInterval(premiumCheckInterval);
            premiumCheckInterval = null;
        }

        console.log('[DEBUG] doLogout: вызываем signOut()');
        try {
            const signOutPromise = App.supabase.auth.signOut();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 3000));
            await Promise.race([signOutPromise, timeoutPromise]);
            console.log('[DEBUG] signOut() выполнен успешно');
        } catch (err) {
            console.error('[DEBUG] Ошибка signOut:', err);
        }

        isLoggedIn = false;
        setInstallButtonVisible(false);
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
        if (drawerLoginBtn) drawerLoginBtn.style.display = '';
        if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        if (typeof App.supa !== 'undefined' && App.supa.clearUserIdCache) App.supa.clearUserIdCache();

        localStorage.removeItem('supabase.auth.token');
        localStorage.removeItem('sb-auth-token');
        sessionStorage.clear();
        window.location.reload();
    }

    async function forceLoadDataFromSupabase() {
        console.log('[DEBUG] forceLoadDataFromSupabase: загрузка данных напрямую из Supabase');
        const carId = App.store.activeCarId;
        if (!carId) {
            console.warn('[DEBUG] Нет активного автомобиля, пропускаем загрузку');
            return;
        }
        try {
            const [operations, fuelLog, tireLog, parts, history, mileageHistory, settings] = await Promise.all([
                App.supa.loadOperations(),
                App.supa.loadFuelLog(),
                App.supa.loadTires(),
                App.supa.loadParts(),
                App.supa.loadHistory(),
                App.supa.loadMileageHistory(),
                App.supa.loadSettings()
            ]);

            console.log(`[DEBUG] Загружено: operations=${operations.length}, fuel=${fuelLog.length}, parts=${parts.length}, history=${history.length}`);

            App.store.operations = operations;
            App.store.fuelLog = fuelLog;
            App.store.tireLog = tireLog;
            App.store.parts = parts;
            App.store.serviceRecords = history;
            App.store.mileageHistory = mileageHistory;
            if (settings) Object.assign(App.store.settings, settings);

            for (const op of operations) await App.store.saveOperationToDB({ ...op, car_id: carId });
            for (const f of fuelLog) await App.store.saveFuelRecordToDB({ ...f, car_id: carId });
            for (const t of tireLog) await App.store.saveTireRecordToDB({ ...t, car_id: carId });
            for (const p of parts) await App.store.savePartToDB({ ...p, car_id: carId });
            for (const h of history) await App.store.saveHistoryRecordToDB({ ...h, car_id: carId });
            for (const m of mileageHistory) await App.store.saveMileageRecordToDB({ ...m, car_id: carId });
            if (settings) {
                await App.db.put('car_settings', { ...settings, car_id: carId });
            }

            if (typeof App.renderAll === 'function') App.renderAll();
            App.toast('Данные загружены', 'info');
        } catch (err) {
            console.error('[DEBUG] Ошибка принудительной загрузки:', err);
            App.toast('Не удалось загрузить данные', 'error');
        }
    }

    function setupAuthSubscription() {
        if (authSubscribed) return;
        authSubscribed = true;
        console.log('[DEBUG] setupAuthSubscription: подписка на onAuthStateChange');
        App.supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[DEBUG] onAuthStateChange: event =', event, 'session =', !!session);
            
            let attempts = 0;
            while (!dbInitialized && attempts < 50) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }

           if (session) {
    if (window._processingAuth) return;
    window._processingAuth = true;
    try {
        if (isDemoMode) clearDemoArtefacts();
        isLoggedIn = true;
        setInstallButtonVisible(true);
        isDemoMode = false;
        demoModeInitialized = false;
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';
        if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';
        document.body.classList.remove('auth-modal-open');
        if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        const dataPanel = document.getElementById('data-panel');
        if (dataPanel) dataPanel.style.display = 'block';
        const syncIndicatorOnline = document.getElementById('sync-indicator');
        if (syncIndicatorOnline) syncIndicatorOnline.style.display = '';
        const mobileRowOnline = document.getElementById('mobile-header-row2');
        if (mobileRowOnline) mobileRowOnline.style.display = 'flex';

        // Мастер-пароль / PIN (без изменений) ...
        let masterPassword = null;
        const hasPin = App.localAuth && await App.localAuth.isPinSet();
        if (hasPin) {
            try {
                const pin = await App.ui.promptModalAsync('Быстрый доступ', 'Введите PIN-код', true);
                if (pin) {
                    masterPassword = await App.localAuth.verifyPin(pin);
                    if (masterPassword) {
                        const salt = App.db.encryption.getStoredSalt();
                        const { key } = await App.db.encryption.initMasterKey(masterPassword, salt);
                        App.db.encryption.setMasterKey(key, salt);
                        await App.store.loadFromIndexedDB();
                        if (typeof App.renderAll === 'function') App.renderAll();
                        App.toast('Расшифровка по PIN успешна', 'success');
                    }
                }
            } catch (pinError) {
                console.warn('[DEBUG] PIN error:', pinError.message);
                App.toast(pinError.message, 'error');
            }
        }
        if (!masterPassword) {
            const hasMasterPassword = localStorage.getItem('vesta_master_password_set') === 'true';
            const message = hasMasterPassword ? 'Введите мастер-пароль' : 'Установите мастер-пароль для шифрования данных (запомните его!)';
            const password = await App.ui.promptModalAsync('Мастер-пароль', message, true);
            if (password) {
                const salt = App.db.encryption.getStoredSalt();
                let isValid = false;
                let key, finalSalt;
                if (hasMasterPassword) {
                    isValid = await App.db.encryption.verifyMasterKey(password, salt);
                    if (isValid) {
                        const res = await App.db.encryption.initMasterKey(password, salt);
                        key = res.key;
                        finalSalt = res.salt;
                        App.db.encryption.setMasterKey(key, finalSalt);
                    }
                } else {
                    const res = await App.db.encryption.initMasterKey(password, null);
                    key = res.key;
                    finalSalt = res.salt;
                    App.db.encryption.setMasterKey(key, finalSalt);
                    await App.db.encryption.saveVerificationString(key);
                    localStorage.setItem('vesta_master_password_set', 'true');
                    isValid = true;
                }
                if (isValid) {
                    await App.store.loadFromIndexedDB();
                    if (typeof App.renderAll === 'function') App.renderAll();
                    App.toast(hasMasterPassword ? 'Расшифровка успешна' : 'Мастер-пароль сохранён', 'success');
                    masterPassword = password;
                    if (App.localAuth && App.localAuth.resetPinAttempts) {
                        App.localAuth.resetPinAttempts();
                    }
                } else {
                    App.toast('Неверный мастер-пароль', 'error');
                }
            } else {
                App.toast('Без мастер-пароля чувствительные данные будут недоступны', 'warning');
                // не загружаем данные напрямую, пойдём дальше
            }
        }
        if (masterPassword && !await App.localAuth.isPinSet() && App.localAuth && App.localAuth.isPinSupported()) {
            const wantPin = await App.ui.confirmModalAsync('Настроить быстрый вход по PIN-коду?');
            if (wantPin) {
                let pinSet = false;
                while (!pinSet) {
                    const pin = await App.ui.promptModalAsync('PIN-код', 'Введите 4+ цифры', true);
                    if (pin && pin.length >= 4 && /^\d+$/.test(pin)) {
                        const confirmPin = await App.ui.promptModalAsync('Подтвердите PIN', 'Повторите PIN', true);
                        if (confirmPin === pin) {
                            try {
                                await App.localAuth.setPin(pin, masterPassword);
                                App.toast('PIN сохранён', 'success');
                                pinSet = true;
                            } catch (err) {
                                App.toast('Ошибка: ' + err.message, 'error');
                            }
                        } else {
                            App.toast('PIN не совпадают', 'error');
                        }
                    } else {
                        App.toast('PIN должен быть 4+ цифры', 'error');
                    }
                }
            }
        }

        // ----- ГЛАВНОЕ ИЗМЕНЕНИЕ: сначала получаем автомобили -----
        const { data: { user } } = await App.supabase.auth.getUser();
        const username = user?.user_metadata?.username || user?.email?.split('@')[0] || '';
        if (username) localStorage.setItem('vesta_username', username);
        updateUsernameDisplay(username);

        if (user) {
            let cars = [];
            try {
                const { data, error } = await App.supabase
                    .from('cars')
                    .select('*')
                    .eq('user_id', user.id);
                if (!error && data && data.length > 0) {
                    cars = data;
                }
            } catch (err) {}

            if (cars.length === 0) {
                // Если у пользователя ещё нет машин, создаём одну
                const { data: newCar } = await App.supabase
                    .from('cars')
                    .insert({ name: 'Мой автомобиль', user_id: user.id })
                    .select()
                    .single();
                if (newCar) cars = [newCar];
            }

            if (cars.length > 0) {
                App.store.cars = cars;
                // Устанавливаем активный автомобиль, если ещё не выбран
                if (!App.store.activeCarId || !cars.some(c => c.id === App.store.activeCarId)) {
                    App.store.activeCarId = cars[0].id;
                    localStorage.setItem('vesta_active_car_id', cars[0].id);
                }
                // Сохраняем машины в IndexedDB
                for (const car of cars) {
                    await App.db.put('cars', car).catch(console.warn);
                }
            }

            // Обновляем селектор и вкладку автомобиля
            if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
            if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        }

        // Теперь, когда активный автомобиль точно есть, синхронизируемся и загружаем данные
        if (typeof App.db.sync !== 'undefined' && typeof App.db.sync.processSyncQueue === 'function') {
            await App.db.sync.processSyncQueue();
        }
        if (typeof App.storage !== 'undefined' && typeof App.storage.loadAllData === 'function') {
            await App.storage.loadAllData().catch(err => console.warn('Ошибка loadAllData:', err));
        }
        if (App.store.operations.length === 0) {
            await forceLoadDataFromSupabase();
        }

        // Приглашения, Realtime и прочее
        if (typeof App.ui.pages.checkPendingInvites === 'function') App.ui.pages.checkPendingInvites();
        if (App.store.activeCarId && App.realtime && typeof App.realtime.subscribeToCar === 'function') {
            App.realtime.subscribeToCar(App.store.activeCarId);
        }
        if (typeof App.ui.pages.checkAndShowInitialParamsModal === 'function') {
            App.ui.pages.checkAndShowInitialParamsModal();
        }
        if (typeof App.renderAll === 'function') App.renderAll();
        if (App.premium && typeof App.premium.init === 'function') {
            await App.premium.init();
        }
        console.log('[DEBUG] Обработка входа завершена');
    } finally {
        window._processingAuth = false;
    }
} else {
                console.log('[DEBUG] Пользователь вышел');
                isLoggedIn = false;
                setInstallButtonVisible(false);
                if (typeof App.supa !== 'undefined' && App.supa.clearUserIdCache) App.supa.clearUserIdCache();
                if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
                if (drawerLoginBtn) drawerLoginBtn.style.display = '';
                const dataPanel = document.getElementById('data-panel');
                if (dataPanel) dataPanel.style.display = 'none';
                const syncIndicatorOff = document.getElementById('sync-indicator');
                if (syncIndicatorOff) syncIndicatorOff.style.display = 'none';
                const mobileRowOff = document.getElementById('mobile-header-row2');
                if (mobileRowOff) mobileRowOff.style.display = 'none';
                const carContainerEl = document.getElementById('car-selector-container');
                if (carContainerEl) carContainerEl.innerHTML = '';
                updateUsernameDisplay('');
                if (App.realtime && typeof App.realtime.unsubscribeAll === 'function') App.realtime.unsubscribeAll();
                clearDemoArtefacts();
                if (typeof App.renderAll === 'function') App.renderAll();
                enterDemoMode();
            }
        });
    }

    async function initDatabase() {
        try {
            await App.db.init();
            const migrated = localStorage.getItem('vesta_migrated_to_indexeddb');
            const { data: { session } } = await App.supabase.auth.getSession();
            if (!migrated && session) {
                const confirmMigration = await App.ui.confirmModalAsync('Перенести существующие данные в новую базу? (рекомендуется)');
                if (confirmMigration) {
                    await App.db.migrateFromLocalStorage();
                    localStorage.setItem('vesta_migrated_to_indexeddb', 'true');
                }
            }
            await App.store.loadFromIndexedDB();

            if (session) {
                const isKilled = await App.db.killSwitch.check();
                if (isKilled) {
                    await App.db.killSwitch.destroyLocalDB();
                    return;
                }
                if (typeof App.db.killSwitch.startPeriodicCheck === 'function') App.db.killSwitch.startPeriodicCheck();
            }

            if (navigator.onLine && App.db.sync && typeof App.db.sync.processSyncQueue === 'function') {
                await App.db.sync.processSyncQueue();
            }

            if (syncInterval) clearInterval(syncInterval);
            syncInterval = setInterval(() => {
                if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                    App.db.sync.processSyncQueue().catch(console.error);
                }
            }, 60000);

            dbInitialized = true;
        } catch (err) {
            console.error('[DEBUG] Ошибка инициализации IndexedDB:', err);
            if (typeof App.toast === 'function') {
                App.toast('Не удалось открыть базу данных.', 'error');
            }
            App.store.initFromLocalStorage();
            dbInitialized = true;
        }
    }

    async function handleOnlineSession() {
        if (!navigator.onLine) {
            isLoggedIn = true;
            setInstallButtonVisible(true);
            const dataPanel = document.getElementById('data-panel');
            if (dataPanel) dataPanel.style.display = 'block';
            const syncIndicatorOffline = document.getElementById('sync-indicator');
            if (syncIndicatorOffline) syncIndicatorOffline.style.display = '';
            const mobileRowOffline = document.getElementById('mobile-header-row2');
            if (mobileRowOffline) mobileRowOffline.style.display = 'flex';

            const cachedUsername = localStorage.getItem('vesta_username') || '';
            updateUsernameDisplay(cachedUsername);

            if (typeof App.store !== 'undefined' && typeof App.store.loadCars === 'function') {
                try {
                    await App.store.loadCars();
                } catch (e) { console.warn('Офлайн: ошибка загрузки машин', e); }
                if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                if (typeof App.renderAll === 'function') App.renderAll();
            }
            return;
        }
        if (!authSubscribed) {
            setupAuthSubscription();
        }
    }

    function onReady() {
        document.body.classList.add('no-transition');
        const savedTheme = localStorage.getItem(App.config.THEME_KEY);
        if (savedTheme) App.events.applyTheme(savedTheme);
        else App.events.applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTimeout(() => document.body.classList.remove('no-transition'), 50);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem(App.config.THEME_KEY)) App.events.applyTheme(e.matches ? 'dark' : 'light');
        });

        App.supabase = supabase.createClient(
            'https://qbjlccdqaudyvedpysil.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU',
            {
                auth: {
                    lockAcquireTimeout: 10000,
                    persistSession: true,
                    storageKey: 'sb-auth-token',
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    flowType: 'pkce'
                },
                realtime: {
                    enabled: false
                }
            }
        );

        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(isPersisted => console.log('Persistent storage:', isPersisted ? 'granted' : 'denied'));
        }

        // Регистрация основного SW с повторными попытками
        if ('serviceWorker' in navigator) {
            (async function registerSW() {
                try {
                    const reg = await navigator.serviceWorker.register('./service-worker.js');
                    console.log('[SW] Основной Service Worker зарегистрирован:', reg);
                    if (reg.waiting) {
                        reg.waiting.postMessage('skipWaiting');
                    }
                    reg.addEventListener('updatefound', () => {
                        const installing = reg.installing;
                        if (installing) {
                            installing.addEventListener('statechange', () => {
                                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                                    App.toast('Доступна новая версия. Обновите страницу.', 'info');
                                }
                            });
                        }
                    });
                } catch (err) {
                    console.error('[SW] Ошибка регистрации основного SW:', err);
                    setTimeout(registerSW, 5000);
                }
            })();

            (async function registerFirebaseSW() {
                try {
                    const reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
                    console.log('[Firebase SW] Service Worker зарегистрирован:', reg);
                } catch (err) {
                    console.warn('[Firebase SW] Ошибка регистрации:', err);
                    setTimeout(registerFirebaseSW, 5000);
                }
            })();
        }

        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            console.log('[OAuth] Обнаружен hash с токеном, обрабатываем');
            App.supabase.auth.getSession().then(() => {
                window.location.hash = '';
            }).catch(console.error);
        }

        initDatabase().then(async () => {
            let hasSession = false;
            try {
                const localToken = localStorage.getItem('sb-auth-token');
                if (localToken) {
                    hasSession = true;
                } else {
                    const { data: { session } } = await App.supabase.auth.getSession();
                    hasSession = !!session;
                }
            } catch (err) {
                hasSession = localStorage.getItem('sb-auth-token') !== null;
            }
            if (!hasSession) {
                enterDemoMode();
            } else {
                const savedUsername = localStorage.getItem('vesta_username');
                if (savedUsername) updateUsernameDisplay(savedUsername);
            }
            await handleOnlineSession();

            // Проверка целостности кэша
            if ('caches' in window) {
                caches.match('./index.html').then(response => {
                    if (!response) {
                        console.warn('[Cache] Кэш приложения повреждён или отсутствует. Очищаем и перезагружаем.');
                        caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
                        setTimeout(() => window.location.reload(), 1000);
                    }
                });
            }
        });

        if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openAuthModal);
        if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', openAuthModal);

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('#sidebar-logout, #drawer-logout');
            if (target && (target.id === 'sidebar-logout' || target.id === 'drawer-logout')) {
                e.preventDefault();
                e.stopPropagation();
                doLogout();
            }
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            setInstallButtonVisible(isLoggedIn);
        });
        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            setInstallButtonVisible(false);
        });
        const pwaInstallBtn = document.getElementById('pwa-install-btn');
        if (pwaInstallBtn) {
            pwaInstallBtn.addEventListener('click', () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(() => {
                        deferredPrompt = null;
                        setInstallButtonVisible(false);
                    });
                }
            });
        }

        // Обработчик online с проверкой реальной сети и fallback
        window.addEventListener('online', async function () {
            console.log('[Main] Получено событие online, проверяем реальное подключение...');
            App.network.resetCache();
            let reallyOnline = false;
            for (let i = 0; i < 5; i++) {
                reallyOnline = await App.network.isReallyOnline();
                if (reallyOnline) break;
                await new Promise(r => setTimeout(r, 2000));
            }

            if (!reallyOnline) {
                console.warn('[Main] Реальная сеть не подтверждена, но продолжаем синхронизацию (navigator.onLine=true)');
            }

            if (typeof App.toast === 'function') App.toast('Сеть восстановлена', 'success');

            if (App.db.sync && typeof App.db.sync.processSyncQueue === 'function') {
                try { await App.db.sync.processSyncQueue(); } catch (e) { console.error(e); }
            }
            if (App.store.activeCarId && typeof App.storage.loadAllData === 'function') {
                try { await App.storage.loadAllData(); } catch (e) { console.error(e); }
            }
            if (App.realtime && typeof App.realtime.resubscribe === 'function') {
                App.realtime.resubscribe();
            }
            if (typeof App.renderAll === 'function') App.renderAll();
        });

        window.addEventListener('offline', () => {
            if (typeof App.toast === 'function') App.toast('Вы офлайн', 'warning');
        });

        if (typeof App.events.init === 'function') App.events.init();
        if (typeof App.events.switchToTab === 'function') App.events.switchToTab('dashboard');

        window.addEventListener('load', () => setTimeout(() => { if (typeof App.initIcons === 'function') App.initIcons(); }, 200));

        // FAB-меню (без изменений)
        (function() {
            const fab = document.createElement('div');
            fab.id = 'fab-menu';
            fab.innerHTML = `
                <div id="fab-overlay" class="fab-overlay" style="display:none;"></div>
                <button id="fab-main-btn" class="fab-main"><i data-lucide="plus"></i></button>
                <div id="fab-actions" class="fab-actions">
                    <button id="fab-mileage" class="fab-action" title="Пробег"><i data-lucide="gauge"></i></button>
                    <button id="fab-fuel" class="fab-action" title="Заправка"><i data-lucide="fuel"></i></button>
                    <button id="fab-service" class="fab-action" title="ТО"><i data-lucide="wrench"></i></button>
                    <button id="fab-part" class="fab-action" title="Запчасть"><i data-lucide="package"></i></button>
                </div>`;
            document.body.appendChild(fab);
            App.initIcons();

            const mainBtn = document.getElementById('fab-main-btn');
            const actions = document.getElementById('fab-actions');
            const overlay = document.getElementById('fab-overlay');
            let actionsOpen = false;

            function setFabIcon(name) {
                const icon = mainBtn?.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', name);
                    if (typeof lucide !== 'undefined') lucide.createIcons({ elements: [mainBtn] });
                }
            }
            function openActions() { actionsOpen = true; overlay.style.display = 'block'; actions.classList.add('open'); setFabIcon('x'); }
            function closeActions() { actionsOpen = false; overlay.style.display = 'none'; actions.classList.remove('open'); setFabIcon('plus'); }
            mainBtn.addEventListener('click', () => actionsOpen ? closeActions() : openActions());
            overlay.addEventListener('click', closeActions);

            document.getElementById('fab-mileage')?.addEventListener('click', () => {
                closeActions();
                if (!App.store.settings) return;
                const currentMileage = App.store.settings.currentMileage || 0;
                const currentMotohours = App.store.settings.currentMotohours || 0;
                const content = `<form id="mileage-form" style="display:flex; flex-direction:column; gap:12px;">
                    <label>Моточасы, ч</label><input type="number" id="fab-motohours-input" value="${currentMotohours}" required>
                    <label>Пробег, км</label><input type="number" id="fab-mileage-input" value="${currentMileage}" required>
                    <div class="modal-actions"><button type="submit" class="primary-btn">Обновить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
                </form>`;
                const modal = App.ui.createModal('Обновить пробег', content);
                const form = modal.querySelector('#mileage-form');
                form.onsubmit = (e) => {
                    e.preventDefault();
                    const newM = parseFloat(document.getElementById('fab-mileage-input').value);
                    const newH = parseFloat(document.getElementById('fab-motohours-input').value);
                    if (isNaN(newM) || isNaN(newH)) { App.toast('Введите числа', 'error'); return; }
                    const dashM = document.getElementById('dash-new-mileage');
                    const dashH = document.getElementById('dash-new-motohours');
                    if (dashM) dashM.value = newM;
                    if (dashH) dashH.value = newH;
                    if (typeof App.events.updateMileageAndAverages === 'function') App.events.updateMileageAndAverages();
                    modal.remove();
                };
                modal.querySelector('.cancel-btn').onclick = () => modal.remove();
            });
            document.getElementById('fab-fuel')?.addEventListener('click', () => { closeActions(); if (typeof App.ui.pages.openFuelModal === 'function') App.ui.pages.openFuelModal(null); });
            document.getElementById('fab-service')?.addEventListener('click', () => { closeActions(); if (typeof App.ui.pages.openOperationForm === 'function') App.ui.pages.openOperationForm(null); });
            document.getElementById('fab-part')?.addEventListener('click', () => { closeActions(); if (typeof App.ui.pages.openPartForm === 'function') App.ui.pages.openPartForm(null); });
        })();
    }

    // Глобальные функции восстановления
    window.recoverViaTelegram = async function() {
        try {
            const username = await App.ui.promptModalAsync('Восстановление через Telegram', 'Введите ваш логин');
            if (!username) return;
            const { data, error } = await App.supabase.functions.invoke('send-telegram-recovery', { body: { username } });
            if (error || !data || !data.success) {
                App.toast(data?.error || 'Ошибка при отправке кода.', 'error');
                return;
            }
            App.toast('Код отправлен в Telegram.', 'info');
            const code = await App.ui.promptModalAsync('Код из Telegram', 'Введите полученный код');
            if (!code) return;
            const tokenRes = await App.supabase.rpc('verify_recovery_code', { p_username: username, p_code: code });
            if (tokenRes.error || !tokenRes.data) {
                App.toast('Неверный код или срок истёк', 'error');
                return;
            }
            const resetToken = tokenRes.data;
            const newPassword = await App.ui.promptModalAsync('Новый пароль', 'Введите новый пароль (минимум 6 символов)');
            if (!newPassword || newPassword.length < 6) {
                App.toast('Пароль должен содержать не менее 6 символов', 'error');
                return;
            }
            const fetchRes = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/secure-reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset_token: resetToken, newPassword: newPassword })
            });
            if (fetchRes.ok) {
                await App.ui.alertModal('Пароль успешно изменён! Теперь войдите с новым паролем.');
            } else {
                const errText = await fetchRes.text();
                App.toast('Ошибка при сбросе: ' + errText, 'error');
            }
        } catch (err) {
            console.error(err);
            App.toast('Произошла ошибка. Попробуйте позже.', 'error');
        } finally {
            if (App.ui.currentModal) App.ui.currentModal.remove();
            document.body.style.overflow = '';
            document.body.classList.remove('auth-modal-open');
            if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        }
    };

    window.recoverViaRecoveryCode = async function() {
        try {
            const username = await App.ui.promptModalAsync('Восстановление по резервному коду', 'Введите ваш логин');
            if (!username) return;
            const code = await App.ui.promptModalAsync('Резервный код', 'Введите код');
            if (!code) return;
            const tokenRes = await App.supabase.rpc('verify_recovery_code', { p_username: username, p_code: code });
            if (tokenRes.error || !tokenRes.data) {
                App.toast('Неверный код или срок истёк', 'error');
                return;
            }
            const resetToken = tokenRes.data;
            const newPassword = await App.ui.promptModalAsync('Новый пароль', 'Введите новый пароль (минимум 6 символов)');
            if (!newPassword || newPassword.length < 6) {
                App.toast('Пароль должен содержать не менее 6 символов', 'error');
                return;
            }
            const fetchRes = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/secure-reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset_token: resetToken, newPassword: newPassword })
            });
            if (fetchRes.ok) {
                await App.ui.alertModal('Пароль успешно изменён! Теперь войдите с новым паролем.');
            } else {
                const errText = await fetchRes.text();
                App.toast('Ошибка при сбросе: ' + errText, 'error');
            }
        } catch (err) {
            console.error(err);
            App.toast('Произошла ошибка. Попробуйте позже.', 'error');
        } finally {
            if (App.ui.currentModal) App.ui.currentModal.remove();
            document.body.style.overflow = '';
            document.body.classList.remove('auth-modal-open');
            if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        }
    };

    window.generateAndShowRecoveryCodes = async function(userId, username) {
        try {
            const { data: codes, error } = await App.supabase.rpc('generate_recovery_codes', { p_user_id: userId });
            if (error || !codes || codes.length === 0) {
                console.error('Ошибка генерации кодов:', error);
                await App.ui.alertModal('Не удалось сгенерировать коды. Попробуйте позже.');
                return;
            }
            const msg = 'Ваши резервные коды для восстановления доступа (сохраните их!):\n\n' + codes.join('\n');
            await App.ui.alertModal(msg);
        } catch (err) {
            console.error(err);
            await App.ui.alertModal('Не удалось сгенерировать коды. Попробуйте позже.');
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
})();