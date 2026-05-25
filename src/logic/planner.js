// src/logic/planner.js
window.App = window.App || {};
App.logic = App.logic || {};

/**
 * Возвращает интервал замены масла в моточасах в зависимости от средней скорости.
 * @param {Object} op - Операция (должна содержать name, category, intervalMotohours)
 * @param {number} avgSpeed - Средняя скорость (км/ч)
 * @returns {number|null}
 */
App.logic.getOilMotohoursInterval = function(op, avgSpeed) {
    if (!isFinite(avgSpeed) || avgSpeed <= 0) return op.intervalMotohours || 250;
    if (op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1) {
        if (avgSpeed < 25) return 200;        // городской
        else if (avgSpeed < 45) return 225;   // смешанный
        else return 250;                      // трассовый
    }
    return op.intervalMotohours;
};

/**
 * Вычисляет план для одной операции (возвращает объект с датами, пробегом, днями и т.д.)
 * @param {Object} op - Операция (поля: lastDate, lastMileage, lastMotohours, intervalKm, intervalMonths, intervalMotohours, name, category)
 * @returns {Object} { recDate, recMileage, recMotohours, planDate, planMileage, daysLeft }
 */
App.logic.calculatePlan = function(op) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // Дата по месяцам
    var recDate = new Date(8640000000000000);
    if (op.intervalMonths) {
        recDate = op.lastDate ? new Date(op.lastDate) : new Date(today);
        recDate.setMonth(recDate.getMonth() + op.intervalMonths);
    }

    // Пробег
    var recMileage = op.lastMileage ? op.lastMileage + op.intervalKm : op.intervalKm;

    // Средняя скорость
    var avgSpeed = 30;
    if (App.store.settings.avgDailyMotohours > 0) {
        avgSpeed = App.store.settings.avgDailyMileage / App.store.settings.avgDailyMotohours;
    }

    // Интервал моточасов
    var motoInterval = App.logic.getOilMotohoursInterval(op, avgSpeed);
    var isMotohoursFresh = true;
    if (op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1) {
        var mh = App.store.mileageHistory;
        if (mh.length >= 1) {
            var last = mh[mh.length - 1];
            if ((App.store.settings.currentMotohours - last.motohours) > 20 ||
                (App.store.settings.currentMileage - last.mileage) > 500) {
                isMotohoursFresh = false;
            }
        }
    }

    var recMotohours = null;
    if (motoInterval && isMotohoursFresh) {
        recMotohours = op.lastMotohours
            ? op.lastMotohours + motoInterval
            : App.store.settings.currentMotohours + motoInterval;
    }

    // Дата по пробегу
    var dateByMileage = new Date(8640000000000000);
    if (recMileage > App.store.settings.currentMileage && App.store.settings.avgDailyMileage > 0) {
        var days = Math.ceil((recMileage - App.store.settings.currentMileage) / App.store.settings.avgDailyMileage);
        dateByMileage = new Date(today);
        dateByMileage.setDate(today.getDate() + days);
    }

    // Дата по моточасам
    var dateByMoto = new Date(8640000000000000);
    if (recMotohours && recMotohours > App.store.settings.currentMotohours && App.store.settings.avgDailyMotohours > 0) {
        var daysMoto = Math.ceil((recMotohours - App.store.settings.currentMotohours) / App.store.settings.avgDailyMotohours);
        dateByMoto = new Date(today);
        dateByMoto.setDate(today.getDate() + daysMoto);
    }

    // Плановая дата — минимум из трёх
    var planDate = new Date(Math.min(recDate.getTime(), dateByMileage.getTime(), dateByMoto.getTime()));
    var daysLeft = Math.ceil((planDate.getTime() - today.getTime()) / 86400000);
    if (planDate.getFullYear() > 275000) daysLeft = 0;

    var planDateStr = planDate.getFullYear() < 275000 ? planDate.toISOString().split('T')[0] : '';
    var recDateStr = recDate.getFullYear() < 275000 ? recDate.toISOString().split('T')[0] : '';

    return {
        recDate: recDateStr,
        recMileage: recMileage,
        recMotohours: recMotohours || '',
        planDate: planDateStr,
        planMileage: recMileage,
        daysLeft: isFinite(daysLeft) ? daysLeft : 0
    };
};

/**
 * Возвращает даты начала и конца выбранного периода.
 * @param {string} period - 'week', 'month', 'quarter', '6months', 'year'
 * @returns {{ start: Date, end: Date }}
 */
App.logic.getPlanPeriodDates = function(period) {
    var now = new Date();
    var start = new Date(now);
    start.setHours(0, 0, 0, 0);
    var end = new Date(now);
    switch (period) {
        case 'month':
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'quarter':
            var quarterEndMonth = Math.ceil((now.getMonth() + 1) / 3) * 3;
            end = new Date(now.getFullYear(), quarterEndMonth, 0);
            break;
        case '6months':
            end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
            break;
        case 'year':
            end = new Date(now.getFullYear(), 11, 31);
            break;
        default:
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    end.setHours(23, 59, 59, 999);
    return { start: start, end: end };
};

/**
 * Генерирует список операций, план которых попадает в выбранный период.
 * @param {string} period - Период из селекта
 * @returns {Array} Отсортированный массив операций
 */
App.logic.generateMaintenancePlan = function(period) {
    var interval = App.logic.getPlanPeriodDates(period);
    var start = interval.start;
    var end = interval.end;
    var plan = App.store.operations.filter(function(op) {
        var planDateStr = App.logic.calculatePlan(op).planDate;
        if (!planDateStr) return false;
        var planDate = new Date(planDateStr);
        return planDate >= start && planDate <= end;
    }).sort(function(a, b) {
        return new Date(App.logic.calculatePlan(a).planDate) - new Date(App.logic.calculatePlan(b).planDate);
    });
    return plan;
};