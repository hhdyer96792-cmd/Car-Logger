// src/api/supabase.js
window.App = window.App || {};
App.supa = App.supa || {};

let cachedUserId = null;

function ensureSupabase() {
    if (!App.supabase) throw new Error('Supabase client not initialized');
    return App.supabase;
}

// ----- Универсальные запросы -----
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
    const { data: { user } } = await App.supabase.auth.getUser();
    cachedUserId = user?.id || null;
    return cachedUserId;
};

App.supa.clearUserIdCache = function() {
    cachedUserId = null;
};

// ----- Загрузка данных -----
App.supa.loadOperations = function() {
    return App.supa.fetchTable('operations').then(({ data, error }) => {
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
    });
};

App.supa.loadFuelLog = function() {
    return App.supa.fetchTable('fuel_log').then(({ data, error }) => {
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
    });
};

App.supa.loadTires = function() {
    return App.supa.fetchTable('tires').then(({ data, error }) => {
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
    });
};

App.supa.loadParts = function() {
    return App.supa.fetchTable('parts').then(({ data, error }) => {
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
    });
};

App.supa.loadHistory = function() {
    return App.supa.fetchTable('history').then(({ data, error }) => {
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
    });
};

App.supa.loadSettings = function() {
    if (!App.store.activeCarId) return Promise.resolve(null);
    return App.supa.getCurrentUserId().then(function(userId) {
        if (!userId) return null;
        ensureSupabase();
        return Promise.all([
            App.supabase.from('vehicle_state').select('*').eq('car_id', App.store.activeCarId).maybeSingle(),
            App.supabase.from('user_settings').select('*').eq('user_id', userId).eq('car_id', App.store.activeCarId).maybeSingle()
        ]).then(function([vs, us]) {
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
        });
    });
};

App.supa.loadMileageHistory = function() {
    return App.supa.fetchTable('mileage_log').then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map(m => ({
            date: m.date,
            mileage: parseFloat(m.mileage) || 0,
            motohours: parseFloat(m.motohours) || 0
        })).sort((a, b) => new Date(a.date) - new Date(b.date));
    });
};

// ----- Сохранение данных -----
App.supa.saveOperation = async function(op) {
    const userId = await App.supa.getCurrentUserId();
    const record = {
        category: op.category,
        name: op.name,
        interval_km: op.intervalKm,
        interval_months: op.intervalMonths,
        interval_motohours: op.intervalMotohours,
        last_date: op.lastDate,
        last_mileage: op.lastMileage,
        last_motohours: op.lastMotohours,
        user_id: userId,
        car_id: App.store.activeCarId
    };
    if (op.id) {
        return App.supa.updateRow('operations', op.id, record);
    } else {
        return App.supa.insertRow('operations', record);
    }
};

App.supa.saveFuelRecord = async function(record) {
    const userId = await App.supa.getCurrentUserId();
    const data = {
        date: record.date,
        mileage: record.mileage,
        liters: record.liters,
        price_per_liter: record.pricePerLiter,
        full_tank: record.fullTank === 'TRUE' || record.fullTank === true,
        fuel_type: record.fuelType || 'Бензин',
        notes: record.notes || '',
        user_id: userId,
        car_id: App.store.activeCarId
    };
    if (record.id) {
        return App.supa.updateRow('fuel_log', record.id, data);
    } else {
        return App.supa.insertRow('fuel_log', data);
    }
};

App.supa.saveTireRecord = async function(record) {
    const userId = await App.supa.getCurrentUserId();
    const data = {
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
        car_id: App.store.activeCarId
    };
    if (record.id) {
        return App.supa.updateRow('tires', record.id, data);
    } else {
        return App.supa.insertRow('tires', data);
    }
};

App.supa.savePart = async function(part) {
    const userId = await App.supa.getCurrentUserId();
    const data = {
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
        car_id: App.store.activeCarId
    };
    if (part.id && part.id !== part.uuid) {
        return App.supa.updateRow('parts', part.uuid || part.id, data);
    } else if (part.id) {
        return App.supa.updateRow('parts', part.id, data);
    } else {
        return App.supa.insertRow('parts', data);
    }
};

App.supa.saveHistoryRecord = async function(record) {
    const userId = await App.supa.getCurrentUserId();
    const data = {
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
        car_id: App.store.activeCarId
    };
    if (record.id) {
        return App.supa.updateRow('history', record.id, data);
    } else {
        return App.supa.insertRow('history', data);
    }
};

// ========== Метод для пробега ==========
App.supa.addMileageRecord = async function(date, mileage, motohours) {
    const userId = await App.supa.getCurrentUserId();
    const record = {
        date: date,
        mileage: mileage,
        motohours: motohours || 0,
        user_id: userId,
        car_id: App.store.activeCarId
    };
    return App.supa.insertRow('mileage_log', record);
};

// Прямые запросы (с upsert, специфичные фильтры)
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
    return App.supabase.from('vehicle_state').upsert(record, { onConflict: 'car_id' }).select();
};

App.supa.saveUserSettings = async function(settingsObj) {
    const userId = await App.supa.getCurrentUserId();
    ensureSupabase();
    const record = {
        user_id: userId,
        car_id: App.store.activeCarId,
        telegram_token: settingsObj.telegramToken || '',
        telegram_chat_id: settingsObj.telegramChatId || '',
        notification_method: settingsObj.notificationMethod || 'telegram',
        reminder_days: settingsObj.reminderDays || '7,2'
    };
    return App.supabase.from('user_settings').upsert(record, { onConflict: 'user_id, car_id' }).select();
};

// ----- Загрузка фото в Supabase Storage -----
App.supa.uploadPhoto = async function(file) {
    const userId = await App.supa.getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    ensureSupabase();
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${userId}/${App.store.activeCarId || 'default'}/${fileName}`;
    
    const { data, error } = await App.supabase.storage
        .from('vesta-photos')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });
    
    if (error) throw error;
    
    const { data: urlData } = App.supabase.storage
        .from('vesta-photos')
        .getPublicUrl(filePath);
    
    return urlData.publicUrl;
};

// ---------- Документы автомобиля (DAL) ----------
App.supa.loadCarDocuments = function() {
    return App.supa.fetchTable('car_documents').then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map(doc => ({
            id: doc.id,
            type: doc.type,
            date: doc.date,
            photoUrl: doc.photo_url,
            amount: doc.amount,
            notes: doc.notes || ''
        }));
    });
};

App.supa.addCarDocument = async function(doc) {
    const userId = await App.supa.getCurrentUserId();
    const record = {
        car_id: App.store.activeCarId,
        user_id: userId,
        type: doc.type,
        date: doc.date,
        photo_url: doc.photoUrl,
        amount: doc.amount,
        notes: doc.notes
    };
    const { data, error } = await App.supabase.from('car_documents').insert(record).select().single();
    if (error) throw error;
    return { id: data.id, ...doc };
};

App.supa.updateCarDocument = async function(docId, updates) {
    const { error } = await App.supabase.from('car_documents').update({
        type: updates.type,
        date: updates.date,
        amount: updates.amount,
        notes: updates.notes
    }).eq('id', docId);
    if (error) throw error;
    return true;
};

App.supa.deleteCarDocument = async function(docId) {
    const { error } = await App.supabase.from('car_documents').delete().eq('id', docId);
    if (error) throw error;
    return true;
};

// ---------- Мульти-авто и совместный доступ ----------
App.supa.loadCars = function() {
    ensureSupabase();
    return App.supabase.from('cars').select('*').then(({ data, error }) => {
        if (error) throw error;
        return data || [];
    });
};

App.supa.createCar = function(name) {
    return App.supa.getCurrentUserId().then(function(userId) {
        ensureSupabase();
        return App.supabase.from('cars').insert({ user_id: userId, name: name }).select().single();
    });
};

App.supa.deleteCar = function(carId) {
    ensureSupabase();
    return App.supabase.from('cars').delete().eq('id', carId).select();
};

App.supa.renameCar = function(carId, newName) {
    ensureSupabase();
    return App.supabase.from('cars').update({ name: newName }).eq('id', carId).select().single();
};

App.supa.inviteUserToCar = function(carId, email) {
    ensureSupabase();
    return App.supabase.from('car_shares').insert({ car_id: carId, invited_email: email }).select().single();
};

App.supa.getPendingInvites = function() {
    return App.supa.getCurrentUserId().then(function(userId) {
        if (!userId) return { data: [], error: null };
        return App.supabase.from('car_shares')
            .select('*, cars(name)')
            .eq('invited_user_id', userId)
            .eq('accepted', false);
    });
};

App.supa.acceptInvite = async function(inviteId) {
    const userId = await App.supa.getCurrentUserId();
    ensureSupabase();
    return App.supabase.from('car_shares')
        .update({ accepted: true, invited_user_id: userId })
        .eq('id', inviteId)
        .select();
};

App.supa.declineInvite = function(inviteId) {
    ensureSupabase();
    return App.supabase.from('car_shares').delete().eq('id', inviteId).select();
};

App.supa.getInviteByCode = function(code) {
    ensureSupabase();
    return App.supabase.from('car_shares')
        .select('*, cars(name)')
        .eq('invite_code', code)
        .maybeSingle();
};

App.supa.getCarShares = function(carId) {
    ensureSupabase();
    return App.supabase.from('car_shares')
        .select('*')
        .eq('car_id', carId);
};

App.supa.deleteCarShare = function(shareId) {
    ensureSupabase();
    return App.supabase.from('car_shares')
        .delete()
        .eq('id', shareId)
        .select();
};

// ========== Дополнительные методы для автомобиля ==========
App.supa.getVehicleState = async function(carId) {
    const { data, error } = await App.supabase
        .from('vehicle_state')
        .select('base_mileage, base_motohours, purchase_date, purchase_cost')
        .eq('car_id', carId)
        .maybeSingle();
    if (error) throw error;
    return data || null;
};

App.supa.updateVehicleState = async function(carId, updates) {
    const record = {
        car_id: carId,
        base_mileage: updates.baseMileage,
        base_motohours: updates.baseMotohours,
        purchase_date: updates.purchaseDate,
        purchase_cost: updates.purchaseCost
    };
    const { error } = await App.supabase
        .from('vehicle_state')
        .upsert(record, { onConflict: 'car_id' });
    if (error) throw error;
    return true;
};

// ========== Календарь ==========
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

// ========== Приглашения (создание ссылки) ==========
App.supa.createInviteLink = async function(carId) {
    const { data, error } = await App.supabase
        .from('car_shares')
        .insert({ car_id: carId, invited_email: null })
        .select('invite_code')
        .single();
    if (error) throw error;
    const inviteCode = data.invite_code;
    return window.location.origin + '/Car-K3eper/?invite=' + inviteCode;
};