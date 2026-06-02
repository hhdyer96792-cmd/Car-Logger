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

    // ========== ЗАГРУЗКА ИЗ INDEXEDDB ==========
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
            const uniquePending = [];
            const seenIds = new Set();
            for (const p of pending.sort((a, b) => a.timestamp - b.timestamp)) {
                if (!seenIds.has(p.id)) {
                    seenIds.add(p.id);
                    uniquePending.push(p);
                }
            }
            this.pendingActions = uniquePending;

            const pendingDeleteIds = this.pendingActions
                .filter(a => a.type === 'delete')
                .map(a => a.entityId);

            if (pendingDeleteIds.length) {
                this.operations = this.operations.filter(op => !pendingDeleteIds.includes(op.id));
                this.fuelLog = this.fuelLog.filter(f => !pendingDeleteIds.includes(f.id));
                this.tireLog = this.tireLog.filter(t => !pendingDeleteIds.includes(t.id));
                this.parts = this.parts.filter(p => !pendingDeleteIds.includes(p.id));
                this.serviceRecords = this.serviceRecords.filter(h => !pendingDeleteIds.includes(h.id));
                this.mileageHistory = this.mileageHistory.filter(m => !pendingDeleteIds.includes(m.id));
                this.cars = this.cars.filter(c => !pendingDeleteIds.includes(c.id));
                if (pendingDeleteIds.includes(this.activeCarId)) {
                    await App.db.delete('car_settings', this.activeCarId);
                }
                console.log('[Store] Отфильтровано записей, ожидающих удаления:', pendingDeleteIds.length);
            }

            // ========== ЗАГРУЗКА НАСТРОЕК ==========
            if (this.activeCarId) {
                const carSettings = await App.db.getById('car_settings', this.activeCarId);
                if (carSettings) {
                    let decrypted = carSettings;
                    const masterKey = App.db.encryption.getMasterKey();
                    if (masterKey && carSettings.telegramToken && typeof carSettings.telegramToken === 'object') {
                        decrypted = await App.db.encryption.decryptSettings(carSettings, masterKey);
                    }
                    decrypted.plateNumber = (decrypted.plateNumber && typeof decrypted.plateNumber !== 'object') ? String(decrypted.plateNumber) : '';
                    decrypted.vin = (decrypted.vin && typeof decrypted.vin !== 'object') ? String(decrypted.vin) : '';
                    Object.assign(this.settings, decrypted);
                } else if (typeof App.storage.loadSettingsForCar === 'function') {
                    await App.storage.loadSettingsForCar(this.activeCarId);
                }
                // Если настроек нет, используем дефолтные, но не перезаписываем существующие
                if (!carSettings && !this.settings.carBrand && !this.settings.carModel) {
                    this.settings = { ...this.settings, carBrand: '', carModel: '', carYear: null, plateNumber: '', vin: '' };
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

    // ========== ОСТАЛЬНОЙ КОД БЕЗ ИЗМЕНЕНИЙ (initFromLocalStorage, save* и т.д.) ==========
    // ... (остальной код из предыдущей версии, без изменений)
};
