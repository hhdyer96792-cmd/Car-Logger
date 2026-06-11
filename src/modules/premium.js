// src/modules/premium.js
window.App = window.App || {};
App.premium = App.premium || {};

App.premium.getDeviceId = function() {
    let deviceId = localStorage.getItem('vesta_device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('vesta_device_id', deviceId);
    }
    return deviceId;
};

/**
 * Проверка статуса Premium через таблицу user_settings и subscription_keys
 */
App.premium.checkStatus = async function() {
    if (!App.supabase || !App.store.activeCarId) return { active: false, tier: 'free' };
    
    const { data: { user } } = await App.supabase.auth.getUser();
    if (!user) return { active: false, tier: 'free' };
    
    try {
        // Получаем premium_tier из user_settings
        const { data: settings, error: settingsError } = await App.supabase
            .from('user_settings')
            .select('premium_tier, premium_expires_at')
            .eq('user_id', user.id)
            .eq('car_id', App.store.activeCarId)
            .maybeSingle();
        
        if (settingsError) throw settingsError;
        
        let tier = settings?.premium_tier || 'free';
        let expiresAt = settings?.premium_expires_at || null;
        let active = (tier !== 'free');
        
        // Если есть expires_at и просрочено – сбрасываем
        if (active && expiresAt && new Date(expiresAt) < new Date()) {
            active = false;
            tier = 'free';
            // Обновляем в БД (асинхронно)
            App.supabase
                .from('user_settings')
                .update({ premium_tier: 'free', premium_expires_at: null })
                .eq('user_id', user.id)
                .eq('car_id', App.store.activeCarId)
                .then(() => {})
                .catch(e => console.warn('Failed to reset expired premium:', e));
        }
        
        App.store.premiumTier = tier;
        App.store.premiumExpiresAt = expiresAt;
        App.store.isPremium = active;
        
        if (active) {
            await App.premium.loadModulesByTier(tier);
        }
        
        return { active, tier, expires_at: expiresAt };
    } catch (err) {
        console.error('[Premium] Ошибка проверки статуса:', err);
        App.errorHandler?.logError(err, 'premium_check');
        return { active: false, tier: 'free' };
    }
};

/**
 * Активация премиум-ключа
 */
App.premium.activateKey = async function(keyValue) {
    if (!App.supabase) throw new Error('Supabase not initialized');
    const { data: { user } } = await App.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    
    const deviceId = App.premium.getDeviceId();
    const deviceName = navigator.userAgent || 'Unknown device';
    
    // Вызов RPC activate_premium_key (должна быть создана в Supabase)
    const { data, error } = await App.supabase.rpc('activate_premium_key', {
        p_key: keyValue,
        p_user_id: user.id,
        p_device_id: deviceId,
        p_device_name: deviceName
    });
    
    if (error) throw new Error(error.message);
    if (!data || !data.success) {
        throw new Error(data?.error || 'Неизвестная ошибка активации');
    }
    
    // Обновляем статус
    await App.premium.checkStatus();
    
    if (typeof App.ui.pages.renderCarTab === 'function') {
        App.ui.pages.renderCarTab();
    }
    
    return data;
};

/**
 * Деактивация устройства (отвязка)
 */
App.premium.deactivateDevice = async function() {
    if (!App.supabase) return;
    const { data: { user } } = await App.supabase.auth.getUser();
    if (!user) return;
    
    const deviceId = App.premium.getDeviceId();
    
    try {
        await App.supabase.rpc('deactivate_device', {
            p_user_id: user.id,
            p_device_id: deviceId
        });
    } catch (err) {
        console.error('[Premium] Ошибка деактивации устройства:', err);
        App.errorHandler?.logError(err, 'premium_deactivate');
    }
    
    App.store.isPremium = false;
    App.store.premiumTier = 'free';
    App.store.premiumExpiresAt = null;
    
    // Обновляем user_settings на клиенте
    if (App.store.activeCarId && App.supabase) {
        await App.supabase
            .from('user_settings')
            .update({ premium_tier: 'free', premium_expires_at: null })
            .eq('user_id', user.id)
            .eq('car_id', App.store.activeCarId);
    }
    
    if (typeof App.ui.pages.renderCarTab === 'function') {
        App.ui.pages.renderCarTab();
    }
};

/**
 * Загрузка премиум-модулей в зависимости от тарифа
 */
App.premium.loadModulesByTier = async function(tier) {
    const features = [];
    if (tier === 'premium' || tier === 'ultra') {
        features.push('imageCache', 'geolocation', 'elm', 'partsSearch');
    }
    if (tier === 'ultra') {
        features.push('fleetComparison', 'autoHistory', 'externalSync');
    }
    for (const feature of features) {
        try {
            if (App.modules && typeof App.modules.load === 'function') {
                await App.modules.load(`premium/${feature}`, true);
                console.log(`[Premium] Модуль ${feature} загружен (тариф ${tier})`);
            } else {
                console.warn(`[Premium] moduleLoader не доступен, не могу загрузить ${feature}`);
            }
        } catch (err) {
            console.warn(`[Premium] Не удалось загрузить модуль ${feature}:`, err);
            App.errorHandler?.logError(err, 'premium_load_module', { feature });
        }
    }
};

/**
 * Инициализация Premium (вызывается после аутентификации)
 */
App.premium.init = async function() {
    try {
        await App.premium.checkStatus();
    } catch (err) {
        console.error('[Premium] Ошибка инициализации:', err);
        App.errorHandler?.logError(err, 'premium_init');
    }
    
    // Периодическая проверка статуса (раз в час)
    if (App.premium._checkInterval) clearInterval(App.premium._checkInterval);
    App.premium._checkInterval = setInterval(() => {
        App.premium.checkStatus().catch(err => {
            console.error('[Premium] Ошибка периодической проверки:', err);
            App.errorHandler?.logError(err, 'premium_periodic_check');
        });
    }, 60 * 60 * 1000);
};