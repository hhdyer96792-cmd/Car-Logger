// src/ui/components/timelineCharts.js
window.App = window.App || {};
App.timelineCharts = App.timelineCharts || {};

// Хранилище активных экземпляров Chart.js для каждого canvas
App.timelineCharts.activeCharts = {};

App.timelineCharts.destroyChart = function(canvasId) {
    if (App.timelineCharts.activeCharts[canvasId]) {
        App.timelineCharts.activeCharts[canvasId].destroy();
        delete App.timelineCharts.activeCharts[canvasId];
    }
};

App.timelineCharts.showNoDataMessage = function(canvas, message) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px var(--font)';
    ctx.fillStyle = 'var(--text-muted)';
    ctx.fillText(message || 'Нет данных за выбранный период', 20, canvas.height / 2);
};

// ========== ГРАФИК 1: Общие расходы + прогноз (линия) ==========
App.timelineCharts.renderTotalCostsWithForecast = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    
    var grouped = App.logic.groupTotalCostsByMonth(monthsCount);
    var months = grouped.months;
    var totalCosts = grouped.totalCosts;
    
    if (months.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о расходах');
        return;
    }
    
    var forecast = App.logic.calculateMonthlyForecast(totalCosts);
    var forecastMonths = [];
    var lastMonth = months[months.length - 1];
    var lastDate = new Date(lastMonth + '-01');
    for (var i = 1; i <= 3; i++) {
        var nextDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + i, 1);
        var nextKey = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0');
        forecastMonths.push(nextKey);
    }
    
    var allLabels = months.concat(forecastMonths);
    var factData = totalCosts.concat([null, null, null]);
    var forecastData = new Array(months.length).fill(null).concat(forecast);
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Факт',
                    data: factData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52,152,219,0.1)',
                    tension: 0.2,
                    fill: false,
                    pointRadius: 3
                },
                {
                    label: 'Прогноз',
                    data: forecastData,
                    borderColor: '#e74c3c',
                    borderDash: [5, 5],
                    backgroundColor: 'transparent',
                    tension: 0.2,
                    fill: false,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + ctx.raw.toLocaleString() + ' ₽';
                        }
                    }
                },
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: '₽' } }
            }
        }
    });
};

// ========== ГРАФИК 2: Затраты: топливо vs ТО (гистограмма) ==========
App.timelineCharts.renderFuelVsTOCosts = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    
    var grouped = App.logic.groupTotalCostsByMonth(monthsCount);
    var months = grouped.months;
    var fuelCosts = grouped.fuelCosts;
    var toCosts = grouped.toCosts;
    
    if (months.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о затратах на топливо или ТО');
        return;
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Топливо',
                    data: fuelCosts,
                    backgroundColor: 'rgba(52,152,219,0.7)',
                    borderColor: '#2980b9',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'ТО',
                    data: toCosts,
                    backgroundColor: 'rgba(231,76,60,0.7)',
                    borderColor: '#c0392b',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + ctx.raw.toLocaleString() + ' ₽';
                        }
                    }
                },
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: '₽' } }
            }
        }
    });
};

// ========== ГРАФИК 3: Средняя цена топлива (линия) ==========
App.timelineCharts.renderAverageFuelPrice = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var fuelLog = App.store.fuelLog || [];
    if (fuelLog.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о заправках');
        return;
    }
    
    var monthlyData = {};
    fuelLog.forEach(function(f) {
        if (!f.date) return;
        var d = new Date(f.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthlyData[key]) monthlyData[key] = { totalCost: 0, totalLiters: 0 };
        monthlyData[key].totalCost += (parseFloat(f.liters) || 0) * (parseFloat(f.pricePerLiter) || 0);
        monthlyData[key].totalLiters += parseFloat(f.liters) || 0;
    });
    
    var months = Object.keys(monthlyData).sort();
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    if (months.length > monthsCount) months = months.slice(-monthsCount);
    
    var avgPrices = months.map(function(m) {
        var data = monthlyData[m];
        return data.totalLiters > 0 ? data.totalCost / data.totalLiters : null;
    });
    
    if (months.length === 0 || avgPrices.every(function(v) { return v === null; })) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о цене топлива за выбранный период');
        return;
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Средняя цена топлива',
                data: avgPrices,
                borderColor: '#f39c12',
                backgroundColor: 'rgba(243,156,18,0.1)',
                tension: 0.2,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.raw ? ctx.raw.toFixed(2) + ' ₽/л' : 'Нет данных';
                        }
                    }
                },
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: '₽/л' } }
            }
        }
    });
};

// ========== ГРАФИК 4: Расход топлива л/100км ==========
App.timelineCharts.renderFuelConsumption = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var fuelLog = App.store.fuelLog || [];
    if (fuelLog.length < 2) {
        App.timelineCharts.showNoDataMessage(canvas, 'Недостаточно данных для расчёта расхода');
        return;
    }
    
    var sorted = fuelLog.filter(function(f) { return f.date && f.mileage; })
        .sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    
    if (sorted.length < 2) {
        App.timelineCharts.showNoDataMessage(canvas, 'Недостаточно заправок для расчёта расхода');
        return;
    }
    
    var monthlyData = {};
    for (var i = 1; i < sorted.length; i++) {
        var curr = sorted[i];
        var prev = sorted[i-1];
        var dist = curr.mileage - prev.mileage;
        if (dist <= 0) continue;
        var consumption = (curr.liters / dist) * 100;
        var d = new Date(curr.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthlyData[key]) monthlyData[key] = { values: [] };
        monthlyData[key].values.push(consumption);
    }
    
    var months = Object.keys(monthlyData).sort();
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    if (months.length > monthsCount) months = months.slice(-monthsCount);
    
    var avgConsumption = months.map(function(m) {
        var data = monthlyData[m];
        if (data.values.length === 0) return null;
        var sum = data.values.reduce(function(a,b) { return a + b; }, 0);
        return sum / data.values.length;
    });
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Расход топлива, л/100км',
                data: avgConsumption,
                borderColor: '#e67e22',
                backgroundColor: 'rgba(230,126,34,0.1)',
                tension: 0.2,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.raw ? ctx.raw.toFixed(1) + ' л/100км' : 'Нет данных';
                        }
                    }
                }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'л/100км' } } }
        }
    });
};

// ========== ГРАФИК 5: Затраты на ТО по категориям ==========
App.timelineCharts.renderTOCostsByCategory = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var records = App.store.serviceRecords || [];
    if (records.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет записей ТО');
        return;
    }
    
    var categoryMap = {};
    records.forEach(function(r) {
        var op = App.store.operations.find(function(o) { return o.id == r.operation_id; });
        var cat = op ? op.category : 'Прочее';
        var cost = (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
        categoryMap[cat] = (categoryMap[cat] || 0) + cost;
    });
    
    var categories = Object.keys(categoryMap).sort();
    var costs = categories.map(function(c) { return categoryMap[c]; });
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [{
                label: 'Затраты на ТО',
                data: costs,
                backgroundColor: 'rgba(231,76,60,0.7)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ctx.raw.toLocaleString() + ' ₽'; }
                    }
                }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: '₽' } } }
        }
    });
};

// ========== ГРАФИК 6: Расходы на шины и запчасти по месяцам ==========
App.timelineCharts.renderTiresAndPartsCosts = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var tiresLog = App.store.tireLog || [];
    var partsList = App.store.parts || [];
    
    var tiresByMonth = {};
    tiresLog.forEach(function(t) {
        if (!t.date) return;
        var d = new Date(t.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        var cost = (Number(t.purchaseCost) || 0) + (Number(t.mountCost) || 0);
        tiresByMonth[key] = (tiresByMonth[key] || 0) + cost;
    });
    
    var partsByMonth = {};
    partsList.forEach(function(p) {
        if (!p.dateAdded) return;
        var d = new Date(p.dateAdded);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        var cost = Number(p.price) || 0;
        partsByMonth[key] = (partsByMonth[key] || 0) + cost;
    });
    
    var allMonthsSet = {};
    Object.keys(tiresByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    Object.keys(partsByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    var months = Object.keys(allMonthsSet).sort();
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    if (months.length > monthsCount) months = months.slice(-monthsCount);
    
    var tiresData = months.map(function(m) { return tiresByMonth[m] || 0; });
    var partsData = months.map(function(m) { return partsByMonth[m] || 0; });
    
    if (months.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о шинах или запчастях');
        return;
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Шины', data: tiresData, backgroundColor: '#2ecc71' },
                { label: 'Запчасти', data: partsData, backgroundColor: '#9b59b6' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + ctx.raw.toLocaleString() + ' ₽';
                        }
                    }
                }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: '₽' } } }
        }
    });
};

// ========== ГРАФИК 7: Прогноз пробега (линейная регрессия) ==========
App.timelineCharts.renderMileageForecast = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var history = App.store.mileageHistory || [];
    if (history.length < 2) {
        App.timelineCharts.showNoDataMessage(canvas, 'Недостаточно данных для прогноза пробега');
        return;
    }
    
    var sorted = history.slice().sort(function(a,b) { return new Date(a.date) - new Date(b.date); });
    var dates = sorted.map(function(e) { return new Date(e.date).getTime(); });
    var mileages = sorted.map(function(e) { return e.mileage; });
    
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
    
    var lastDate = new Date(minDate);
    var forecastDays = 30 * (period === 'month' ? 1 : (period === 'quarter' ? 3 : 12));
    var forecastDates = [];
    var forecastMileages = [];
    for (var d = 1; d <= forecastDays; d++) {
        var futureDay = x[n-1] + d;
        var futureMileage = intercept + slope * futureDay;
        var futureDate = new Date(minDate + futureDay * 86400000);
        forecastDates.push(futureDate.toISOString().slice(0,10));
        forecastMileages.push(Math.round(futureMileage));
    }
    
    var last6Months = sorted.slice(-6);
    var histDates = last6Months.map(function(e) { return e.date; });
    var histMileages = last6Months.map(function(e) { return e.mileage; });
    
    var allLabels = histDates.concat(forecastDates);
    var histData = histMileages.concat(new Array(forecastDates.length).fill(null));
    var forecastData = new Array(histDates.length).fill(null).concat(forecastMileages);
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                { label: 'История', data: histData, borderColor: '#3498db', fill: false, pointRadius: 2 },
                { label: 'Прогноз', data: forecastData, borderColor: '#e74c3c', borderDash: [5,5], fill: false, pointRadius: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + ctx.raw + ' км';
                        }
                    }
                }
            },
            scales: { y: { title: { display: true, text: 'км' } } }
        }
    });
};

// ========== ГРАФИК 8: Количество выполненных операций по месяцам ==========
App.timelineCharts.renderOperationsCount = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var records = App.store.serviceRecords || [];
    if (records.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет выполненных операций');
        return;
    }
    
    var monthlyCount = {};
    records.forEach(function(r) {
        if (!r.date) return;
        var d = new Date(r.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthlyCount[key] = (monthlyCount[key] || 0) + 1;
    });
    
    var months = Object.keys(monthlyCount).sort();
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    if (months.length > monthsCount) months = months.slice(-monthsCount);
    
    var counts = months.map(function(m) { return monthlyCount[m] || 0; });
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{ label: 'Количество операций', data: counts, backgroundColor: '#1abc9c' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'шт.' }, stepSize: 1 } }
        }
    });
};

// ========== ГРАФИК 9: Стоимость 1 км пробега по месяцам ==========
App.timelineCharts.renderCostPerKm = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var mileageHistory = App.store.mileageHistory || [];
    if (mileageHistory.length < 2) {
        App.timelineCharts.showNoDataMessage(canvas, 'Недостаточно данных о пробеге');
        return;
    }
    
    var sortedMileage = mileageHistory.slice().sort(function(a,b) { return new Date(a.date) - new Date(b.date); });
    
    var totalCostsByMonth = App.logic.groupTotalCostsByMonth(0);
    var monthlyCostsMap = {};
    for (var i = 0; i < totalCostsByMonth.months.length; i++) {
        monthlyCostsMap[totalCostsByMonth.months[i]] = totalCostsByMonth.totalCosts[i];
    }
    
    var monthlyMileage = {};
    for (var i = 1; i < sortedMileage.length; i++) {
        var curr = sortedMileage[i];
        var prev = sortedMileage[i-1];
        var daysDiff = Math.ceil((new Date(curr.date) - new Date(prev.date)) / 86400000);
        if (daysDiff <= 0) continue;
        var d = new Date(curr.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthlyMileage[key] = (monthlyMileage[key] || 0) + (curr.mileage - prev.mileage);
    }
    
    var months = Object.keys(monthlyCostsMap).filter(function(m) { return monthlyMileage[m] > 0; }).sort();
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    if (months.length > monthsCount) months = months.slice(-monthsCount);
    
    var costPerKm = months.map(function(m) {
        var cost = monthlyCostsMap[m] || 0;
        var km = monthlyMileage[m] || 1;
        return cost / km;
    });
    
    if (months.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных для расчёта стоимости км');
        return;
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{ label: '₽/км', data: costPerKm, borderColor: '#e67e22', fill: true }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.raw.toFixed(2) + ' ₽/км';
                        }
                    }
                }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: '₽/км' } } }
        }
    });
};

// ========== ГРАФИК 10: Средняя скорость км/ч по месяцам ==========
App.timelineCharts.renderAverageSpeed = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var mileageHistory = App.store.mileageHistory || [];
    if (mileageHistory.length < 2) {
        App.timelineCharts.showNoDataMessage(canvas, 'Недостаточно данных о пробеге и моточасах');
        return;
    }
    
    var sorted = mileageHistory.slice().sort(function(a,b) { return new Date(a.date) - new Date(b.date); });
    var monthlySpeed = {};
    for (var i = 1; i < sorted.length; i++) {
        var curr = sorted[i];
        var prev = sorted[i-1];
        var dist = curr.mileage - prev.mileage;
        var hours = (curr.motohours || 0) - (prev.motohours || 0);
        if (hours <= 0) continue;
        var speed = dist / hours;
        var d = new Date(curr.date);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthlySpeed[key]) monthlySpeed[key] = [];
        monthlySpeed[key].push(speed);
    }
    
    var months = Object.keys(monthlySpeed).sort();
    var monthsCount = 12;
    if (period === 'quarter') monthsCount = 3;
    else if (period === 'month') monthsCount = 1;
    if (months.length > monthsCount) months = months.slice(-monthsCount);
    
    var avgSpeeds = months.map(function(m) {
        var speeds = monthlySpeed[m];
        var sum = speeds.reduce(function(a,b) { return a + b; }, 0);
        return sum / speeds.length;
    });
    
    if (months.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о скорости');
        return;
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{ label: 'Средняя скорость, км/ч', data: avgSpeeds, borderColor: '#3498db', fill: true }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'км/ч' } } }
        }
    });
};

// ========== ГРАФИК 11: Динамика пробега и моточасов (2 линии) ==========
App.timelineCharts.renderMileageAndHours = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var history = App.store.mileageHistory || [];
    if (history.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных');
        return;
    }
    
    var sorted = history.slice().sort(function(a,b) { return new Date(a.date) - new Date(b.date); });
    var labels = sorted.map(function(e) { return e.date; });
    var mileageData = sorted.map(function(e) { return e.mileage; });
    var hoursData = sorted.map(function(e) { return e.motohours || 0; });
    
    if (labels.length > 12) {
        labels = labels.slice(-12);
        mileageData = mileageData.slice(-12);
        hoursData = hoursData.slice(-12);
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Пробег, км', data: mileageData, borderColor: '#3498db', yAxisID: 'y' },
                { label: 'Моточасы, ч', data: hoursData, borderColor: '#e74c3c', yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { tooltip: { mode: 'index', intersect: false } },
            scales: {
                y: { title: { display: true, text: 'км' }, beginAtZero: true },
                y1: { position: 'right', title: { display: true, text: 'ч' }, beginAtZero: true, grid: { drawOnChartArea: false } }
            }
        }
    });
};

// ========== ГРАФИК 12: Распределение расходов (круговая) ==========
App.timelineCharts.renderExpensePie = function(canvasId, period) {
    App.timelineCharts.destroyChart(canvasId);
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = canvas.clientWidth || 500;
        canvas.height = canvas.clientHeight || 200;
    }
    
    var structure = App.logic.calculateExpenseStructure(period === 'month' ? 'month' : (period === 'quarter' ? 'quarter' : 'year'));
    
    if (structure.labels.length === 0) {
        App.timelineCharts.showNoDataMessage(canvas, 'Нет данных о расходах');
        return;
    }
    
    var ctx = canvas.getContext('2d');
    App.timelineCharts.activeCharts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: structure.labels,
            datasets: [{ data: structure.values, backgroundColor: structure.colors }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.label + ': ' + ctx.raw.toLocaleString() + ' ₽';
                        }
                    }
                }
            }
        }
    });
};