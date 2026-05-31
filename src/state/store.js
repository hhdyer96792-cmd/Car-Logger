// src/state/store.js
window.App = window.App || {};

App.store = {
    spreadsheetId: '',

    operations: [],
    parts: [],
    fuelLog: [],
    tireLog: [],
    workCosts: [],
    serviceRecords: [],
    mileageHistory: [],

    cars: [],
    activeCarId: null,

    settings: {
        currentMileage: 0,
        currentMotohours: 0,
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
    },

    baseMileage: 0,
    baseMotohours: 0,
    purchaseDate: '',

    ownershipDays: 0,
    ownershipDisplayMode: 'days',

    pendingActions: [],
    calendarEventCache: new Map(),
    serverTimestamps: {},

    isRecordPending: function(recordId) {
        if (!recordId) return false;
        return this.pendingActions.some(action => 
            action.entityId == recordId && 
            (action.type === 'save' || action.type === 'update')
        );
    },

    // ========== ЗАГРУЗКА ИЗ INDEXEDDB БЕЗ ДУБЛЕЙ ==========
    loadFromIndexedDB: async function() {
    if (!App.db || !App.db._db) {
        console.warn('[Store] IndexedDB не инициализирована, загружаю из localStorage (fallback)');
        this.initFromLocalStorage();
        return;
    }

    try {
        const carId = this.activeCarId;
        
        const allOps = await App.db.getAll('operations');
        const allFuel = await App.db.getAll('fuel_log');
        const allTires = await App.db.getAll('tires');
        const allParts = await App.db.getAll('parts');
        const allHistory = await App.db.getAll('service_records');
        const allMileage = await App.db.getAll('mileage_log');

        if (carId) {
            // Используем Map для устранения дублей по id
            const opsMap = new Map();
            allOps.filter(op => op.car_id == carId).forEach(op => {
                if (!opsMap.has(op.id)) opsMap.set(op.id, op);
            });
            this.operations = Array.from(opsMap.values()).map(op => ({
                id: op.id,
                uuid: op.id,
                category: op.category,
                name: op.name,
                intervalKm: op.intervalKm || 0,
                intervalMonths: op.intervalMonths || 0,
                intervalMotohours: op.intervalMotohours || null,
                lastDate: op.lastDate || null,
                lastMileage: op.lastMileage || 0,
                lastMotohours: op.lastMotohours || 0,
                updatedAt: op.updatedAt,
                car_id: op.car_id
            }));

            const fuelMap = new Map();
            allFuel.filter(f => f.car_id == carId).forEach(f => {
                if (!fuelMap.has(f.id)) fuelMap.set(f.id, f);
            });
            this.fuelLog = Array.from(fuelMap.values()).map(f => ({
                id: f.id,
                uuid: f.id,
                date: f.date,
                mileage: f.mileage,
                liters: f.liters,
                pricePerLiter: f.pricePerLiter,
                fullTank: f.fullTank ? 'TRUE' : '',
                fuelType: f.fuelType || 'Бензин',
                notes: f.notes || '',
                car_id: f.car_id
            }));

            const tiresMap = new Map();
            allTires.filter(t => t.car_id == carId).forEach(t => {
                if (!tiresMap.has(t.id)) tiresMap.set(t.id, t);
            });
            this.tireLog = Array.from(tiresMap.values()).map(t => ({
                id: t.id,
                uuid: t.id,
                date: t.date,
                type: t.type || '',
                mileage: t.mileage,
                model: t.model || '',
                size: t.size || '',
                wear: t.wear || '',
                notes: t.notes || '',
                purchaseCost: t.purchaseCost || 0,
                mountCost: t.mountCost || 0,
                isDIY: t.isDIY || false,
                car_id: t.car_id
            }));

            const partsMap = new Map();
            allParts.filter(p => p.car_id == carId).forEach(p => {
                if (!partsMap.has(p.id)) partsMap.set(p.id, p);
            });
            this.parts = Array.from(partsMap.values()).map(p => ({
                id: p.id,
                uuid: p.id,
                operation: p.operation || '',
                oem: p.oem || '',
                analog: p.analog || '',
                price: p.price || '',
                supplier: p.supplier || '',
                link: p.link || '',
                comment: p.comment || '',
                inStock: p.inStock || 0,
                location: p.location || '',
                dateAdded: p.dateAdded || '',
                car_id: p.car_id
            }));

            const historyMap = new Map();
            allHistory.filter(h => h.car_id == carId).forEach(h => {
                if (!historyMap.has(h.id)) historyMap.set(h.id, h);
            });
            this.serviceRecords = Array.from(historyMap.values()).map(h => ({
                id: h.id,
                operation_id: h.operation_id,
                date: h.date,
                mileage: h.mileage || '',
                motohours: h.motohours || '',
                parts_cost: h.parts_cost || 0,
                work_cost: h.work_cost || 0,
                is_diy: h.is_diy || false,
                notes: h.notes || '',
                photo_url: h.photo_url || '',
                user_id: h.user_id,
                rowIndex: h.id,
                car_id: h.car_id
            }));

            const mileageMap = new Map();
            allMileage.filter(m => m.car_id == carId).forEach(m => {
                if (!mileageMap.has(m.id)) mileageMap.set(m.id, m);
            });
            this.mileageHistory = Array.from(mileageMap.values()).map(m => ({
                id: m.id,
                date: m.date,
                mileage: m.mileage,
                motohours: m.motohours || 0,
                car_id: m.car_id
            })).sort((a, b) => new Date(a.date) - new Date(b.date));
        } else {
            this.operations = [];
            this.fuelLog = [];
            this.tireLog = [];
            this.parts = [];
            this.serviceRecords = [];
            this.mileageHistory = [];
        }

        const cars = await App.db.getAll('cars');
        this.cars = cars;
        if (!this.activeCarId && cars.length > 0) {
            this.activeCarId = cars[0].id;
            localStorage.setItem('vesta_active_car_id', this.activeCarId);
        }

        const pending = await App.db.getAll('pending_actions');
        this.pendingActions = pending.sort((a, b) => a.timestamp - b.timestamp);

        // ========== ЗАГРУЗКА НАСТРОЕК С ДЕШИФРОВКОЙ ==========
        if (this.activeCarId) {
            const carSettings = await App.db.getById('car_settings', this.activeCarId);
            if (carSettings) {
                let decrypted = carSettings;
                const masterKey = App.db.encryption.getMasterKey();
                if (masterKey && carSettings.telegramToken && typeof carSettings.telegramToken === 'object') {
                    decrypted = await App.db.encryption.decryptSettings(carSettings, masterKey);
                }
                // Принудительно преобразуем поля в строки (защита от [object Object])
                if (decrypted.plateNumber && typeof decrypted.plateNumber !== 'string') {
                    decrypted.plateNumber = String(decrypted.plateNumber);
                }
                if (decrypted.vin && typeof decrypted.vin !== 'string') {
                    decrypted.vin = String(decrypted.vin);
                }
                Object.assign(this.settings, decrypted);
            } else if (typeof App.storage.loadSettingsForCar === 'function') {
                await App.storage.loadSettingsForCar(this.activeCarId);
            }
        }

        this.baseMileage = 0;
        this.baseMotohours = 0;
        this.purchaseDate = '';
        this.calculateOwnershipDays();
        console.log('[Store] Данные загружены из IndexedDB с фильтром car_id =', carId);
    } catch (err) {
        console.error('[Store] Ошибка загрузки из IndexedDB:', err);
        this.initFromLocalStorage();
    }
},

    // ========== FALLBACK ==========
    initFromLocalStorage: function() {
        var cached = localStorage.getItem(App.config.CACHE_KEY);
        if (cached) {
            var d = JSON.parse(cached);
            this.operations = d.operations || [];
            this.settings = d.settings || App.defaults.settings;
            this.parts = d.parts || [];
            this.fuelLog = d.fuelLog || [];
            this.tireLog = d.tireLog || [];
            this.workCosts = d.workCosts || [];
            this.baseMileage = d.baseMileage || 0;
            this.baseMotohours = d.baseMotohours || 0;
            this.purchaseDate = d.purchaseDate || '';
        }
        var pendingRaw = localStorage.getItem(App.config.PENDING_KEY);
        this.pendingActions = pendingRaw ? JSON.parse(pendingRaw) : [];
        try {
            var calRaw = localStorage.getItem(App.config.CALENDAR_CACHE_KEY);
            if (calRaw) {
                var entries = JSON.parse(calRaw);
                this.calendarEventCache = new Map(entries);
            }
        } catch (e) {}
        var notifMethod = localStorage.getItem(App.config.NOTIFICATION_METHOD_KEY);
        if (notifMethod) this.settings.notificationMethod = notifMethod;
        this.loadPriceHistory();
        this.activeCarId = localStorage.getItem('vesta_active_car_id') || null;
        this.calculateOwnershipDays();
        console.warn('[Store] Используется устаревший initFromLocalStorage');
    },

    // ========== СОХРАНЕНИЕ В INDEXEDDB ==========
    saveOperationToDB: async function(op) {
        if (!op.id) op.id = crypto.randomUUID();
        await App.db.put('operations', op);
    },
    saveFuelRecordToDB: async function(record) {
        if (!record.id) record.id = crypto.randomUUID();
        await App.db.put('fuel_log', record);
    },
    saveTireRecordToDB: async function(record) {
        if (!record.id) record.id = crypto.randomUUID();
        await App.db.put('tires', record);
    },
    savePartToDB: async function(part) {
        if (!part.id) part.id = crypto.randomUUID();
        await App.db.put('parts', part);
    },
    saveHistoryRecordToDB: async function(record) {
        if (!record.id) record.id = crypto.randomUUID();
        await App.db.put('service_records', record);
    },
    saveMileageRecordToDB: async function(record) {
        if (!record.id) record.id = crypto.randomUUID();
        await App.db.put('mileage_log', record);
    },
    saveSettingsToDB: async function() {
        const carId = this.activeCarId;
        if (!carId) return;
        const settingsToSave = { car_id: carId, ...this.settings };
        if (!settingsToSave.id) settingsToSave.id = carId;
        const masterKey = App.db.encryption.getMasterKey();
        if (masterKey) {
            const encrypted = await App.db.encryption.encryptSettings(settingsToSave, masterKey);
            await App.db.put('car_settings', encrypted);
        } else {
            await App.db.put('car_settings', settingsToSave);
        }
    },
    saveCarToDB: async function(car) {
        await App.db.put('cars', car);
    },

    // ========== ОЧЕРЕДЬ СИНХРОНИЗАЦИИ ==========
    addPendingAction: async function(action) {
        const newAction = {
            id: crypto.randomUUID(),
            type: action.type,
            entityType: action.entityType,
            entityId: action.entityId,
            data: action.data,
            timestamp: Date.now(),
            retryCount: 0
        };
        this.pendingActions.push(newAction);
        await App.db.put('pending_actions', newAction);
    },
    clearPendingActions: async function() {
        await App.db.clear('pending_actions');
        this.pendingActions = [];
    },
    removePendingAction: async function(actionId) {
        await App.db.delete('pending_actions', actionId);
        this.pendingActions = this.pendingActions.filter(a => a.id !== actionId);
    },

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========
    saveToLocalStorage: function() {
        console.warn('[Store] saveToLocalStorage игнорируется, данные в IndexedDB');
    },
    loadPriceHistory: function() {},
    savePriceHistory: function() {},
    saveServerTimestamps: function() {},
    hasConflict: function() { return false; },
    updateServerTimestamp: function() {},

    calculateOwnershipDays: function() {
        if (!this.purchaseDate) {
            this.ownershipDays = 0;
            return;
        }
        const now = new Date();
        const purchase = new Date(this.purchaseDate);
        if (isNaN(purchase.getTime())) {
            this.ownershipDays = 0;
            return;
        }
        this.ownershipDays = Math.floor(Math.abs(now - purchase) / 86400000);
    },
    saveCalendarCache: function() {},

    setActiveCar: function(carId) {
    if (this.activeCarId === carId) return;
    this.activeCarId = carId;
    localStorage.setItem('vesta_active_car_id', carId);
    
    // Загружаем данные для нового автомобиля из IndexedDB
    this.loadFromIndexedDB().catch(console.error);
    
    // Загружаем настройки для этого автомобиля
    if (typeof App.storage.loadSettingsForCar === 'function') {
        App.storage.loadSettingsForCar(carId).then(() => {
            // Обновляем UI после загрузки настроек
            if (typeof App.renderAll === 'function') App.renderAll();
        }).catch(console.error);
    }
    
    // Если мы онлайн – подгружаем свежие данные с сервера
    if (navigator.onLine && typeof App.storage.loadAllData === 'function') {
        App.storage.loadAllData().catch(console.error);
    }
},
    
    loadCars: function() {
        const self = this;
        return App.supa.loadCars().then(cars => {
            self.cars = cars;
            if (cars.length) {
                const exists = self.activeCarId && cars.some(c => c.id == self.activeCarId);
                if (!exists) self.setActiveCar(cars[0].id);
                else localStorage.setItem('vesta_active_car_id', self.activeCarId);
            } else if (!self.activeCarId) {
                self.activeCarId = null;
                localStorage.removeItem('vesta_active_car_id');
            }
            return cars;
        });
    }
};
