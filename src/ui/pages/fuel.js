// src/ui/pages/fuel.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages._fuelPeriod = 'month';

// ---------- Главная точка входа ----------
App.ui.pages.renderFuelTab = function() {
    if (!App.store.fuelLog || App.store.fuelLog.length === 0) {
        ['fuel-summary-card', 'fuel-period-switch'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        ['fuelPriceHistogram', 'fuelConsumptionHistogram', 'fuelCostPieChart', 'fuelVolumePieChart'].forEach(function(canvasId) {
            var canvas = document.getElementById(canvasId);
            if (canvas) {
                var card = canvas.closest('.card.chart-card');
                if (card) card.style.display = 'none';
            }
        });
        var cardsContainer = document.getElementById('fuel-cards-container');
        if (cardsContainer) cardsContainer.innerHTML = '<p class="hint">Нет данных</p>';
        return;
    } else {
        ['fuel-summary-card', 'fuel-period-switch'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.style.display = '';
        });
        ['fuelPriceHistogram', 'fuelConsumptionHistogram', 'fuelCostPieChart', 'fuelVolumePieChart'].forEach(function(canvasId) {
            var canvas = document.getElementById(canvasId);
            if (canvas) {
                var card = canvas.closest('.card.chart-card');
                if (card) card.style.display = '';
            }
        });
    }

    App.ui.pages.renderFuelSummary();
    App.ui.pages.renderFuelPeriodSwitch();
    App.ui.pages.renderFuelCharts(App.ui.pages._fuelPeriod);
    App.ui.pages.renderFuelCards();
};

// ---------- Сводка 2×2 ----------
App.ui.pages.renderFuelSummary = function() {
    var logs = App.store.fuelLog || [];
    if (logs.length === 0) {
        document.getElementById('fuel-total-cost').textContent = '0 ₽';
        document.getElementById('fuel-avg-consumption').textContent = '0';
        document.getElementById('fuel-total-liters').textContent = '0';
        document.getElementById('fuel-cost-per-km').textContent = '0';
        return;
    }
    var totalLiters = 0, totalCost = 0, totalMileage = 0;
    var typeLiters = {}, typeCost = {};

    logs.forEach(function(f) {
        var lit = parseFloat(f.liters) || 0;
        var price = parseFloat(f.pricePerLiter) || 0;
        var mileage = parseFloat(f.mileage) || 0;
        totalLiters += lit;
        totalCost += lit * price;
        if (mileage > totalMileage) totalMileage = mileage;
        var t = f.fuelType || 'Бензин';
        if (!typeLiters[t]) { typeLiters[t] = 0; typeCost[t] = 0; }
        typeLiters[t] += lit;
        typeCost[t] += lit * price;
    });

    var sumConsumption = 0, typeCount = 0;
    for (var t in typeLiters) {
        if (typeLiters[t] > 0 && totalMileage > 0) {
            sumConsumption += (typeLiters[t] / totalMileage) * 100;
            typeCount++;
        }
    }
    var avgConsumption = typeCount ? (sumConsumption / typeCount).toFixed(1) : 0;
    var costPerKm = totalMileage ? (totalCost / totalMileage).toFixed(2) : 0;

    document.getElementById('fuel-total-cost').textContent = totalCost.toLocaleString() + ' ₽';
    document.getElementById('fuel-avg-consumption').textContent = avgConsumption;
    document.getElementById('fuel-total-liters').textContent = totalLiters.toLocaleString();
    document.getElementById('fuel-cost-per-km').textContent = costPerKm;
};

// ---------- Переключатель периода ----------
App.ui.pages.renderFuelPeriodSwitch = function() {
    var container = document.getElementById('fuel-period-switch');
    if (!container) return;
    container.querySelectorAll('.period-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.fuelPeriod === App.ui.pages._fuelPeriod) {
            btn.classList.add('active');
        }
        btn.onclick = function() {
            App.ui.pages._fuelPeriod = this.dataset.fuelPeriod;
            container.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            App.ui.pages.renderFuelCharts(App.ui.pages._fuelPeriod);
        };
    });
};

// ---------- Все графики ----------
App.ui.pages.renderFuelCharts = function(period) {
    App.ui.pages.renderFuelPriceHistogram(period);
    App.ui.pages.renderFuelConsumptionHistogram(period);
    App.ui.pages.renderFuelCostPie(period);
    App.ui.pages.renderFuelVolumePie(period);
};

// ---------- Вспомогательные функции для периодов ----------
function getIntervalStart(period) {
    var now = new Date();
    switch (period) {
        case 'week':
            var day = now.getDay();
            var diffToMonday = (day === 0 ? 6 : day - 1);
            var monday = new Date(now);
            monday.setDate(now.getDate() - diffToMonday);
            monday.setHours(0,0,0,0);
            return monday;
        case 'month':
            return new Date(now.getFullYear(), now.getMonth(), 1);
        case 'quarter':
            var quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
            return new Date(now.getFullYear(), quarterStartMonth, 1);
        case '6months':
            return new Date(now.getFullYear(), now.getMonth() - 5, 1);
        case 'year':
            return new Date(now.getFullYear(), 0, 1);
        case '5years':
            return new Date(now.getFullYear() - 4, 0, 1);
        default: return null;
    }
}

function generateIntervals(period) {
    var start = getIntervalStart(period);
    var now = new Date();
    var intervals = [];
    var labels = [];
    var current = new Date(start);
    var monthNames = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    var dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

    if (period === 'week') {
        for (var i = 0; i < 7; i++) {
            var d = new Date(current);
            d.setDate(current.getDate() + i);
            labels.push(dayNames[i]);
            intervals.push({ start: d, end: new Date(d.getTime() + 86400000 - 1) });
        }
    } else if (period === 'month') {
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        for (var w = 0; w < 4; w++) {
            var weekStart = new Date(monthStart);
            weekStart.setDate(monthStart.getDate() + w * 7);
            var weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            labels.push((w+1).toString());
            intervals.push({ start: weekStart, end: weekEnd });
        }
    } else if (period === 'quarter') {
        for (var m = 0; m < 3; m++) {
            var monthDate = new Date(now.getFullYear(), now.getMonth() - (2 - m), 1);
            labels.push(monthNames[monthDate.getMonth()] + '.' + monthDate.getFullYear().toString().slice(-2));
            intervals.push({ start: monthDate, end: new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0, 23,59,59) });
        }
    } else if (period === '6months') {
        for (var m = 5; m >= 0; m--) {
            var monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
            labels.push(monthNames[monthDate.getMonth()] + '.' + monthDate.getFullYear().toString().slice(-2));
            intervals.push({ start: monthDate, end: new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0, 23,59,59) });
        }
    } else if (period === 'year') {
        for (var m = 11; m >= 0; m--) {
            var monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
            labels.push(monthNames[monthDate.getMonth()] + '.' + monthDate.getFullYear().toString().slice(-2));
            intervals.push({ start: monthDate, end: new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0, 23,59,59) });
        }
    } else if (period === '5years') {
        for (var y = 4; y >= 0; y--) {
            var yearStart = new Date(now.getFullYear() - y, 0, 1);
            labels.push(yearStart.getFullYear().toString());
            intervals.push({ start: yearStart, end: new Date(yearStart.getFullYear(), 11, 31, 23,59,59) });
        }
    }
    return { labels: labels, intervals: intervals };
}

// ---------- Гистограмма средней цены ----------
App.ui.pages.renderFuelPriceHistogram = function(period) {
    var canvas = document.getElementById('fuelPriceHistogram');
    if (!canvas) return;
    if (App.charts._fuelPriceHist) App.charts._fuelPriceHist.destroy();
    var res = generateIntervals(period);
    if (res.labels.length === 0) return;
    var logs = App.store.fuelLog || [];
    var datasets = {}, allTypes = [];
    logs.forEach(function(f) {
        var t = f.fuelType || 'Бензин';
        if (allTypes.indexOf(t) === -1) allTypes.push(t);
    });
    allTypes.forEach(function(t) { datasets[t] = new Array(res.labels.length).fill(null); });

    for (var i = 0; i < res.intervals.length; i++) {
        var intv = res.intervals[i];
        var summed = {};
        allTypes.forEach(function(t) { summed[t] = { totalCost: 0, totalLiters: 0 }; });
        logs.forEach(function(f) {
            var d = new Date(f.date);
            if (d >= intv.start && d <= intv.end) {
                var t = f.fuelType || 'Бензин';
                summed[t].totalCost += (f.liters || 0) * (f.pricePerLiter || 0);
                summed[t].totalLiters += (f.liters || 0);
            }
        });
        allTypes.forEach(function(t) {
            if (summed[t].totalLiters > 0) {
                datasets[t][i] = parseFloat((summed[t].totalCost / summed[t].totalLiters).toFixed(2));
            }
        });
    }

    var colors = {
        'Бензин': '#E53935',
        'Дизель': '#FF8C00',
        'Газ (ГБО)': '#0072CE',
        'Электричество': '#A6CE39'
    };
    var ds = allTypes.map(function(t) {
        return {
            label: t,
            data: datasets[t],
            backgroundColor: colors[t] || '#888',
            borderColor: colors[t] || '#888',
            borderWidth: 1
        };
    });

    var ctx = canvas.getContext('2d');
    App.charts._fuelPriceHist = new Chart(ctx, {
        type: 'bar',
        data: { labels: res.labels, datasets: ds },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + ' ₽/л'; } } }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: '₽/л' } } }
        }
    });
};

// ---------- Гистограмма расхода ----------
App.ui.pages.renderFuelConsumptionHistogram = function(period) {
    var canvas = document.getElementById('fuelConsumptionHistogram');
    if (!canvas) return;
    if (App.charts._fuelConsHist) App.charts._fuelConsHist.destroy();
    var res = generateIntervals(period);
    if (res.labels.length === 0) return;
    var logs = App.store.fuelLog || [];
    var sorted = logs.filter(function(f) { return f.date && f.mileage; }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    var allTypes = [];
    logs.forEach(function(f) {
        var t = f.fuelType || 'Бензин';
        if (allTypes.indexOf(t) === -1) allTypes.push(t);
    });
    var datasets = {};
    allTypes.forEach(function(t) { datasets[t] = new Array(res.labels.length).fill(null); });

    for (var i = 0; i < res.intervals.length; i++) {
        var intv = res.intervals[i];
        var typeConsumptions = {};
        allTypes.forEach(function(t) { typeConsumptions[t] = []; });
        for (var j = 1; j < sorted.length; j++) {
            var curr = sorted[j], prev = sorted[j-1];
            var d = new Date(curr.date);
            if (d >= intv.start && d <= intv.end) {
                var dist = curr.mileage - prev.mileage;
                if (dist > 0) {
                    var cons = (curr.liters / dist) * 100;
                    var t = curr.fuelType || 'Бензин';
                    if (allTypes.indexOf(t) >= 0) typeConsumptions[t].push(cons);
                }
            }
        }
        allTypes.forEach(function(t) {
            if (typeConsumptions[t].length > 0) {
                var avg = typeConsumptions[t].reduce(function(a,b) { return a+b; }, 0) / typeConsumptions[t].length;
                datasets[t][i] = parseFloat(avg.toFixed(2));
            }
        });
    }

    var colors = {
        'Бензин': '#E53935',
        'Дизель': '#FF8C00',
        'Газ (ГБО)': '#0072CE',
        'Электричество': '#A6CE39'
    };
    var ds = allTypes.map(function(t) {
        return {
            label: t,
            data: datasets[t],
            backgroundColor: colors[t] || '#888',
            borderColor: colors[t] || '#888',
            borderWidth: 1
        };
    });

    var ctx = canvas.getContext('2d');
    App.charts._fuelConsHist = new Chart(ctx, {
        type: 'bar',
        data: { labels: res.labels, datasets: ds },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw + ' л/100 км'; } } }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'л/100 км' } } }
        }
    });
};

// Круговая: затраты по типу топлива
App.ui.pages.renderFuelCostPie = function(period) {
    var canvas = document.getElementById('fuelCostPieChart');
    if (!canvas) return;
    if (App.charts._fuelCostPie) App.charts._fuelCostPie.destroy();
    var res = generateIntervals(period);
    var logs = App.store.fuelLog || [];
    var typeCost = {};
    logs.forEach(function(f) {
        var d = new Date(f.date);
        if (res.intervals.some(function(intv) { return d >= intv.start && d <= intv.end; })) {
            var t = f.fuelType || 'Бензин';
            typeCost[t] = (typeCost[t] || 0) + (f.liters || 0) * (f.pricePerLiter || 0);
        }
    });
    var labels = Object.keys(typeCost);
    var data = labels.map(function(l) { return typeCost[l]; });
    // Фиксированное соответствие цветов
    var colorMap = {
        'Бензин': '#E53935',
        'Дизель': '#FF8C00',
        'Газ (ГБО)': '#0072CE',
        'Электричество': '#A6CE39'
    };
    var backgroundColor = labels.map(function(l) { return colorMap[l] || '#888'; });
    if (labels.length === 0) return;
    var ctx = canvas.getContext('2d');
    App.charts._fuelCostPie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: backgroundColor }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
};

// Круговая: расход (литры) по типу топлива
App.ui.pages.renderFuelVolumePie = function(period) {
    var canvas = document.getElementById('fuelVolumePieChart');
    if (!canvas) return;
    if (App.charts._fuelVolumePie) App.charts._fuelVolumePie.destroy();
    var res = generateIntervals(period);
    var logs = App.store.fuelLog || [];
    var typeLiters = {};
    logs.forEach(function(f) {
        var d = new Date(f.date);
        if (res.intervals.some(function(intv) { return d >= intv.start && d <= intv.end; })) {
            var t = f.fuelType || 'Бензин';
            typeLiters[t] = (typeLiters[t] || 0) + (f.liters || 0);
        }
    });
    var labels = Object.keys(typeLiters);
    var data = labels.map(function(l) { return typeLiters[l]; });
    var colorMap = {
        'Бензин': '#E53935',
        'Дизель': '#FF8C00',
        'Газ (ГБО)': '#0072CE',
        'Электричество': '#A6CE39'
    };
    var backgroundColor = labels.map(function(l) { return colorMap[l] || '#888'; });
    if (labels.length === 0) return;
    var ctx = canvas.getContext('2d');
    App.charts._fuelVolumePie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: backgroundColor }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
};

// ---------- Карточки заправок (аккордеоны по годам) ----------
App.ui.pages.renderFuelCards = function() {
    var container = document.getElementById('fuel-cards-container');
    if (!container) return;
    var sorted = (App.store.fuelLog || []).filter(function(f) { return f.date; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    if (sorted.length === 0) {
        container.innerHTML = '<p class="hint">Нет данных</p>';
        return;
    }
    var byYear = {};
    sorted.forEach(function(f) {
        var year = f.date.substring(0, 4);
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(f);
    });
    var years = Object.keys(byYear).sort().reverse();
    var html = '';
    years.forEach(function(year) {
        var records = byYear[year];
        var totalLiters = records.reduce(function(s, r) { return s + (Number(r.liters) || 0); }, 0);
        var totalCost = records.reduce(function(s, r) { return s + (Number(r.liters) || 0) * (Number(r.pricePerLiter) || 0); }, 0);
        html += '<div class="accordion-group">';
        html += '<div class="accordion-header">';
        html += '<i data-lucide="calendar"></i> ' + year + ' (' + totalLiters.toFixed(1) + ' л, ' + totalCost.toFixed(0) + ' ₽)';
        html += '<i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>';
        html += '</div>';
        html += '<div class="accordion-body">';

        records.forEach(function(f) {
            var originalIndex = App.store.fuelLog.indexOf(f);
            var fuelType = f.fuelType || 'Бензин';
            var typeClass = 'petrol';
            if (fuelType === 'Дизель') typeClass = 'diesel';
            else if (fuelType === 'Газ (ГБО)') typeClass = 'gas';
            else if (fuelType === 'Электричество') typeClass = 'electric';
            var total = (Number(f.liters) || 0) * (Number(f.pricePerLiter) || 0);
            var fullTank = (f.fullTank === 'TRUE' || f.fullTank === true);
            html += '<div class="card-item">';
            html += '<div class="card-header">';
            html += '<div class="card-summary">';
            html += '<strong>' + App.utils.escapeHtml(f.date) + '</strong>';
            html += '<div class="card-meta"><span class="fuel-type-dot ' + typeClass + '"></span>' + fuelType + (fullTank ? ' · Полный бак' : '') + '</div>';
            html += '<div class="card-meta">Пробег: ' + (f.mileage || '—') + ' км · ' + f.liters + ' л · ' + (f.pricePerLiter || '—') + ' ₽/л</div>';
            html += '<div class="card-meta">Сумма: ' + total.toFixed(2) + ' ₽</div>';
            if (f.notes) html += '<div class="card-meta">Прим.: ' + App.utils.escapeHtml(f.notes) + '</div>';
            html += '</div>';
            html += '<div class="card-actions">';
            html += '<button class="icon-btn" data-action="edit-fuel" data-idx="' + originalIndex + '"><i data-lucide="pencil"></i></button>';
            html += '<button class="icon-btn" data-action="delete-fuel" data-idx="' + originalIndex + '"><i data-lucide="trash-2"></i></button>';
            html += '</div>';
            html += '</div>'; // card-header
            html += '</div>'; // card-item
        });

        html += '</div></div>'; // accordion-body, accordion-group
    });

    container.innerHTML = html;

    // Обработчики аккордеонов
    container.querySelectorAll('.accordion-header').forEach(function(header) {
        header.addEventListener('click', function() {
            var body = header.nextElementSibling;
            if (body && body.classList.contains('accordion-body')) {
                body.classList.toggle('open');
                header.classList.toggle('open');
                var arrow = header.querySelector('.accordion-arrow');
                if (arrow) {
                    arrow.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
                }
            }
        });
    });

    App.initIcons();
};

// ---------- Старая точка входа ----------
App.ui.pages.renderFuelTable = function() {
    App.ui.pages.renderFuelTab();
};

// ======== УПРАВЛЕНИЕ ЗАПРАВКАМИ (восстановлено) ========
App.ui.pages.checkFuelOrderConflicts = function(dateISO, mileage, excludeRowIndex) {
    var sorted = App.store.fuelLog.filter(function(_, idx) {
        return (idx + 2) !== excludeRowIndex;
    }).sort(function(a, b) {
        if (a.date === b.date) return a.mileage - b.mileage;
        return (a.date || '').localeCompare(b.date || '');
    });

    var prev = null, next = null;
    for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i];
        if (!r.date) continue;
        if (r.date < dateISO) {
            prev = r;
        } else if (r.date === dateISO && r.mileage <= mileage) {
            prev = r;
        } else {
            next = r;
            break;
        }
    }

    var conflict = false;
    var message = '';
    if (prev && prev.mileage > mileage) {
        conflict = true;
        message += '⚠️ Пробег (' + mileage + ' км) меньше предыдущей заправки от ' + prev.date + ' (' + prev.mileage + ' км). ';
    }
    if (next && next.mileage < mileage) {
        conflict = true;
        message += '⚠️ Пробег (' + mileage + ' км) больше следующей заправки от ' + next.date + ' (' + next.mileage + ' км). ';
    }
    if (prev && prev.date > dateISO) {
        conflict = true;
        message += '⚠️ Дата (' + dateISO + ') раньше предыдущей заправки от ' + prev.date + '. ';
    }
    if (next && next.date < dateISO) {
        conflict = true;
        message += '⚠️ Дата (' + dateISO + ') позже следующей заправки от ' + next.date + '. ';
    }
    return { hasConflict: conflict, message: message, prevRecord: prev, nextRecord: next };
};

App.ui.pages.openFuelModal = function(record) {
    var isEdit = !!(record && record.id);
    var defaultDate = record && record.date
        ? App.utils.isoToDDMMYYYY(record.date)
        : App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);
    var currentMileage = App.store.settings.currentMileage;

    var content =
        '<form id="fuel-form">' +
            (isEdit ? '<input type="hidden" name="id" value="' + record.id + '">' : '') +
            '<label>Дата (ДД-ММ-ГГГГ)</label>' +
            '<input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + App.utils.escapeHtml(defaultDate) + '">' +
            '<label>Пробег</label>' +
            '<input type="number" name="mileage" value="' + (record ? record.mileage : currentMileage) + '" required>' +
            '<label>Литры</label>' +
            '<input type="number" name="liters" step="0.01" value="' + (record ? record.liters : '') + '" required>' +
            '<label>Цена/л</label>' +
            '<input type="number" name="pricePerLiter" step="0.01" value="' + (record ? record.pricePerLiter : '') + '">' +
            '<label>Тип топлива</label>' +
            '<select name="fuelType">' +
                '<option value="Бензин" ' + (record && record.fuelType === 'Бензин' ? 'selected' : '') + '>Бензин</option>' +
                '<option value="Дизель" ' + (record && record.fuelType === 'Дизель' ? 'selected' : '') + '>Дизель</option>' +
                '<option value="Газ (ГБО)" ' + (record && record.fuelType === 'Газ (ГБО)' ? 'selected' : '') + '>Газ (ГБО)</option>' +
                '<option value="Электричество" ' + (record && record.fuelType === 'Электричество' ? 'selected' : '') + '>Электричество</option>' +
            '</select>' +
            '<label>Примечание</label>' +
            '<input type="text" name="notes" value="' + App.utils.escapeHtml(record ? (record.notes || '') : '') + '">' +
            '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '<i data-lucide="fuel"></i> Редактировать заправку' : '<i data-lucide="fuel"></i> Добавить заправку', content);
    var form = modal.querySelector('#fuel-form');

    form.onsubmit = function(e) {
        e.preventDefault();
        var formEl = e.target;
        var dateStr = formEl.querySelector('[name="date"]').value.trim();
        var dateISO = App.utils.ddmmYYYYtoISO(dateStr);
        var mileage = App.utils.validateNumberInput(formEl.querySelector('[name="mileage"]'), false);
        var liters = App.utils.validateNumberInput(formEl.querySelector('[name="liters"]'), true);
        var pricePerLiter = App.utils.validateNumberInput(formEl.querySelector('[name="pricePerLiter"]'), true, true);
        if (mileage === null || liters === null) return;

        var d = Object.fromEntries(new FormData(formEl));
        var id = d.id || null;
        var conflict = App.ui.pages.checkFuelOrderConflicts(dateISO, mileage, id ? null : null);
        if (conflict.hasConflict) {
            if (!confirm(conflict.message + '\n\nСохранить, несмотря на нарушение порядка?')) return;
        }

        modal.remove();

        var existingUuid = (record && record.uuid) ? record.uuid : crypto.randomUUID();
        var existingUpdatedAt = (record && record.updated_at) ? record.updated_at : new Date().toISOString();

        var recordData = {
            id: id,
            uuid: existingUuid,
            updated_at: existingUpdatedAt,
            date: dateISO,
            mileage: mileage,
            liters: liters,
            pricePerLiter: pricePerLiter,
            fullTank: false,
            fuelType: d.fuelType,
            notes: d.notes || ''
        };

        if (App.config.USE_SUPABASE) {
            App.storage.saveFuelRecord(id, recordData)
                .then(function(res) {
                    if (res && res.data && res.data.length > 0) recordData.id = res.data[0].id;
                    if (isEdit) {
                        var idx = App.store.fuelLog.findIndex(function(f) { return f.id == id; });
                        if (idx !== -1) App.store.fuelLog[idx] = recordData;
                    } else {
                        App.store.fuelLog.push(recordData);
                    }
                    App.store.saveToLocalStorage();
                    App.ui.pages.renderFuelTab();
                    App.toast(isEdit ? 'Заправка обновлена' : 'Заправка добавлена', 'success');
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка сохранения в Supabase', 'error');
                });
        } else {
            if (isEdit) {
                var idx = App.store.fuelLog.findIndex(function(f) { return f.id == id; });
                if (idx !== -1) App.store.fuelLog[idx] = recordData;
            } else {
                App.store.fuelLog.push(recordData);
            }
            App.store.saveToLocalStorage();
            App.ui.pages.renderFuelTab();
            App.toast(isEdit ? 'Заправка обновлена' : 'Заправка добавлена', 'success');
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.deleteFuelEntry = function(idx) {
    var fuel = App.store.fuelLog[idx];
    if (!fuel || !fuel.id) { App.toast('Запись не найдена', 'error'); return; }
    App.storage.deleteFuelRecord(fuel.id).then(function() {
        App.storage.loadAllData().then(function() {
            App.ui.pages.renderFuelTab();
        });
        App.toast('Запись о заправке удалена', 'success');
    }).catch(function(err) {
        console.error(err);
        App.toast('Не удалось удалить заправку (возможно, недостаточно прав)', 'error');
    });
};

App.ui.pages.startVoiceFuelInput = function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert('Распознавание речи не поддерживается в этом браузере');
        return;
    }
    var rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    var voiceBtn = document.getElementById('voice-fuel-btn');
    if (voiceBtn) voiceBtn.classList.add('recording');
    rec.start();
    rec.onresult = function(e) {
        var text = e.results[0][0].transcript;
        App.ui.pages.parseFuelVoice(text);
        if (voiceBtn) voiceBtn.classList.remove('recording');
    };
    rec.onerror = function(e) {
        if (voiceBtn) voiceBtn.classList.remove('recording');
        alert(e.error === 'not-allowed' ? 'Доступ к микрофону запрещён.' : 'Ошибка распознавания: ' + e.error);
    };
};

App.ui.pages.parseFuelVoice = function(text) {
    var nums = text.match(/\d+(?:[.,]\d+)?/g);
    if (!nums || nums.length < 2) {
        alert('Скажите пробег и литры. Например: "пробег двенадцать тысяч литров сорок два"');
        return;
    }
    var mileage = parseInt(nums[0]);
    var liters = parseFloat(nums[1].replace(',', '.'));
    var pricePerLiter = nums[2] ? parseFloat(nums[2].replace(',', '.')) : null;
    App.ui.pages.openFuelModal({ mileage: mileage, liters: liters, pricePerLiter: pricePerLiter });
};