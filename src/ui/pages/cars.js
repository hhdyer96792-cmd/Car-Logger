// src/ui/pages/cars.js
window.App = window.App || {};
App.ui.pages = App.ui.pages || {};

// Делегирование для кнопок автомобиля (не теряется после перерисовки)
document.body.addEventListener('click', (e) => {
    const target = e.target.closest('#add-car-btn');
    if (target) {
        e.preventDefault();
        App.ui.pages.addCar();
        return;
    }
    const renameTarget = e.target.closest('#rename-car-btn');
    if (renameTarget) {
        e.preventDefault();
        App.ui.pages.renameCar();
        return;
    }
    const deleteTarget = e.target.closest('#delete-car-btn');
    if (deleteTarget) {
        e.preventDefault();
        App.ui.pages.deleteCar();
        return;
    }
    const saveDetailsTarget = e.target.closest('#save-car-details-btn');
    if (saveDetailsTarget) {
        e.preventDefault();
        // Сохраняем данные автомобиля
        const brand = document.getElementById('car-brand')?.value?.trim();
        const model = document.getElementById('car-model')?.value?.trim();
        const year = parseInt(document.getElementById('car-year')?.value) || null;
        const plate = document.getElementById('car-plate')?.value?.trim();
        const vin = document.getElementById('car-vin')?.value?.trim();
        if (brand !== undefined) App.store.settings.carBrand = brand || '';
        if (model !== undefined) App.store.settings.carModel = model || '';
        App.store.settings.carYear = year;
        if (plate !== undefined) App.store.settings.plateNumber = plate || '';
        if (vin !== undefined) App.store.settings.vin = vin || '';
        App.storage.saveSettings(App.store.settings).then(() => {
            App.toast('Данные автомобиля сохранены', 'success');
        }).catch(err => {
            console.error(err);
            App.toast('Ошибка сохранения', 'error');
        });
    }
});

/* ========== ЛОКАЛЬНЫЙ КЭШ ДОКУМЕНТОВ ========== */
App.ui.pages._carDocuments = [];

/* ========== БЕЗОПАСНОЕ ПОЛУЧЕНИЕ USER ID ========== */
App.ui.pages._getUserIdSafe = async function() {
    const { data: { session } } = await App.supabase.auth.getSession();
    return session?.user?.id || null;
};

/* ========== ФУНКЦИИ РАБОТЫ С ДОКУМЕНТАМИ ========== */
App.ui.pages.loadCarDocuments = async function() {
    if (!App.store.activeCarId) return [];
    try {
        const data = await App.supa.loadCarDocuments();
        App.ui.pages._carDocuments = data;
    } catch (e) {
        console.warn('Не удалось загрузить документы:', e);
        App.ui.pages._carDocuments = [];
    }
    return App.ui.pages._carDocuments;
};

App.ui.pages.addCarDocument = async function(doc) {
    if (!App.store.activeCarId) return null;
    try {
        const newDoc = await App.supa.addCarDocument(doc);
        App.ui.pages._carDocuments.unshift({
            id: newDoc.id,
            type: newDoc.type,
            date: newDoc.date,
            photoUrl: newDoc.photoUrl,
            amount: newDoc.amount,
            notes: newDoc.notes || ''
        });
        if (App.store.isPremium && typeof App.modules.load === 'function') {
            App.modules.load('premium/imageCache', true).then(imageCache => {
                if (imageCache && imageCache.cachePhotoAfterUpload) {
                    imageCache.cachePhotoAfterUpload(newDoc.photoUrl).catch(console.warn);
                }
            }).catch(err => console.warn('[ImageCache] Failed to load module:', err));
        }
        return newDoc;
    } catch (e) {
        console.error('Ошибка добавления документа:', e);
        return null;
    }
};

App.ui.pages.updateCarDocument = async function(docId, updates) {
    try {
        await App.supa.updateCarDocument(docId, updates);
        const idx = App.ui.pages._carDocuments.findIndex(d => d.id === docId);
        if (idx !== -1) Object.assign(App.ui.pages._carDocuments[idx], updates);
        return true;
    } catch (e) {
        console.error('Ошибка обновления документа:', e);
        return false;
    }
};

App.ui.pages.deleteCarDocument = async function(docId) {
    try {
        await App.supa.deleteCarDocument(docId);
        App.ui.pages._carDocuments = App.ui.pages._carDocuments.filter(d => d.id !== docId);
        return true;
    } catch (e) {
        console.error('Ошибка удаления документа:', e);
        return false;
    }
};

/* ========== РЕНДЕР СЕЛЕКТОРА АВТОМОБИЛЯ ========== */
App.ui.pages.renderCarSelector = function() {
    var container = document.getElementById('car-selector-container');
    if (!container) return;
    var html = '<select id="car-select"><option value="">-- Выберите авто --</option>';
    App.store.cars.forEach(function(car) {
        var selected = car.id == App.store.activeCarId ? ' selected' : '';
        html += '<option value="' + car.id + '"' + selected + '>' + App.utils.escapeHtml(car.name) + '</option>';
    });
    html += '</select>';
    container.innerHTML = html;

    document.getElementById('car-select').addEventListener('change', function() {
        var carId = this.value;
        if (carId) {
            App.store.setActiveCar(carId);
            if (App.realtime && App.realtime.subscribeToCar) {
                App.realtime.subscribeToCar(carId);
            }
            App.storage.loadAllData().then(function() {
                if (typeof App.renderAll === 'function') App.renderAll();
            });
            var sidebarSelect = document.getElementById('sidebar-car-select');
            if (sidebarSelect) sidebarSelect.value = carId;
            var car = App.store.cars.find(function(c) { return c.id == carId; });
            var currentCarNameEl = document.getElementById('current-car-name');
            if (currentCarNameEl && car) currentCarNameEl.textContent = car.name;
        }
    });

    var sidebarContainer = document.getElementById('sidebar-car-selector');
    if (sidebarContainer) {
        var sidebarHtml = '<select id="sidebar-car-select">' +
            '<option value="">-- Выберите авто --</option>';
        App.store.cars.forEach(function(car) {
            var selected = car.id == App.store.activeCarId ? ' selected' : '';
            sidebarHtml += '<option value="' + car.id + '"' + selected + '>' + App.utils.escapeHtml(car.name) + '</option>';
        });
        sidebarHtml += '</select>';
        sidebarContainer.innerHTML = sidebarHtml;

        document.getElementById('sidebar-car-select').addEventListener('change', function() {
            var carId = this.value;
            if (carId) {
                App.store.setActiveCar(carId);
                if (App.realtime && App.realtime.subscribeToCar) {
                    App.realtime.subscribeToCar(carId);
                }
                App.storage.loadAllData().then(function() {
                    if (typeof App.renderAll === 'function') App.renderAll();
                });
                var mainSelect = document.getElementById('car-select');
                if (mainSelect) mainSelect.value = carId;
            }
        });
    }
    App.initIcons();
};

/* ========== CRUD АВТОМОБИЛЕЙ (с поддержкой офлайн) ========== */
App.ui.pages.addCar = function() {
    App.ui.promptModal('Название автомобиля', 'Мой автомобиль', function(name) {
        if (!name) return;
        App.supa.createCar(name).then(function(res) {
            var car = res.data;
            if (!car) {
                console.warn('createCar вернул пустой ответ, перезагружаем список');
                return App.store.loadCars().then(function() {
                    App.ui.pages.renderCarSelector();
                });
            }
            App.store.cars.push(car);
            App.store.setActiveCar(car.id);
            App.ui.pages.renderCarSelector();
            if (App.realtime && App.realtime.subscribeToCar) {
                App.realtime.subscribeToCar(car.id);
            }
            App.storage.loadAllData().then(function() {
                if (typeof App.renderAll === 'function') App.renderAll();
                if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
            });
            App.toast('Автомобиль добавлен', 'success');
        }).catch(function(err) {
            console.error(err);
            App.toast('Ошибка создания авто', 'error');
        });
    });
};

App.ui.pages.renameCar = async function() {
    var carId = App.store.activeCarId;
    if (!carId) { App.toast('Нет выбранного автомобиля', 'warning'); return; }
    var userId = await App.ui.pages._getUserIdSafe();
    var car = App.store.cars.find(c => c.id == carId);
    if (!car || car.user_id !== userId) {
        App.toast('Только владелец может переименовывать автомобиль', 'warning');
        return;
    }
    App.ui.promptModal('Новое название', car.name, async function(newName) {
        if (!newName || newName === car.name) return;
        
        // Офлайн-режим: сохраняем действие в очередь
        if (!navigator.onLine) {
            await App.store.addPendingAction({
                type: 'save',
                entityType: 'car',
                entityId: carId,
                data: { id: carId, name: newName, user_id: car.user_id }
            });
            car.name = newName;
            await App.db.put('cars', car);
            App.ui.pages.renderCarSelector();
            if (typeof App.ui.pages.updateCarSelectorOnCarTab === 'function') App.ui.pages.updateCarSelectorOnCarTab();
            App.toast('Название обновлено локально, синхронизируется позже', 'warning');
            return;
        }
        
        try {
            await App.supa.renameCar(carId, newName);
            car.name = newName;
            App.ui.pages.renderCarSelector();
            if (typeof App.ui.pages.updateCarSelectorOnCarTab === 'function') App.ui.pages.updateCarSelectorOnCarTab();
            App.toast('Название обновлено', 'success');
        } catch (err) {
            console.error(err);
            App.toast('Ошибка переименования', 'error');
        }
    });
};

App.ui.pages.deleteCar = async function() {
    var carId = App.store.activeCarId;
    if (!carId) { App.toast('Нет выбранного автомобиля', 'warning'); return; }
    var userId = await App.ui.pages._getUserIdSafe();
    var car = App.store.cars.find(c => c.id == carId);
    if (!car || car.user_id !== userId) {
        App.toast('Только владелец может удалять автомобиль', 'warning');
        return;
    }
    App.ui.confirmModal('Удалить автомобиль и все его данные? Это действие необратимо.', async function() {
        if (!navigator.onLine) {
            // Офлайн: помечаем на удаление
            await App.store.addPendingAction({
                type: 'delete',
                entityType: 'car',
                entityId: carId,
                data: { id: carId }
            });
            App.store.cars = App.store.cars.filter(c => c.id != carId);
            App.store.activeCarId = null;
            await App.db.delete('cars', carId);
            App.ui.pages.renderCarSelector();
            App.toast('Автомобиль помечен на удаление, синхронизируется позже', 'warning');
            return;
        }
        
        try {
            await App.supa.deleteCar(carId);
            App.store.cars = App.store.cars.filter(c => c.id != carId);
            App.store.activeCarId = null;
            App.ui.pages.renderCarSelector();
            App.store.operations = [];
            App.store.fuelLog = [];
            App.store.tireLog = [];
            App.store.parts = [];
            App.store.serviceRecords = [];
            App.store.mileageHistory = [];
            if (typeof App.renderAll === 'function') App.renderAll();
            if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
            App.toast('Автомобиль удалён', 'success');
        } catch (err) {
            console.error(err);
            App.toast('Ошибка удаления', 'error');
        }
    });
};

/* ========== ПРИГЛАШЕНИЯ (ИСПРАВЛЕНА: однократная привязка через делегирование) ========== */
App.ui.pages.inviteUser = async function() {
    var carId = App.store.activeCarId;
    if (!carId) {
        App.toast('Сначала выберите автомобиль', 'warning');
        return;
    }
    try {
        console.log('[Invite] Вызов App.supa.createInviteLink для carId:', carId);
        if (!App.supa.createInviteLink) {
            console.error('[Invite] App.supa.createInviteLink не определён');
            App.toast('Функция приглашения временно недоступна', 'error');
            return;
        }
        const inviteLink = await App.supa.createInviteLink(carId);
        console.log('[Invite] Ссылка получена:', inviteLink);
        if (!inviteLink) {
            throw new Error('Не удалось создать ссылку');
        }
        var copyHtml = '<div style="margin-top:12px;">' +
            '<p class="hint">Ссылка для приглашения:</p>' +
            '<input type="text" value="' + inviteLink + '" readonly style="width:100%;" id="invite-link-input">' +
            '<button id="copy-invite-link-btn" class="primary-btn" style="margin-top:8px;">Копировать</button>' +
            '</div>';
        var modal = App.ui.createModal('Пригласить пользователя', copyHtml);
        document.getElementById('copy-invite-link-btn').addEventListener('click', function() {
            var input = document.getElementById('invite-link-input');
            input.select();
            document.execCommand('copy');
            App.toast('Ссылка скопирована в буфер обмена', 'success');
        });
    } catch (err) {
        console.error('[Invite] Ошибка создания приглашения:', err);
        App.toast('Ошибка создания приглашения: ' + (err.message || err), 'error');
    }
};

/* ========== КАЛЕНДАРЬ ========== */
App.ui.pages.subscribeToCalendar = async function() {
    var carId = App.store.activeCarId;
    if (!carId) { App.toast('Сначала выберите авто', 'warning'); return; }
    try {
        let token = await App.supa.getCalendarToken(carId);
        if (!token) {
            token = await App.supa.createCalendarToken(carId);
        }
        var feedUrl = `https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/calendar-feed?token=${token}`;
        var copyHtml = '<div style="margin-top:12px;">' +
            '<p class="hint">Скопируйте ссылку и добавьте в свой календарь как интернет-календарь:</p>' +
            '<input type="text" value="' + feedUrl + '" readonly style="width:100%;" id="calendar-feed-url">' +
            '<button id="copy-feed-url-btn" class="primary-btn" style="margin-top:8px;">Копировать</button>' +
            '</div>';
        var modal = App.ui.createModal('Подписка на календарь', copyHtml);
        document.getElementById('copy-feed-url-btn').addEventListener('click', function() {
            var input = document.getElementById('calendar-feed-url');
            input.select();
            document.execCommand('copy');
            App.toast('Ссылка скопирована', 'success');
        });
    } catch (err) {
        console.error(err);
        App.toast('Ошибка получения токена', 'error');
    }
};

App.ui.pages.updateCurrentCarName = function() {
    var car = App.store.cars.find(function(c) { return c.id == App.store.activeCarId; });
    var el = document.getElementById('current-car-name');
    if (el) el.textContent = car ? car.name : '';
};

/* ========== ПРИГЛАШЕНИЯ (ПРОВЕРКА) ========== */
App.ui.pages.checkPendingInvites = function() {
    var urlParams = new URLSearchParams(window.location.search);
    var inviteCode = urlParams.get('invite');

    if (inviteCode && !App.supabase.auth.getUser()) {
        sessionStorage.setItem('pendingInvite', inviteCode);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (inviteCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
        App.supa.getInviteByCode(inviteCode).then(function({ data, error }) {
            if (error || !data) {
                App.toast('Приглашение не найдено', 'error');
                return;
            }
            if (data.accepted) {
                App.toast('Приглашение уже принято', 'warning');
                return;
            }
            var carName = data.cars ? data.cars.name : 'автомобиль';
            App.ui.confirmModal(`Вас пригласили в автомобиль "${carName}". Принять?`, function() {
                App.supa.acceptInvite(data.id).then(function() {
                    App.toast('Приглашение принято!', 'success');
                    App.store.setActiveCar(data.car_id);
                    App.store.loadCars().then(function() {
                        App.ui.pages.renderCarSelector();
                        App.storage.loadAllData();
                    });
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка принятия приглашения', 'error');
                });
            });
        });
        return;
    }

    var pendingInvite = sessionStorage.getItem('pendingInvite');
    if (pendingInvite) {
        sessionStorage.removeItem('pendingInvite');
        window.history.replaceState({}, document.title, window.location.pathname + '?invite=' + pendingInvite);
        App.ui.pages.checkPendingInvites();
        return;
    }

    App.supa.getPendingInvites().then(function({ data, error }) {
        if (error || !data || data.length === 0) return;
        data.forEach(function(inv) {
            var carName = inv.cars ? inv.cars.name : 'автомобиль';
            App.ui.confirmModal(`Вас пригласили в автомобиль "${carName}". Принять?`, function() {
                App.supa.acceptInvite(inv.id).then(function() {
                    App.toast('Приглашение принято!', 'success');
                    App.store.setActiveCar(inv.car_id);
                    App.store.loadCars().then(function() {
                        App.ui.pages.renderCarSelector();
                        App.storage.loadAllData();
                    });
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка принятия приглашения', 'error');
                });
            }, function() {
                App.supa.declineInvite(inv.id);
            });
        });
    });
};

/* ========== НОВАЯ ВКЛАДКА «АВТОМОБИЛЬ» ========== */
App.ui.pages.renderCarTab = function() {
    var selector = document.getElementById('car-page-selector');
    if (selector) {
        selector.innerHTML = '<option value="">-- Выберите авто --</option>';
        App.store.cars.forEach(function(car) {
            var selected = car.id == App.store.activeCarId ? ' selected' : '';
            selector.innerHTML += '<option value="' + car.id + '"' + selected + '>' + App.utils.escapeHtml(car.name) + '</option>';
        });
        selector.onchange = function() {
            var carId = this.value;
            if (carId) {
                App.store.setActiveCar(carId);
                if (App.realtime && App.realtime.subscribeToCar) {
                    App.realtime.subscribeToCar(carId);
                }
                App.storage.loadAllData().then(function() {
                    App.ui.pages.loadCarDetailsWithRetry(carId);
                    App.ui.pages.renderCarSelector();
                    App.ui.pages.updateCurrentCarName();
                    App.ui.pages.renderSharingListForCarTab();
                    App.ui.pages.renderBasicParams();
                    App.ui.pages.loadCarDocuments().then(function() {
                        App.ui.pages.renderDocuments();
                    });
                });
            }
        };
    }

    // Используем onclick (гарантированная привязка) для кнопок
    const addCarBtn = document.getElementById('add-car-btn');
    if (addCarBtn) addCarBtn.onclick = () => App.ui.pages.addCar();
    const renameCarBtn = document.getElementById('rename-car-btn');
    if (renameCarBtn) renameCarBtn.onclick = () => App.ui.pages.renameCar();
    const deleteCarBtn = document.getElementById('delete-car-btn');
    if (deleteCarBtn) deleteCarBtn.onclick = () => App.ui.pages.deleteCar();
    const saveCarDetailsBtn = document.getElementById('save-car-details-btn');
    if (saveCarDetailsBtn) {
        saveCarDetailsBtn.onclick = function() {
            var brand = document.getElementById('car-brand')?.value?.trim();
            var model = document.getElementById('car-model')?.value?.trim();
            var year = parseInt(document.getElementById('car-year')?.value) || null;
            var plate = document.getElementById('car-plate')?.value?.trim();
            var vin = document.getElementById('car-vin')?.value?.trim();
            if (brand !== undefined) App.store.settings.carBrand = brand || '';
            if (model !== undefined) App.store.settings.carModel = model || '';
            App.store.settings.carYear = year;
            if (plate !== undefined) App.store.settings.plateNumber = plate || '';
            if (vin !== undefined) App.store.settings.vin = vin || '';
            App.storage.saveSettings(App.store.settings).then(function() {
                App.toast('Данные автомобиля сохранены', 'success');
            }).catch(function(err) {
                console.error(err);
                App.toast('Ошибка сохранения', 'error');
            });
        };
    }

    if (App.store.activeCarId) {
        App.ui.pages.loadCarDetailsWithRetry(App.store.activeCarId);
    } else {
        var brandField = document.getElementById('car-brand');
        if (brandField) brandField.value = '';
        var modelField = document.getElementById('car-model');
        if (modelField) modelField.value = '';
        var yearField = document.getElementById('car-year');
        if (yearField) yearField.value = '';
        var plateField = document.getElementById('car-plate');
        if (plateField) plateField.value = '';
        var vinField = document.getElementById('car-vin');
        if (vinField) vinField.value = '';
    }

    App.ui.pages.renderBasicParams();
    App.ui.pages.renderSharingListForCarTab();

    App.ui.pages.loadCarDocuments().then(function() {
        App.ui.pages.renderDocuments();
    });

    App.ui.pages.renderExportBlock();

    if (typeof App.ui.pages.initCsvImport === 'function') {
        App.ui.pages.initCsvImport();
    }
    
    // Удаляем старый блок кнопок VIN, если он есть
    var existingVinWrapper = document.getElementById('vin-buttons-wrapper');
    if (existingVinWrapper) {
        existingVinWrapper.remove();
    }
    
    var vinContainer = document.querySelector('.car-fields-grid');
    if (vinContainer) {
        var oldVinInput = document.getElementById('car-vin');
        if (!oldVinInput) {
            console.warn('[Cars] Поле car-vin не найдено, создаём динамически');
            var newVinInput = document.createElement('input');
            newVinInput.type = 'text';
            newVinInput.id = 'car-vin';
            newVinInput.placeholder = 'VIN';
            vinContainer.appendChild(newVinInput);
            oldVinInput = newVinInput;
        }
        if (oldVinInput) {
            var wrapper = document.createElement('div');
            wrapper.id = 'vin-buttons-wrapper';
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.gap = '8px';
            oldVinInput.parentNode.insertBefore(wrapper, oldVinInput);
            wrapper.appendChild(oldVinInput);
            
            var btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '8px';
            btnContainer.style.flexWrap = 'wrap';
            
            if (App.store.isPremium) {
                var vinBtn = document.createElement('button');
                vinBtn.id = 'vin-info-btn';
                vinBtn.className = 'secondary-btn';
                vinBtn.innerHTML = '<i data-lucide="info"></i> Инфо по VIN';
                btnContainer.appendChild(vinBtn);
                
                var plateBtn = document.createElement('button');
                plateBtn.id = 'plate-info-btn';
                plateBtn.className = 'secondary-btn';
                plateBtn.innerHTML = '<i data-lucide="flag"></i> Инфо по номеру';
                btnContainer.appendChild(plateBtn);
            } else {
                var hintSpan = document.createElement('span');
                hintSpan.className = 'hint';
                hintSpan.id = 'premium-hint-vin';
                hintSpan.innerHTML = '<i data-lucide="lock"></i> Поиск по VIN/номеру доступен в Premium';
                btnContainer.appendChild(hintSpan);
            }
            
            wrapper.appendChild(btnContainer);
            
            var vinInfoBtn = document.getElementById('vin-info-btn');
            if (vinInfoBtn) {
                vinInfoBtn.addEventListener('click', async () => {
                    if (!App.store.isPremium) {
                        App.modules.showUpgradeModal();
                        return;
                    }
                    const vin = document.getElementById('car-vin')?.value?.trim();
                    if (!vin || vin.length !== 17) {
                        App.toast('Введите корректный VIN (17 символов)', 'warning');
                        return;
                    }
                    try {
                        const module = await App.modules.load('premium/partsSearch', true);
                        if (module && module.showVehicleInfoModal) {
                            await module.showVehicleInfoModal(vin, 'vin');
                        }
                    } catch (err) {
                        console.error(err);
                        App.toast('Не удалось загрузить модуль поиска', 'error');
                    }
                });
            }
            
            var plateInfoBtn = document.getElementById('plate-info-btn');
            if (plateInfoBtn) {
                plateInfoBtn.addEventListener('click', async () => {
                    if (!App.store.isPremium) {
                        App.modules.showUpgradeModal();
                        return;
                    }
                    const country = await App.ui.promptModalAsync('Введите страну', 'uk - Великобритания, nl - Нидерланды');
                    if (!country || !['uk', 'nl'].includes(country.toLowerCase())) {
                        App.toast('Поддерживаемые страны: uk, nl', 'warning');
                        return;
                    }
                    const plate = await App.ui.promptModalAsync('Регистрационный номер', '');
                    if (!plate) return;
                    try {
                        const module = await App.modules.load('premium/partsSearch', true);
                        if (module && module.showVehicleInfoModal) {
                            await module.showVehicleInfoModal(`${country}:${plate.toUpperCase()}`, 'plate');
                        }
                    } catch (err) {
                        console.error(err);
                        App.toast('Не удалось загрузить модуль поиска', 'error');
                    }
                });
            }
        }
    }
    App.initIcons();
};

/* ========== УЛУЧШЕННАЯ ФУНКЦИЯ ЗАГРУЗКИ ДЕТАЛЕЙ ========== */
App.ui.pages.loadCarDetailsWithRetry = function(carId, maxAttempts = 20, delayMs = 200) {
    let attempts = 0;
    const tryLoad = () => {
        const brandField = document.getElementById('car-brand');
        const modelField = document.getElementById('car-model');
        const yearField = document.getElementById('car-year');
        const plateField = document.getElementById('car-plate');
        if (brandField && modelField && yearField && plateField) {
            App.ui.pages.loadCarDetails(carId);
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(tryLoad, delayMs);
        } else {
            console.error('[Cars] Не удалось найти поля ввода автомобиля');
            App.toast('Не удалось загрузить данные автомобиля. Пожалуйста, перезагрузите страницу.', 'error');
        }
    };
    tryLoad();
};

App.ui.pages.loadCarDetails = function(carId) {
    var brandField = document.getElementById('car-brand');
    var modelField = document.getElementById('car-model');
    var yearField = document.getElementById('car-year');
    var plateField = document.getElementById('car-plate');
    var vinField = document.getElementById('car-vin');
    
    if (!brandField || !modelField || !yearField || !plateField) return;
    
    var s = App.store.settings;
    brandField.value = (s.carBrand || '').toString();
    modelField.value = (s.carModel || '').toString();
    yearField.value = s.carYear || '';
    
    // Защита от объектов
    const plateValue = s.plateNumber;
    plateField.value = (plateValue && typeof plateValue === 'object') ? '' : (plateValue || '').toString();
    
    if (vinField) {
        const vinValue = s.vin;
        vinField.value = (vinValue && typeof vinValue === 'object') ? '' : (vinValue || '').toString();
    }
};

/* ========== ДЕЛЕГИРОВАНИЕ СОБЫТИЙ ДЛЯ КНОПКИ ПРИГЛАШЕНИЯ ========== */
function setupInviteDelegation() {
    document.body.addEventListener('click', function(e) {
        const target = e.target.closest('#invite-btn');
        if (target && target.id === 'invite-btn') {
            e.preventDefault();
            e.stopPropagation();
            App.ui.pages.inviteUser();
        }
    });
    console.log('[Cars] Делегирование для кнопки приглашения настроено');
}

if (!window._inviteDelegationSet) {
    setupInviteDelegation();
    window._inviteDelegationSet = true;
}

/* ========== ОСНОВНЫЕ ПАРАМЕТРЫ (с исправлением [object Object]) ========== */
App.ui.pages.renderBasicParams = async function() {
    let baseMileage = 0, baseMotohours = 0, purchaseDate = '', purchaseCost = 0;
    if (App.store.activeCarId && App.supa && typeof App.supa.getVehicleState === 'function') {
        try {
            const state = await App.supa.getVehicleState(App.store.activeCarId);
            if (state) {
                baseMileage = state.base_mileage || 0;
                baseMotohours = state.base_motohours || 0;
                purchaseDate = state.purchase_date || '';
                purchaseCost = state.purchase_cost || 0;
            }
        } catch (e) {
            console.warn('Ошибка загрузки базовых параметров:', e);
        }
    }

    var elBaseMileage = document.getElementById('set-base-mileage');
    var elBaseMotohours = document.getElementById('set-base-motohours');
    var elPurchaseDate = document.getElementById('purchase-date');
    var elPurchaseCost = document.getElementById('purchase-cost');
    if (elBaseMileage) elBaseMileage.value = baseMileage;
    if (elBaseMotohours) elBaseMotohours.value = baseMotohours;
    if (elPurchaseDate) elPurchaseDate.value = purchaseDate ? App.utils.isoToDDMMYYYY(purchaseDate) : '';
    if (elPurchaseCost) elPurchaseCost.value = purchaseCost;

    if (purchaseDate) {
        App.store.purchaseDate = purchaseDate;
        App.store.calculateOwnershipDays();
    }
    var currentMode = App.store.ownershipDisplayMode || 'days';
    var days = App.store.ownershipDays;
    var display = days;
    if (currentMode === 'months') display = (days / 30).toFixed(1);
    else if (currentMode === 'years') display = (days / 365).toFixed(1);
    var unit = currentMode === 'days' ? 'дн' : (currentMode === 'months' ? 'мес' : 'лет');
    var ownershipDaysEl = document.getElementById('ownership-days');
    if (ownershipDaysEl) ownershipDaysEl.value = display + ' ' + unit;

    App.store.purchaseCost = purchaseCost;
    App.ui.pages.updateOwnershipCost();

    var saveParamsBtn = document.getElementById('save-params-btn');
    if (saveParamsBtn) {
        saveParamsBtn.onclick = async function() {
            var newBaseMileage = parseInt(document.getElementById('set-base-mileage')?.value) || 0;
            var newBaseMotohours = parseInt(document.getElementById('set-base-motohours')?.value) || 0;
            var dateStr = document.getElementById('purchase-date')?.value || '';
            var newPurchaseDate = dateStr ? App.utils.ddmmYYYYtoISO(dateStr) : null;
            var newPurchaseCost = parseFloat(document.getElementById('purchase-cost')?.value) || 0;

            if (App.store.activeCarId && App.supa && typeof App.supa.updateVehicleState === 'function') {
                await App.supa.updateVehicleState(App.store.activeCarId, {
                    baseMileage: newBaseMileage,
                    baseMotohours: newBaseMotohours,
                    purchaseDate: newPurchaseDate,
                    purchaseCost: newPurchaseCost
                });
            }

            App.store.baseMileage = newBaseMileage;
            App.store.baseMotohours = newBaseMotohours;
            App.store.purchaseDate = newPurchaseDate;
            App.store.purchaseCost = newPurchaseCost;
            App.store.calculateOwnershipDays();
            App.ui.pages.updateOwnershipCost();
            App.toast('Параметры сохранены', 'success');
        };
    }

    var fields = [
        document.getElementById('set-base-mileage'),
        document.getElementById('set-base-motohours'),
        document.getElementById('purchase-date'),
        document.getElementById('purchase-cost')
    ];
    fields.forEach(function(f) { if (f) f.disabled = true; });

    var editParamsBtn = document.getElementById('edit-params-btn');
    if (editParamsBtn) {
        editParamsBtn.onclick = function() {
            fields.forEach(function(f) { if (f) f.disabled = false; });
            var baseMileageField = document.getElementById('set-base-mileage');
            if (baseMileageField) baseMileageField.focus();
        };
    }

    var originalSave = saveParamsBtn ? saveParamsBtn.onclick : null;
    if (saveParamsBtn) {
        saveParamsBtn.onclick = async function() {
            if (originalSave) await originalSave();
            fields.forEach(function(f) { if (f) f.disabled = true; });
        };
    }

    var clearParamsBtn = document.getElementById('clear-params-btn');
    if (clearParamsBtn) {
        clearParamsBtn.onclick = function() {
            App.ui.confirmModal('Удалить все основные параметры? Это действие нельзя отменить.', function() {
                var baseMileageField = document.getElementById('set-base-mileage');
                if (baseMileageField) baseMileageField.value = '';
                var baseMotohoursField = document.getElementById('set-base-motohours');
                if (baseMotohoursField) baseMotohoursField.value = '';
                var purchaseDateField = document.getElementById('purchase-date');
                if (purchaseDateField) purchaseDateField.value = '';
                var purchaseCostField = document.getElementById('purchase-cost');
                if (purchaseCostField) purchaseCostField.value = '';
                if (App.store.activeCarId && App.supa && typeof App.supa.updateVehicleState === 'function') {
                    App.supa.updateVehicleState(App.store.activeCarId, {
                        baseMileage: null,
                        baseMotohours: null,
                        purchaseDate: null,
                        purchaseCost: null
                    }).catch(err => console.error('Ошибка очистки параметров:', err));
                }
                App.store.baseMileage = 0;
                App.store.baseMotohours = 0;
                App.store.purchaseDate = '';
                App.store.purchaseCost = 0;
                App.store.ownershipDays = 0;
                var ownershipDaysEl = document.getElementById('ownership-days');
                if (ownershipDaysEl) ownershipDaysEl.value = '0 дн';
                App.ui.pages.updateOwnershipCost();
                fields.forEach(function(f) { if (f) f.disabled = true; });
                App.toast('Параметры очищены', 'success');
            });
        };
    }

    var toggleUnitBtn = document.getElementById('toggle-ownership-unit');
    if (toggleUnitBtn) {
        toggleUnitBtn.onclick = function() {
            App.ui.pages.toggleOwnershipUnit();
        };
    }

    var toggleCostBtn = document.getElementById('toggle-cost-unit');
    if (toggleCostBtn) {
        toggleCostBtn.onclick = function() {
            var mode = App.store._costDisplayMode || 'total';
            App.store._costDisplayMode = (mode === 'total') ? 'perKm' : 'total';
            App.ui.pages.updateOwnershipCost();
        };
    }
};

/* ========== ПЕРЕКЛЮЧЕНИЕ ЕДИНИЦ ВЛАДЕНИЯ ========== */
App.ui.pages.toggleOwnershipUnit = function() {
    var modes = ['days', 'months', 'years'];
    var cur = App.store.ownershipDisplayMode || 'days';
    var next = modes[(modes.indexOf(cur) + 1) % modes.length];
    App.store.ownershipDisplayMode = next;
    var days = App.store.ownershipDays;
    var display = days;
    if (next === 'months') display = (days / 30).toFixed(1);
    else if (next === 'years') display = (days / 365).toFixed(1);
    var unit = next === 'days' ? 'дн' : (next === 'months' ? 'мес' : 'лет');
    var el = document.getElementById('ownership-days');
    if (el) el.value = display + ' ' + unit;
};

App.ui.pages.updateOwnershipCost = function() {
    var totalCost = (App.store.purchaseCost || 0)
        + (App.store.parts || []).reduce(function(s, p) { return s + (parseFloat(p.price) || 0); }, 0)
        + (App.store.serviceRecords || []).reduce(function(s, r) {
            return s + (parseFloat(r.parts_cost) || 0) + (parseFloat(r.work_cost) || 0);
          }, 0)
        + (App.store.fuelLog || []).reduce(function(s, f) {
            return s + (parseFloat(f.liters) || 0) * (parseFloat(f.pricePerLiter) || 0);
          }, 0)
        + (App.store.tireLog || []).reduce(function(s, t) {
            return s + (parseFloat(t.purchaseCost) || 0) + (parseFloat(t.mountCost) || 0) + (parseFloat(t.diskCost) || 0);
          }, 0);

    var mileage = App.store.settings.currentMileage;
    var perKm = mileage > 0 ? (totalCost / mileage).toFixed(2) : '0';
    var displayMode = App.store._costDisplayMode || 'total';
    var displayValue = (displayMode === 'perKm') ? perKm + ' ₽/км' : totalCost.toLocaleString() + ' ₽';
    var costEl = document.getElementById('ownership-cost');
    if (costEl) costEl.value = displayValue;
};

/* ========== ЭКСПОРТ ДАННЫХ ========== */
App.ui.pages.renderExportBlock = function() {
    var exportBtn = document.getElementById('export-data-btn-car');
    if (exportBtn) {
        exportBtn.onclick = function() {
            var type = document.getElementById('export-type-select-car')?.value || 'to';
            var format = document.getElementById('export-format-select-car')?.value || 'csv';
            if (format === 'csv') {
                var exportData = App.ui.pages.getExportData(type);
                if (exportData && exportData.data) {
                    App.ui.pages.exportToCSV(exportData.data, exportData.filename, exportData.headers);
                }
            } else if (format === 'xlsx') {
                if (type === 'all') App.ui.pages.exportToExcelAll();
                else App.ui.pages.exportToExcelForType(type);
            }
        };
    }
};

/* ========== ДОКУМЕНТЫ (без изменений, но оставлен код) ========== */
App.ui.pages.renderDocuments = function() {
    var container = document.getElementById('documents-accordions');
    if (!container) return;

    var docs = App.ui.pages._carDocuments || [];
    var grouped = {};
    docs.forEach(function(doc) {
        var type = doc.type || 'Прочее';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(doc);
    });

    var html = '';
    var types = ['ОСАГО', 'Чек', 'Заказ-наряд', 'PDF', 'Прочее'];
    types.forEach(function(type) {
        var items = grouped[type] || [];
        html += '<div class="accordion-group">';
        html += '<div class="accordion-header">';
        html += '<i data-lucide="file-text"></i> ' + type + ' (' + items.length + ')';
        html += '<i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>';
        html += '</div>';
        html += '<div class="accordion-body">';
        if (items.length === 0) {
            html += '<p class="hint">Нет документов</p>';
        } else {
            items.forEach(function(doc) {
                html += '<div class="card-item">';
                html += '<div class="card-header">';
                html += '<span>' + (doc.date || '') + '</span>';
                html += '<div class="card-actions">';
                html += '<button class="icon-btn edit-doc-btn" data-id="' + doc.id + '"><i data-lucide="pencil"></i></button>';
                html += '<button class="icon-btn delete-doc-btn" data-id="' + doc.id + '"><i data-lucide="trash-2"></i></button>';
                html += '</div>';
                html += '</div>';
                if (doc.photoUrl) {
                    var isPdf = doc.photoUrl.toLowerCase().endsWith('.pdf');
                    if (isPdf) {
                        html += '<a href="' + doc.photoUrl + '" target="_blank" class="card-meta"><i data-lucide="file-text"></i> PDF-документ</a>';
                    } else {
                        html += '<a href="' + doc.photoUrl + '" target="_blank"><img src="' + doc.photoUrl + '" class="doc-preview" /></a>';
                    }
                }
                if (doc.amount) html += '<div class="card-meta">Сумма: ' + doc.amount + ' ₽</div>';
                if (doc.notes) html += '<div class="card-meta">' + App.utils.escapeHtml(doc.notes) + '</div>';
                html += '</div>';
            });
        }
        html += '</div></div>';
    });
    container.innerHTML = html;
    App.initIcons();

    container.querySelectorAll('.accordion-header').forEach(function(header) {
        header.addEventListener('click', function() {
            var body = header.nextElementSibling;
            if (body && body.classList.contains('accordion-body')) {
                body.classList.toggle('open');
                var arrow = header.querySelector('.accordion-arrow');
                if (arrow) arrow.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    });

    var addDocBtn = document.getElementById('add-document-btn');
    if (addDocBtn) addDocBtn.onclick = function() {
        var fileInput = document.getElementById('doc-file-input');
        if (fileInput) fileInput.click();
    };

    var uploadDocBtn = document.getElementById('upload-document-btn');
    if (uploadDocBtn) {
        uploadDocBtn.onclick = function() {
            var fileInput = document.getElementById('doc-file-upload');
            if (!fileInput) {
                fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.id = 'doc-file-upload';
                fileInput.accept = 'image/*,.pdf';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);
            }
            fileInput.click();

            fileInput.onchange = async function(e) {
                var file = e.target.files[0];
                if (!file) return;
                try {
                    var url = await App.supa.uploadPhoto(file);
                    var extension = file.name.split('.').pop().toLowerCase();
                    var docType = (extension === 'pdf') ? 'PDF' : 'Чек';

                    if (docType === 'Чек') {
                        try {
                            var rawText = await recognizeWithTesseract(url);
                            var ocrData = parseRawText(rawText);
                            var newDoc = {
                                type: ocrData.type || 'Чек',
                                date: ocrData.date || new Date().toISOString().split('T')[0],
                                photoUrl: url,
                                amount: ocrData.amount || 0,
                                notes: ''
                            };
                            await App.ui.pages.addCarDocument(newDoc);
                            App.ui.pages.renderDocuments();
                            App.toast('Документ добавлен и распознан', 'success');
                            return;
                        } catch (ocrErr) {}
                    }

                    var newDoc = {
                        type: docType,
                        date: new Date().toISOString().split('T')[0],
                        photoUrl: url,
                        amount: 0,
                        notes: ''
                    };
                    await App.ui.pages.addCarDocument(newDoc);
                    App.ui.pages.renderDocuments();
                    App.toast('Файл загружен', 'success');
                } catch (err) {
                    console.error('Upload failed:', err);
                    App.toast('Ошибка загрузки файла', 'error');
                }
                e.target.value = '';
            };
        };
    }

    async function recognizeWithTesseract(imageUrl) {
        try {
            const TesseractLib = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
            const Tesseract = TesseractLib.default || TesseractLib;
            const worker = await Tesseract.createWorker('rus');
            const { data: { text } } = await worker.recognize(imageUrl);
            await worker.terminate();
            return text;
        } catch (e) {
            console.warn('Tesseract не смог распознать:', e);
            return '';
        }
    }

    function parseRawText(text) {
        const lower = text.toLowerCase();
        let type = "Прочее";
        if (lower.includes("осаго") || lower.includes("страхов") || lower.includes("полис")) type = "ОСАГО";
        else if (lower.includes("заказ-наряд") || lower.includes("наряд-заказ") || lower.includes("ремонт")) type = "Заказ-наряд";
        else if (lower.includes("чек") || lower.includes("касс") || lower.includes("итог")) type = "Чек";

        let amount = null;
        const am = text.match(/(\d{1,3}(?:[.,]\d{2})?)\s?[₽р]|(?:итог|сумма|всего)[^\d]*(\d{1,3}(?:[.,]\d{2})?)/i);
        if (am) {
            const n = (am[1] || am[2]).replace(",", ".");
            amount = parseFloat(n);
            if (isNaN(amount)) amount = null;
        }

        let date = null;
        const dm = text.match(/(\d{2}[.\-/]\d{2}[.\-/]\d{4})/);
        if (dm) {
            const parts = dm[1].replace(/\//g, ".").split(".");
            if (parts.length === 3) date = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return { type, amount, date, rawText: text.substring(0, 500) };
    }

    var docFileInput = document.getElementById('doc-file-input');
    if (docFileInput) {
        docFileInput.onchange = async function(e) {
            var file = e.target.files[0];
            if (!file) return;
            try {
                var url = await App.supa.uploadPhoto(file);
                var rawText = await recognizeWithTesseract(url);
                var ocrData = parseRawText(rawText);
                var newDoc = {
                    type: ocrData.type || 'Чек',
                    date: ocrData.date || new Date().toISOString().split('T')[0],
                    photoUrl: url,
                    amount: ocrData.amount || 0,
                    notes: ''
                };
                await App.ui.pages.addCarDocument(newDoc);
                App.ui.pages.renderDocuments();
                App.toast('Документ добавлен и распознан', 'success');
            } catch (uploadError) {
                console.error('Upload failed:', uploadError);
                App.toast('Ошибка загрузки фото', 'error');
            }
            e.target.value = '';
        };
    }

    container.addEventListener('click', async function(e) {
        var target = e.target.closest('.edit-doc-btn');
        if (target) {
            var docId = target.dataset.id;
            var doc = App.ui.pages._carDocuments.find(d => d.id == docId);
            if (!doc) return;

            var content =
                '<form id="edit-doc-form">' +
                    '<label>Тип</label>' +
                    '<select name="type">' +
                        '<option value="ОСАГО" ' + (doc.type === 'ОСАГО' ? 'selected' : '') + '>ОСАГО</option>' +
                        '<option value="Чек" ' + (doc.type === 'Чек' ? 'selected' : '') + '>Чек</option>' +
                        '<option value="Заказ-наряд" ' + (doc.type === 'Заказ-наряд' ? 'selected' : '') + '>Заказ-наряд</option>' +
                        '<option value="PDF" ' + (doc.type === 'PDF' ? 'selected' : '') + '>PDF</option>' +
                        '<option value="Прочее" ' + (doc.type === 'Прочее' ? 'selected' : '') + '>Прочее</option>' +
                    '</select>' +
                    '<label>Сумма</label>' +
                    '<input type="number" name="amount" step="0.01" value="' + (doc.amount || '') + '">' +
                    '<label>Примечание</label>' +
                    '<textarea name="notes" rows="2">' + App.utils.escapeHtml(doc.notes || '') + '</textarea>' +
                    '<div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">' +
                        '<button type="submit" class="primary-btn">Сохранить</button>' +
                        '<button type="button" class="cancel-btn secondary-btn">Отмена</button>' +
                    '</div>' +
                '</form>';

            var modal = App.ui.createModal('Редактировать документ', content);
            var form = modal.querySelector('#edit-doc-form');

            form.onsubmit = async function(ev) {
                ev.preventDefault();
                var data = new FormData(form);
                doc.type = data.get('type') || 'Прочее';
                doc.amount = parseFloat(data.get('amount')) || 0;
                doc.notes = data.get('notes') || '';
                await App.ui.pages.updateCarDocument(doc.id, {
                    type: doc.type,
                    date: doc.date,
                    amount: doc.amount,
                    notes: doc.notes
                });
                modal.remove();
                App.ui.pages.renderDocuments();
            };

            modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
            return;
        }

        target = e.target.closest('.delete-doc-btn');
        if (target) {
            var docId = target.dataset.id;
            var doc = App.ui.pages._carDocuments.find(d => d.id == docId);
            if (!doc) return;
            App.ui.confirmModal('Удалить документ?', async function() {
                await App.ui.pages.deleteCarDocument(doc.id);
                App.ui.pages.renderDocuments();
            });
        }
    });
};

/* ========== МОДАЛЬНОЕ ОКНО НАЧАЛЬНЫХ ПАРАМЕТРОВ ========== */
App.ui.pages.showInitialParamsModal = function() {
    var todayStr = App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);

    var content =
        '<form id="initial-params-form">' +
            '<div class="car-params-row">' +
                '<div class="field-group">' +
                    '<label>Пробег до владения, км</label>' +
                    '<input type="number" id="init-base-mileage" placeholder="0">' +
                '</div>' +
                '<div class="field-group">' +
                    '<label>Моточасы до владения, ч</label>' +
                    '<input type="number" id="init-base-motohours" placeholder="0">' +
                '</div>' +
            '</div>' +
            '<div class="car-params-row">' +
                '<div class="field-group">' +
                    '<label>Дата покупки</label>' +
                    '<input type="text" id="init-purchase-date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + todayStr + '">' +
                '</div>' +
                '<div class="field-group">' +
                    '<label>Стоимость покупки</label>' +
                    '<input type="number" id="init-purchase-cost" placeholder="₽">' +
                '</div>' +
            '</div>' +
            '<div class="modal-actions" style="display:flex; gap:8px; justify-content:flex-end;">' +
                '<button type="submit" class="primary-btn"><i data-lucide="save"></i> Сохранить</button>' +
                '<button type="button" class="cancel-btn secondary-btn">Заполнить позже</button>' +
            '</div>' +
        '</form>';

    var modal = App.ui.createModal('Заполните основные параметры', content);
    App.initIcons();

    var form = modal.querySelector('#initial-params-form');

    form.onsubmit = async function(e) {
        e.preventDefault();
        var baseMileage = parseInt(document.getElementById('init-base-mileage').value) || 0;
        var baseMotohours = parseInt(document.getElementById('init-base-motohours').value) || 0;
        var dateStr = document.getElementById('init-purchase-date').value;
        var purchaseDate = dateStr ? App.utils.ddmmYYYYtoISO(dateStr) : null;
        var purchaseCost = parseFloat(document.getElementById('init-purchase-cost').value) || 0;

        if (App.store.activeCarId && App.supa && typeof App.supa.updateVehicleState === 'function') {
            await App.supa.updateVehicleState(App.store.activeCarId, {
                baseMileage: baseMileage,
                baseMotohours: baseMotohours,
                purchaseDate: purchaseDate,
                purchaseCost: purchaseCost
            });
            App.store.baseMileage = baseMileage;
            App.store.baseMotohours = baseMotohours;
            App.store.purchaseDate = purchaseDate;
            App.store.purchaseCost = purchaseCost;
            App.store.calculateOwnershipDays();
            App.ui.pages.updateOwnershipCost();
        }

        modal.remove();
        App.toast('Данные сохранены', 'success');
    };

    modal.querySelector('.cancel-btn').onclick = function() {
        modal.remove();
        App.toast('Можно заполнить на вкладке Автомобиль', 'info');
    };
};

App.ui.pages.checkAndShowInitialParamsModal = async function() {
    if (!App.store.activeCarId) return;
    if (typeof App.supa.getVehicleState !== 'function') {
        console.warn('[Cars] getVehicleState not available, skip initial params modal');
        return;
    }
    try {
        const state = await App.supa.getVehicleState(App.store.activeCarId);
        if (!state || (state.base_mileage === null && state.base_motohours === null && 
            state.purchase_date === null && state.purchase_cost === null)) {
            if (!sessionStorage.getItem('initial_params_shown')) {
                sessionStorage.setItem('initial_params_shown', '1');
                App.ui.pages.showInitialParamsModal();
            }
        }
    } catch (e) {
        console.warn('Ошибка проверки параметров:', e);
    }
};

/* ========== СОВМЕСТНЫЙ ДОСТУП (экспортные функции оставлены для совместимости) ========== */
App.ui.pages.renderSharingListForCarTab = function() {
    var container = document.getElementById('sharing-container');
    if (!container) return;
    var carId = App.store.activeCarId;
    if (!carId) {
        container.innerHTML = '<p class="hint">Выберите автомобиль</p>';
        return;
    }
    App.ui.pages._getUserIdSafe().then(function(userId) {
        if (!userId) {
            container.innerHTML = '<p class="hint">Не удалось определить пользователя</p>';
            return;
        }
        App.supa.getCarShares(carId).then(function({ data, error }) {
            if (error) { container.innerHTML = '<p class="hint">Ошибка загрузки</p>'; return; }
            var car = App.store.cars.find(c => c.id == carId);
            var isOwner = car && car.user_id === userId;
            var shares = data || [];
            if (!isOwner) shares = shares.filter(share => share.invited_user_id === userId);
            if (shares.length === 0) {
                container.innerHTML = '<p class="hint">Нет приглашённых пользователей</p>';
                App.initIcons(); return;
            }
            var html = '<ul style="list-style:none; padding:0;">';
            shares.forEach(function(share) {
                var statusIcon = share.accepted ? '<i data-lucide="check-circle" style="color:var(--success);"></i>' : '<i data-lucide="clock" style="color:var(--warning);"></i>';
                var statusText = share.accepted ? 'Принято' : 'Ожидает';
                var emailOrId = share.invited_email || (share.invited_user_id ? 'ID: ' + share.invited_user_id.substring(0,8) : '—');
                html += '<li style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">';
                html += '<span>' + statusIcon + ' <strong>' + App.utils.escapeHtml(emailOrId) + '</strong> (' + statusText + ')</span>';
                if (isOwner) html += '<button class="icon-btn remove-share-btn" data-id="' + share.id + '" title="Удалить доступ"><i data-lucide="trash-2"></i></button>';
                html += '</li>';
            });
            html += '</ul>';
            container.innerHTML = html;
            if (isOwner) {
                container.querySelectorAll('.remove-share-btn').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var shareId = btn.dataset.id;
                        App.ui.confirmModal('Удалить доступ для этого пользователя?', function() {
                            App.supa.deleteCarShare(shareId).then(function() {
                                App.toast('Доступ удалён', 'success');
                                App.ui.pages.renderSharingListForCarTab();
                            }).catch(function(err) {
                                console.error(err);
                                App.toast('Ошибка удаления доступа', 'error');
                            });
                        });
                    });
                });
            }
            App.initIcons();
        });
    }).catch(function(err) {
        console.error(err);
        container.innerHTML = '<p class="hint">Ошибка загрузки</p>';
    });
    
    // ==================== ЭКСПОРТ И ПРОЧИЕ ФУНКЦИИ ====================
    App.ui.pages.subscribeToPush = function() {};
    App.ui.pages.openPhotoFolder = function() { App.toast('Фотографии теперь хранятся в Supabase Storage', 'info'); };
    App.ui.pages.shareTable = function() { window.open('https://docs.google.com/spreadsheets/d/' + App.store.spreadsheetId + '/edit', '_blank'); };
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
        App.store.operations.forEach(function(op) { reportHtml += '<tr><td>' + App.utils.escapeHtml(op.category) + '</td><td>' + App.utils.escapeHtml(op.name) + '</td><td>' + (op.intervalKm || '—') + '</td><td>' + (op.intervalMonths || '—') + '</td><td>' + (op.lastDate || '—') + '</td><td>' + (op.lastMileage || '—') + '</td></table>'; });
        reportHtml += '</tbody></table><h2>История ТО</h2><tr><thead><tr><th>Дата</th><th>Операция</th><th>Пробег</th><th>Запчасти</th><th>Работа</th><th>DIY</th><th>Прим.</th></tr></thead><tbody>';
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

    // ========== ОБНОВЛЕНИЕ СЕЛЕКТОРА АВТОМОБИЛЕЙ НА ВКЛАДКЕ ==========
    App.ui.pages.updateCarSelectorOnCarTab = function() {
        const selector = document.getElementById('car-page-selector');
        if (!selector) return;
        if (!App.store.cars || App.store.cars.length === 0) {
            selector.innerHTML = '<option value="">-- Нет автомобилей --</option>';
            return;
        }
        let html = '';
        App.store.cars.forEach(car => {
            const selected = (car.id === App.store.activeCarId) ? ' selected' : '';
            html += `<option value="${car.id}"${selected}>${App.utils.escapeHtml(car.name)}</option>`;
        });
        selector.innerHTML = html;
        
        const newSelector = selector.cloneNode(true);
        selector.parentNode.replaceChild(newSelector, selector);
        newSelector.addEventListener('change', (e) => {
            const carId = e.target.value;
            if (carId) {
                App.store.setActiveCar(carId);
                if (typeof App.storage.loadAllData === 'function') App.storage.loadAllData();
            }
        });
        App.initIcons();
    };
};
