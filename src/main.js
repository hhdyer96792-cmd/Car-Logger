// src/main.js
// ===== Полифил crypto.randomUUID =====
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

    async function waitForSupabase(retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            const online = await App.network.isReallyOnline();
            if (online) return true;
            console.log(`[Main] Supabase недоступен, попытка ${i+1}/${retries} через ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
        }
        return false;
    }

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
        if (!name) name = localStorage.getItem('vesta_username') || '';
        if (displayEl) displayEl.innerHTML = name ? `<i data-lucide="user"></i> ${name}` : '';
        if (sidebarUsernameEl) sidebarUsernameEl.innerHTML = name ? `<i data-lucide="user"></i> ${name}` : '';
        App.initIcons();
    }

    function clearDemoArtefacts() {
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
            const stores = ['operations','fuel_log','tires','parts','service_records','mileage_log','cars','settings'];
            stores.forEach(s => App.db.clear(s).catch(()=>{}));
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
            { id: 'demo1', category: 'ДВС', name: 'Масло', intervalKm: 10000, intervalMonths: 12 },
            { id: 'demo2', category: 'Тормозная система', name: 'Тормозные колодки', intervalKm: 30000 }
        ];
        App.store.fuelLog = [{ date: new Date().toISOString().split('T')[0], mileage: 1000, liters: 45, pricePerLiter: 50, fuelType: 'Бензин' }];
        App.store.settings = { currentMileage: 5000, currentMotohours: 100, avgDailyMileage: 45, avgDailyMotohours: 1.8, telegramToken:'', telegramChatId:'', notificationMethod:'telegram', reminderDays:'7,2', carBrand:'', carModel:'', carYear:null, plateNumber:'', vin:'' };
        if (App.realtime && typeof App.realtime.unsubscribeAll === 'function') App.realtime.unsubscribeAll();
        App.store.saveToLocalStorage();
        if (App.db && App.db._db) App.store.saveSettingsToDB().catch(()=>{});
        const dataPanel = document.getElementById('data-panel');
        if (dataPanel) dataPanel.style.display = 'block';
        if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
        if (typeof App.renderAll === 'function') App.renderAll();
        if (typeof App.toast === 'function') App.toast('Демо-режим. Войдите, чтобы сохранить данные.', 'info');
    }

    function showLoadingSpinner() {
        const panel = document.getElementById('data-panel');
        if (panel) {
            const existingSpinner = panel.querySelector('.loading-overlay');
            if (!existingSpinner) {
                const overlay = document.createElement('div');
                overlay.className = 'loading-overlay';
                overlay.innerHTML = '<div class="spinner"></div><p class="hint">Загрузка данных...</p>';
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.right = '0';
                overlay.style.bottom = '0';
                overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
                overlay.style.display = 'flex';
                overlay.style.flexDirection = 'column';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.zIndex = '100';
                panel.style.position = 'relative';
                panel.appendChild(overlay);
            }
        }
    }

    function hideLoadingSpinner() {
        const panel = document.getElementById('data-panel');
        if (panel) {
            const overlay = panel.querySelector('.loading-overlay');
            if (overlay) overlay.remove();
            panel.style.position = '';
        }
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
                const isOnline = await App.network.isReallyOnline();
                if (!isOnline) {
                    App.toast('Нет соединения с сервером. Проверьте интернет и попробуйте снова.', 'error');
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
        App.store.operations = []; App.store.fuelLog = []; App.store.tireLog = []; App.store.parts = []; App.store.serviceRecords = []; App.store.mileageHistory = []; App.store.cars = []; App.store.activeCarId = null;
        localStorage.removeItem('vesta_active_car_id'); localStorage.removeItem('vesta_username');
        if (App.db && App.db._db) {
            for (const s of ['operations','fuel_log','tires','parts','service_records','mileage_log','cars']) await App.db.clear(s).catch(()=>{});
        }
        if (syncInterval) clearInterval(syncInterval);
        if (premiumCheckInterval) clearInterval(premiumCheckInterval);
        
        // [CLOUD BACKUP] Очищаем облачные бэкапы при выходе
        if (typeof App.db.cloudBackup?.clearAllBackups === 'function') {
            await App.db.cloudBackup.clearAllBackups();
        }
        
        await App.supabase.auth.signOut();
        isLoggedIn = false;
        setInstallButtonVisible(false);
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
        if (drawerLoginBtn) drawerLoginBtn.style.display = '';
        if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        App.supa.clearUserIdCache?.();
        localStorage.removeItem('supabase.auth.token'); localStorage.removeItem('sb-auth-token');
        sessionStorage.clear();
        window.location.reload();
    }

    function setupAuthSubscription() {
        if (authSubscribed) return;
        authSubscribed = true;
        App.supabase.auth.onAuthStateChange(async (event, session) => {
            while (!dbInitialized) await new Promise(r => setTimeout(r, 100));
            if (session) {
                if (window._processingAuth) return;
                window._processingAuth = true;
                try {
                    if (isDemoMode) clearDemoArtefacts();
                    isLoggedIn = true; setInstallButtonVisible(true); isDemoMode = false; demoModeInitialized = false;
                    if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';
                    if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';
                    document.body.classList.remove('auth-modal-open');
                    if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
                    const dataPanel = document.getElementById('data-panel');
                    if (dataPanel) dataPanel.style.display = 'block';

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
                                }
                            }
                        } catch (pinError) {}
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
                                    key = res.key; finalSalt = res.salt;
                                    App.db.encryption.setMasterKey(key, finalSalt);
                                }
                            } else {
                                const res = await App.db.encryption.initMasterKey(password, null);
                                key = res.key; finalSalt = res.salt;
                                App.db.encryption.setMasterKey(key, finalSalt);
                                await App.db.encryption.saveVerificationString(key);
                                localStorage.setItem('vesta_master_password_set', 'true');
                                isValid = true;
                            }
                            if (isValid) {
                                await App.store.loadFromIndexedDB();
                                if (typeof App.renderAll === 'function') App.renderAll();
                                masterPassword = password;
                                if (App.localAuth && App.localAuth.resetPinAttempts) App.localAuth.resetPinAttempts();
                            } else {
                                App.toast('Неверный мастер-пароль', 'error');
                            }
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
                                            pinSet = true;
                                        } catch (err) { App.toast('Ошибка: ' + err.message, 'error'); }
                                    } else App.toast('PIN не совпадают', 'error');
                                } else App.toast('PIN должен быть 4+ цифры', 'error');
                            }
                        }
                    }

                    const { data: { user } } = await App.supabase.auth.getUser();
                    const username = user?.user_metadata?.username || user?.email?.split('@')[0] || '';
                    if (username) localStorage.setItem('vesta_username', username);
                    updateUsernameDisplay(username);

                    if (user) {
                        let cars = [];
                        try {
                            const { data, error } = await App.supabase.from('cars').select('*').eq('user_id', user.id);
                            if (!error && data && data.length > 0) cars = data;
                        } catch (err) {}
                        if (cars.length === 0) {
                            const { data: newCar } = await App.supabase.from('cars').insert({ name: 'Мой автомобиль', user_id: user.id }).select().single();
                            if (newCar) cars = [newCar];
                        }
                        if (cars.length > 0) {
                            App.store.cars = cars;
                            if (!App.store.activeCarId || !cars.some(c => c.id === App.store.activeCarId)) {
                                App.store.activeCarId = cars[0].id;
                                localStorage.setItem('vesta_active_car_id', cars[0].id);
                            }
                            for (const car of cars) await App.db.put('cars', car).catch(()=>{});
                        }
                        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
                    }

                    showLoadingSpinner();
                    try {
                        if (typeof App.storage.loadAllData === 'function') {
                            await App.storage.loadAllData();
                        }
                        
                        // ========== [CLOUD BACKUP] Восстановление очереди из облака ==========
                        // Если локальная очередь пуста, пробуем восстановить из облачного бэкапа
                        if (App.store.pendingActions.length === 0 && typeof App.db.cloudBackup?.restorePendingActionsFromCloud === 'function') {
                            const restored = await App.db.cloudBackup.restorePendingActionsFromCloud();
                            if (restored > 0) {
                                console.log(`[Main] Восстановлено ${restored} действий из облачного бэкапа`);
                            }
                        }
                        // ======================================================================
                        
                    } catch (err) {
                        console.warn('Ошибка начальной загрузки:', err);
                    } finally {
                        hideLoadingSpinner();
                        if (typeof App.renderAll === 'function') App.renderAll();
                    }
                } finally {
                    window._processingAuth = false;
                }
            } else {
                isLoggedIn = false; setInstallButtonVisible(false);
                if (sidebarLoginBtn) sidebarLoginBtn.style.display = ''; if (drawerLoginBtn) drawerLoginBtn.style.display = '';
                const dataPanel = document.getElementById('data-panel');
                if (dataPanel) dataPanel.style.display = 'none';
                updateUsernameDisplay('');
                if (App.realtime?.unsubscribeAll) App.realtime.unsubscribeAll();
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
                if (isKilled) { await App.db.killSwitch.destroyLocalDB(); return; }
                if (typeof App.db.killSwitch.startPeriodicCheck === 'function') App.db.killSwitch.startPeriodicCheck();
            }

            if (navigator.onLine && App.db.sync) {
                const available = await waitForSupabase(3, 1000);
                if (available) {
                    App.db.sync.processSyncQueue().catch(()=>{});
                }
            }

            syncInterval = setInterval(() => {
                if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                    App.db.sync.processSyncQueue().catch(()=>{});
                }
            }, 30000);

            dbInitialized = true;
        } catch (err) {
            console.error('[DEBUG] Ошибка инициализации IndexedDB:', err);
            App.store.initFromLocalStorage();
            dbInitialized = true;
        }
    }

    function onReady() {
        document.body.classList.add('no-transition');
        App.events.applyTheme(localStorage.getItem(App.config.THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        setTimeout(() => document.body.classList.remove('no-transition'), 50);

        App.supabase = supabase.createClient(
            'https://qbjlccdqaudyvedpysil.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU',
            { auth: { lockAcquireTimeout: 10000, persistSession: true, storageKey: 'sb-auth-token', autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }, realtime: { enabled: false } }
        );

        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(isPersisted => console.log('Persistent storage:', isPersisted ? 'granted' : 'denied'));
        }

        if ('serviceWorker' in navigator) {
            (async function registerSW() {
                try { await navigator.serviceWorker.register('./service-worker.js'); } catch (e) { setTimeout(registerSW, 5000); }
            })();
        }

        initDatabase().then(async () => {
            let hasSession = false;
            try { const { data: { session } } = await App.supabase.auth.getSession(); hasSession = !!session; } catch (e) {}
            if (!authSubscribed) setupAuthSubscription();
            if (!hasSession) enterDemoMode();
            else {
                const savedUsername = localStorage.getItem('vesta_username');
                if (savedUsername) updateUsernameDisplay(savedUsername);
            }
        });

        if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openAuthModal);
        if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', openAuthModal);

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('#sidebar-logout, #drawer-logout');
            if (target) { e.preventDefault(); doLogout(); }
        });

        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; setInstallButtonVisible(isLoggedIn); });
        window.addEventListener('appinstalled', () => { deferredPrompt = null; setInstallButtonVisible(false); });

        window.addEventListener('online', async () => {
            console.log('[Main] Сеть восстановлена');
            const available = await waitForSupabase(3, 2000);
            if (!available) {
                console.warn('[Main] Supabase всё ещё недоступен, синхронизация отложена');
                return;
            }
            if (App.db.sync && !App.db.sync._isRunning) {
                App.db.sync.processSyncQueue().catch(console.error);
            }
            if (App.realtime?.resubscribe) App.realtime.resubscribe();
            if (App.store.activeCarId) {
                App.storage.loadAllData().catch(console.warn);
            }
        });
        window.addEventListener('offline', () => {});

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data?.type === 'SYNC_TRIGGERED') {
                    console.log('[Main] Получен сигнал синхронизации от SW');
                    if (App.db.sync && !App.db.sync._isRunning) {
                        App.db.sync.processSyncQueue().catch(console.error);
                    }
                }
            });
        }

        if (typeof App.events.init === 'function') App.events.init();
        if (typeof App.events.switchToTab === 'function') App.events.switchToTab('dashboard');

        setTimeout(() => { if (typeof App.initIcons === 'function') App.initIcons(); }, 200);

        // FAB-меню
        (function() {
            const fab = document.createElement('div');
            fab.id = 'fab-menu';
            fab.innerHTML = `<div id="fab-overlay" class="fab-overlay" style="display:none;"></div><button id="fab-main-btn" class="fab-main"><i data-lucide="plus"></i></button><div id="fab-actions" class="fab-actions"><button id="fab-mileage" class="fab-action" title="Пробег"><i data-lucide="gauge"></i></button><button id="fab-fuel" class="fab-action" title="Заправка"><i data-lucide="fuel"></i></button><button id="fab-service" class="fab-action" title="ТО"><i data-lucide="wrench"></i></button><button id="fab-part" class="fab-action" title="Запчасть"><i data-lucide="package"></i></button></div>`;
            document.body.appendChild(fab);
            App.initIcons();
            const mainBtn = document.getElementById('fab-main-btn');
            const actions = document.getElementById('fab-actions');
            const overlay = document.getElementById('fab-overlay');
            let open = false;
            mainBtn.onclick = () => {
                open = !open;
                overlay.style.display = open ? 'block' : 'none';
                actions.classList.toggle('open', open);
            };
            overlay.onclick = () => {
                open = false;
                overlay.style.display = 'none';
                actions.classList.remove('open');
            };
            document.getElementById('fab-fuel').onclick = () => {
                if (typeof App.ui.pages.openFuelModal === 'function') App.ui.pages.openFuelModal(null);
            };
            document.getElementById('fab-service').onclick = () => {
                if (typeof App.ui.pages.openOperationForm === 'function') App.ui.pages.openOperationForm(null);
            };
            document.getElementById('fab-part').onclick = () => {
                if (typeof App.ui.pages.openPartForm === 'function') App.ui.pages.openPartForm(null);
            };
            document.getElementById('fab-mileage').onclick = () => {
                if (typeof App.ui.pages.openMileageModal === 'function') {
                    App.ui.pages.openMileageModal();
                } else {
                    console.warn('[FAB] openMileageModal not available');
                }
            };
        })();

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
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
})();