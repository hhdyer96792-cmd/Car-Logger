// src/api/supabase.js
window.App = window.App || {};
App.supa = App.supa || {};

let cachedUserId = null;

async function withRetry(fn, maxRetries = 3, delay = 500, context = 'unknown') {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const isLockError = err.message && (err.message.includes('Lock') || err.message.includes('stole') || err.toString().includes('Lock'));
            if (isLockError && i < maxRetries) {
                console.warn(`[Supabase] Lock conflict in ${context}, retry ${i+1}/${maxRetries}`);
                await new Promise(r => setTimeout(r, delay * (i + 1)));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

function withTimeout(promise, timeoutMs, context) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${context} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function ensureSupabase() {
    if (!App.supabase) throw new Error('Supabase client not initialized');
    return App.supabase;
}

async function compressImage(file) {
    console.warn('[Supabase] Image compression temporarily disabled');
    return file;
}

async function upsertWithRetry(table, record, conflictField, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const { error } = await App.supabase.from(table).upsert(record, { onConflict: conflictField });
            if (error) {
                if (error.code === '23505') {
                    console.warn(`[Supabase] Upsert conflict on ${table}, retry ${i+1}/${maxRetries}`);
                    await new Promise(r => setTimeout(r, 500 * (i + 1)));
                    continue;
                }
                throw error;
            }
            return { error: null };
        } catch (err) {
            lastError = err;
            if (i === maxRetries - 1) throw err;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw lastError;
}

App.supa.fetchTable = function(tableName) {
    ensureSupabase();
    var query = App.supabase.from(tableName).select('*');
    if (App.store.activeCarId && tableName !== 'cars' && tableName !== 'car_shares' &&
        tableName !== 'vehicle_state' && tableName !== 'user_settings') {
        query = query.eq('car_id', App.store.activeCarId);
    }
    return query;
};

App.supa.insertRow = function(tableName, record) {
    ensureSupabase();
    return App.supabase.from(tableName).insert(record).select();
};

App.supa.updateRow = function(tableName, id, record) {
    ensureSupabase();
    return App.supabase.from(tableName).update(record).eq('id', id).select();
};

App.supa.deleteRow = function(tableName, id) {
    ensureSupabase();
    return App.supabase.from(tableName).delete().eq('id', id).select();
};

App.supa.getCurrentUserId = async function() {
    if (cachedUserId) return cachedUserId;
    ensureSupabase();
    try {
        const { data: { user } } = await withRetry(() => App.supabase.auth.getUser(), 3, 500, 'getUser');
        cachedUserId = user?.id || null;
        return cachedUserId;
    } catch (err) {
        console.error('[Supabase] getCurrentUserId failed:', err);
        return null;
    }
};

App.supa.clearUserIdCache = function() {
    cachedUserId = null;
};

// ========== ЗАГРУЗКА ДАННЫХ ==========
App.supa.loadOperations = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('operations').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(op => ({
                    id: op.id,
                    uuid: op.id,
                    category: op.category,
                    name: op.name,
                    intervalKm: op.interval_km || 0,
                    intervalMonths: op.interval_months || 0,
                    intervalMotohours: op.interval_motohours || null,
                    lastDate: op.last_date || null,
                    lastMileage: op.last_mileage || 0,
                    lastMotohours: op.last_motohours || 0,
                    updatedAt: op.updated_at
                }));
            }),
            25000, 'loadOperations'
        ),
    3, 500, 'loadOperations');
};

App.supa.loadFuelLog = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('fuel_log').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(f => ({
                    id: f.id,
                    date: f.date,
                    mileage: parseFloat(f.mileage) || 0,
                    liters: parseFloat(f.liters) || 0,
                    pricePerLiter: parseFloat(f.price_per_liter) || 0,
                    fullTank: f.full_tank ? 'TRUE' : '',
                    fuelType: f.fuel_type || 'Бензин',
                    notes: f.notes || ''
                }));
            }),
            25000, 'loadFuelLog'
        ),
    3, 500, 'loadFuelLog');
};

App.supa.loadTires = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('tires').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(t => ({
                    id: t.id,
                    date: t.date,
                    type: t.type || '',
                    mileage: parseFloat(t.mileage) || 0,
                    model: t.model || '',
                    size: t.size || '',
                    wear: t.wear || '',
                    notes: t.notes || '',
                    purchaseCost: parseFloat(t.purchase_cost) || 0,
                    mountCost: parseFloat(t.mount_cost) || 0,
                    isDIY: t.is_diy || false
                }));
            }),
            25000, 'loadTires'
        ),
    3, 500, 'loadTires');
};

App.supa.loadParts = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('parts').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(p => ({
                    id: p.id,
                    uuid: p.id,
                    operation: p.operation || '',
                    oem: p.oem || '',
                    analog: p.analog || '',
                    price: p.price || '',
                    supplier: p.supplier || '',
                    link: p.link || '',
                    comment: p.comment || '',
                    inStock: parseFloat(p.in_stock) || 0,
                    location: p.location || '',
                    dateAdded: p.purchase_date || ''
                }));
            }),
            25000, 'loadParts'
        ),
    3, 500, 'loadParts');
};

App.supa.loadHistory = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('history').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(h => ({
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
            }),
            25000, 'loadHistory'
        ),
    3, 500, 'loadHistory');
};

App.supa.loadSettings = function() {
    if (!App.store.activeCarId) return Promise.resolve(null);
    return withRetry(async () => {
        const userId = await App.supa.getCurrentUserId();
        if (!userId) return null;
        ensureSupabase();
        const [vs, us] = await Promise.all([
            App.supabase.from('vehicle_state').select('*').eq('car_id', App.store.activeCarId).maybeSingle(),
            App.supabase.from('user_settings').select('*').eq('user_id', userId).eq('car_id', App.store.activeCarId).maybeSingle()
        ]);
        return {
            currentMileage: vs.data ? parseFloat(vs.data.current_mileage) || 0 : 0,
            currentMotohours: vs.data ? parseFloat(vs.data.current_motohours) || 0 : 0,
            avgDailyMileage: vs.data ? parseFloat(vs.data.avg_daily_mileage) || 45 : 45,
            avgDailyMotohours: vs.data ? parseFloat(vs.data.avg_daily_motohours) || 1.8 : 1.8,
            telegramToken: us.data ? us.data.telegram_token || '' : '',
            telegramChatId: us.data ? us.data.telegram_chat_id || '' : '',
            notificationMethod: us.data ? us.data.notification_method || 'telegram' : 'telegram',
            reminderDays: us.data ? us.data.reminder_days || '7,2' : '7,2',
            carBrand: vs.data?.car_brand || '',
            carModel: vs.data?.car_model || '',
            carYear: vs.data?.car_year || null,
            plateNumber: vs.data?.plate_number || '',
            vin: vs.data?.vin || ''
        };
    }, 3, 500, 'loadSettings');
};

App.supa.loadMileageHistory = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('mileage_log').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(m => ({
                    id: m.id,
                    date: m.date,
                    mileage: parseFloat(m.mileage) || 0,
                    motohours: parseFloat(m.motohours) || 0
                })).sort((a, b) => new Date(a.date) - new Date(b.date));
            }),
            25000, 'loadMileageHistory'
        ),
    3, 500, 'loadMileageHistory');
};

// ========== СОХРАНЕНИЕ С UPSERT ==========
App.supa.saveOperation = async function(op) {
    const userId = await App.supa.getCurrentUserId();
    const carId = op.car_id || App.store.activeCarId;
    const record = {
        id: op.id || crypto.randomUUID(),
        category: op.category,
        name: op.name,
        interval_km: op.intervalKm,
        interval_months: op.intervalMonths,
        interval_motohours: op.intervalMotohours,
        last_date: op.lastDate,
        last_mileage: op.lastMileage,
        last_motohours: op.lastMotohours,
        user_id: userId,
        car_id: carId
    };
    const { data, error } = await withTimeout(
        App.supabase.from('operations').upsert(record, { onConflict: 'id' }).select().single(),
        25000, 'saveOperation'
    );
    if (error) throw error;
    return { data: [data], error: null };
};

App.supa.saveFuelRecord = async function(record) {
    const userId = await App.supa.getCurrentUserId();
    const carId = record.car_id || App.store.activeCarId;
    const data = {
        id: record.id || crypto.randomUUID(),
        date: record.date,
        mileage: record.mileage,
        liters: record.liters,
        price_per_liter: record.pricePerLiter,
        full_tank: record.fullTank === 'TRUE' || record.fullTank === true,
        fuel_type: record.fuelType || 'Бензин',
        notes: record.notes || '',
        user_id: userId,
        car_id: carId
    };
    const { data: result, error } = await withTimeout(
        App.supabase.from('fuel_log').upsert(data, { onConflict: 'id' }).select().single(),
        25000, 'saveFuelRecord'
    );
    if (error) throw error;
    return { data: [result], error: null };
};

App.supa.saveTireRecord = async function(record) {
    const userId = await App.supa.getCurrentUserId();
    const carId = record.car_id || App.store.activeCarId;
    const data = {
        id: record.id || crypto.randomUUID(),
        date: record.date,
        type: record.type,
        mileage: record.mileage,
        model: record.model || '',
        size: record.size || '',
        wear: record.wear || '',
        notes: record.notes || '',
        purchase_cost: record.purchaseCost || 0,
        mount_cost: record.mountCost || 0,
        is_diy: record.isDIY || false,
        user_id: userId,
        car_id: carId
    };
    const { data: result, error } = await withTimeout(
        App.supabase.from('tires').upsert(data, { onConflict: 'id' }).select().single(),
        25000, 'saveTireRecord'
    );
    if (error) throw error;
    return { data: [result], error: null };
};

App.supa.savePart = async function(part) {
    const userId = await App.supa.getCurrentUserId();
    const carId = part.car_id || App.store.activeCarId;
    const data = {
        id: part.id || crypto.randomUUID(),
        operation: part.operation || '',
        oem: part.oem || '',
        analog: part.analog || '',
        price: part.price || 0,
        supplier: part.supplier || '',
        link: part.link || '',
        comment: part.comment || '',
        in_stock: part.inStock || 0,
        location: part.location || '',
        purchase_date: part.purchaseDate || null,
        user_id: userId,
        car_id: carId
    };
    const { data: result, error } = await withTimeout(
        App.supabase.from('parts').upsert(data, { onConflict: 'id' }).select().single(),
        25000, 'savePart'
    );
    if (error) throw error;
    return { data: [result], error: null };
};

App.supa.saveHistoryRecord = async function(record) {
    const userId = await App.supa.getCurrentUserId();
    const carId = record.car_id || App.store.activeCarId;
    const data = {
        id: record.id || crypto.randomUUID(),
        operation_id: record.operation_id,
        date: record.date,
        mileage: record.mileage,
        motohours: record.motohours,
        parts_cost: record.parts_cost || 0,
        work_cost: record.work_cost || 0,
        is_diy: record.is_diy || false,
        notes: record.notes || '',
        photo_url: record.photo_url || '',
        user_id: userId,
        car_id: carId
    };
    const { data: result, error } = await withTimeout(
        App.supabase.from('history').upsert(data, { onConflict: 'id' }).select().single(),
        25000, 'saveHistoryRecord'
    );
    if (error) throw error;
    return { data: [result], error: null };
};

App.supa.addMileageRecord = async function(date, mileage, motohours, carId) {
    const userId = await App.supa.getCurrentUserId();
    const effectiveCarId = carId || App.store.activeCarId;
    const record = {
        id: crypto.randomUUID(),
        date: date,
        mileage: mileage,
        motohours: motohours || 0,
        user_id: userId,
        car_id: effectiveCarId
    };
    const { data: result, error } = await withTimeout(
        App.supabase.from('mileage_log').upsert(record, { onConflict: 'id' }).select().single(),
        25000, 'addMileageRecord'
    );
    if (error) throw error;
    return { data: [result], error: null };
};

// ========== UPSERT ==========
App.supa.saveVehicleState = async function(state) {
    ensureSupabase();
    const record = {
        car_id: App.store.activeCarId,
        current_mileage: state.currentMileage,
        current_motohours: state.currentMotohours,
        avg_daily_mileage: state.avgDailyMileage,
        avg_daily_motohours: state.avgDailyMotohours,
        car_brand: state.carBrand,
        car_model: state.carModel,
        car_year: state.carYear,
        plate_number: state.plateNumber,
        vin: state.vin
    };
    return upsertWithRetry('vehicle_state', record, 'car_id');
};

App.supa.saveUserSettings = async function(settingsObj) {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    ensureSupabase();
    const record = {
        user_id: userId,
        car_id: App.store.activeCarId,
        telegram_token: settingsObj.telegramToken || '',
        telegram_chat_id: settingsObj.telegramChatId || '',
        notification_method: settingsObj.notificationMethod || 'telegram',
        reminder_days: settingsObj.reminderDays || '7,2'
    };
    return upsertWithRetry('user_settings', record, 'user_id, car_id');
};

// ========== ФОТО ==========
App.supa.uploadPhoto = async function(file) {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) throw new Error('Файл слишком большой. Максимальный размер 5 МБ.');
    const compressed = await compressImage(file);
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    ensureSupabase();
    const fileExt = compressed.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${userId}/${App.store.activeCarId || 'default'}/${fileName}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const { data, error } = await App.supabase.storage
            .from('vesta-photos')
            .upload(filePath, compressed, { cacheControl: '3600', upsert: false, signal: controller.signal });
        clearTimeout(timeoutId);
        if (error) throw error;
        const { data: urlData } = App.supabase.storage.from('vesta-photos').getPublicUrl(filePath);
        return urlData.publicUrl;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
};

// ---------- Документы автомобиля ----------
App.supa.loadCarDocuments = function() {
    return withRetry(() =>
        withTimeout(
            App.supa.fetchTable('car_documents').then(({ data, error }) => {
                if (error) throw error;
                return (data || []).map(doc => ({
                    id: doc.id,
                    type: doc.type,
                    date: doc.date,
                    photoUrl: doc.photo_url,
                    amount: doc.amount,
                    notes: doc.notes || ''
                }));
            }),
            25000, 'loadCarDocuments'
        ),
    3, 500, 'loadCarDocuments');
};

App.supa.addCarDocument = async function(doc) {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    const record = {
        id: crypto.randomUUID(),
        car_id: App.store.activeCarId,
        user_id: userId,
        type: doc.type,
        date: doc.date,
        photo_url: doc.photoUrl,
        amount: doc.amount,
        notes: doc.notes
    };
    const { data, error } = await withTimeout(
        App.supabase.from('car_documents').insert(record).select().single(),
        25000, 'addCarDocument'
    );
    if (error) throw error;
    return { id: data.id, ...doc };
};

App.supa.updateCarDocument = async function(docId, updates) {
    const { error } = await withTimeout(
        App.supabase.from('car_documents').update({
            type: updates.type,
            date: updates.date,
            amount: updates.amount,
            notes: updates.notes
        }).eq('id', docId),
        25000, 'updateCarDocument'
    );
    if (error) throw error;
    return true;
};

App.supa.deleteCarDocument = async function(docId) {
    const { error } = await withTimeout(
        App.supabase.from('car_documents').delete().eq('id', docId),
        25000, 'deleteCarDocument'
    );
    if (error) throw error;
    return true;
};

// ---------- Мульти-авто ----------
App.supa.loadCars = function() {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('cars').select('*').then(({ data, error }) => {
            if (error) throw error;
            return data || [];
        }),
        25000, 'loadCars'
    );
};

App.supa.createCar = function(name) {
    return App.supa.getCurrentUserId().then(userId => {
        if (!userId) throw new Error('Not authenticated');
        ensureSupabase();
        const record = { id: crypto.randomUUID(), user_id: userId, name };
        return withTimeout(
            App.supabase.from('cars').insert(record).select().single(),
            25000, 'createCar'
        );
    });
};

App.supa.deleteCar = function(carId) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('cars').delete().eq('id', carId).select(),
        25000, 'deleteCar'
    );
};

App.supa.renameCar = function(carId, newName) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('cars').update({ name: newName }).eq('id', carId).select().single(),
        25000, 'renameCar'
    );
};

App.supa.inviteUserToCar = function(carId, email) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('car_shares').insert({ id: crypto.randomUUID(), car_id: carId, invited_email: email }).select().single(),
        25000, 'inviteUserToCar'
    );
};

App.supa.getPendingInvites = function() {
    return App.supa.getCurrentUserId().then(userId => {
        if (!userId) return { data: [], error: null };
        return withTimeout(
            App.supabase.from('car_shares')
                .select('*, cars(name)')
                .eq('invited_user_id', userId)
                .eq('accepted', false),
            25000, 'getPendingInvites'
        );
    });
};

App.supa.acceptInvite = async function(inviteId) {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    ensureSupabase();
    return withTimeout(
        App.supabase.from('car_shares')
            .update({ accepted: true, invited_user_id: userId })
            .eq('id', inviteId)
            .select(),
        25000, 'acceptInvite'
    );
};

App.supa.declineInvite = function(inviteId) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('car_shares').delete().eq('id', inviteId).select(),
        25000, 'declineInvite'
    );
};

App.supa.getInviteByCode = function(code) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('car_shares')
            .select('*, cars(name)')
            .eq('invite_code', code)
            .maybeSingle(),
        25000, 'getInviteByCode'
    );
};

App.supa.getCarShares = function(carId) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('car_shares').select('*').eq('car_id', carId),
        25000, 'getCarShares'
    );
};

App.supa.deleteCarShare = function(shareId) {
    ensureSupabase();
    return withTimeout(
        App.supabase.from('car_shares').delete().eq('id', shareId).select(),
        25000, 'deleteCarShare'
    );
};

App.supa.getVehicleState = async function(carId) {
    return withRetry(async () => {
        const { data, error } = await App.supabase
            .from('vehicle_state')
            .select('base_mileage, base_motohours, purchase_date, purchase_cost')
            .eq('car_id', carId)
            .maybeSingle();
        if (error) throw error;
        return data || null;
    }, 3, 500, 'getVehicleState');
};

App.supa.updateVehicleState = async function(carId, updates) {
    const record = {
        car_id: carId,
        base_mileage: updates.baseMileage,
        base_motohours: updates.baseMotohours,
        purchase_date: updates.purchaseDate,
        purchase_cost: updates.purchaseCost
    };
    const { error } = await withTimeout(
        App.supabase.from('vehicle_state').upsert(record, { onConflict: 'car_id' }),
        25000, 'updateVehicleState'
    );
    if (error) throw error;
    return true;
};

App.supa.getCalendarToken = async function(carId) {
    const { data, error } = await App.supabase
        .from('calendar_tokens')
        .select('token')
        .eq('car_id', carId)
        .maybeSingle();
    if (error) throw error;
    return data?.token || null;
};

App.supa.createCalendarToken = async function(carId) {
    const newToken = crypto.randomUUID();
    const { data, error } = await App.supabase
        .from('calendar_tokens')
        .insert({ car_id: carId, token: newToken })
        .select('token')
        .single();
    if (error) throw error;
    return data.token;
};

App.supa.createInviteLink = async function(carId) {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('Пользователь не авторизован');
    const { data, error } = await App.supabase
        .from('car_shares')
        .insert({ id: crypto.randomUUID(), car_id: carId, invited_email: null })
        .select('invite_code')
        .single();
    if (error) throw error;
    if (!data || !data.invite_code) throw new Error('Не удалось получить invite_code');
    const inviteCode = data.invite_code;
    return window.location.origin + '/Car-K3eper/?invite=' + inviteCode;
};

if (!App.supa.getVehicleState) {
    App.supa.getVehicleState = async function(carId) { return null; };
}
if (!App.supa.updateVehicleState) {
    App.supa.updateVehicleState = async function(carId, updates) { return true; };
}

// ========== PUSH-ТОКЕНЫ ==========
App.supa.savePushToken = async function(token) {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await App.supabase
        .from('push_subscriptions')
        .upsert({ user_id: userId, player_id: token, fcm_token: token, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    return true;
};

App.supa.removePushToken = async function() {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const { error } = await App.supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);
    if (error) throw error;
    return true;
};

// ========== OAuth РЕДИРЕКТ ==========
App.supa.handleOAuthRedirect = async function() {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
        console.log('[Supabase] OAuth редирект, обрабатываем...');
        const { data, error } = await App.supabase.auth.getSession();
        if (error) {
            App.toast('Ошибка входа через Google', 'error');
        } else if (data.session) {
            App.toast('Вход через Google выполнен', 'success');
        }
        window.location.hash = '';
    }
};

if (typeof window !== 'undefined') {
    setTimeout(() => {
        if (App.supa && typeof App.supa.handleOAuthRedirect === 'function') {
            App.supa.handleOAuthRedirect();
        }
    }, 100);
}