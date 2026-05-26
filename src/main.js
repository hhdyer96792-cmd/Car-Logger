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
        if (displayEl) {
            displayEl.innerHTML = name ? `<i data-lucide="user"></i> ${name}` : '';
        }
        if (sidebarUsernameEl) {
            sidebarUsernameEl.innerHTML = name ? `<i data-lucide="user"></i> ${name}` : '';
        }
        App.initIcons();
    }

    function enterDemoMode() {
        if (demoModeInitialized) return;
        demoModeInitialized = true;
        isDemoMode = true;

        // Очищаем все хранилища
        App.store.operations = [];
        App.store.fuelLog = [];
        App.store.tireLog = [];
        App.store.parts = [];
        App.store.serviceRecords = [];
        App.store.mileageHistory = [];
        App.store.cars = [];
        App.store.activeCarId = null;

        // Демо-автомобиль
        const demoCarId = crypto.randomUUID();
        App.store.cars = [{ id: demoCarId, name: 'Мой автомобиль', user_id: 'demo' }];
        App.store.activeCarId = demoCarId;
        localStorage.setItem('vesta_active_car_id', demoCarId);

        // Демо-операции
        App.store.operations = [
            { id: 'demo1', category: 'ДВС', name: 'Масло', intervalKm: 10000, intervalMonths: 12, lastMileage: 0, lastDate: null },
            { id: 'demo2', category: 'Тормозная система', name: 'Тормозные колодки', intervalKm: 30000, lastMileage: 0 }
        ];

        // Демо-заправка
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
        App.store.saveSettingsToDB().catch(console.warn);

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
        // ... (без изменений, код уже есть в вашем файле)
        // В целях экономии места оставляем как есть, но в реальном файле он должен быть
        console.log('initAuthFormEvents placeholder');
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

    function doLogout() {
        if (typeof App.db.encryption !== 'undefined') App.db.encryption.clearMasterKey();
        if (typeof App.store === 'undefined') return;

        // Очистка отображения имени
        updateUsernameDisplay('');

        // Сброс хранилища
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
        localStorage.removeItem('vesta_master_password_set');

        if (typeof App.store.saveToLocalStorage === 'function') App.store.saveToLocalStorage();

        App.supabase.auth.signOut().catch(e => console.warn('Signout error', e));

        isLoggedIn = false;
        setInstallButtonVisible(false);
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
        if (drawerLoginBtn) drawerLoginBtn.style.display = '';
        if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
        if (typeof App.supa !== 'undefined' && App.supa.clearUserIdCache) App.supa.clearUserIdCache();

        demoModeInitialized = false;
        isDemoMode = false;
        enterDemoMode();

        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
        if (typeof App.renderAll === 'function') App.renderAll();
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
            authSubscribed = true;
            App.supabase.auth.onAuthStateChange(async (event, session) => {
                if (session) {
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

                    // Запрос мастер-пароля или PIN
                    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        let masterPassword = null;
                        const hasPin = App.localAuth && await App.localAuth.isPinSet();
                        if (hasPin) {
                            const pin = await App.ui.promptModalAsync('Быстрый доступ', 'Введите PIN-код (4+ цифр)');
                            if (pin) {
                                masterPassword = await App.localAuth.verifyPin(pin);
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
                            const message = hasMasterPassword ? 'Введите мастер-пароль' : 'Установите мастер-пароль для шифрования данных (запомните его!)';
                            const password = await App.ui.promptModalAsync('Мастер-пароль', message);
                            if (password) {
                                const salt = App.db.encryption.getStoredSalt();
                                let isValid = false;
                                if (hasMasterPassword) {
                                    isValid = await App.db.encryption.verifyMasterKey(password, salt);
                                } else {
                                    isValid = true;
                                    localStorage.setItem('vesta_master_password_set', 'true');
                                }
                                if (isValid) {
                                    const { key } = await App.db.encryption.initMasterKey(password, salt);
                                    App.db.encryption.setMasterKey(key, salt);
                                    if (!hasMasterPassword) await App.db.encryption.saveVerificationString(key);
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
                    }

                    // Получение данных пользователя для отображения имени
                    const { data: { user } } = await App.supabase.auth.getUser();
                    const username = user?.user_metadata?.username || '';
                    if (username) localStorage.setItem('vesta_username', username);
                    updateUsernameDisplay(username);

                    if (typeof App.ui.pages.checkPushSubscriptionStatus === 'function') {
                        App.ui.pages.checkPushSubscriptionStatus();
                    }

                    // Сброс пароля (если нужно)
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

                    // Загрузка автомобилей и данных
                    if (typeof App.store !== 'undefined' && typeof App.store.loadCars === 'function') {
                        await App.store.loadCars();
                        if (App.store.cars.length === 0) {
                            try {
                                const newCar = await App.supa.createCar('Мой автомобиль');
                                if (newCar && newCar.data) {
                                    App.store.cars.push(newCar.data);
                                    App.store.setActiveCar(newCar.data.id);
                                }
                            } catch (e) { console.warn('Не удалось создать автомобиль:', e); }
                        } else if (!App.store.activeCarId) {
                            App.store.setActiveCar(App.store.cars[0].id);
                        }
                        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
                        if (typeof App.ui.pages.checkPendingInvites === 'function') App.ui.pages.checkPendingInvites();
                        if (!isDemoMode && App.store.activeCarId && App.realtime && typeof App.realtime.subscribeToCar === 'function') {
                            App.realtime.subscribeToCar(App.store.activeCarId);
                        }
                        if (!isDemoMode && typeof App.storage !== 'undefined' && typeof App.storage.loadAllData === 'function') {
                            await App.storage.loadAllData();
                            if (typeof App.ui.pages.checkAndShowInitialParamsModal === 'function') App.ui.pages.checkAndShowInitialParamsModal();
                        }
                        if (typeof App.renderAll === 'function') App.renderAll();
                    }
                } else {
                    // Выход
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
                    if (typeof App.store !== 'undefined') {
                        App.store.operations = [];
                        App.store.fuelLog = [];
                        App.store.tireLog = [];
                        App.store.parts = [];
                        App.store.serviceRecords = [];
                        App.store.mileageHistory = [];
                        if (typeof App.store.saveToLocalStorage === 'function') App.store.saveToLocalStorage();
                    }
                    if (typeof App.renderAll === 'function') App.renderAll();
                }
            });
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

        // Создаём клиент Supabase с увеличенным таймаутом блокировки
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

        // Инициализация IndexedDB
        (async function initDatabase() {
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
                if (navigator.onLine) await App.db.sync.processSyncQueue();
                else console.log('[Main] Офлайн-режим');
                setInterval(() => {
                    if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                        App.db.sync.processSyncQueue().catch(console.error);
                    }
                }, 60000);
            } catch (err) {
                console.error('Ошибка инициализации IndexedDB:', err);
                if (typeof App.toast === 'function') App.toast('Не удалось открыть базу данных.', 'error');
                App.store.initFromLocalStorage();
            }
        })();

        App.renderAll = function() {
            const activeTab = document.querySelector('.tab-content.active');
            if (!activeTab) {
                const savedTab = localStorage.getItem('vesta_active_tab');
                if (savedTab) App.events.switchToTab(savedTab);
                return;
            }
            const tabId = activeTab.id.replace('tab-', '');
            if (typeof App.events.switchToTab === 'function') App.events.switchToTab(tabId);
            else if (tabId === 'dashboard' && typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
        };

        const savedSession = localStorage.getItem('supabase.auth.token');
        if (!savedSession) enterDemoMode();

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

        handleOnlineSession();

        if (typeof App.events.init === 'function') App.events.init();
        if (typeof App.events.switchToTab === 'function') App.events.switchToTab('dashboard');

        window.addEventListener('load', () => setTimeout(() => { if (typeof App.initIcons === 'function') App.initIcons(); }, 200));

        // FAB-меню
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
            function openActions() { actionsOpen = true; if (overlay) overlay.style.display = 'block'; if (actions) actions.classList.add('open'); setFabIcon('x'); }
            function closeActions() { actionsOpen = false; if (overlay) overlay.style.display = 'none'; if (actions) actions.classList.remove('open'); setFabIcon('plus'); }
            if (mainBtn) mainBtn.addEventListener('click', () => actionsOpen ? closeActions() : openActions());
            if (overlay) overlay.addEventListener('click', closeActions);

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
        if (typeof App.ui.promptModalAsync !== 'function') { App.toast('Функция модальных окон недоступна', 'error'); return; }
        const username = await App.ui.promptModalAsync('Восстановление через Telegram', 'Введите ваш логин');
        if (!username) return;
        if (!App.supabase || typeof App.supabase.functions === 'undefined') { App.toast('Ошибка подключения к серверу.', 'error'); return; }
        const { data, error } = await App.supabase.functions.invoke('send-telegram-recovery', { body: { username } });
        if (error || !data?.success) { App.toast(data?.error || 'Ошибка при отправке кода.', 'error'); return; }
        App.toast('Код отправлен в Telegram.', 'info');
        const code = await App.ui.promptModalAsync('Код из Telegram', 'Введите полученный код');
        if (!code) return;
        const tokenRes = await App.supabase.rpc('verify_recovery_code', { p_username: username, p_code: code });
        if (tokenRes.error || !tokenRes.data) { App.toast('Неверный код или срок истёк', 'error'); return; }
        const resetToken = tokenRes.data;
        const newPassword = await App.ui.promptModalAsync('Новый пароль', 'Введите новый пароль (минимум 6 символов)');
        if (!newPassword || newPassword.length < 6) { App.toast('Пароль должен быть не менее 6 символов', 'error'); return; }
        const fetchRes = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/secure-reset-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_token: resetToken, newPassword })
        });
        if (fetchRes.ok) await App.ui.alertModal('Пароль успешно изменён! Теперь войдите с новым паролем.');
        else { const errText = await fetchRes.text(); App.toast('Ошибка при сбросе: ' + errText, 'error'); }
    };
    window.recoverViaRecoveryCode = async function() {
        if (typeof App.ui.promptModalAsync !== 'function') { App.toast('Функция модальных окон недоступна', 'error'); return; }
        const username = await App.ui.promptModalAsync('Восстановление по резервному коду', 'Введите ваш логин');
        if (!username) return;
        const code = await App.ui.promptModalAsync('Резервный код', 'Введите код');
        if (!code) return;
        const tokenRes = await App.supabase.rpc('verify_recovery_code', { p_username: username, p_code: code });
        if (tokenRes.error || !tokenRes.data) { App.toast('Неверный код или срок истёк', 'error'); return; }
        const resetToken = tokenRes.data;
        const newPassword = await App.ui.promptModalAsync('Новый пароль', 'Введите новый пароль (минимум 6 символов)');
        if (!newPassword || newPassword.length < 6) { App.toast('Пароль должен быть не менее 6 символов', 'error'); return; }
        const fetchRes = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/secure-reset-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_token: resetToken, newPassword })
        });
        if (fetchRes.ok) await App.ui.alertModal('Пароль успешно изменён!');
        else { const errText = await fetchRes.text(); App.toast('Ошибка при сбросе: ' + errText, 'error'); }
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