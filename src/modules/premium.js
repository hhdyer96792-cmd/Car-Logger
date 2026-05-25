// src/modules/premium.js
window.App = window.App || {};
App.premium = App.premium || {};

// Уникальный идентификатор устройства (хранится в localStorage)
App.premium.getDeviceId = function() {
    let deviceId = localStorage.getItem('vesta_device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('vesta_device_id', deviceId);
    }
    return deviceId;
};

// Проверка статуса подписки (возвращает активность, tier и срок действия)
App.premium.checkStatus = async function() {
    if (!App.supabase || !App.store.activeCarId) return { active: false, tier: 'free' };
    
    const { data: { user } } = await App.supabase.auth.getUser();
    if (!user) return { active: false, tier: 'free' };
    
    const deviceId = App.premium.getDeviceId();
    let data = null;
    let error = null;
    
    try {
        const result = await App.supabase.rpc('get_user_premium_status', {
            p_user_id: user.id,
            p_device_id: deviceId
        });
        data = result.data;
        error = result.error;
    } catch (err) {
        error = err;
        console.error('[Premium] Исключение при вызове RPC:', err);
    }
    
    if (error || !data) {
        console.error('[Premium] Ошибка проверки статуса:', error);
        return { active: false, tier: 'free' };
    }
    
    // Сохраняем статус в App.store
    App.store.premiumTier = data.tier;
    App.store.premiumExpiresAt = data.expires_at;
    App.store.isPremium = (data.active && data.tier !== 'free');
    
    // Если подписка активна, загружаем модули согласно тарифу
    if (data.active && data.tier !== 'free') {
        await App.premium.loadModulesByTier(data.tier);
    }
    
    return data;
};

// Активация ключа
App.premium.activateKey = async function(keyValue) {
    if (!App.supabase) throw new Error('Supabase not initialized');
    const { data: { user } } = await App.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    
    const deviceId = App.premium.getDeviceId();
    const deviceName = navigator.userAgent || 'Unknown device';
    
    let data = null;
    let error = null;
    
    try {
        const result = await App.supabase.rpc('activate_premium_key', {
            p_key: keyValue,
            p_user_id: user.id,
            p_device_id: deviceId,
            p_device_name: deviceName
        });
        data = result.data;
        error = result.error;
    } catch (err) {
        error = err;
        console.error('[Premium] Исключение при активации ключа:', err);
    }
    
    if (error || !data || !data.success) {
        const errMsg = data?.error || error?.message || 'Неизвестная ошибка';
        throw new Error(errMsg);
    }
    
    await App.premium.checkStatus();
    return data;
};

// Деактивация устройства
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
    }
    
    App.store.isPremium = false;
    App.store.premiumTier = 'free';
    App.store.premiumFeatures = [];
};

// Динамическая загрузка модулей в зависимости от tier
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
            // Проверяем, доступен ли модуль через moduleLoader
            if (App.modules && typeof App.modules.load === 'function') {
                await App.modules.load(`premium/${feature}`, true);
                console.log(`[Premium] Модуль ${feature} загружен (тариф ${tier})`);
            } else {
                console.warn(`[Premium] moduleLoader не доступен, не могу загрузить ${feature}`);
            }
        } catch (err) {
            console.warn(`[Premium] Не удалось загрузить модуль ${feature}:`, err);
        }
    }
};

// Инициализация премиум-функций (вызывается после входа)
App.premium.init = async function() {
    try {
        const status = await App.premium.checkStatus();
        if (status.active && status.tier !== 'free') {
            await App.premium.loadModulesByTier(status.tier);
        }
    } catch (err) {
        console.error('[Premium] Ошибка инициализации:', err);
    }
    
    // Периодическая проверка (раз в час)
    setInterval(() => {
        App.premium.checkStatus().catch(err => console.error('[Premium] Ошибка периодической проверки:', err));
    }, 60 * 60 * 1000);
};