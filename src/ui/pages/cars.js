// src/ui/pages/cars.js
window.App = window.App || {};
App.ui.pages = App.ui.pages || {};

/* ========== ЛОКАЛЬНЫЙ КЭШ ДОКУМЕНТОВ ========== */
App.ui.pages._carDocuments = [];

/* ========== БЕЗОПАСНОЕ ПОЛУЧЕНИЕ USER ID ========== */
App.ui.pages._getUserIdSafe = async function() {
    const { data: { session } } = await App.supabase.auth.getSession();
    return session?.user?.id || null;
};

/* ========== ФУНКЦИИ РАБОТЫ С ДОКУМЕНТАМИ (через DAL) ========== */
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
        // Премиум-кэширование фото (асинхронно, без блокировки)
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

/* ========== CRUD АВТОМОБИЛЕЙ ========== */
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
        try {
            await App.supa.renameCar(carId, newName);
            car.name = newName;
            App.ui.pages.renderCarSelector();
            if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
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

/* ========== ПРИГЛАШЕНИЯ ========== */
App.ui.pages.inviteUser = async function() {
    var carId = App.store.activeCarId;
    if (!carId) { App.toast('Сначала выберите авто', 'warning'); return; }
    try {
        const inviteLink = await App.supa.createInviteLink(carId);
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
        console.error(err);
        App.toast('Ошибка создания приглашения', 'error');
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
                    App.ui.pages.loadCarDetails(carId);
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

    document.getElementById('add-car-btn').onclick = App.ui.pages.addCar;
    document.getElementById('rename-car-btn').onclick = App.ui.pages.renameCar;
    document.getElementById('delete-car-btn').onclick = App.ui.pages.deleteCar;
    document.getElementById('save-car-details-btn').onclick = function() {
        var brand = document.getElementById('car-brand').value.trim();
        var model = document.getElementById('car-model').value.trim();
        var year = parseInt(document.getElementById('car-year').value) || null;
        var plate = document.getElementById('car-plate').value.trim();
        var vin = document.getElementById('car-vin').value.trim();
        App.store.settings.carBrand = brand;
        App.store.settings.carModel = model;
        App.store.settings.carYear = year;
        App.store.settings.plateNumber = plate;
        App.store.settings.vin = vin;
        App.storage.saveSettings(App.store.settings).then(function() {
            App.toast('Данные автомобиля сохранены', 'success');
        });
    };

    if (App.store.activeCarId) {
        App.ui.pages.loadCarDetails(App.store.activeCarId);
    } else {
        document.getElementById('car-brand').value = '';
        document.getElementById('car-model').value = '';
        document.getElementById('car-year').value = '';
        document.getElementById('car-plate').value = '';
        document.getElementById('car-vin').value = '';
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
    
           var vinContainer = document.querySelector('.car-fields-grid');
    if (vinContainer) {
        var oldVinInput = document.getElementById('car-vin');
        var wrapper = null;
        
        // Создаём wrapper, если его ещё нет
        if (oldVinInput && !document.getElementById('vin-info-btn')) {
            wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.gap = '8px';
            wrapper.style.alignItems = 'center';
            oldVinInput.parentNode.insertBefore(wrapper, oldVinInput);
            wrapper.appendChild(oldVinInput);
            oldVinInput.style.flex = '1';
            
            var btn = document.createElement('button');
            btn.id = 'vin-info-btn';
            btn.className = 'secondary-btn';
            btn.innerHTML = '<i data-lucide="info"></i> Инфо по VIN';
            btn.style.width = 'auto';
            btn.style.whiteSpace = 'nowrap';
            wrapper.appendChild(btn);
            App.initIcons();
        } else {
            wrapper = oldVinInput ? oldVinInput.parentNode : null;
        }
        
        // Добавляем кнопку "Инфо по номеру", если её ещё нет
        if (wrapper && !document.getElementById('plate-info-btn')) {
            var plateBtn = document.createElement('button');
            plateBtn.id = 'plate-info-btn';
            plateBtn.className = 'secondary-btn';
            plateBtn.innerHTML = '<i data-lucide="flag"></i> Инфо по номеру';
            plateBtn.style.width = 'auto';
            plateBtn.style.whiteSpace = 'nowrap';
            wrapper.appendChild(plateBtn);
            App.initIcons();
        }
        
        // Обработчик для VIN
        var vinInfoBtn = document.getElementById('vin-info-btn');
        if (vinInfoBtn) {
            vinInfoBtn.addEventListener('click', async () => {
                const vin = document.getElementById('car-vin').value.trim();
                if (!vin || vin.length !== 17) {
                    App.toast('Введите корректный VIN (17 символов)', 'warning');
                    return;
                }
                if (!App.store.isPremium) {
                    App.modules.showUpgradeModal();
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
        
        // Обработчик для номера
        var plateInfoBtn = document.getElementById('plate-info-btn');
        if (plateInfoBtn) {
            plateInfoBtn.addEventListener('click', async () => {
                const country = prompt('Введите страну (uk - Великобритания, nl - Нидерланды):');
                if (!country || !['uk', 'nl'].includes(country.toLowerCase())) {
                    App.toast('Поддерживаемые страны: uk, nl', 'warning');
                    return;
                }
                const plate = prompt('Введите регистрационный номер:');
                if (!plate) return;
                if (!App.store.isPremium) {
                    App.modules.showUpgradeModal();
                    return;
                }
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
        
        App.initIcons();
    }   
};      

App.ui.pages.loadCarDetails = function(carId) {
    var s = App.store.settings;
    document.getElementById('car-brand').value = s.carBrand || '';
    document.getElementById('car-model').value = s.carModel || '';
    document.getElementById('car-year').value = s.carYear || '';
    document.getElementById('car-plate').value = s.plateNumber || '';
    document.getElementById('car-vin').value = s.vin || '';
};

/* ========== ОСНОВНЫЕ ПАРАМЕТРЫ ========== */
App.ui.pages.renderBasicParams = async function() {
    let baseMileage = 0, baseMotohours = 0, purchaseDate = '', purchaseCost = 0;
    if (App.store.activeCarId) {
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

    document.getElementById('set-base-mileage').value = baseMileage;
    document.getElementById('set-base-motohours').value = baseMotohours;
    document.getElementById('purchase-date').value = purchaseDate ? App.utils.isoToDDMMYYYY(purchaseDate) : '';
    document.getElementById('purchase-cost').value = purchaseCost;

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
    document.getElementById('ownership-days').value = display + ' ' + unit;

    App.store.purchaseCost = purchaseCost;
    App.ui.pages.updateOwnershipCost();

    // ---- Обработчики ----
    document.getElementById('save-params-btn').onclick = async function() {
        var newBaseMileage = parseInt(document.getElementById('set-base-mileage').value) || 0;
        var newBaseMotohours = parseInt(document.getElementById('set-base-motohours').value) || 0;
        var dateStr = document.getElementById('purchase-date').value;
        var newPurchaseDate = dateStr ? App.utils.ddmmYYYYtoISO(dateStr) : null;
        var newPurchaseCost = parseFloat(document.getElementById('purchase-cost').value) || 0;

        if (App.store.activeCarId) {
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

    var fields = [
        document.getElementById('set-base-mileage'),
        document.getElementById('set-base-motohours'),
        document.getElementById('purchase-date'),
        document.getElementById('purchase-cost')
    ];
    fields.forEach(function(f) { if (f) f.disabled = true; });

    document.getElementById('edit-params-btn').onclick = function() {
        fields.forEach(function(f) { if (f) f.disabled = false; });
        document.getElementById('set-base-mileage').focus();
    };

    var originalSave = document.getElementById('save-params-btn').onclick;
    document.getElementById('save-params-btn').onclick = async function() {
        if (originalSave) await originalSave();
        fields.forEach(function(f) { if (f) f.disabled = true; });
    };

    document.getElementById('clear-params-btn').onclick = function() {
        App.ui.confirmModal('Удалить все основные параметры? Это действие нельзя отменить.', function() {
            document.getElementById('set-base-mileage').value = '';
            document.getElementById('set-base-motohours').value = '';
            document.getElementById('purchase-date').value = '';
            document.getElementById('purchase-cost').value = '';
            if (App.store.activeCarId) {
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
            document.getElementById('ownership-days').value = '0 дн';
            App.ui.pages.updateOwnershipCost();
            fields.forEach(function(f) { if (f) f.disabled = true; });
            App.toast('Параметры очищены', 'success');
        });
    };

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
    document.getElementById('ownership-cost').value = displayValue;
};

/* ========== ЭКСПОРТ ДАННЫХ ========== */
App.ui.pages.renderExportBlock = function() {
    document.getElementById('export-data-btn-car').onclick = function() {
        var type = document.getElementById('export-type-select-car').value;
        var format = document.getElementById('export-format-select-car').value;
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
};

/* ========== ДОКУМЕНТЫ (ФОТО + OCR + АККОРДЕОНЫ) ========== */
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

    document.getElementById('add-document-btn').onclick = function() {
        document.getElementById('doc-file-input').click();
    };

    document.getElementById('upload-document-btn').onclick = function() {
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

    document.getElementById('doc-file-input').onchange = async function(e) {
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

        if (App.store.activeCarId) {
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
    // Проверяем, определена ли функция
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

/* ========== СОВМЕСТНЫЙ ДОСТУП ========== */
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
                var statusIcon = share.accepted ? '✅' : '⏳';
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
};