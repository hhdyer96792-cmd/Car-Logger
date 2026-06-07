// src/config/constants.js
window.App = window.App || {};

App.config = {
    DEBUG: true,
    
    // Новая версия приложения (увеличивать при каждом релизе)
    APP_VERSION: '2.1.0',
    
    // Ключи кэша и хранения
    CACHE_KEY: 'vesta_to_cache',
    PENDING_KEY: 'vesta_pending_actions',
    CALENDAR_CACHE_KEY: 'vesta_calendar_events',
    PRICE_HISTORY_KEY: 'vesta_price_history',
    THEME_KEY: 'vesta_theme',
    NOTIFICATION_METHOD_KEY: 'notificationMethod',
    STATS_PERIOD_KEY: 'stats_period',

    // ========== КОНСТАНТЫ ПРОИЗВОДИТЕЛЬНОСТИ ==========
    // Виртуализация (количество элементов на страницу/категорию)
    ITEMS_PER_CATEGORY: 15,
    HISTORY_PAGE_SIZE: 50,
    PARTS_PAGE_SIZE: 30,
    FUEL_PAGE_SIZE: 30,
    TIRES_PAGE_SIZE: 30,
    
    // Синхронизация
    SYNC_INTERVAL_MS: 60000,           // 1 минута
    SYNC_RETRY_MAX: 10,
    SYNC_BASE_DELAY: 1000,
    SYNC_MAX_DELAY: 30000,
    SYNC_ACTION_TIMEOUT: 20000,        // 20 секунд на действие
    
    // Загрузка данных
    FIRST_PAGE_SIZE: 50,
    LOAD_CHUNK_SIZE: 3,                // параллельная загрузка 3 таблиц одновременно
    LOAD_CHUNK_DELAY_MS: 100,          // пауза между чанками
    
    // Таймауты запросов
    SUPABASE_TIMEOUT_MS: 20000,
    SUPABASE_RETRY_MAX: 3,
    SUPABASE_RETRY_DELAY: 500,
    
    // Кэширование
    CACHE_MAX_IMAGES: 200,
    VIN_CACHE_TTL_DAYS: 30,
    PLATE_CACHE_TTL_DAYS: 30,
    
    // Лимиты
    MAX_PHOTO_SIZE_BYTES: 5 * 1024 * 1024,  // 5 МБ
    MAX_ROUTES_HISTORY: 50,
    
    // Таймауты UI
    TOAST_DURATION_MS: 3000,
    SPINNER_DELAY_MS: 200,

    // Связанные пары операций
    LINKED_PAIRS: [
        { main: 'Масло', linked: 'Масляный фильтр', combinedName: 'Масло + фильтр' },
        { main: 'Масло CVT (частичная)', linked: 'Фильтр вариатора', combinedName: 'Масло CVT + фильтр' }
    ],

    // Автоматически связанные операции при выполнении основной
    AUTO_DEDUCT_PAIRS: [
        { main: 'Масло', dependent: 'Масляный фильтр', note: 'Автоматически вместе с заменой масла' },
        { main: 'Масло CVT (частичная)', dependent: 'Фильтр вариатора', note: 'Автоматически вместе с частичной заменой масла CVT' },
        { main: 'Ремень ГРМ', dependent: 'Ролик ГРМ', note: 'Автоматически вместе с заменой ремня ГРМ' },
        { main: 'Ремень ГРМ', dependent: 'Помпа', note: 'Автоматически вместе с заменой ремня ГРМ' },
        { main: 'Тормозные колодки', dependent: 'Датчик износа колодок', note: 'Автоматически вместе с заменой колодок' },
        { main: 'Воздушный фильтр', dependent: 'Фильтр салона', note: 'Автоматически при замене воздушного фильтра (рекомендовано)' }
    ],

    // Ключевые слова для нормализации названий операций
    KEYWORDS_MAP: [
        { keywords: ['масло', 'двигатель', 'двс'], canonicalPart: 'Масло' },
        { keywords: ['масло', 'cvt', 'вариатор'], canonicalPart: 'Масло CVT (частичная)' },
        { keywords: ['фильтр', 'масляный'], canonicalPart: 'Масляный фильтр' },
        { keywords: ['фильтр', 'вариатора'], canonicalPart: 'Фильтр вариатора' },
        { keywords: ['ремень', 'грм', 'грм'], canonicalPart: 'Ремень ГРМ' },
        { keywords: ['ролик', 'грм'], canonicalPart: 'Ролик ГРМ' },
        { keywords: ['помпа', 'водяной насос'], canonicalPart: 'Помпа' },
        { keywords: ['колодки', 'тормозные'], canonicalPart: 'Тормозные колодки' },
        { keywords: ['датчик', 'износа'], canonicalPart: 'Датчик износа колодок' },
        { keywords: ['воздушный', 'фильтр'], canonicalPart: 'Воздушный фильтр' },
        { keywords: ['фильтр', 'салона'], canonicalPart: 'Фильтр салона' },
        { keywords: ['свечи', 'зажигания'], canonicalPart: 'Свечи зажигания' },
        { keywords: ['провода', 'высоковольтные'], canonicalPart: 'Высоковольтные провода' },
        { keywords: ['тормозная', 'жидкость'], canonicalPart: 'Тормозная жидкость' },
        { keywords: ['прокачка', 'тормозов'], canonicalPart: 'Прокачка тормозов' }
    ],

    USE_SUPABASE: true   // всегда true
};