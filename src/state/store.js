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

    // Проверка ожидания синхронизации
    isRecordPending: function(recordId) {
        if (!recordId) return false;
        return this.pendingActions.some(action => 
            action.entityId == recordId && 
            (action.type === 'save' || action.type === 'update')
        );
    },

    // ========== ЗАГРУЗКА ИЗ INDEXEDDB С ФИЛЬТРАЦИЕЙ ПО CAR_ID ==========
    loadFromIndexedDB: async function() {
        if (!App.db || !App.db._db) {
            console.warn('[Store] IndexedDB не инициализирована, загружаю из localStorage (fallback)');
            this.initFromLocalStorage();
            return;
        }

        try {
            const carId = this.activeCarId;
            
            // Загружаем все записи из БД
            const allOps = await App.db.getAll('operations');
            const allFuel = await App.db.getAll('fuel_log');
            const allTires = await App.db.getAll('tires');
            const allParts = await App.db.getAll('parts');
            const allHistory = await App.db.getAll('service_records');
            const allMileage = await App.db.getAll('mileage_log');

            if (carId) {
                // Фильтруем по car_id
                this.operations = allOps.filter(op => op.car_id == carId).map(op => ({
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
                    updatedAt: op.updatedAt
                }));

                this.fuelLog = allFuel.filter(f => f.car_id == carId).map(f => ({
                    id: f.id,
                    uuid: f.id,
                    date: f.date,
                    mileage: f.mileage,
                    liters: f.liters,
                    pricePerLiter: f.pricePerLiter,
                    fullTank: f.fullTank ? 'TRUE' : '',
                    fuelType: f.fuelType || 'Бензин',
                    notes: f.notes || ''
                }));

                this.tireLog = allTires.filter(t => t.car_id == carId).map(t => ({
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
                    isDIY: t.isDIY || false
                }));

                this.parts = allParts.filter(p => p.car_id == carId).map(p => ({
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
                    dateAdded: p.dateAdded || ''
                }));

                this.serviceRecords = allHistory.filter(h => h.car_id == carId).map(h => ({
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
                    rowIndex: h.id
                }));

                this.mileageHistory = allMileage.filter(m => m.car_id == carId).map(m => ({
                    date: m.date,
                    mileage: m.mileage,
                    motohours: m.motohours || 0
                })).sort((a, b) => new Date(a.date) - new Date(b.date));
            } else {
                // Нет активного автомобиля – очищаем данные
                this.operations = [];
                this.fuelLog = [];
                this.tireLog = [];
                this.parts = [];
                this.serviceRecords = [];
                this.mileageHistory = [];
            }

            const settings = await App.db.getById('settings', 1);
            if (settings) {
                let decryptedSettings = settings;
                const masterKey = App.db.encryption.getMasterKey();
                if (masterKey && settings.telegramToken && typeof settings.telegramToken === 'object') {
                    decryptedSettings = await App.db.encryption.decryptSettings(settings, masterKey);
                }
                this.settings = {
                    currentMileage: decryptedSettings.currentMileage || 0,
                    currentMotohours: decryptedSettings.currentMotohours || 0,
                    avgDailyMileage: decryptedSettings.avgDailyMileage || 45,
                    avgDailyMotohours: decryptedSettings.avgDailyMotohours || 1.8,
                    telegramToken: decryptedSettings.telegramToken || '',
                    telegramChatId: decryptedSettings.telegramChatId || '',
                    notificationMethod: decryptedSettings.notificationMethod || 'telegram',
                    reminderDays: decryptedSettings.reminderDays || '7,2',
                    carBrand: decryptedSettings.carBrand || '',
                    carModel: decryptedSettings.carModel || '',
                    carYear: decryptedSettings.carYear || null,
                    plateNumber: decryptedSettings.plateNumber || '',
                    vin: decryptedSettings.vin || ''
                };
            }

            const cars = await App.db.getAll('cars');
            this.cars = cars;
            if (!this.activeCarId && cars.length > 0) {
                this.activeCarId = cars[0].id;
                localStorage.setItem('vesta_active_car_id', this.activeCarId);
            }

            const pending = await App.db.getAll('pending_actions');
            this.pendingActions = pending.sort((a, b) => a.timestamp - b.timestamp);

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
        await App.db.put('operations', op);
    },
    saveFuelRecordToDB: async function(record) {
        await App.db.put('fuel_log', record);
    },
    saveTireRecordToDB: async function(record) {
        await App.db.put('tires', record);
    },
    savePartToDB: async function(part) {
        await App.db.put('parts', part);
    },
    saveHistoryRecordToDB: async function(record) {
        await App.db.put('service_records', record);
    },
    saveMileageRecordToDB: async function(record) {
        await App.db.put('mileage_log', record);
    },
    saveSettingsToDB: async function() {
        let settingsToSave = { id: 1, ...this.settings };
        const masterKey = App.db.encryption.getMasterKey();
        if (masterKey) {
            settingsToSave = await App.db.encryption.encryptSettings(settingsToSave, masterKey);
            const existing = await App.db.getById('encrypted_secrets', 'verification');
            if (!existing) {
                await App.db.encryption.saveVerificationString(masterKey);
            }
        }
        await App.db.put('settings', settingsToSave);
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
        this.activeCarId = carId;
        localStorage.setItem('vesta_active_car_id', carId);
        this.loadFromIndexedDB().catch(console.error);
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