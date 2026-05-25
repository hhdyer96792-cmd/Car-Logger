// src/logic/statistics.js
window.App = window.App || {};
App.logic = App.logic || {};

/**
 * Возвращает начальную дату для заданного периода.
 * @param {string} period - 'week', 'month', 'quarter', '6months', 'year'
 * @returns {Date|null}
 */
App.logic.getStartDateForPeriod = function(period) {
    var now = new Date();
    switch (period) {
        case 'week': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        case 'month': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        case '6months': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        case 'year': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        default: return null;
    }
};

/**
 * Фильтрует массив записей по периоду.
 * @param {Array} records - Массив объектов с полем date
 * @param {string} period - Период ('all' или конкретный)
 * @param {string} [dateField='date'] - Имя поля с датой
 * @returns {Array}
 */
App.logic.filterByPeriod = function(records, period, dateField) {
    dateField = dateField || 'date';
    if (period === 'all') return records;
    var start = App.logic.getStartDateForPeriod(period);
    if (!start) return records;
    return records.filter(function(r) {
        var d = r[dateField] ? new Date(r[dateField]) : null;
        return d && d >= start;
    });
};

/**
 * Вычисляет статистику за выбранный период.
 * @param {string} [period='all']
 * @returns {Object} { totalMaintenanceCost, totalFuelCost, costPerKm, avgFuelConsumption, fuelByType, avgMileagePerDay, avgMotohoursPerDay }
 */
App.logic.calculateStatistics = function(period) {
    period = period || 'all';
    var fServ = App.logic.filterByPeriod(App.store.serviceRecords, period);
    var fFuel = App.logic.filterByPeriod(App.store.fuelLog, period);
    var fMile = App.logic.filterByPeriod(App.store.mileageHistory, period);

    var totalMaint = fServ.reduce(function(s, r) {
        return s + (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
    }, 0);

    // Общие затраты на топливо
    var totalFuelCost = fFuel.reduce(function(s, f) {
        return s + (Number(f.liters) || 0) * (Number(f.pricePerLiter) || 0);
    }, 0);

    // Группируем заправки по типам топлива
    var fuelByType = {};
    fFuel.forEach(function(f) {
        var type = f.fuelType || 'Бензин';
        if (!fuelByType[type]) {
            fuelByType[type] = { totalLiters: 0, totalCost: 0, count: 0 };
        }
        fuelByType[type].totalLiters += Number(f.liters) || 0;
        fuelByType[type].totalCost += (Number(f.liters) || 0) * (Number(f.pricePerLiter) || 0);
        fuelByType[type].count++;
    });

    // Рассчитываем пробег и период (как раньше)
    var periodMileage = 0, periodDays = 1, periodMotohours = 0;
    if (fMile.length >= 2) {
        var first = fMile[0], last = fMile[fMile.length - 1];
        periodMileage = last.mileage - first.mileage;
        periodDays = Math.ceil((new Date(last.date) - new Date(first.date)) / 86400000) || 1;
        periodMotohours = (last.motohours || 0) - (first.motohours || 0);
    } else if (fMile.length === 1) {
        var r = fMile[0];
        periodMileage = App.store.settings.currentMileage - (App.store.baseMileage || r.mileage);
        periodDays = App.store.ownershipDays || 1;
        periodMotohours = App.store.settings.currentMotohours - (App.store.baseMotohours || r.motohours);
    } else {
        periodMileage = App.store.settings.currentMileage - (App.store.baseMileage || 0);
        periodDays = App.store.ownershipDays || 1;
        periodMotohours = App.store.settings.currentMotohours - (App.store.baseMotohours || 0);
    }

    // Для каждого типа считаем средний расход и цену
    for (var type in fuelByType) {
        if (fuelByType.hasOwnProperty(type)) {
            var d = fuelByType[type];
            d.avgConsumption = periodMileage > 0 ? (d.totalLiters / periodMileage) * 100 : 0;
            d.avgPrice = d.totalLiters > 0 ? d.totalCost / d.totalLiters : 0;
        }
    }

    // Изменено: средний расход по всем типам - среднее арифметическое
    var totalAvgConsumption = 0;
    var typeCount = 0;
    for (var t in fuelByType) {
        if (fuelByType[t].avgConsumption && fuelByType[t].totalLiters > 0) {
            totalAvgConsumption += fuelByType[t].avgConsumption;
            typeCount++;
        }
    }
    var avgConsumption = typeCount > 0 ? totalAvgConsumption / typeCount : 0;

    var totalCost = totalMaint + totalFuelCost;
    var costPerKm = periodMileage > 0 ? totalCost / periodMileage : 0;

    var avgMileageDay = 0, avgMotoDay = 0;
    if (fMile.length >= 2) {
        var first2 = fMile[0], last2 = fMile[fMile.length - 1];
        var days2 = Math.ceil((new Date(last2.date) - new Date(first2.date)) / 86400000) || 1;
        avgMileageDay = (last2.mileage - first2.mileage) / days2;
        avgMotoDay = ((last2.motohours || 0) - (first2.motohours || 0)) / days2;
    } else {
        avgMileageDay = periodMileage / periodDays;
        avgMotoDay = periodMotohours / periodDays;
    }

    return {
        totalMaintenanceCost: Number(totalMaint),
        totalFuelCost: Number(totalFuelCost),
        costPerKm: Number(costPerKm),
        avgFuelConsumption: Number(avgConsumption), // среднее арифметическое по типам
        fuelByType: fuelByType,                     // { "Бензин": { totalLiters, totalCost, avgConsumption, avgPrice }, ... }
        avgMileagePerDay: Number(avgMileageDay),
        avgMotohoursPerDay: Number(avgMotoDay)
    };
};

/**
 * Группирует топливные записи по месяцам с разделением по типам топлива.
 * Возвращает объект:
 * {
 *   months: string[],
 *   averageConsumption: number[],     // среднее по типам за месяц
 *   datasetsByType: { "Бензин": { consumption: number[], price: number[] }, ... },
 *   mainFuelType: string,
 *   mainPrice: number[]               // цена основного типа
 * }
 */
App.logic.groupFuelByMonth = function() {
    var sorted = App.store.fuelLog.filter(function(r) { return r.date && r.mileage; })
        .sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

    // Собираем все типы топлива
    var allTypes = [];
    sorted.forEach(function(r) {
        var t = r.fuelType || 'Бензин';
        if (allTypes.indexOf(t) === -1) allTypes.push(t);
    });

    // Для каждого типа собираем месячные данные
    var typeMonthly = {}; // { 'Бензин': { '2025-01': { consumptionValues: [], totalCost: 0, totalLiters: 0 } } }
    allTypes.forEach(function(type) {
        typeMonthly[type] = {};
    });

    // Собираем данные
    sorted.forEach(function(r) {
        var type = r.fuelType || 'Бензин';
        var date = new Date(r.date);
        var ym = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        if (!typeMonthly[type][ym]) {
            typeMonthly[type][ym] = { consumptionValues: [], totalCost: 0, totalLiters: 0 };
        }
        // Для расхода ищем предыдущую заправку того же типа
        var prev = sorted.slice().reverse().find(function(p) {
            return p.date < r.date && (p.fuelType || 'Бензин') === type;
        });
        if (prev) {
            var dist = r.mileage - prev.mileage;
            if (dist > 0) {
                var cons = (r.liters / dist) * 100;
                if (isFinite(cons)) typeMonthly[type][ym].consumptionValues.push(cons);
            }
        }
        typeMonthly[type][ym].totalCost += r.liters * r.pricePerLiter;
        typeMonthly[type][ym].totalLiters += r.liters;
    });

    // Собираем все месяцы
    var allMonthsSet = {};
    for (var t in typeMonthly) {
        for (var m in typeMonthly[t]) {
            allMonthsSet[m] = true;
        }
    }
    var months = Object.keys(allMonthsSet).sort();

    // Считаем средний расход и цену для каждого типа по месяцам
    var datasetsByType = {};
    allTypes.forEach(function(type) {
        datasetsByType[type] = { consumption: new Array(months.length).fill(null), price: new Array(months.length).fill(null) };
    });

    months.forEach(function(month, idx) {
        for (var t in typeMonthly) {
            var data = typeMonthly[t][month];
            if (data) {
                if (data.consumptionValues.length > 0) {
                    var sumCons = data.consumptionValues.reduce(function(a, b) { return a + b; }, 0);
                    datasetsByType[t].consumption[idx] = parseFloat((sumCons / data.consumptionValues.length).toFixed(1));
                }
                if (data.totalLiters > 0) {
                    datasetsByType[t].price[idx] = parseFloat((data.totalCost / data.totalLiters).toFixed(2));
                }
            }
        }
    });

    // Вычисляем средний расход по типам за каждый месяц (среднее арифметическое)
    var averageConsumption = months.map(function(month, idx) {
        var sum = 0, cnt = 0;
        for (var t in datasetsByType) {
            var val = datasetsByType[t].consumption[idx];
            if (val !== null) { sum += val; cnt++; }
        }
        return cnt > 0 ? parseFloat((sum / cnt).toFixed(1)) : null;
    });

    // Определяем основной тип топлива (по общему литражу за всё время)
    var totalLitersByType = {};
    sorted.forEach(function(r) {
        var t = r.fuelType || 'Бензин';
        totalLitersByType[t] = (totalLitersByType[t] || 0) + r.liters;
    });
    var mainFuelType = null, maxLiters = 0;
    for (var ft in totalLitersByType) {
        if (totalLitersByType[ft] > maxLiters) {
            maxLiters = totalLitersByType[ft];
            mainFuelType = ft;
        }
    }

    // Цена основного типа по месяцам
    var mainPrice = mainFuelType ? datasetsByType[mainFuelType].price : new Array(months.length).fill(null);

    return {
        months: months,
        averageConsumption: averageConsumption,
        datasetsByType: datasetsByType,
        mainFuelType: mainFuelType,
        mainPrice: mainPrice
    };
};

/**
 * Группирует затраты по месяцам для графиков.
 * @param {string} period
 * @returns {{ months: string[], fuelCosts: number[], toCosts: number[] }}
 */
App.logic.groupCostsByMonth = function(period) {
    var filteredFuel = App.logic.filterByPeriod(App.store.fuelLog, period, 'date');
    var filteredService = App.logic.filterByPeriod(App.store.serviceRecords, period, 'date');

    var fuelByMonth = {};
    var toByMonth = {};

    filteredFuel.forEach(function(record) {
        if (!record.date || !record.liters || !record.pricePerLiter) return;
        var date = new Date(record.date);
        if (isNaN(date.getTime())) return;
        var yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        var cost = record.liters * record.pricePerLiter;
        fuelByMonth[yearMonth] = (fuelByMonth[yearMonth] || 0) + cost;
    });

    filteredService.forEach(function(record) {
        if (!record.date) return;
        var date = new Date(record.date);
        if (isNaN(date.getTime())) return;
        var yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        var parts = Number(record.parts_cost) || 0;
        var work = Number(record.work_cost) || 0;
        toByMonth[yearMonth] = (toByMonth[yearMonth] || 0) + parts + work;
    });

    var allMonthsSet = {};
    Object.keys(fuelByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    Object.keys(toByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    var months = Object.keys(allMonthsSet).sort();

    var fuelCosts = months.map(function(m) { return fuelByMonth[m] || 0; });
    var toCosts = months.map(function(m) { return toByMonth[m] || 0; });

    return { months: months, fuelCosts: fuelCosts, toCosts: toCosts };
};

/**
 * Структура расходов по категориям для круговой диаграммы.
 * @param {string} period
 * @returns {{ labels: string[], values: number[], colors: string[] }}
 */
App.logic.calculateExpenseStructure = function(period) {
    var filteredFuel = App.logic.filterByPeriod(App.store.fuelLog, period, 'date');
    var fuelCost = filteredFuel.reduce(function(s, r) { return s + (r.liters * r.pricePerLiter); }, 0);

    var filteredService = App.logic.filterByPeriod(App.store.serviceRecords, period, 'date');
    var toCost = 0, tiresCost = 0, insuranceCost = 0;

    filteredService.forEach(function(rec) {
        var op = App.store.operations.find(function(o) { return o.id == rec.operation_id; });
        if (op && op.category === 'Документы' && op.name.indexOf('ОСАГО') !== -1) {
            insuranceCost += Number(rec.parts_cost) || 0;
        } else {
            toCost += (Number(rec.parts_cost) || 0) + (Number(rec.work_cost) || 0);
        }
    });

    var filteredTires = App.logic.filterByPeriod(App.store.tireLog, period, 'date');
    filteredTires.forEach(function(t) {
        tiresCost += (t.purchaseCost || 0);
        if (t.mileage !== 0 && t.mountCost) tiresCost += t.mountCost;
    });

    var labels = [], values = [], colors = [];
    if (fuelCost > 0) { labels.push('Топливо'); values.push(fuelCost); colors.push('#3498db'); }
    if (toCost > 0) { labels.push('ТО'); values.push(toCost); colors.push('#e74c3c'); }
    if (tiresCost > 0) { labels.push('Шины'); values.push(tiresCost); colors.push('#2ecc71'); }
    if (insuranceCost > 0) { labels.push('ОСАГО'); values.push(insuranceCost); colors.push('#f39c12'); }

    return { labels: labels, values: values, colors: colors };
};

/**
 * Прогнозирует дату достижения заданного пробега на основе линейной регрессии.
 * @param {number} targetMileage
 * @returns {Date|null}
 */
App.logic.predictMileageDate = function(targetMileage) {
    var history = App.store.mileageHistory;
    if (history.length < 2) return null;

    var dates = history.map(function(entry) { return new Date(entry.date).getTime(); });
    var mileages = history.map(function(entry) { return entry.mileage; });

    var minDate = Math.min.apply(null, dates);
    var x = dates.map(function(d) { return (d - minDate) / (1000 * 3600 * 24); });
    var y = mileages;

    var n = x.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
    }

    var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    var intercept = (sumY - slope * sumX) / n;
    var predictedDay = (targetMileage - intercept) / slope;
    if (predictedDay < 0) return null;
    return new Date(minDate + predictedDay * 86400000);
};

/**
 * Определяет текущий режим вождения по средней скорости.
 * @returns {{ text: string, hint: string }}
 */
App.logic.getDrivingMode = function() {
    var avgSpeed = null;
    var s = App.store.settings;
    if (s.currentMotohours > 0 && s.currentMileage > 0) {
        avgSpeed = s.currentMileage / s.currentMotohours;
    } else {
        var mh = App.store.mileageHistory;
        if (mh.length >= 2) {
            var first = mh[0];
            var last = mh[mh.length - 1];
            var mDiff = last.mileage - first.mileage;
            var hDiff = (last.motohours || 0) - (first.motohours || 0);
            if (hDiff > 0) avgSpeed = mDiff / hDiff;
        }
    }
    if (avgSpeed === null) return { text: 'Нет данных', hint: '' };
    if (avgSpeed < 25) return { text: 'Городской (' + avgSpeed.toFixed(1) + ' км/ч)', hint: 'Интервал масла: 200 м/ч' };
    if (avgSpeed <= 45) return { text: 'Смешанный (' + avgSpeed.toFixed(1) + ' км/ч)', hint: 'Интервал масла: 225 м/ч' };
    return { text: 'Трассовый (' + avgSpeed.toFixed(1) + ' км/ч)', hint: 'Интервал масла: 250 м/ч' };
};