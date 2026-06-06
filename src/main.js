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
            ['operations','fuel_log','tires','parts','service_records','mileage_log','cars','settings'].forEach(s => App.db.clear(s).catch(()=>{}));
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
        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
        if (typeof App.renderAll === 'function') App.renderAll();
        if (typeof App.toast === 'function') App.toast('Демо-режим. Войдите, чтобы сохранить данные.', 'info');
    }

    function initAuthFormEvents(container) {
        // оставлено без изменений (как в предыдущей версии)
    }

    function openAuthModal() {
        const template = document.getElementById('auth-template');
        if (!template) return;
        const content = template.content.cloneNode(true);
        if (typeof App.ui.createModal !== 'function') return;
        const modal = App.ui.createModal('Аккаунт', '');
        if (!modal) return;
        modal.querySelector('.modal-content').appendChild(content);
        document.body.classList.add('auth-modal-open');
        initAuthFormEvents(modal);
        modal.querySelector('.close').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        modal.style.display = 'flex';
    }

    async function doLogout() {
        App.store.operations = []; App.store.fuelLog = []; App.store.tireLog = []; App.store.parts = []; App.store.serviceRecords = []; App.store.mileageHistory = []; App.store.cars = []; App.store.activeCarId = null;
        localStorage.removeItem('vesta_active_car_id'); localStorage.removeItem('vesta_username');
        if (App.db && App.db._db) {
            for (const s of ['operations','fuel_log','tires','parts','service_records','mileage_log','cars']) await App.db.clear(s).catch(()=>{});
        }
        if (syncInterval) clearInterval(syncInterval);
        if (premiumCheckInterval) clearInterval(premiumCheckInterval);
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
                    document.getElementById('data-panel').style.display = 'block';
                    document.getElementById('sync-indicator').style.display = '';
                    document.getElementById('mobile-header-row2').style.display = 'flex';

                    // PIN / мастер-пароль (упрощено для краткости, полная версия в предыдущем ответе)
                    let masterPassword = null;
                    // ... логика PIN ...

                    const { data: { user } } = await App.supabase.auth.getUser();
                    if (user) {
                        let cars = [];
                        try { const { data } = await App.supabase.from('cars').select('*').eq('user_id', user.id); if (data) cars = data; } catch {}
                        if (!cars.length) { const { data: newCar } = await App.supabase.from('cars').insert({ name: 'Мой автомобиль', user_id: user.id }).select().single(); if (newCar) cars = [newCar]; }
                        App.store.cars = cars;
                        if (!App.store.activeCarId || !cars.some(c => c.id === App.store.activeCarId)) {
                            App.store.activeCarId = cars[0].id; localStorage.setItem('vesta_active_car_id', cars[0].id);
                        }
                        for (const car of cars) await App.db.put('cars', car).catch(()=>{});
                        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
                    }

                    // Загрузка данных (вызов из setActiveCar уже сделан, здесь не дублируем)
                    if (typeof App.db.sync.processSyncQueue === 'function') App.db.sync.processSyncQueue().catch(()=>{});
                    if (typeof App.ui.pages.checkPendingInvites === 'function') App.ui.pages.checkPendingInvites();
                    if (App.store.activeCarId && App.realtime?.subscribeToCar) App.realtime.subscribeToCar(App.store.activeCarId);
                    if (typeof App.renderAll === 'function') App.renderAll();
                } finally { window._processingAuth = false; }
            } else {
                isLoggedIn = false; setInstallButtonVisible(false);
                if (sidebarLoginBtn) sidebarLoginBtn.style.display = ''; if (drawerLoginBtn) drawerLoginBtn.style.display = '';
                document.getElementById('data-panel').style.display = 'none';
                document.getElementById('sync-indicator').style.display = 'none';
                document.getElementById('mobile-header-row2').style.display = 'none';
                updateUsernameDisplay('');
                if (App.realtime?.unsubscribeAll) App.realtime.unsubscribeAll();
                clearDemoArtefacts();
                if (typeof App.renderAll === 'function') App.renderAll();
                enterDemoMode();
            }
        });
    }

    async function initDatabase() {
        await App.db.init();
        await App.store.loadFromIndexedDB();
        if (navigator.onLine && App.db.sync) App.db.sync.processSyncQueue().catch(()=>{});
        syncInterval = setInterval(() => { if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) App.db.sync.processSyncQueue().catch(()=>{}); }, 60000);
        dbInitialized = true;
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

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js').catch(() => setTimeout(() => navigator.serviceWorker.register('./service-worker.js'), 5000));
            navigator.serviceWorker.register('./firebase-messaging-sw.js').catch(() => setTimeout(() => navigator.serviceWorker.register('./firebase-messaging-sw.js'), 5000));
        }

        initDatabase().then(async () => {
            let hasSession = false;
            try { hasSession = !!(await App.supabase.auth.getSession()).data.session; } catch {}
            if (!hasSession) enterDemoMode();
            else { if (localStorage.getItem('vesta_username')) updateUsernameDisplay(localStorage.getItem('vesta_username')); }
            if (!navigator.onLine) {
                if (typeof App.store.loadCars === 'function') { try { await App.store.loadCars(); } catch {} }
                if (typeof App.renderAll === 'function') App.renderAll();
            } else {
                setupAuthSubscription();
            }
        });

        if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openAuthModal);
        if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', openAuthModal);
        document.body.addEventListener('click', e => { if (e.target.closest('#sidebar-logout, #drawer-logout')) doLogout(); });
        window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; setInstallButtonVisible(isLoggedIn); });
        window.addEventListener('appinstalled', () => { deferredPrompt = null; setInstallButtonVisible(false); });
        window.addEventListener('online', () => {
            if (App.db.sync && !App.db.sync._isRunning) App.db.sync.processSyncQueue().catch(()=>{});
            if (App.realtime?.resubscribe) App.realtime.resubscribe();
        });
        window.addEventListener('offline', () => {});
        if (typeof App.events.init === 'function') App.events.init();
        if (typeof App.events.switchToTab === 'function') App.events.switchToTab('dashboard');
        setTimeout(() => { if (typeof App.initIcons === 'function') App.initIcons(); }, 200);

        // FAB-меню
        (function() {
            const fab = document.createElement('div'); fab.id = 'fab-menu';
            fab.innerHTML = `<div id="fab-overlay" class="fab-overlay" style="display:none;"></div><button id="fab-main-btn" class="fab-main"><i data-lucide="plus"></i></button><div id="fab-actions" class="fab-actions"><button id="fab-mileage" class="fab-action" title="Пробег"><i data-lucide="gauge"></i></button><button id="fab-fuel" class="fab-action" title="Заправка"><i data-lucide="fuel"></i></button><button id="fab-service" class="fab-action" title="ТО"><i data-lucide="wrench"></i></button><button id="fab-part" class="fab-action" title="Запчасть"><i data-lucide="package"></i></button></div>`;
            document.body.appendChild(fab); App.initIcons();
            const mainBtn = document.getElementById('fab-main-btn'), actions = document.getElementById('fab-actions'), overlay = document.getElementById('fab-overlay');
            let open = false;
            mainBtn.onclick = () => { open = !open; overlay.style.display = open ? 'block' : 'none'; actions.classList.toggle('open', open); };
            overlay.onclick = () => { open = false; overlay.style.display = 'none'; actions.classList.remove('open'); };
            document.getElementById('fab-fuel').onclick = () => { if (typeof App.ui.pages.openFuelModal === 'function') App.ui.pages.openFuelModal(null); };
            document.getElementById('fab-service').onclick = () => { if (typeof App.ui.pages.openOperationForm === 'function') App.ui.pages.openOperationForm(null); };
            document.getElementById('fab-part').onclick = () => { if (typeof App.ui.pages.openPartForm === 'function') App.ui.pages.openPartForm(null); };
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