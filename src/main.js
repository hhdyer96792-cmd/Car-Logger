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
// ===== Конец полифила =====

(function() {
    var isLoggedIn = false;
    var deferredPrompt = null;
    var authSubscribed = false;

    function setInstallButtonVisible(visible) {
        var installBtn = document.getElementById('pwa-install-btn');
        if (!installBtn) return;
        if (window.matchMedia('(display-mode: standalone)').matches) {
            installBtn.style.display = 'none';
            return;
        }
        if (visible && deferredPrompt) {
            installBtn.style.display = 'block';
        } else {
            installBtn.style.display = 'none';
        }
    }

    function onReady() {
        document.body.classList.add('no-transition');

        var savedTheme = localStorage.getItem(App.config.THEME_KEY);
        if (savedTheme) {
            App.events.applyTheme(savedTheme);
        } else {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            App.events.applyTheme(prefersDark ? 'dark' : 'light');
        }

        setTimeout(function() {
            document.body.classList.remove('no-transition');
        }, 50);

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (!localStorage.getItem(App.config.THEME_KEY)) {
                App.events.applyTheme(e.matches ? 'dark' : 'light');
            }
        });

        App.supabase = supabase.createClient(
            'https://qbjlccdqaudyvedpysil.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU'
        );

        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(function(isPersisted) {
                console.log('Persistent storage:', isPersisted ? '✅ granted' : '❌ denied');
            }).catch(function(err) {
                console.warn('Persistent storage check failed:', err);
            });
        }

        // ===== ИНИЦИАЛИЗАЦИЯ INDEXEDDB, МИГРАЦИЯ, ЗАГРУЗКА ДАННЫХ, KILL SWITCH =====
        (async function initDatabase() {
            try {
                await App.db.init();
                const migrated = localStorage.getItem('vesta_migrated_to_indexeddb');
                if (!migrated) {
                    const confirmMigration = confirm('Перенести существующие данные в новую базу? (рекомендуется)');
                    if (confirmMigration) {
                        await App.db.migrateFromLocalStorage();
                        localStorage.setItem('vesta_migrated_to_indexeddb', 'true');
                    }
                }
                await App.store.loadFromIndexedDB();
                const { data: { session } } = await App.supabase.auth.getSession();
                if (session) {
                    const isKilled = await App.db.killSwitch.check();
                    if (isKilled) {
                        await App.db.killSwitch.destroyLocalDB();
                        return;
                    }
                    if (typeof App.db.killSwitch.startPeriodicCheck === 'function') {
                        App.db.killSwitch.startPeriodicCheck();
                    }
                }
                if (navigator.onLine) {
                    await App.db.sync.processSyncQueue();
                } else {
                    console.log('[Main] Офлайн-режим, синхронизация отложена');
                }
                setInterval(() => {
                    if (navigator.onLine && App.db.sync && !App.db.sync._isRunning) {
                        App.db.sync.processSyncQueue().catch(console.error);
                    }
                }, 60000);
            } catch (err) {
                console.error('Ошибка инициализации IndexedDB:', err);
                if (typeof App.toast === 'function') {
                    App.toast('Не удалось открыть базу данных. Некоторые функции будут недоступны.', 'error');
                }
                App.store.initFromLocalStorage();
            }
        })();

        App.renderAll = function() {
            var activeTab = document.querySelector('.tab-content.active');
            if (!activeTab) {
                var savedTab = localStorage.getItem('vesta_active_tab');
                if (savedTab) {
                    App.events.switchToTab(savedTab);
                }
                return;
            }
            var tabId = activeTab.id.replace('tab-', '');
            if (typeof App.events.switchToTab === 'function') {
                App.events.switchToTab(tabId);
            } else if (tabId === 'dashboard' && typeof App.ui.pages.renderDashboard === 'function') {
                App.ui.pages.renderDashboard();
            }
        };

        var authPanel = document.getElementById('auth-panel');
        var mobileRow = document.getElementById('mobile-header-row2');
        if (mobileRow) mobileRow.style.display = 'none';
        var syncIndicator = document.getElementById('sync-indicator');
        if (syncIndicator) syncIndicator.style.display = 'none';

        var isDemoMode = false;
        var demoModeInitialized = false;
        var sidebarLoginBtn = document.getElementById('sidebar-login');
        var drawerLoginBtn = document.getElementById('drawer-login');

        function enterDemoMode() {
            if (demoModeInitialized) return;
            demoModeInitialized = true;
            isDemoMode = true;
            App.store.operations = [
                { id: 'demo1', category: 'ДВС', name: 'Масло', intervalKm: 10000, intervalMonths: 12, lastMileage: 0, lastDate: null },
                { id: 'demo2', category: 'Тормозная система', name: 'Тормозные колодки', intervalKm: 30000, lastMileage: 0 }
            ];
            App.store.fuelLog = [
                { date: '2026-05-01', mileage: 1000, liters: 45, pricePerLiter: 50, fuelType: 'Бензин' }
            ];
            App.store.settings = {
                currentMileage: 5000,
                currentMotohours: 100,
                avgDailyMileage: 45,
                avgDailyMotohours: 1.8,
                telegramToken: '',
                telegramChatId: '',
                notificationMethod: 'telegram',
                carBrand: '',
                carModel: '',
                carYear: null,
                plateNumber: '',
                vin: ''
            };
            
            if (App.realtime && typeof App.realtime.unsubscribeAll === 'function') {
                App.realtime.unsubscribeAll();
            }

            var demoCarId = crypto.randomUUID();
            if (!App.store.cars || App.store.cars.length === 0) {
                App.store.cars = [{
                    id: demoCarId,
                    name: 'Мой автомобиль',
                    user_id: 'demo'
                }];
                App.store.setActiveCar(demoCarId);
            } else {
                App.store.setActiveCar(App.store.cars[0].id);
            }

            App.store.saveToLocalStorage();
            var dataPanel = document.getElementById('data-panel');
            if (dataPanel) dataPanel.style.display = 'block';

            if (typeof App.ui.pages.renderDashboard === 'function') {
                App.ui.pages.renderDashboard();
            }
            if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
            if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
            if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
            if (typeof App.renderAll === 'function') App.renderAll();
            if (typeof App.toast === 'function') App.toast('Демо‑режим. Войдите, чтобы сохранить данные.', 'info');
        }

        function initAuthFormEvents(container) {
            var tabLogin = container.querySelector('#tab-login');
            var tabSocial = container.querySelector('#tab-social');
            var authLoginDiv = container.querySelector('#auth-login');
            var authSocialDiv = container.querySelector('#auth-social');
            if (tabLogin) tabLogin.addEventListener('click', function() {
                tabLogin.classList.add('active'); tabSocial.classList.remove('active');
                authLoginDiv.style.display = 'block'; authSocialDiv.style.display = 'none';
            });
            if (tabSocial) tabSocial.addEventListener('click', function() {
                tabSocial.classList.add('active'); tabLogin.classList.remove('active');
                authSocialDiv.style.display = 'block'; authLoginDiv.style.display = 'none';
            });

            var googleBtn = container.querySelector('#supabase-auth-btn');
            if (googleBtn) {
                googleBtn.addEventListener('click', function() {
                    var redirectUrl = window.location.origin + window.location.pathname;
                    App.supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: redirectUrl }
                    }).catch(function(err) { App.toast('Ошибка входа через Google', 'error'); });
                });
            }

            var loginForm = container.querySelector('#login-form');
            var loginMessage = container.querySelector('#login-message');
            var passwordConfirmLabel = container.querySelector('#password-confirm-label');
            var passwordConfirmInput = container.querySelector('#password-confirm-input');

            if (loginForm) {
                loginForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    var formData = new FormData(loginForm);
                    var username = (formData.get('username') || '').toString().trim();
                    var password = formData.get('password') || '';
                    if (!username || !password) {
                        App.toast('Введите логин и пароль', 'error');
                        return;
                    }
                    var email = username + '@vesta.internal';
                    App.supabase.auth.signInWithPassword({ email: email, password: password })
                        .then(function(res) {
                            if (res.error) {
                                if (loginMessage) loginMessage.textContent = 'Неверный логин или пароль.';
                            } else {
                                var modal = container.closest('.modal');
                                if (modal) {
                                    modal.remove();
                                    document.body.classList.remove('auth-modal-open');
                                }
                            }
                        });
                });

                var signUpBtn = container.querySelector('#login-sign-up-btn');
                if (signUpBtn) {
                    signUpBtn.addEventListener('click', function() {
                        if (passwordConfirmLabel) passwordConfirmLabel.style.display = 'block';
                        if (passwordConfirmInput) {
                            passwordConfirmInput.style.display = 'block';
                            passwordConfirmInput.required = true;
                        }

                        var formData = new FormData(loginForm);
                        var username = (formData.get('username') || '').toString().trim();
                        var password = formData.get('password') || '';
                        var passwordConfirm = formData.get('password_confirm') || '';
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

                        var email = username + '@vesta.internal';
                        App.supabase.auth.signUp({
                            email: email,
                            password: password,
                            options: { data: { username: username } }
                        }).then(function(res) {
                            if (res.error) {
                                App.toast('Ошибка регистрации: ' + res.error.message, 'error');
                            } else {
                                if (res.data.session) {
                                    App.toast('Регистрация успешна!', 'success');
                                    if (passwordConfirmLabel) passwordConfirmLabel.style.display = 'none';
                                    if (passwordConfirmInput) {
                                        passwordConfirmInput.style.display = 'none';
                                        passwordConfirmInput.required = false;
                                    }
                                    loginForm.reset();
                                    if (loginMessage) loginMessage.textContent = '';
                                    container.closest('.modal').remove();
                                    document.body.classList.remove('auth-modal-open');
                                    if (res.data.user && typeof window.generateAndShowRecoveryCodes === 'function') {
                                        window.generateAndShowRecoveryCodes(res.data.user.id, username);
                                    }
                                } else {
                                    App.toast('Регистрация успешна! Подтвердите email, чтобы войти.', 'info');
                                }
                            }
                        });
                    });
                }
            }

            var forgotLink = container.querySelector('#forgot-access-link');
            var recoveryBlock = container.querySelector('#recovery-options');
            if (forgotLink) {
                forgotLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    if (recoveryBlock) recoveryBlock.style.display = 'block';
                });
            }

            var btnTelegram = container.querySelector('#recover-telegram');
            if (btnTelegram) btnTelegram.addEventListener('click', function() { window.recoverViaTelegram(); });

            var btnCode = container.querySelector('#recover-code');
            if (btnCode) btnCode.addEventListener('click', function() { window.recoverViaRecoveryCode(); });

            var btnRecoverGoogle = container.querySelector('#recover-google');
            if (btnRecoverGoogle) {
                btnRecoverGoogle.addEventListener('click', function() {
                    var redirectUrl = window.location.origin + window.location.pathname;
                    App.supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: redirectUrl }
                    });
                });
            }
        }

        function openAuthModal() {
            var template = document.getElementById('auth-template');
            if (!template) {
                console.error('Шаблон auth-template не найден');
                return;
            }
            var content = template.content.cloneNode(true);
            if (typeof App.ui.createModal !== 'function') {
                console.error('App.ui.createModal не определён');
                return;
            }
            var modal = App.ui.createModal('Аккаунт', '');
            if (!modal) return;
            var modalContent = modal.querySelector('.modal-content');
            if (!modalContent) return;
            modalContent.appendChild(content);
            document.body.classList.add('auth-modal-open');
            initAuthFormEvents(modalContent);
            var closeBtn = modalContent.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    modal.remove();
                    document.body.classList.remove('auth-modal-open');
                });
            }
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.remove();
                    document.body.classList.remove('auth-modal-open');
                }
            });
            modal.style.display = 'flex';
            if (typeof App.initIcons === 'function') App.initIcons();
        }

        if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openAuthModal);
        if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', openAuthModal);

        // PWA установка
        window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            deferredPrompt = e;
            setInstallButtonVisible(isLoggedIn);
        });
        window.addEventListener('appinstalled', function() {
            console.log('App installed');
            deferredPrompt = null;
            setInstallButtonVisible(false);
        });

        // Обработчик клика по кнопке установки PWA
        var pwaInstallBtn = document.getElementById('pwa-install-btn');
        if (pwaInstallBtn) {
            pwaInstallBtn.addEventListener('click', function() {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function(choiceResult) {
                        if (choiceResult.outcome === 'accepted') {
                            console.log('User accepted the install prompt');
                        } else {
                            console.log('User dismissed the install prompt');
                        }
                        deferredPrompt = null;
                        setInstallButtonVisible(false);
                    });
                }
            });
        }

        var savedSession = localStorage.getItem('supabase.auth.token');
        if (!savedSession) {
            enterDemoMode();
        }

        function doLogout() {
            if (typeof App.db.encryption !== 'undefined') App.db.encryption.clearMasterKey();
            if (typeof App.store === 'undefined') return;
            var loginFormEl = document.getElementById('login-form');
            if (loginFormEl) loginFormEl.reset();
            var usernameDisplayEl = document.getElementById('username-display');
            if (usernameDisplayEl) usernameDisplayEl.textContent = '';
            var sidebarUsernameEl = document.getElementById('sidebar-username');
            if (sidebarUsernameEl) sidebarUsernameEl.textContent = '';
            var carContainerEl = document.getElementById('car-selector-container');
            if (carContainerEl) carContainerEl.innerHTML = '';
            App.store.operations = [];
            App.store.fuelLog = [];
            App.store.tireLog = [];
            App.store.parts = [];
            App.store.serviceRecords = [];
            App.store.mileageHistory = [];
            App.store.cars = [];
            App.store.activeCarId = null;
            localStorage.removeItem('vesta_active_car_id');
            if (typeof App.store.saveToLocalStorage === 'function') App.store.saveToLocalStorage();
            App.supabase.auth.signOut().catch(function(e) { console.warn('Signout error', e); });
            isLoggedIn = false;
            setInstallButtonVisible(false);
            if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
            if (drawerLoginBtn) drawerLoginBtn.style.display = '';
            if (typeof App.events.closeDrawer === 'function') App.events.closeDrawer();
            if (typeof App.supa !== 'undefined' && App.supa.clearUserIdCache) {
                App.supa.clearUserIdCache();
            }
            enterDemoMode();
            if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
            if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
            if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
            if (typeof App.renderAll === 'function') App.renderAll();
        }

        var logoutSidebarBtn = document.getElementById('sidebar-logout');
        if (logoutSidebarBtn) logoutSidebarBtn.addEventListener('click', doLogout);
        var logoutDrawerBtn = document.getElementById('drawer-logout');
        if (logoutDrawerBtn) logoutDrawerBtn.addEventListener('click', doLogout);

        var isInitialized = false;

        async function handleOnlineSession() {
            if (!navigator.onLine) {
                isLoggedIn = true;
                setInstallButtonVisible(true);
                var dataPanel = document.getElementById('data-panel');
                if (dataPanel) dataPanel.style.display = 'block';
                var syncIndicatorOffline = document.getElementById('sync-indicator');
                if (syncIndicatorOffline) syncIndicatorOffline.style.display = '';
                var mobileRowOffline = document.getElementById('mobile-header-row2');
                if (mobileRowOffline) mobileRowOffline.style.display = 'flex';

                var cachedUsername = localStorage.getItem('vesta_username') || '';
                var displayElOffline = document.getElementById('username-display');
                if (displayElOffline && cachedUsername) {
                    displayElOffline.textContent = '👤 ' + cachedUsername;
                }
                var sidebarUsernameOffline = document.getElementById('sidebar-username');
                if (sidebarUsernameOffline && cachedUsername) {
                    sidebarUsernameOffline.textContent = '👤 ' + cachedUsername;
                }

                if (typeof App.store !== 'undefined' && typeof App.store.loadCars === 'function') {
                    try {
                        await App.store.loadCars();
                    } catch (e) {
                        console.warn('Офлайн: ошибка загрузки машин', e);
                    }
                    if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                    if (typeof App.renderAll === 'function') App.renderAll();
                }
                return;
            }

            if (!authSubscribed) {
                authSubscribed = true;
                App.supabase.auth.onAuthStateChange(async function(event, session) {
                    if (session) {
                        isLoggedIn = true;
                        setInstallButtonVisible(true);
                        isDemoMode = false;
                        demoModeInitialized = false;
                        if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';
                        if (drawerLoginBtn) drawerLoginBtn.style.display = 'none';
                        document.body.classList.remove('auth-modal-open');
                        var dataPanel = document.getElementById('data-panel');
                        if (dataPanel) dataPanel.style.display = 'block';
                        var syncIndicatorOnline = document.getElementById('sync-indicator');
                        if (syncIndicatorOnline) syncIndicatorOnline.style.display = '';
                        var mobileRowOnline = document.getElementById('mobile-header-row2');
                        if (mobileRowOnline) mobileRowOnline.style.display = 'flex';

                        // ===== ЗАПРОС ПАРОЛЯ ДЛЯ ШИФРОВАНИЯ =====
                        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                            if (typeof App.ui.promptModalAsync === 'function') {
                                const password = await App.ui.promptModalAsync('Введите пароль для расшифровки данных', '');
                                if (password) {
                                    const salt = App.db.encryption.getStoredSalt();
                                    const isValid = await App.db.encryption.verifyMasterKey(password, salt);
                                    if (isValid) {
                                        const { key } = await App.db.encryption.initMasterKey(password, salt);
                                        App.db.encryption.setMasterKey(key, salt);
                                        await App.store.loadFromIndexedDB();
                                        if (typeof App.renderAll === 'function') App.renderAll();
                                        App.toast('Расшифровка успешна', 'success');
                                    } else {
                                        App.toast('Неверный пароль. Чувствительные данные не будут расшифрованы.', 'error');
                                    }
                                } else {
                                    App.toast('Без пароля чувствительные данные будут недоступны', 'warning');
                                }
                            } else {
                                var pwd = prompt('Введите пароль для расшифровки данных:');
                                if (pwd) {
                                    const salt = App.db.encryption.getStoredSalt();
                                    const isValid = await App.db.encryption.verifyMasterKey(pwd, salt);
                                    if (isValid) {
                                        const { key } = await App.db.encryption.initMasterKey(pwd, salt);
                                        App.db.encryption.setMasterKey(key, salt);
                                        await App.store.loadFromIndexedDB();
                                        if (typeof App.renderAll === 'function') App.renderAll();
                                        App.toast('Расшифровка успешна', 'success');
                                    } else {
                                        App.toast('Неверный пароль. Чувствительные данные не будут расшифрованы.', 'error');
                                    }
                                } else {
                                    App.toast('Без пароля чувствительные данные будут недоступны', 'warning');
                                }
                            }
                        }
                        // ===== КОНЕЦ БЛОКА ШИФРОВАНИЯ =====

                        // ===== ИНИЦИАЛИЗАЦИЯ ПРЕМИУМ-ФУНКЦИЙ =====
                        if (App.premium && typeof App.premium.init === 'function') {
                            await App.premium.init();
                        }
                        // ===== КОНЕЦ БЛОКА PREMIUM =====

                        App.supabase.auth.getUser().then(function(userRes) {
                            var displayEl = document.getElementById('username-display');
                            if (displayEl && userRes.data.user && userRes.data.user.user_metadata && userRes.data.user.user_metadata.username) {
                                displayEl.textContent = '👤 ' + userRes.data.user.user_metadata.username;
                                localStorage.setItem('vesta_username', userRes.data.user.user_metadata.username);
                            }
                            var sidebarUsernameEl = document.getElementById('sidebar-username');
                            if (sidebarUsernameEl && userRes.data.user && userRes.data.user.user_metadata && userRes.data.user.user_metadata.username) {
                                sidebarUsernameEl.textContent = '👤 ' + userRes.data.user.user_metadata.username;
                            }
                        });

                        // Удалён некорректный вызов App.store.initFromLocalStorage()
                        
                        if (typeof App.ui.pages.checkPushSubscriptionStatus === 'function') {
                            App.ui.pages.checkPushSubscriptionStatus();
                        }

                        if (event === 'PASSWORD_RECOVERY') {
                            if (typeof App.ui.promptModalAsync === 'function') {
                                App.ui.promptModalAsync('Введите новый пароль', '').then(function(newPassword) {
                                    if (newPassword && newPassword.length >= 6) {
                                        App.supabase.auth.updateUser({ password: newPassword }).then(function(res) {
                                            if (res.error) {
                                                if (typeof App.toast === 'function') App.toast('Ошибка при смене пароля', 'error');
                                            } else {
                                                if (typeof App.toast === 'function') App.toast('Пароль успешно изменён!', 'success');
                                                window.location.hash = '';
                                                window.location.search = '';
                                            }
                                        });
                                    } else if (newPassword) {
                                        if (typeof App.toast === 'function') App.toast('Пароль должен содержать не менее 6 символов', 'error');
                                    }
                                });
                            } else {
                                var newPassword = prompt('Введите новый пароль (минимум 6 символов):');
                                if (newPassword && newPassword.length >= 6) {
                                    App.supabase.auth.updateUser({ password: newPassword }).then(function(res) {
                                        if (res.error) {
                                            if (typeof App.toast === 'function') App.toast('Ошибка при смене пароля', 'error');
                                        } else {
                                            if (typeof App.toast === 'function') App.toast('Пароль успешно изменён!', 'success');
                                            window.location.hash = '';
                                            window.location.search = '';
                                        }
                                    });
                                }
                            }
                        }

                        if (typeof App.store !== 'undefined' && typeof App.store.loadCars === 'function') {
                            App.store.loadCars().then(async function() {
                                if (App.store.cars.length === 0) {
                                    try {
                                        if (typeof App.supa !== 'undefined' && App.supa.createCar) {
                                            var newCar = await App.supa.createCar('Мой автомобиль');
                                            if (newCar && newCar.data) {
                                                App.store.cars.push(newCar.data);
                                                App.store.setActiveCar(newCar.data.id);
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('Не удалось создать автомобиль:', e);
                                    }
                                } else if (!App.store.activeCarId) {
                                    App.store.setActiveCar(App.store.cars[0].id);
                                }

                                if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
                                if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
                                if (typeof App.ui.pages.checkPendingInvites === 'function') App.ui.pages.checkPendingInvites();
                                if (!isDemoMode && App.store.activeCarId) {
                                    if (App.realtime && typeof App.realtime.subscribeToCar === 'function') {
                                        App.realtime.subscribeToCar(App.store.activeCarId);
                                    }
                                }
                                if (!isDemoMode && typeof App.storage !== 'undefined' && typeof App.storage.loadAllData === 'function') {
                                    App.storage.loadAllData().then(function() {
                                        if (typeof App.renderAll === 'function') App.renderAll();
                                        if (typeof App.ui.pages.checkAndShowInitialParamsModal === 'function') App.ui.pages.checkAndShowInitialParamsModal();
                                    });
                                } else {
                                    if (typeof App.renderAll === 'function') App.renderAll();
                                }
                            });
                        }
                    } else {
                        isLoggedIn = false;
                        setInstallButtonVisible(false);
                        if (typeof App.supa !== 'undefined' && App.supa.clearUserIdCache) {
                            App.supa.clearUserIdCache();
                        }
                        if (sidebarLoginBtn) sidebarLoginBtn.style.display = '';
                        if (drawerLoginBtn) drawerLoginBtn.style.display = '';
                        var dataPanel = document.getElementById('data-panel');
                        if (dataPanel) dataPanel.style.display = 'none';
                        var syncIndicatorOff = document.getElementById('sync-indicator');
                        if (syncIndicatorOff) syncIndicatorOff.style.display = 'none';
                        var mobileRowOff = document.getElementById('mobile-header-row2');
                        if (mobileRowOff) mobileRowOff.style.display = 'none';
                        var carContainerEl = document.getElementById('car-selector-container');
                        if (carContainerEl) carContainerEl.innerHTML = '';
                        var usernameDisplayEl = document.getElementById('username-display');
                        if (usernameDisplayEl) usernameDisplayEl.textContent = '';
                        var sidebarUsernameEl = document.getElementById('sidebar-username');
                        if (sidebarUsernameEl) sidebarUsernameEl.textContent = '';
                        if (App.realtime && typeof App.realtime.unsubscribeAll === 'function') {
                            App.realtime.unsubscribeAll();
                        }
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

        window.addEventListener('online', function() {
            if (typeof App.toast === 'function') App.toast('Сеть восстановлена', 'success');
            if (App.store && App.store.pendingActions && App.store.pendingActions.length > 0) {
                if (typeof App.toast === 'function') App.toast('Синхронизация офлайн-изменений...', 'info');
                App.store.pendingActions.forEach(function(action) {
                    if (action.type === 'service' && typeof App.logic.addServiceRecord === 'function') {
                        App.logic.addServiceRecord(
                            action.opId, action.date, action.mileage, action.motohours,
                            action.partsCost, action.workCost, action.isDIY, action.notes, action.photoUrl
                        );
                    }
                });
                if (typeof App.store.clearPendingActions === 'function') App.store.clearPendingActions();
            }
            handleOnlineSession();
        });

        window.addEventListener('offline', function() {
            if (typeof App.toast === 'function') App.toast('Вы офлайн', 'warning');
        });

        if (!isInitialized) {
            isInitialized = true;
            handleOnlineSession();
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(new URL('./service-worker.js', location.href)).then(function(registration) {
                console.log('✅ Сервис-воркер зарегистрирован:', registration.scope);
            }).catch(function(err) {
                console.error('❌ Ошибка регистрации сервис-воркера:', err);
            });
        }

        if (typeof App.events.init === 'function') App.events.init();
        if (typeof App.events.switchToTab === 'function') App.events.switchToTab('dashboard');

        window.addEventListener('load', function() {
            setTimeout(function() {
                if (typeof App.initIcons === 'function') App.initIcons();
            }, 200);
        });

        // ===== ПЛАВАЮЩАЯ FAB-КНОПКА =====
        (function() {
            var fab = document.createElement('div');
            fab.id = 'fab-menu';
            fab.innerHTML =
                '<div id="fab-overlay" class="fab-overlay" style="display:none;"></div>' +
                '<button id="fab-main-btn" class="fab-main"><i data-lucide="plus"></i></button>' +
                '<div id="fab-actions" class="fab-actions">' +
                    '<button id="fab-mileage" class="fab-action" title="Пробег"><i data-lucide="gauge"></i></button>' +
                    '<button id="fab-fuel" class="fab-action" title="Заправка"><i data-lucide="fuel"></i></button>' +
                    '<button id="fab-service" class="fab-action" title="ТО"><i data-lucide="wrench"></i></button>' +
                    '<button id="fab-part" class="fab-action" title="Запчасть"><i data-lucide="package"></i></button>' +
                '</div>';
            document.body.appendChild(fab);
            if (typeof App.initIcons === 'function') App.initIcons();

            var mainBtn = document.getElementById('fab-main-btn');
            var actions = document.getElementById('fab-actions');
            var overlay = document.getElementById('fab-overlay');
            var actionsOpen = false;

            function setFabIcon(name) {
                var icon = mainBtn ? mainBtn.querySelector('i') : null;
                if (icon) {
                    icon.setAttribute('data-lucide', name);
                    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                        lucide.createIcons({ elements: [mainBtn] });
                    }
                }
            }

            function openActions() {
                actionsOpen = true;
                if (overlay) overlay.style.display = 'block';
                if (actions) actions.classList.add('open');
                setFabIcon('x');
            }

            function closeActions() {
                actionsOpen = false;
                if (overlay) overlay.style.display = 'none';
                if (actions) actions.classList.remove('open');
                setFabIcon('plus');
            }

            if (mainBtn) {
                mainBtn.addEventListener('click', function() {
                    if (actionsOpen) closeActions();
                    else openActions();
                });
            }
            if (overlay) overlay.addEventListener('click', closeActions);

            var fabMileage = document.getElementById('fab-mileage');
            if (fabMileage) {
                fabMileage.addEventListener('click', function() {
                    closeActions();
                    if (typeof App.store === 'undefined' || !App.store.settings) return;
                    var currentMileage = App.store.settings.currentMileage || 0;
                    var currentMotohours = App.store.settings.currentMotohours || 0;
                    var content =
                        '<form id="mileage-form" style="display:flex; flex-direction:column; gap:12px;">' +
                            '<label>Моточасы, ч</label>' +
                            '<input type="number" id="fab-motohours-input" value="' + currentMotohours + '" required>' +
                            '<label>Пробег, км</label>' +
                            '<input type="number" id="fab-mileage-input" value="' + currentMileage + '" required>' +
                            '<div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">' +
                                '<button type="submit" class="primary-btn">Обновить</button>' +
                                '<button type="button" class="cancel-btn secondary-btn">Отмена</button>' +
                            '</div>' +
                        '</form>';
                    if (typeof App.ui.createModal !== 'function') return;
                    var modal = App.ui.createModal('Обновить пробег', content);
                    if (!modal) return;
                    var form = modal.querySelector('#mileage-form');
                    if (!form) return;
                    form.onsubmit = function(e) {
                        e.preventDefault();
                        var newM = parseFloat(document.getElementById('fab-mileage-input').value);
                        var newH = parseFloat(document.getElementById('fab-motohours-input').value);
                        if (isNaN(newM) || isNaN(newH)) {
                            if (typeof App.toast === 'function') App.toast('Введите числа', 'error');
                            return;
                        }
                        var dashM = document.getElementById('dash-new-mileage');
                        var dashH = document.getElementById('dash-new-motohours');
                        if (dashM) dashM.value = newM;
                        if (dashH) dashH.value = newH;
                        if (typeof App.events.updateMileageAndAverages === 'function') App.events.updateMileageAndAverages();
                        modal.remove();
                        if (typeof App.toast === 'function') App.toast('Пробег и моточасы обновлены', 'success');
                    };
                    var cancelBtn = modal.querySelector('.cancel-btn');
                    if (cancelBtn) cancelBtn.onclick = function() { modal.remove(); };
                });
            }

            var fabFuel = document.getElementById('fab-fuel');
            if (fabFuel) {
                fabFuel.addEventListener('click', function() {
                    closeActions();
                    if (typeof App.ui.pages.openFuelModal === 'function') App.ui.pages.openFuelModal(null);
                });
            }
            var fabService = document.getElementById('fab-service');
            if (fabService) {
                fabService.addEventListener('click', function() {
                    closeActions();
                    if (typeof App.ui.pages.openOperationForm === 'function') App.ui.pages.openOperationForm(null);
                });
            }
            var fabPart = document.getElementById('fab-part');
            if (fabPart) {
                fabPart.addEventListener('click', function() {
                    closeActions();
                    if (typeof App.ui.pages.openPartForm === 'function') App.ui.pages.openPartForm(null);
                });
            }
        })();
    }

    // ===== Глобальные функции восстановления =====
    window.recoverViaTelegram = async function() {
        try {
            if (typeof App.ui.promptModalAsync !== 'function') {
                App.toast('Функция модальных окон недоступна. Обновите страницу.', 'error');
                return;
            }
            const username = await App.ui.promptModalAsync('Восстановление через Telegram', 'Введите ваш логин');
            if (!username) return;

            if (!App.supabase || typeof App.supabase.functions === 'undefined') {
                App.toast('Ошибка подключения к серверу.', 'error');
                return;
            }

            const { data, error } = await App.supabase.functions.invoke('send-telegram-recovery', {
                body: { username: username }
            });
            if (error || !data || !data.success) {
                App.toast(data?.error || 'Ошибка при отправке кода.', 'error');
                return;
            }

            App.toast('Код отправлен в Telegram.', 'info');

            const input = await App.ui.promptModalAsync('Код из Telegram', 'Введите полученный код');
            if (!input) return;

            const tokenRes = await App.supabase.rpc('verify_recovery_code', {
                p_username: username,
                p_code: input
            });
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
                if (typeof App.ui.alertModal === 'function') {
                    App.ui.alertModal('Пароль успешно изменён! Теперь войдите с новым паролем.');
                } else {
                    alert('Пароль успешно изменён! Теперь войдите с новым паролем.');
                }
            } else {
                const errText = await fetchRes.text();
                App.toast('Ошибка при сбросе: ' + errText, 'error');
            }
        } catch (err) {
            console.error('recoverViaTelegram error:', err);
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
            if (typeof App.ui.promptModalAsync !== 'function') {
                App.toast('Функция модальных окон недоступна. Обновите страницу.', 'error');
                return;
            }
            const username = await App.ui.promptModalAsync('Восстановление по резервному коду', 'Введите ваш логин');
            if (!username) return;

            if (!App.supabase || typeof App.supabase.rpc !== 'function') {
                App.toast('Ошибка подключения к серверу.', 'error');
                return;
            }

            const code = await App.ui.promptModalAsync('Резервный код', 'Введите код');
            if (!code) return;

            const tokenRes = await App.supabase.rpc('verify_recovery_code', {
                p_username: username,
                p_code: code
            });
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
                if (typeof App.ui.alertModal === 'function') {
                    App.ui.alertModal('Пароль успешно изменён! Теперь войдите с новым паролем.');
                } else {
                    alert('Пароль успешно изменён! Теперь войдите с новым паролем.');
                }
            } else {
                const errText = await fetchRes.text();
                App.toast('Ошибка при сбросе: ' + errText, 'error');
            }
        } catch (err) {
            console.error('recoverViaRecoveryCode error:', err);
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
            const { data: codes, error } = await App.supabase.rpc('generate_recovery_codes', {
                p_user_id: userId
            });
            if (error || !codes || !codes.length) {
                console.error('Ошибка генерации кодов:', error);
                if (typeof App.ui.alertModal === 'function') {
                    App.ui.alertModal('Не удалось сгенерировать коды. Попробуйте позже.');
                } else {
                    alert('Не удалось сгенерировать коды. Попробуйте позже.');
                }
                return;
            }
            const msg = 'Ваши резервные коды для восстановления доступа (сохраните их!):\n\n' + codes.join('\n');
            if (typeof App.ui.alertModal === 'function') {
                App.ui.alertModal(msg);
            } else {
                alert(msg);
            }
        } catch (err) {
            console.error('generateAndShowRecoveryCodes error:', err);
            if (typeof App.ui.alertModal === 'function') {
                App.ui.alertModal('Не удалось сгенерировать коды. Попробуйте позже.');
            } else {
                alert('Не удалось сгенерировать коды. Попробуйте позже.');
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();