// src/config/constants.js
window.App = window.App || {};

App.config = {
    DEBUG: false,
    
    // Новая версия приложения (увеличивать при каждом релизе)
    APP_VERSION: '2.1.0',
    
    CACHE_KEY: 'vesta_to_cache',
    PENDING_KEY: 'vesta_pending_actions',
    CALENDAR_CACHE_KEY: 'vesta_calendar_events',
    PRICE_HISTORY_KEY: 'vesta_price_history',
    THEME_KEY: 'vesta_theme',
    NOTIFICATION_METHOD_KEY: 'notificationMethod',
    STATS_PERIOD_KEY: 'stats_period',

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