// src/main.js (с расширенным логированием)
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
        const name = username || '';
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
        console.log('[DEBUG] enterDemoMode вызван');
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
        // ... (без изменений, оставляем как в предыдущей версии)
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
                }).catch(err => App.toast('Ошибка входа через Google', 'error'));
            });
        }

        const loginForm = container.querySelector('#login-form');
        const loginMessage = container.querySelector('#login-message');
        const passwordConfirmLabel = container.querySelector('#password-confirm-label');
        const passwordConfirmInput = container.querySelector('#password-confirm-input');

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
                    App.toast('Ошибка входа', 'error');
                } else {
                    const modal = container.closest('.modal');
                    if (modal) {
                        modal.remove();
                        document.body.classList.remove('auth-modal-open');
                    }
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
                        App.toast('Регистрация успешна!', 'success');
                        if (passwordConfirmLabel) passwordConfirmLabel.style.display = 'none';
                        if (passwordConfirmInput) {
                            passwordConfirmInput.style.display = 'none';
                            passwordConfirmInput.required = false;
                        }
                        loginForm.reset();
                        if (loginMessage) loginMessage.textContent = '';
                        const modal = container.closest('.modal');
                        if (modal) modal.remove();
                        document.body.classList.remove('auth-modal-open');
                        if (data.user && typeof window.generateAndShowRecoveryCodes === 'function') {
                            await window.generateAndShowRecoveryCodes(data.user.id, username);
                        }
                    } else {
                        App.toast('Регистрация успешна! Подтвердите email, чтобы войти.', 'info');
                    }
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
        if (typeof App.db.encryption !== 'undefined') App.db.encryption.clearMasterKey();
        if (typeof App.store === 'undefined') return;

        updateUsernameDisplay('');
        clearDemoArtefacts();

        console.log('[DEBUG] doLogout: вызываем signOut()');
        const { error } = await App.supabase.auth.signOut();
        if (error) console.error('[DEBUG] Ошибка signOut:', error);
        else console.log('[DEBUG] signOut() выполнен успешно');

        isLoggedIn = false;
        setInstallButtonVisible(false);
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
        if (drawerLoginBtn) drawerLoginBtn.style.display = '';
        if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        if (typeof App.supa !== 'undefined' && App.supa.clearUserIdCache) App.supa.clearUserIdCache();

        localStorage.removeItem('vesta_master_password_set');
        localStorage.removeItem('vesta_encryption_salt');

        console.log('[DEBUG] doLogout: вызываем enterDemoMode()');
        enterDemoMode();

        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
        if (typeof App.renderAll === 'function') App.renderAll();

        // Принудительная перезагрузка для гарантии сброса состояния
        setTimeout(() => {
            console.log('[DEBUG] doLogout: перезагрузка страницы');
            window.location.reload();
        }, 500);
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
            if (!dbInitialized) console.warn('[DEBUG] DB не инициализирована после 5 секунд');
            else console.log('[DEBUG] DB инициализирована, продолжаем');

            if (session) {
                console.log('[DEBUG] Пользователь вошёл, начинаем загрузку данных');
                if (isDemoMode) clearDemoArtefacts();
                isLoggedIn = true;
                setInstallButtonVisible(true);
                isDemoMode = false;
                demoModeInitialized = false;
                if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';
                if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';
                document.body.classList.remove('auth-modal-open');
                const dataPanel = document.getElementById('data-panel');
                if (dataPanel) dataPanel.style.display = 'block';
                const syncIndicatorOnline = document.getElementById('sync-indicator');
                if (syncIndicatorOnline) syncIndicatorOnline.style.display = '';
                const mobileRowOnline = document.getElementById('mobile-header-row2');
                if (mobileRowOnline) mobileRowOnline.style.display = 'flex';

                // ========== БЛОК МАСТЕР-ПАРОЛЯ И PIN ==========
                let masterPassword = null;
                const hasPin = App.localAuth && await App.localAuth.isPinSet();
                console.log('[DEBUG] hasPin =', hasPin);
                if (hasPin) {
                    const pin = await App.ui.promptModalAsync('Быстрый доступ', 'Введите PIN-код (4+ цифр)');
                    if (pin) {
                        masterPassword = await App.localAuth.verifyPin(pin);
                        console.log('[DEBUG] verifyPin вернул', !!masterPassword);
                        if (masterPassword) {
                            const salt = App.db.encryption.getStoredSalt();
                            const { key } = await App.db.encryption.initMasterKey(masterPassword, salt);
                            App.db.encryption.setMasterKey(key, salt);
                            await App.store.loadFromIndexedDB();
                            if (typeof App.renderAll === 'function') App.renderAll();
                            App.toast('Расшифровка по PIN успешна', 'success');
                        } else {
                            App.toast('Неверный PIN-код. Попробуйте мастер-пароль.', 'error');
                        }
                    }
                }
                if (!masterPassword) {
                    const hasMasterPassword = localStorage.getItem('vesta_master_password_set') === 'true';
                    console.log('[DEBUG] hasMasterPassword =', hasMasterPassword);
                    const message = hasMasterPassword ? 'Введите мастер-пароль' : 'Установите мастер-пароль для шифрования данных (запомните его!)';
                    const password = await App.ui.promptModalAsync('Мастер-пароль', message);
                    if (password) {
                        const salt = App.db.encryption.getStoredSalt();
                        let isValid = false;
                        let key, finalSalt;
                        if (hasMasterPassword) {
                            isValid = await App.db.encryption.verifyMasterKey(password, salt);
                            console.log('[DEBUG] verifyMasterKey =', isValid);
                            if (isValid) {
                                const res = await App.db.encryption.initMasterKey(password, salt);
                                key = res.key;
                                finalSalt = res.salt;
                                App.db.encryption.setMasterKey(key, finalSalt);
                            }
                        } else {
                            console.log('[DEBUG] Первая установка мастер-пароля');
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
                        } else {
                            App.toast('Неверный мастер-пароль', 'error');
                        }
                    } else {
                        App.toast('Без мастер-пароля чувствительные данные будут недоступны', 'warning');
                    }
                }
                if (masterPassword && !hasPin && App.localAuth && App.localAuth.isPinSupported()) {
                    const wantPin = await App.ui.confirmModalAsync('Настроить быстрый вход по PIN-коду?');
                    if (wantPin) {
                        let pinSet = false;
                        while (!pinSet) {
                            const pin = await App.ui.promptModalAsync('PIN-код (4+ цифры)', '');
                            if (pin && pin.length >= 4 && /^\d+$/.test(pin)) {
                                const confirmPin = await App.ui.promptModalAsync('Подтвердите PIN', '');
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

                // Имя пользователя
                const { data: { user } } = await App.supabase.auth.getUser();
                const username = user?.user_metadata?.username || user?.email?.split('@')[0] || '';
                if (username) localStorage.setItem('vesta_username', username);
                updateUsernameDisplay(username);

                if (typeof App.ui.pages.checkPushSubscriptionStatus === 'function') {
                    App.ui.pages.checkPushSubscriptionStatus();
                }

                if (event === 'PASSWORD_RECOVERY') {
                    const newPassword = await App.ui.promptModalAsync('Новый пароль', 'Введите новый пароль (минимум 6 символов)');
                    if (newPassword && newPassword.length >= 6) {
                        const { error } = await App.supabase.auth.updateUser({ password: newPassword });
                        if (error) App.toast('Ошибка смены пароля', 'error');
                        else {
                            App.toast('Пароль изменён', 'success');
                            window.location.hash = '';
                            window.location.search = '';
                        }
                    }
                }

                // ========== ЗАГРУЗКА ВСЕХ ДАННЫХ ==========
                console.log('[DEBUG] Вызов App.storage.loadAllData()');
                if (typeof App.storage !== 'undefined' && typeof App.storage.loadAllData === 'function') {
                    await App.storage.loadAllData();
                    console.log('[DEBUG] App.storage.loadAllData() завершён');
                } else {
                    console.warn('[DEBUG] App.storage.loadAllData не определён');
                }

                // ========== ПРИНУДИТЕЛЬНАЯ ЗАГРУЗКА АВТОМОБИЛЕЙ ==========
                try {
                    const { data: { user } } = await App.supabase.auth.getUser();
                    if (user) {
                        console.log('[DEBUG] Загрузка автомобилей для user', user.id);
                        if (App.db && App.db._db) {
                            await App.db.clear('cars').catch(console.warn);
                        }
                        const { data: cars, error } = await App.supabase
                            .from('cars')
                            .select('*')
                            .eq('user_id', user.id);
                        if (error) throw error;
                        console.log('[DEBUG] Загружено автомобилей:', cars?.length);
                        if (cars && cars.length > 0) {
                            App.store.cars = cars;
                            if (!App.store.activeCarId || !cars.some(c => c.id === App.store.activeCarId)) {
                                App.store.activeCarId = cars[0].id;
                                localStorage.setItem('vesta_active_car_id', cars[0].id);
                            }
                            for (const car of cars) await App.db.put('cars', car);
                        } else {
                            console.log('[DEBUG] Автомобилей нет, создаём новый');
                            const { data: newCar, error: createError } = await App.supabase
                                .from('cars')
                                .insert({ name: 'Мой автомобиль', user_id: user.id })
                                .select()
                                .single();
                            if (createError) throw createError;
                            App.store.cars = [newCar];
                            App.store.activeCarId = newCar.id;
                            localStorage.setItem('vesta_active_car_id', newCar.id);
                            await App.db.put('cars', newCar);
                        }
                        if (typeof App.ui.pages.updateCarSelectorOnCarTab === 'function') {
                            App.ui.pages.updateCarSelectorOnCarTab();
                        } else {
                            App.ui.pages.renderCarSelector();
                            App.ui.pages.renderCarTab();
                        }
                    }
                } catch (err) {
                    console.error('[DEBUG] Ошибка загрузки автомобилей:', err);
                }

                if (typeof App.ui.pages.checkPendingInvites === 'function') App.ui.pages.checkPendingInvites();
                if (App.store.activeCarId && App.realtime && typeof App.realtime.subscribeToCar === 'function') {
                    App.realtime.subscribeToCar(App.store.activeCarId);
                }
                if (typeof App.ui.pages.checkAndShowInitialParamsModal === 'function') {
                    App.ui.pages.checkAndShowInitialParamsModal();
                }
                if (typeof App.renderAll === 'function') App.renderAll();
                console.log('[DEBUG] Обработка входа завершена');
            } else {
                console.log('[DEBUG] Пользователь вышел (событие выхода)');
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
        console.log('[DEBUG] initDatabase: начало инициализации IndexedDB');
        try {
            await App.db.init();
            console.log('[DEBUG] App.db.init() завершён');
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
            console.log('[DEBUG] App.store.loadFromIndexedDB() завершён, operations:', App.store.operations.length);
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
            } else if (navigator.onLine && !App.db.sync) {
                console.warn('[DEBUG] Sync module not loaded yet, skipping sync');
            } else {
                console.log('[DEBUG] Офлайн-режим, синхронизация отложена');
            }
            setInterval(() => {
                if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                    App.db.sync.processSyncQueue().catch(console.error);
                }
            }, 60000);
            dbInitialized = true;
            console.log('[DEBUG] dbInitialized = true');
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
        console.log('[DEBUG] onReady: начало');
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
                    detectSessionInUrl: true
                }
            }
        );

        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(isPersisted => console.log('Persistent storage:', isPersisted ? 'granted' : 'denied'));
        }

        initDatabase().then(() => {
            console.log('[DEBUG] initDatabase завершён, проверяем сессию');
            const savedSession = localStorage.getItem('supabase.auth.token');
            if (!savedSession) {
                console.log('[DEBUG] Нет сохранённой сессии, запускаем демо-режим');
                enterDemoMode();
            } else {
                App.supabase.auth.getSession().then(({ data: { session } }) => {
                    if (!session) {
                        console.log('[DEBUG] Сессия не активна, запускаем демо-режим');
                        enterDemoMode();
                    } else {
                        console.log('[DEBUG] Сессия активна, не запускаем демо');
                    }
                });
            }
            handleOnlineSession();
        });

        if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openAuthModal);
        if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', openAuthModal);

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

        const logoutSidebarBtn = document.getElementById('sidebar-logout');
        if (logoutSidebarBtn) logoutSidebarBtn.addEventListener('click', doLogout);
        const logoutDrawerBtn = document.getElementById('drawer-logout');
        if (logoutDrawerBtn) logoutDrawerBtn.addEventListener('click', doLogout);

        window.addEventListener('online', () => {
            if (typeof App.toast === 'function') App.toast('Сеть восстановлена', 'success');
            if (App.store && App.store.pendingActions && App.store.pendingActions.length > 0) {
                App.toast('Синхронизация офлайн-изменений...', 'info');
                App.store.pendingActions.forEach(action => {
                    if (action.type === 'service' && typeof App.logic.addServiceRecord === 'function') {
                        App.logic.addServiceRecord(action.opId, action.date, action.mileage, action.motohours,
                            action.partsCost, action.workCost, action.isDIY, action.notes, action.photoUrl);
                    }
                });
                if (typeof App.store.clearPendingActions === 'function') App.store.clearPendingActions();
            }
            handleOnlineSession();
        });
        window.addEventListener('offline', () => {
            if (typeof App.toast === 'function') App.toast('Вы офлайн', 'warning');
        });

        if (typeof App.events.init === 'function') App.events.init();
        if (typeof App.events.switchToTab === 'function') App.events.switchToTab('dashboard');

        window.addEventListener('load', () => setTimeout(() => { if (typeof App.initIcons === 'function') App.initIcons(); }, 200));

        // FAB-меню (оставлено без изменений)
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
        console.log('recoverViaTelegram placeholder');
        await App.ui.alertModal('Восстановление через Telegram временно недоступно. Пожалуйста, свяжитесь с администратором.');
    };
    window.recoverViaRecoveryCode = async function() {
        console.log('recoverViaRecoveryCode placeholder');
        await App.ui.alertModal('Восстановление по резервному коду временно недоступно.');
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