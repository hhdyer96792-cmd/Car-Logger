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

    // ========== ЗАГРУЗКА ИЗ INDEXEDDB (с фильтрацией по car_id) ==========
    loadFromIndexedDB: async function() {
        if (!App.db || !App.db._db) {
            console.warn('[Store] IndexedDB не инициализирована, загружаю из localStorage (fallback)');
            this.initFromLocalStorage();
            return;
        }

        try {
            const activeCarId = this.activeCarId;
            if (!activeCarId) {
                console.warn('[Store] activeCarId не установлен, данные не загружены');
                return;
            }

            const ops = await App.db.getAll('operations');
            this.operations = ops
                .filter(op => op.car_id == activeCarId)
                .map(op => ({
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

            const fuel = await App.db.getAll('fuel_log');
            this.fuelLog = fuel
                .filter(f => f.car_id == activeCarId)
                .map(f => ({
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

            const tires = await App.db.getAll('tires');
            this.tireLog = tires
                .filter(t => t.car_id == activeCarId)
                .map(t => ({
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

            const parts = await App.db.getAll('parts');
            this.parts = parts
                .filter(p => p.car_id == activeCarId)
                .map(p => ({
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

            const history = await App.db.getAll('service_records');
            this.serviceRecords = history
                .filter(h => h.car_id == activeCarId)
                .map(h => ({
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

            const mileage = await App.db.getAll('mileage_log');
            this.mileageHistory = mileage
                .filter(m => m.car_id == activeCarId)
                .map(m => ({
                    date: m.date,
                    mileage: m.mileage,
                    motohours: m.motohours || 0
                }))
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            const settings = await App.db.getById('settings', 1);
            if (settings) {
                let decryptedSettings = settings;
                const masterKey = App.db.encryption.getMasterKey();
                if (masterKey && settings.telegramToken && typeof settings.telegramToken === 'object') {
                    decryptedSettings = await App.db.encryption.decryptSettings(settings, masterKey);
                } else if (!masterKey) {
                    decryptedSettings = { ...settings };
                    const sensitiveFields = ['telegramToken', 'telegramChatId', 'vin', 'plateNumber'];
                    for (const field of sensitiveFields) {
                        if (decryptedSettings[field] && typeof decryptedSettings[field] === 'object') {
                            decryptedSettings[field] = '';
                        }
                    }
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
            console.log('[Store] Данные загружены из IndexedDB с фильтром car_id =', activeCarId);
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
        if (typeof App.ui.pages.renderCarSelector === 'function') App.ui.pages.renderCarSelector();
        if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
        if (typeof App.storage.loadAllData === 'function') {
            App.storage.loadAllData();
        }
    },

    loadCars: async function() {
        try {
            const { data: { user } } = await App.supabase.auth.getUser();
            if (!user) return [];
            const { data: cars, error } = await App.supabase
                .from('cars')
                .select('*')
                .eq('user_id', user.id);
            if (error) throw error;
            if (cars && cars.length) {
                for (const car of cars) {
                    await App.db.put('cars', car);
                }
                this.cars = cars;
                if (!this.activeCarId || !cars.some(c => c.id == this.activeCarId)) {
                    this.activeCarId = cars[0].id;
                    localStorage.setItem('vesta_active_car_id', this.activeCarId);
                }
                console.log('[Store] Автомобили загружены:', cars);
                return cars;
            } else {
                console.log('[Store] Автомобилей нет, создаём...');
                const { data: newCar, error: createError } = await App.supabase
                    .from('cars')
                    .insert({ name: 'Мой автомобиль', user_id: user.id })
                    .select()
                    .single();
                if (createError) throw createError;
                await App.db.put('cars', newCar);
                this.cars = [newCar];
                this.activeCarId = newCar.id;
                localStorage.setItem('vesta_active_car_id', newCar.id);
                console.log('[Store] Автомобиль создан:', newCar);
                return [newCar];
            }
        } catch (err) {
            console.error('[Store] Ошибка loadCars:', err);
            return [];
        }

   // ========== ПРОВЕРКА НАЛИЧИЯ ДЕЙСТВИЯ В ОЧЕРЕДИ ==========
    isRecordPending: function(recordId) {
        if (!recordId) return false;
        return this.pendingActions.some(action => action.entityId == recordId);
    }
};
    }
};