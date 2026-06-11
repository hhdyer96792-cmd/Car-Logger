// src/utils/chartOptimizer.js
window.App = window.App || {};
App.chartOptimizer = App.chartOptimizer || {};

// Конфигурация (переопределяется из App.config)
const DEFAULT_MAX_POINTS = 100;
const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Агрегирует данные для графика, уменьшая количество точек до maxPoints,
 * сохраняя общий тренд (алгоритм Largest Triangle Three Buckets – LTTB).
 * @param {Array} data - массив объектов с числовыми полями x и y
 * @param {number} x - имя поля для оси X (дата или индекс)
 * @param {number} y - имя поля для оси Y (значение)
 * @param {number} maxPoints - максимальное количество точек на выходе
 * @returns {Array} агрегированный массив
 */
App.chartOptimizer.aggregateData = function(data, xField, yField, maxPoints) {
    if (!data || data.length === 0) return [];
    maxPoints = maxPoints || DEFAULT_MAX_POINTS;
    if (data.length <= maxPoints) return data.slice();
    
    // Копируем и преобразуем в числовые значения
    const points = data.map(item => ({
        x: typeof item[xField] === 'number' ? item[xField] : new Date(item[xField]).getTime(),
        y: parseFloat(item[yField]) || 0
    }));
    
    // Используем алгоритм LTTB (Largest Triangle Three Buckets)
    // Реализация из https://github.com/sveinn-steinarsson/flot-downsample
    const bucketSize = (points.length - 2) / (maxPoints - 2);
    const sampled = [points[0]];
    let a = 0;
    
    for (let i = 1; i < maxPoints - 1; i++) {
        const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
        const rangeEnd = Math.floor(i * bucketSize) + 1;
        
        let maxArea = -1;
        let maxAreaPoint = points[rangeStart];
        let avgX = 0, avgY = 0;
        
        for (let j = rangeStart; j < rangeEnd; j++) {
            avgX += points[j].x;
            avgY += points[j].y;
        }
        avgX /= (rangeEnd - rangeStart);
        avgY /= (rangeEnd - rangeStart);
        
        for (let j = rangeStart; j < rangeEnd; j++) {
            const area = Math.abs((points[a].x - avgX) * (points[j].y - points[a].y) -
                                 (points[a].x - points[j].x) * (avgY - points[a].y)) * 0.5;
            if (area > maxArea) {
                maxArea = area;
                maxAreaPoint = points[j];
            }
        }
        sampled.push(maxAreaPoint);
        a = points.indexOf(maxAreaPoint);
    }
    sampled.push(points[points.length - 1]);
    
    // Восстанавливаем оригинальную структуру (объекты с исходными полями)
    return sampled.map(p => ({
        [xField]: p.x,
        [yField]: p.y,
        original: p
    }));
};

/**
 * Дебаунс для функций рендеринга графиков.
 * @param {Function} fn - функция рендеринга
 * @param {number} delay - задержка в мс
 * @returns {Function} обёрнутая функция
 */
App.chartOptimizer.debounceRender = function(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay || DEFAULT_DEBOUNCE_MS);
    };
};

/**
 * Проверка размера данных и предупреждение пользователя.
 * @param {Array} data - массив данных
 * @param {string} chartName - название графика
 * @returns {boolean} true если данных много и нужно предупредить
 */
App.chartOptimizer.checkDataSize = function(data, chartName) {
    if (data && data.length > 500) {
        if (typeof App.toast === 'function') {
            App.toast(`⚠️ Данных для графика "${chartName}" слишком много (${data.length} записей). График может тормозить.`, 'warning');
        }
        return true;
    }
    return false;
};

/**
 * Получает агрегированные данные с сервера (если доступна Edge Function)
 * @param {string} table - имя таблицы
 * @param {string} period - месяц/квартал/год
 * @param {string} carId - ID автомобиля
 * @returns {Promise<Array>} агрегированные данные
 */
App.chartOptimizer.fetchAggregatedStats = async function(table, period, carId) {
    if (!App.supabase) return null;
    try {
        const { data, error } = await App.supabase.functions.invoke('aggregate-stats', {
            body: { table, period, car_id: carId }
        });
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('[ChartOptimizer] Серверная агрегация недоступна, используем локальную', err);
        return null;
    }
};