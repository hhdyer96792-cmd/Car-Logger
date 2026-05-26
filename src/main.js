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
        if (typeof App !== 'undefined' && App.initIcons) App.initIcons();
    }

    function clearDemoArtefacts() {
        // Полная очистка перед переходом в реальный режим
        if (App && App.store) {
            App.store.operations = [];
            App.store.fuelLog = [];
            App.store.tireLog = [];
            App.store.parts = [];
            App.store.serviceRecords = [];
            App.store.mileageHistory = [];
            App.store.cars = [];
            App.store.activeCarId = null;
        }
        localStorage.removeItem('vesta_active_car_id');
        localStorage.removeItem('vesta_username');
        if (App && App.db && App.db._db) {
            const stores = ['operations', 'fuel_log', 'tires', 'parts', 'service_records', 'mileage_log', 'cars'];
            stores.forEach(store => App.db.clear(store).catch(console.warn));
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
        if (App && App.store) {
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
            if (App.realtime && App.realtime.unsubscribeAll) App.realtime.unsubscribeAll();
            App.store.saveToLocalStorage();
            if (App.db && App.db._db && App.store.saveSettingsToDB) App.store.saveSettingsToDB().catch(console.warn);
        }

        const dataPanel = document.getElementById('data-panel');
        if (dataPanel) dataPanel.style.display = 'block';

        if (typeof App !== 'undefined') {
            if (App.ui && App.ui.pages && App.ui.pages.renderDashboard) App.ui.pages.renderDashboard();
            if (App.ui && App.ui.pages && App.ui.pages.renderCarSelector) App.ui.pages.renderCarSelector();
            if (App.ui && App.ui.pages && App.ui.pages.renderCarTab) App.ui.pages.renderCarTab();
            if (App.ui && App.ui.pages && App.ui.pages.populateSettingsFields) App.ui.pages.populateSettingsFields();
            if (typeof App.renderAll === 'function') App.renderAll();
        }
        if (typeof App !== 'undefined' && App.toast) App.toast('Демо-режим. Войдите, чтобы сохранить данные.', 'info');
    }

    function initAuthFormEvents(container) {
        // Полная копия существующей функции из вашего кода (здесь не привожу для краткости, но в реальном файле она должна быть)
        // Для теста минимально:
        console.log('initAuthFormEvents placeholder');
    }

    function openAuthModal() {
        const template = document.getElementById('auth-template');
        if (!template) { console.error('Шаблон auth-template не найден'); return; }
        const content = template.content.cloneNode(true);
        if (typeof App !== 'undefined' && App.ui && App.ui.createModal) {
            const modal = App.ui.createModal('Аккаунт', '');
            if (!modal) return;
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) modalContent.appendChild(content);
            document.body.classList.add('auth-modal-open');
            initAuthFormEvents(modalContent);
            const closeBtn = modalContent?.querySelector('.close');
            if (closeBtn) closeBtn.onclick = () => modal.remove();
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            modal.style.display = 'flex';
            if (App.initIcons) App.initIcons();
        } else {
            alert('Ошибка: UI не загружен');
        }
    }

    async function ensureCarExists(userId) {
        console.log('[Main] Проверка автомобилей для пользователя', userId);
        // Прямой запрос к Supabase
        const { data: cars, error } = await App.supabase
            .from('cars')
            .select('*')
            .eq('user_id', userId);
        if (error) {
            console.error('[Main] Ошибка загрузки автомобилей:', error);
            return null;
        }
        if (cars && cars.length > 0) {
            console.log('[Main] Найден существующий автомобиль:', cars[0]);
            return cars[0];
        }
        // Создаём новый
        console.log('[Main] Создаём новый автомобиль...');
        const { data: newCar, error: createError } = await App.supabase
            .from('cars')
            .insert({ name: 'Мой автомобиль', user_id: userId })
            .select()
            .single();
        if (createError) {
            console.error('[Main] Ошибка создания автомобиля:', createError);
            return null;
        }
        console.log('[Main] Автомобиль создан:', newCar);
        return newCar;
    }

    async function initMasterPassword() {
        const hasMaster = localStorage.getItem('vesta_master_password_set') === 'true';
        if (!hasMaster) {
            const password = await App.ui.promptModalAsync('Мастер-пароль', 'Установите мастер-пароль для шифрования данных (запомните его!)');
            if (password && password.length >= 4) {
                const { key, salt } = await App.db.encryption.initMasterKey(password, null);
                App.db.encryption.setMasterKey(key, salt);
                await App.db.encryption.saveVerificationString(key);
                localStorage.setItem('vesta_master_password_set', 'true');
                console.log('[Main] Мастер-пароль сохранён');
                return true;
            }
        } else {
            const password = await App.ui.promptModalAsync('Мастер-пароль', 'Введите мастер-пароль');
            if (password) {
                const salt = App.db.encryption.getStoredSalt();
                const isValid = await App.db.encryption.verifyMasterKey(password, salt);
                if (isValid) {
                    const { key } = await App.db.encryption.initMasterKey(password, salt);
                    App.db.encryption.setMasterKey(key, salt);
                    console.log('[Main] Мастер-пароль верен');
                    return true;
                } else {
                    App.toast('Неверный мастер-пароль', 'error');
                }
            }
        }
        return false;
    }

    async function initDatabase() {
        try {
            if (!App.db) throw new Error('App.db не определён');
            await App.db.init();
            console.log('[Main] IndexedDB инициализирована');

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
            // Синхронизация только если модуль загружен
            if (navigator.onLine && App.db.sync && typeof App.db.sync.processSyncQueue === 'function') {
                await App.db.sync.processSyncQueue();
            } else if (navigator.onLine && !App.db.sync) {
                console.warn('[Main] App.db.sync не загружен, синхронизация отложена');
            }
            setInterval(() => {
                if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                    App.db.sync.processSyncQueue().catch(console.error);
                }
            }, 60000);
        } catch (err) {
            console.error('[Main] Ошибка инициализации IndexedDB:', err);
            if (App.toast) App.toast('Не удалось открыть базу данных.', 'error');
            if (App.store && App.store.initFromLocalStorage) App.store.initFromLocalStorage();
        }
    }

    async function handleOnlineSession() {
        if (!navigator.onLine) {
            // Офлайн-режим
            isLoggedIn = true;
            setInstallButtonVisible(true);
            const dataPanel = document.getElementById('data-panel');
            if (dataPanel) dataPanel.style.display = 'block';
            const syncIndicator = document.getElementById('sync-indicator');
            if (syncIndicator) syncIndicator.style.display = '';
            const mobileRow = document.getElementById('mobile-header-row2');
            if (mobileRow) mobileRow.style.display = 'flex';
            const cachedUsername = localStorage.getItem('vesta_username') || '';
            updateUsernameDisplay(cachedUsername);
            if (App.store && App.store.loadCars) {
                try {
                    await App.store.loadCars();
                } catch (e) { console.warn('Офлайн: ошибка загрузки машин', e); }
                if (App.ui && App.ui.pages && App.ui.pages.renderCarSelector) App.ui.pages.renderCarSelector();
                if (typeof App.renderAll === 'function') App.renderAll();
            }
            return;
        }

        if (!authSubscribed) {
            authSubscribed = true;
            App.supabase.auth.onAuthStateChange(async (event, session) => {
                if (session) {
                    // Пользователь вошёл
                    isLoggedIn = true;
                    setInstallButtonVisible(true);
                    isDemoMode = false;
                    demoModeInitialized = false;
                    if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';
                    if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';
                    document.body.classList.remove('auth-modal-open');
                    const dataPanel = document.getElementById('data-panel');
                    if (dataPanel) dataPanel.style.display = 'block';
                    const syncIndicator = document.getElementById('sync-indicator');
                    if (syncIndicator) syncIndicator.style.display = '';
                    const mobileRow = document.getElementById('mobile-header-row2');
                    if (mobileRow) mobileRow.style.display = 'flex';

                    // Инициализация шифрования и мастер-пароля
                    await initMasterPassword();

                    // Получение имени пользователя
                    const { data: { user } } = await App.supabase.auth.getUser();
                    const username = user?.user_metadata?.username || '';
                    if (username) localStorage.setItem('vesta_username', username);
                    updateUsernameDisplay(username);

                    // Проверка и создание автомобиля (если нет)
                    const car = await ensureCarExists(user.id);
                    if (car) {
                        if (!App.store.cars.find(c => c.id === car.id)) {
                            App.store.cars.push(car);
                            await App.db.put('cars', car);
                        }
                        if (!App.store.activeCarId) {
                            App.store.setActiveCar(car.id);
                            localStorage.setItem('vesta_active_car_id', car.id);
                        }
                        if (App.ui && App.ui.pages && App.ui.pages.renderCarSelector) App.ui.pages.renderCarSelector();
                        if (App.ui && App.ui.pages && App.ui.pages.renderCarTab) App.ui.pages.renderCarTab();
                    }

                    // Загрузка остальных данных
                    if (App.ui && App.ui.pages && App.ui.pages.checkPendingInvites) App.ui.pages.checkPendingInvites();
                    if (App.realtime && App.store.activeCarId && App.realtime.subscribeToCar) App.realtime.subscribeToCar(App.store.activeCarId);
                    if (App.storage && App.storage.loadAllData) await App.storage.loadAllData();
                    if (App.ui && App.ui.pages && App.ui.pages.checkAndShowInitialParamsModal) App.ui.pages.checkAndShowInitialParamsModal();
                    if (typeof App.renderAll === 'function') App.renderAll();
                } else {
                    // Выход
                    isLoggedIn = false;
                    setInstallButtonVisible(false);
                    if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
                    if (drawerLoginBtn) drawerLoginBtn.style.display = '';
                    const dataPanel = document.getElementById('data-panel');
                    if (dataPanel) dataPanel.style.display = 'none';
                    const syncIndicator = document.getElementById('sync-indicator');
                    if (syncIndicator) syncIndicator.style.display = 'none';
                    const mobileRow = document.getElementById('mobile-header-row2');
                    if (mobileRow) mobileRow.style.display = 'none';
                    const carContainer = document.getElementById('car-selector-container');
                    if (carContainer) carContainer.innerHTML = '';
                    updateUsernameDisplay('');
                    if (App.realtime && App.realtime.unsubscribeAll) App.realtime.unsubscribeAll();
                    clearDemoArtefacts();
                    enterDemoMode();
                }
            });
        }
    }

    function onReady() {
        // Проверка наличия необходимых глобальных объектов
        if (typeof supabase === 'undefined') {
            console.error('Supabase client not loaded');
            return;
        }
        if (typeof App === 'undefined') {
            console.error('App global object not initialized');
            return;
        }

        document.body.classList.add('no-transition');
        const savedTheme = localStorage.getItem(App.config?.THEME_KEY);
        if (savedTheme && App.events && App.events.applyTheme) App.events.applyTheme(savedTheme);
        else if (App.events && App.events.applyTheme) App.events.applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTimeout(() => document.body.classList.remove('no-transition'), 50);
        if (window.matchMedia && App.events && App.events.applyTheme) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                if (!localStorage.getItem(App.config?.THEME_KEY)) App.events.applyTheme(e.matches ? 'dark' : 'light');
            });
        }

        // Создание клиента Supabase
        if (!App.supabase) {
            App.supabase = supabase.createClient(
                'https://qbjlccdqaudyvedpysil.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU',
                { auth: { lockAcquireTimeout: 10000, persistSession: true, storageKey: 'sb-auth-token', autoRefreshToken: true, detectSessionInUrl: true } }
            );
        }

        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(isPersisted => console.log('Persistent storage:', isPersisted ? 'granted' : 'denied'));
        }

        // Инициализация БД
        initDatabase().then(() => {
            const savedSession = localStorage.getItem('supabase.auth.token');
            if (!savedSession) {
                enterDemoMode();
            } else {
                App.supabase.auth.getSession().then(({ data: { session } }) => {
                    if (!session) enterDemoMode();
                });
            }
        });

        if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openAuthModal);
        if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', openAuthModal);

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            setInstallButtonVisible(isLoggedIn);
        });
        window.addEventListener('appinstalled', () => { deferredPrompt = null; setInstallButtonVisible(false); });
        const pwaInstallBtn = document.getElementById('pwa-install-btn');
        if (pwaInstallBtn) {
            pwaInstallBtn.addEventListener('click', () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(() => { deferredPrompt = null; setInstallButtonVisible(false); });
                }
            });
        }

        const logoutSidebarBtn = document.getElementById('sidebar-logout');
        if (logoutSidebarBtn) logoutSidebarBtn.addEventListener('click', () => {
            if (App.store && App.store.activeCarId) {
                localStorage.removeItem('vesta_active_car_id');
                localStorage.removeItem('vesta_username');
                App.supabase.auth.signOut().catch(console.warn);
                clearDemoArtefacts();
                enterDemoMode();
                if (App.ui && App.ui.pages && App.ui.pages.renderCarSelector) App.ui.pages.renderCarSelector();
                if (App.ui && App.ui.pages && App.ui.pages.renderCarTab) App.ui.pages.renderCarTab();
                if (App.ui && App.ui.pages && App.ui.pages.populateSettingsFields) App.ui.pages.populateSettingsFields();
                if (typeof App.renderAll === 'function') App.renderAll();
            }
        });
        const logoutDrawerBtn = document.getElementById('drawer-logout');
        if (logoutDrawerBtn) logoutDrawerBtn.addEventListener('click', logoutSidebarBtn?.click || (() => {}));

        window.addEventListener('online', () => {
            if (App.toast) App.toast('Сеть восстановлена', 'success');
            if (App.store && App.store.pendingActions && App.store.pendingActions.length > 0) {
                if (App.toast) App.toast('Синхронизация офлайн-изменений...', 'info');
                App.store.pendingActions.forEach(action => {
                    if (action.type === 'service' && App.logic && App.logic.addServiceRecord) {
                        App.logic.addServiceRecord(action.opId, action.date, action.mileage, action.motohours,
                            action.partsCost, action.workCost, action.isDIY, action.notes, action.photoUrl);
                    }
                });
                if (App.store.clearPendingActions) App.store.clearPendingActions();
            }
            handleOnlineSession();
        });
        window.addEventListener('offline', () => { if (App.toast) App.toast('Вы офлайн', 'warning'); });

        handleOnlineSession();

        if (App.events && App.events.init) App.events.init();
        if (App.events && App.events.switchToTab) App.events.switchToTab('dashboard');

        window.addEventListener('load', () => setTimeout(() => { if (App.initIcons) App.initIcons(); }, 200));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
})();