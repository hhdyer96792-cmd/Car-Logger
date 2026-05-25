// src/logic/timeline.js
window.App = window.App || {};
App.logic = App.logic || {};

/**
 * Возвращает массив месяцев между двумя датами в формате 'YYYY-MM'
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {string[]}
 */
App.logic.getMonthsBetween = function(startDate, endDate) {
    var months = [];
    var current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    var end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (current <= end) {
        months.push(current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0'));
        current.setMonth(current.getMonth() + 1);
    }
    return months;
};

/**
 * Группирует общие расходы (топливо + ТО) по месяцам, возвращает объект:
 * { months: [], totalCosts: [], fuelCosts: [], toCosts: [] }
 * @param {number} monthsCount - количество последних месяцев (0 = все)
 * @returns {Object}
 */
App.logic.groupTotalCostsByMonth = function(monthsCount) {
    var fuelLog = App.store.fuelLog || [];
    var serviceRecords = App.store.serviceRecords || [];
    
    var fuelByMonth = {};
    var toByMonth = {};
    
    fuelLog.forEach(function(f) {
        if (!f.date) return;
        var d = new Date(f.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        var cost = (parseFloat(f.liters) || 0) * (parseFloat(f.pricePerLiter) || 0);
        fuelByMonth[key] = (fuelByMonth[key] || 0) + cost;
    });
    
    serviceRecords.forEach(function(r) {
        if (!r.date) return;
        var d = new Date(r.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        var cost = (parseFloat(r.parts_cost) || 0) + (parseFloat(r.work_cost) || 0);
        toByMonth[key] = (toByMonth[key] || 0) + cost;
    });
    
    var allMonthsSet = {};
    Object.keys(fuelByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    Object.keys(toByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    var allMonths = Object.keys(allMonthsSet).sort();
    
    if (monthsCount > 0 && allMonths.length > monthsCount) {
        allMonths = allMonths.slice(-monthsCount);
    }
    
    var totalCosts = allMonths.map(function(m) {
        return (fuelByMonth[m] || 0) + (toByMonth[m] || 0);
    });
    var fuelCosts = allMonths.map(function(m) { return fuelByMonth[m] || 0; });
    var toCosts = allMonths.map(function(m) { return toByMonth[m] || 0; });
    
    return {
        months: allMonths,
        totalCosts: totalCosts,
        fuelCosts: fuelCosts,
        toCosts: toCosts
    };
};

/**
 * Возвращает прогноз на следующие 3 месяца на основе линейной регрессии
 * @param {Array} monthlyTotals - массив чисел (общие расходы по месяцам)
 * @returns {Array} массив из 3 прогнозных значений
 */
App.logic.calculateMonthlyForecast = function(monthlyTotals) {
    if (monthlyTotals.length < 3) return [0, 0, 0];
    var n = monthlyTotals.length;
    var x = [];
    var y = monthlyTotals;
    for (var i = 0; i < n; i++) x.push(i);
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
    }
    var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    var intercept = (sumY - slope * sumX) / n;
    var forecast = [];
    for (var i = 1; i <= 3; i++) {
        var pred = intercept + slope * (n + i - 1);
        forecast.push(Math.max(0, pred));
    }
    return forecast;
};