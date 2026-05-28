// src/ui/pages/stats.js (Финансы)
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// Период по умолчанию
App.ui.pages.financePeriod = 'month';

// Хранилище экземпляров графиков
App.charts._financeDynamics = null;
App.charts._financeCostHist = null;
App.charts._financePie = null;
App.charts._financeComp = null;

// Проверка доступности Chart.js
function isChartAvailable() {
    return typeof Chart !== 'undefined';
}

// Вспомогательная функция для обновления данных графика
function updateChartData(chart, labels, datasets) {
    if (!chart) return false;
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.update();
    return true;
}

// Главный вход при открытии вкладки
App.ui.pages.renderFinanceTab = function() {
    App.ui.pages.populateFinancePeriodSwitch();
    App.ui.pages.updateFinanceMetrics();
    App.ui.pages.updateFinanceForecast();
    App.ui.pages.renderDynamicsChart();   // теперь ленивый рендер
    App.ui.pages.renderCostHistogram();
    App.ui.pages.renderFinancePie();
    App.ui.pages.renderComparison();
};

// Быстрый вызов из events.js (старое имя)
App.ui.pages.renderStats = function() { App.ui.pages.renderFinanceTab(); };
App.ui.pages.renderFuelAnalytics = function() {};

// ---------- Переключатель периода ----------
App.ui.pages.populateFinancePeriodSwitch = function() {
    var container = document.getElementById('finance-period-switch');
    if (!container) return;
    container.querySelectorAll('.period-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.period === App.ui.pages.financePeriod) btn.classList.add('active');
        btn.onclick = function() {
            var period = this.dataset.period;
            App.ui.pages.financePeriod = period;
            container.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            // Обновляем метрики и графики
            App.ui.pages.updateFinanceMetrics();
            App.ui.pages.updateFinanceForecast();
            App.ui.pages.renderDynamicsChart();
            App.ui.pages.renderCostHistogram();
            App.ui.pages.renderFinancePie();
        };
    });
};

// ---------- Вспомогательные функции дат ----------
function getMonthKey(date) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0'); }
function parseMonthKey(key) { var parts = key.split('-'); return { year: parseInt(parts[0]), month: parseInt(parts[1])-1 }; }

function getPeriodDateRange(period) {
    var now = new Date();
    var start, end;
    if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59);
    } else if (period === 'quarter') {
        var qStart = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qStart, 1);
        end = new Date(now.getFullYear(), qStart+3, 0, 23,59,59);
    } else if (period === 'year') {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23,59,59);
    } else { // all
        start = new Date(2000,0,1);
        end = new Date(2099,11,31,23,59,59);
    }
    return { start: start, end: end };
}

// ---------- Получение всех затрат за период ----------
function getTotalCostsInPeriod(start, end) {
    var fuelCost = 0, toCost = 0, partsCost = 0, tiresCost = 0;
    (App.store.fuelLog || []).forEach(function(f) {
        var d = new Date(f.date);
        if (d >= start && d <= end) fuelCost += (parseFloat(f.liters)||0) * (parseFloat(f.pricePerLiter)||0);
    });
    (App.store.serviceRecords || []).forEach(function(r) {
        var d = new Date(r.date);
        if (d >= start && d <= end) toCost += (parseFloat(r.parts_cost)||0) + (parseFloat(r.work_cost)||0);
    });
    (App.store.parts || []).forEach(function(p) { partsCost += parseFloat(p.price)||0; });
    (App.store.tireLog || []).forEach(function(t) {
        var d = new Date(t.date);
        if (d >= start && d <= end) tiresCost += (parseFloat(t.purchaseCost)||0) + (parseFloat(t.mountCost)||0);
    });
    return { fuel: fuelCost, to: toCost, parts: partsCost, tires: tiresCost };
}

// ---------- Агрегация общих затрат по месяцам ----------
function aggregateMonthlyCosts() {
    var monthly = {};
    (App.store.fuelLog || []).forEach(function(f) {
        if (!f.date) return;
        var d = new Date(f.date);
        var key = getMonthKey(d);
        if (!monthly[key]) monthly[key] = 0;
        monthly[key] += (parseFloat(f.liters)||0) * (parseFloat(f.pricePerLiter)||0);
    });
    (App.store.serviceRecords || []).forEach(function(r) {
        if (!r.date) return;
        var d = new Date(r.date);
        var key = getMonthKey(d);
        if (!monthly[key]) monthly[key] = 0;
        monthly[key] += (parseFloat(r.parts_cost)||0) + (parseFloat(r.work_cost)||0);
    });
    (App.store.tireLog || []).forEach(function(t) {
        if (!t.date) return;
        var d = new Date(t.date);
        var key = getMonthKey(d);
        if (!monthly[key]) monthly[key] = 0;
        monthly[key] += (parseFloat(t.purchaseCost)||0) + (parseFloat(t.mountCost)||0);
    });
    return monthly;
}

// ---------- Метрики ----------
App.ui.pages.updateFinanceMetrics = function() {
    var period = App.ui.pages.financePeriod;
    var range = getPeriodDateRange(period);
    var costs = getTotalCostsInPeriod(range.start, range.end);
    var total = costs.fuel + costs.to + costs.parts + costs.tires;
    document.getElementById('finance-total').textContent = total.toLocaleString() + ' ₽';

    var days = Math.ceil((range.end - range.start) / (1000 * 60 * 60 * 24)) || 1;
    var dailyAvg = total / days;
    document.getElementById('finance-daily-avg').textContent = dailyAvg.toFixed(0) + ' ₽';

    var monthly = aggregateMonthlyCosts();
    var best  = { monthKey: '', cost:  Infinity };
    var worst = { monthKey: '', cost: -Infinity };

    for (var key in monthly) {
        var d = parseMonthKey(key);
        var date = new Date(d.year, d.month, 1);
        if (date >= range.start && date <= range.end) {
            if (monthly[key] > worst.cost) {
                worst.cost = monthly[key];
                worst.monthKey = key;
            }
            if (monthly[key] < best.cost) {
                best.cost = monthly[key];
                best.monthKey = key;
            }
        }
    }

    if (worst.monthKey) {
        document.getElementById('finance-expensive-month').textContent = worst.monthKey;
        document.getElementById('finance-expensive-amount').textContent = worst.cost.toLocaleString() + ' ₽';
    } else {
        document.getElementById('finance-expensive-month').textContent = '—';
        document.getElementById('finance-expensive-amount').textContent = '';
    }

    if (best.monthKey) {
        document.getElementById('finance-cheap-month').textContent = best.monthKey;
        document.getElementById('finance-cheap-amount').textContent = best.cost.toLocaleString() + ' ₽';
    } else {
        document.getElementById('finance-cheap-month').textContent = '—';
        document.getElementById('finance-cheap-amount').textContent = '';
    }
};

// ---------- Прогноз ----------
App.ui.pages.updateFinanceForecast = function() {
    var monthly = aggregateMonthlyCosts();
    var now = new Date();
    var lastThree = [];
    for (var i = 3; i >= 1; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var key = getMonthKey(d);
        lastThree.push(monthly[key] || 0);
    }
    if (lastThree.length < 3 || lastThree.every(function(v){ return v === 0; })) {
        document.getElementById('finance-forecast-value').innerHTML = '<span class="hint">Недостаточно данных</span>';
        return;
    }
    var avg = lastThree.reduce(function(a,b){return a+b;},0) / 3;
    var forecast = avg;
    var maxDiff = 0;
    lastThree.forEach(function(v) { maxDiff = Math.max(maxDiff, Math.abs(v - avg)); });
    var rangeText = avg ? (maxDiff / avg * 100).toFixed(0) : 0;
    document.getElementById('finance-forecast-value').innerHTML =
        '<span style="font-size:1.8rem; font-weight:700;">' + forecast.toFixed(0) + ' ₽</span>' +
        ' <span style="opacity:0.8;">±' + rangeText + '%</span>' +
        '<div class="hint">(на основе среднего за последние 3 месяца)</div>';
};

// ---------- Линейный график динамики с прогнозом (ленивая инициализация) ----------
App.ui.pages.renderDynamicsChart = function() {
    if (!isChartAvailable()) return;
    var canvas = document.getElementById('financeDynamicsChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // Получаем данные
    var monthly = aggregateMonthlyCosts();
    var now = new Date();
    var labels = [];
    var factData = [];
    for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var key = getMonthKey(d);
        labels.push(key);
        factData.push(monthly[key] || 0);
    }
    var last3 = factData.slice(-3);
    var avgLast3 = last3.reduce(function(a,b){return a+b;},0) / 3;
    var forecastData = [];
    for (var j = 0; j < 3; j++) {
        labels.push('прогноз');
        forecastData.push(avgLast3);
    }
    var forecastDataPadded = new Array(labels.length - 3).fill(null).concat(forecastData);

    // Если графика ещё нет – создаём, иначе обновляем данные
    if (!App.charts._financeDynamics) {
        App.charts._financeDynamics = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Факт',
                        data: factData.concat(new Array(3).fill(null)),
                        borderColor: '#3498db',
                        backgroundColor: 'transparent',
                        tension: 0.2,
                        pointRadius: 2
                    },
                    {
                        label: 'Прогноз',
                        data: forecastDataPadded,
                        borderColor: '#e74c3c',
                        borderDash: [5,5],
                        backgroundColor: 'transparent',
                        tension: 0.2,
                        pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } else {
        App.charts._financeDynamics.data.labels = labels;
        App.charts._financeDynamics.data.datasets[0].data = factData.concat(new Array(3).fill(null));
        App.charts._financeDynamics.data.datasets[1].data = forecastDataPadded;
        App.charts._financeDynamics.update();
    }
};

// ---------- Гистограмма общих затрат (ленивая) ----------
App.ui.pages.renderCostHistogram = function() {
    if (!isChartAvailable()) return;
    var canvas = document.getElementById('financeCostHistogram');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var period = App.ui.pages.financePeriod;
    var labels, data;
    var monthly = aggregateMonthlyCosts();
    var now = new Date();

    if (period === 'month') {
        labels = ['1','2','3','4'];
        data = [0,0,0,0];
        var start = new Date(now.getFullYear(), now.getMonth(), 1);
        var end = new Date(now.getFullYear(), now.getMonth()+1, 0);
        for (var key in monthly) {
            var d = parseMonthKey(key);
            var date = new Date(d.year, d.month, 15);
            if (date >= start && date <= end) {
                var week = Math.ceil(date.getDate() / 7);
                data[week-1] += monthly[key];
            }
        }
    } else if (period === 'quarter') {
        var qStart = Math.floor(now.getMonth()/3)*3;
        labels = [];
        data = [];
        for (var m=0; m<3; m++) {
            var monthDate = new Date(now.getFullYear(), qStart+m, 1);
            labels.push(monthDate.toLocaleString('ru',{month:'short',year:'2-digit'}));
            data.push(monthly[getMonthKey(monthDate)] || 0);
        }
    } else if (period === 'year') {
        labels = [];
        data = [];
        for (var m=0; m<12; m++) {
            var monthDate = new Date(now.getFullYear(), m, 1);
            labels.push(monthDate.toLocaleString('ru',{month:'short'}));
            data.push(monthly[getMonthKey(monthDate)] || 0);
        }
    } else {
        labels = [];
        data = [];
        var years = {};
        for (var key in monthly) {
            var y = key.split('-')[0];
            if (!years[y]) years[y] = 0;
            years[y] += monthly[key];
        }
        var sortedYears = Object.keys(years).sort();
        sortedYears.forEach(function(y) {
            labels.push(y);
            data.push(years[y]);
        });
    }

    // Создаём или обновляем график
    if (!App.charts._financeCostHist) {
        App.charts._financeCostHist = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Общие затраты',
                    data: data,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } else {
        App.charts._financeCostHist.data.labels = labels;
        App.charts._financeCostHist.data.datasets[0].data = data;
        App.charts._financeCostHist.update();
    }
};

// ---------- Круговая диаграмма распределения (ленивая) ----------
App.ui.pages.renderFinancePie = function() {
    if (!isChartAvailable()) return;
    var canvas = document.getElementById('financePieChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var period = App.ui.pages.financePeriod;
    var range = getPeriodDateRange(period);
    var costs = getTotalCostsInPeriod(range.start, range.end);
    var labels = ['Топливо', 'ТО', 'Запчасти', 'Шины'];
    var data = [costs.fuel, costs.to, costs.parts, costs.tires];
    var colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

    if (data.every(function(v){ return v===0; })) {
        if (App.charts._financePie) App.charts._financePie.destroy();
        return;
    }

    if (!App.charts._financePie) {
        App.charts._financePie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: data, backgroundColor: colors }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    } else {
        App.charts._financePie.data.labels = labels;
        App.charts._financePie.data.datasets[0].data = data;
        App.charts._financePie.update();
    }
};

// ---------- Сравнение периодов (ленивый график) ----------
App.ui.pages.renderComparison = function() {
    var select1 = document.getElementById('compare-period-1');
    var select2 = document.getElementById('compare-period-2');
    if (!select1 || !select2) return;
    var now = new Date();
    select1.innerHTML = ''; select2.innerHTML = '';
    for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var key = getMonthKey(d);
        var option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        select1.appendChild(option.cloneNode(true));
        select2.appendChild(option);
    }
    select1.value = getMonthKey(new Date(now.getFullYear(), now.getMonth()-1, 1));
    select2.value = getMonthKey(now);

    var updateComparison = function() {
        var key1 = select1.value, key2 = select2.value;
        if (!key1 || !key2) return;
        var p1 = parseMonthKey(key1), p2 = parseMonthKey(key2);
        var r1 = { start: new Date(p1.year,p1.month,1), end: new Date(p1.year,p1.month+1,0,23,59,59) };
        var r2 = { start: new Date(p2.year,p2.month,1), end: new Date(p2.year,p2.month+1,0,23,59,59) };
        var c1 = getTotalCostsInPeriod(r1.start, r1.end);
        var c2 = getTotalCostsInPeriod(r2.start, r2.end);
        var total1 = c1.fuel+c1.to+c1.parts+c1.tires;
        var total2 = c2.fuel+c2.to+c2.parts+c2.tires;
        var diff = total2 - total1;
        var diffPercent = total1 ? (diff/total1*100).toFixed(1) : 0;
        document.getElementById('comparison-results').innerHTML =
            '<div class="comparison-line"><span>' + key1 + ': ' + total1.toLocaleString() + ' ₽</span><span>' + key2 + ': ' + total2.toLocaleString() + ' ₽</span></div>' +
            '<div>Изменение: ' + (diff>=0?'+':'') + diffPercent + '%</div>';

        var canvas = document.getElementById('financeComparisonChart');
        if (canvas && isChartAvailable()) {
            var ctx = canvas.getContext('2d');
            var labels = ['Топливо','ТО','Запчасти','Шины'];
            var datasets = [
                { label: key1, data: [c1.fuel, c1.to, c1.parts, c1.tires], backgroundColor: '#3498db' },
                { label: key2, data: [c2.fuel, c2.to, c2.parts, c2.tires], backgroundColor: '#e74c3c' }
            ];

            if (!App.charts._financeComp) {
                App.charts._financeComp = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: labels, datasets: datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom' } },
                        scales: { y: { beginAtZero: true } }
                    }
                });
            } else {
                App.charts._financeComp.data.labels = labels;
                App.charts._financeComp.data.datasets = datasets;
                App.charts._financeComp.update();
            }
        }
    };

    select1.addEventListener('change', updateComparison);
    select2.addEventListener('change', updateComparison);
    updateComparison();
};