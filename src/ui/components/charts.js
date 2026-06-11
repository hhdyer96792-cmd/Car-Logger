// src/ui/components/charts.js
window.App = window.App || {};
App.charts = App.charts || {};

App.charts.activeCharts = {};

App.charts.destroyChart = function(canvasId) {
    if (App.charts.activeCharts[canvasId]) {
        App.charts.activeCharts[canvasId].destroy();
        delete App.charts.activeCharts[canvasId];
    }
};

var fuelTypeColors = {
    'Бензин': '#e67e22',
    'Дизель': '#2ecc71',
    'Газ (ГБО)': '#f39c12',
    'Электричество': '#3498db'
};
var averageColor = '#e74c3c';

function isMobile() {
    return window.innerWidth < 768;
}

/* ================================================================
   ГРАФИК РАСХОДА ТОПЛИВА (ПО МЕСЯЦАМ)
   ================================================================ */
App.charts.renderFuelConsumptionChart = async function() {
    App.charts.destroyChart('fuelConsumptionChart');
    const canvas = document.getElementById('fuelConsumptionChart');
    if (!canvas) return;
    
    const cacheKey = `fuel_consumption_${App.store.activeCarId}`;
    let grouped = App.chartCache.get(cacheKey);
    
    if (!grouped && App.store.activeCarId && App.supa.getMonthlyFuelStats) {
        const data = await App.supa.getMonthlyFuelStats(App.store.activeCarId);
        if (data && data.length) {
            grouped = {
                months: data.map(d => d.year_month),
                averageConsumption: data.map(d => parseFloat(d.avg_consumption) || 0),
                datasetsByType: { 'Общий': { consumption: data.map(d => parseFloat(d.avg_consumption) || 0) } }
            };
            App.chartCache.set(cacheKey, grouped);
        }
    }
    
    if (!grouped) {
        // fallback на локальную агрегацию (старый код)
        grouped = App.logic.groupFuelByMonth();
    }
    
    const months = grouped.months;
    const datasetsByType = grouped.datasetsByType;
    const averageConsumption = grouped.averageConsumption;
    
    const mobile = window.innerWidth < 768;
    const chartType = mobile ? 'bar' : 'line';
    
    const datasets = [];
    const avgDataset = {
        label: 'Средний расход',
        data: averageConsumption,
        borderColor: '#e74c3c',
        backgroundColor: mobile ? '#e74c3c70' : '#e74c3c20',
        tension: mobile ? undefined : 0.2,
        fill: false,
        pointRadius: mobile ? 0 : 4,
        pointHoverRadius: mobile ? 3 : 6,
        hidden: false,
        borderWidth: mobile ? 2 : 1,
        borderRadius: mobile ? 6 : 0
    };
    if (mobile) delete avgDataset.tension;
    datasets.push(avgDataset);
    
    for (const type in datasetsByType) {
        const data = datasetsByType[type].consumption;
        const color = { 'Бензин': '#e67e22', 'Дизель': '#2ecc71', 'Газ (ГБО)': '#f39c12', 'Электричество': '#3498db' }[type] || '#888';
        const typeDataset = {
            label: type,
            data: data,
            borderColor: color,
            backgroundColor: mobile ? color + '70' : color + '20',
            tension: mobile ? undefined : 0.2,
            fill: false,
            pointRadius: mobile ? 0 : 4,
            pointHoverRadius: mobile ? 3 : 6,
            hidden: true
        };
        if (mobile) delete typeDataset.tension;
        datasets.push(typeDataset);
    }
    
    const ctx = canvas.getContext('2d');
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} л/100 км` } },
            legend: { position: 'top' }
        },
        scales: { y: { title: { display: true, text: 'л/100 км' }, beginAtZero: true } }
    };
    if (!mobile) {
        options.plugins.zoom = {
            pan: { enabled: true, mode: 'x', speed: 10 },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', speed: 0.1, limits: { x: { min: 0.5, max: 5 } } }
        };
    }
    
    App.charts.activeCharts['fuelConsumptionChart'] = new Chart(ctx, {
        type: chartType,
        data: { labels: months, datasets: datasets },
        options: options
    });
    App.initIcons();
};


/* ================================================================
   ГРАФИК СРЕДНЕЙ ЦЕНЫ ТОПЛИВА (ПО МЕСЯЦАМ)
   ================================================================ */
App.charts.renderFuelPriceChart = function() {
    App.charts.destroyChart('fuelPriceChart');
    var canvas = document.getElementById('fuelPriceChart');
    if (!canvas) return;
    var grouped = App.logic.groupFuelByMonth();
    var months = grouped.months;
    var datasetsByType = grouped.datasetsByType;
    var mainFuelType = grouped.mainFuelType;

    var mobile = isMobile();
    var chartType = mobile ? 'bar' : 'line';

    var datasets = [];
    for (var type in datasetsByType) {
        var data = datasetsByType[type].price;
        var color = fuelTypeColors[type] || '#888';
        var typeDataset = {
            label: type,
            data: data,
            borderColor: color,
            backgroundColor: color + '20',
            tension: 0.2,
            fill: false,
            pointRadius: mobile ? 0 : 4,
            pointHoverRadius: mobile ? 3 : 6,
            hidden: (type !== mainFuelType)
        };
        if (mobile) {
            typeDataset.backgroundColor = color + '70';
            typeDataset.borderWidth = 2;
            typeDataset.borderRadius = 6;
            delete typeDataset.tension;
            delete typeDataset.fill;
        }
        datasets.push(typeDataset);
    }

    var ctx = canvas.getContext('2d');
    var options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + ' ₽/л'; }
                }
            },
            legend: { position: 'top' }
        },
        scales: {
            y: { title: { display: true, text: '₽/л' }, beginAtZero: true }
        }
    };

    if (!mobile) {
        options.plugins.zoom = {
            pan: { enabled: true, mode: 'x', speed: 10 },
            zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'x',
                speed: 0.1,
                limits: { x: { min: 0.5, max: 5 } }
            }
        };
    }

    App.charts.activeCharts['fuelPriceChart'] = new Chart(ctx, {
        type: chartType,
        data: { labels: months, datasets: datasets },
        options: options
    });
    App.initIcons();
};

/* ================================================================
   ГРАФИК ЗАТРАТ (ТОПЛИВО + ТО) ПО МЕСЯЦАМ
   ================================================================ */
App.charts.renderCostsChart = async function(period) {
    App.charts.destroyChart('costsChart');
    const canvas = document.getElementById('costsChart');
    if (!canvas) return;
    period = period || document.getElementById('stats-period-select')?.value || 'all';
    
    let startDate = null, endDate = null;
    if (period !== 'all') {
        const range = App.logic.getPeriodDateRange(period);
        startDate = range.start.toISOString().split('T')[0];
        endDate = range.end.toISOString().split('T')[0];
    }
    
    const cacheKey = `costs_${App.store.activeCarId}_${period}`;
    let monthly = App.chartCache.get(cacheKey);
    
    if (!monthly && App.store.activeCarId && App.supa.getMonthlyCosts) {
        const data = await App.supa.getMonthlyCosts(App.store.activeCarId, startDate, endDate);
        if (data && data.length) {
            monthly = {
                months: data.map(d => d.year_month),
                fuelCosts: data.map(d => parseFloat(d.fuel_cost) || 0),
                toCosts: data.map(d => parseFloat(d.maintenance_cost) || 0)
            };
            App.chartCache.set(cacheKey, monthly);
        }
    }
    
    if (!monthly) {
        // fallback на старую локальную агрегацию
        monthly = App.logic.groupCostsByMonth(period);
    }
    
    const months = monthly.months;
    const fuelCosts = monthly.fuelCosts;
    const toCosts = monthly.toCosts;
    
    if (months.length === 0) {
        const ctx = canvas.getContext('2d');
        App.charts.activeCharts['costsChart'] = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: true }
        });
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} ₽` } },
            legend: { position: 'top' }
        },
        scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Затраты (₽)' }, ticks: { callback: (v) => v.toLocaleString() } },
            x: { title: { display: true, text: 'Месяц' }, ticks: { maxRotation: 45, minRotation: 45 } }
        }
    };
    if (window.innerWidth >= 768) {
        options.plugins.zoom = {
            pan: { enabled: true, mode: 'x', speed: 10 },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', speed: 0.1, limits: { x: { min: 0.5, max: 5 } } }
        };
    }
    
    App.charts.activeCharts['costsChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Топливо (₽)', data: fuelCosts, backgroundColor: 'rgba(52,152,219,0.7)', borderColor: '#2980b9', borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'ТО (запчасти + работы) (₽)', data: toCosts, backgroundColor: 'rgba(231,76,60,0.7)', borderColor: '#c0392b', borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }
            ]
        },
        options: options
    });
    App.initIcons();
};

/* ================================================================
   КРУГОВАЯ ДИАГРАММА РАСПРЕДЕЛЕНИЯ ЗАТРАТ ПО КАТЕГОРИЯМ
   ================================================================ */
App.charts.renderExpensePieChart = function(period) {
    App.charts.destroyChart('expensePieChart');
    var canvas = document.getElementById('expensePieChart');
    if (!canvas) return;
    period = period || document.getElementById('stats-period-select')?.value || 'all';
    var structure = App.logic.calculateExpenseStructure(period);
    var labels = structure.labels;
    var values = structure.values;
    var colors = structure.colors;

    if (values.length === 0) {
        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['expensePieChart'] = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Нет данных'], datasets: [{ data: [1], backgroundColor: ['#ccc'] }] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { title: function() { return 'Нет данных за период'; } } }
                }
            }
        });
        return;
    }

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['expensePieChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '50%',
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            var label = context.label || '';
                            var value = context.raw;
                            var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                            var percent = ((value / total) * 100).toFixed(1);
                            return label + ': ' + value.toFixed(2) + ' ₽ (' + percent + '%)';
                        }
                    }
                }
            }
        }
    });
    App.initIcons();
};

/* ================================================================
   ПРОГРЕСС-БАР ОСТАТКА РЕСУРСА МАСЛА
   ================================================================ */
App.charts.renderOilResourceBar = function() {
    var container = document.getElementById('oil-resource-bar');
    if (!container) return;

    var oilOp = App.store.operations.find(function(op) {
        return op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1;
    });
    if (!oilOp) {
        container.innerHTML = '<p class="hint">Нет данных о массе</p>';
        return;
    }

    if (!container.querySelector('.oil-resource-track')) {
        container.innerHTML = '' +
            '<div class="oil-resource-label">Остаток ресурса масла</div>' +
            '<div class="oil-resource-track">' +
                '<div class="oil-resource-fill" style="width: 100%;"></div>' +
            '</div>' +
            '<div class="oil-resource-percent">100%</div>';
    }

    var plan = App.logic.calculatePlan(oilOp);
    var lastMileage = oilOp.lastMileage || App.store.settings.currentMileage;
    var nextMileage = plan.planMileage;
    var currentMileage = App.store.settings.currentMileage;

    var percentUsed = 0;
    if (nextMileage && nextMileage > lastMileage) {
        percentUsed = Math.min(100, Math.max(0, ((currentMileage - lastMileage) / (nextMileage - lastMileage)) * 100));
    }
    var percentRemaining = 100 - percentUsed;

    var color;
    if (percentRemaining >= 50) {
        var green = 200;
        var red = Math.floor((1 - (percentRemaining - 50) / 50) * 180);
        color = 'rgb(' + red + ', 200, 80)';
    } else {
        var red = 200;
        var green = Math.floor((percentRemaining / 50) * 200);
        color = 'rgb(200, ' + green + ', 60)';
    }

    var fill = container.querySelector('.oil-resource-fill');
    var percentLabel = container.querySelector('.oil-resource-percent');
    if (fill) {
        fill.style.width = percentRemaining + '%';
        fill.style.backgroundColor = color;
    }
    if (percentLabel) {
        percentLabel.textContent = Math.round(percentRemaining) + '%';
    }
    App.initIcons();
};

/* ================================================================
   МИНИ-ГРАФИКИ ДЛЯ ДАШБОРДА
   ================================================================ */

/**
 * Мини-график расхода топлива (дашборд) – показывает средний расход.
 */
App.charts.renderMiniFuelConsumptionChart = function() {
    App.charts.destroyChart('dash-fuel-consumption-chart');
    var canvas = document.getElementById('dash-fuel-consumption-chart');
    if (!canvas) return;
    var grouped = App.logic.groupFuelByMonth();
    var months = grouped.months.slice(-6);
    var data = grouped.averageConsumption.slice(-6);

    if (data.every(function(v) { return v === null; })) {
        var firstType = Object.keys(grouped.datasetsByType)[0];
        if (firstType) data = grouped.datasetsByType[firstType].consumption.slice(-6);
    }

    var mobile = isMobile();
    var chartType = mobile ? 'bar' : 'line';

    var dataset = {
        label: 'Средний расход',
        data: data,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231,76,60,0.1)',
        tension: 0.2,
        pointRadius: mobile ? 0 : 2
    };
    if (mobile) {
        dataset.backgroundColor = '#e74c3c70';
        dataset.borderWidth = 2;
        dataset.borderRadius = 4;
        delete dataset.tension;
    }

    var ctx = canvas.getContext('2d');
    var options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: function(ctx) { return ctx.raw + ' л/100 км'; }
                }
            }
        },
        scales: { y: { beginAtZero: true } }
    };

    App.charts.activeCharts['dash-fuel-consumption-chart'] = new Chart(ctx, {
        type: chartType,
        data: { labels: months, datasets: [dataset] },
        options: options
    });
};

App.charts.renderMiniCostsChart = function() {
    App.charts.destroyChart('dash-costs-chart');
    var canvas = document.getElementById('dash-costs-chart');
    if (!canvas) return;
    var grouped = App.logic.groupCostsByMonth('6months');
    var months = grouped.months;
    var fuelCosts = grouped.fuelCosts;
    var toCosts = grouped.toCosts;

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['dash-costs-chart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Топливо', data: fuelCosts, backgroundColor: '#3498db' },
                { label: 'ТО', data: toCosts, backgroundColor: '#e74c3c' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: function(ctx) { return ctx.raw + ' ₽'; } } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return v + ' ₽'; } } } }
        }
    });
};

App.charts.renderMiniExpensePieChart = function() {
    App.charts.destroyChart('dash-expense-pie-chart');
    var canvas = document.getElementById('dash-expense-pie-chart');
    if (!canvas) return;
    var structure = App.logic.calculateExpenseStructure('6months');

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['dash-expense-pie-chart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: structure.labels,
            datasets: [{ data: structure.values, backgroundColor: structure.colors }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
};

App.charts.updateDrivingModeIndicator = function() {
    var modeSpan = document.getElementById('driving-mode');
    var hintSpan = document.getElementById('driving-mode-hint');
    if (!modeSpan) return;
    var modeData = App.logic.getDrivingMode();
    modeSpan.textContent = modeData.text;
    if (hintSpan) hintSpan.textContent = modeData.hint;
    var container = document.getElementById('driving-mode-indicator');
    if (container) {
        container.classList.remove('city', 'highway', 'mixed');
        if (modeData.text.indexOf('Городской') !== -1) container.classList.add('city');
        else if (modeData.text.indexOf('Трассовый') !== -1) container.classList.add('highway');
        else if (modeData.text.indexOf('Смешанный') !== -1) container.classList.add('mixed');
    }
};