// src/ui/pages/dashboard.js
window.App = window.App || {};
App.charts = App.charts || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// === Десктопные функции ===
App.ui.pages.renderTireWearMini = function() {
    var container = document.getElementById('dash-tire-wear-container');
    if (!container) return;
    var summerTires = App.store.tireLog.filter(function(t) { return t.type === 'Лето'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var winterTires = App.store.tireLog.filter(function(t) { return t.type === 'Зима'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var summerLast = summerTires[0];
    var winterLast = winterTires[0];

    function buildWearCard(tire, type) {
        if (!tire) return '<div class="wear-card-item"><h4>' + type + '</h4><p class="hint">Нет данных</p></div>';
        var wearPercent = 0;
        var wearValue = tire.wear ? parseFloat(tire.wear) : 0;
        if (type === 'Лето') {
            var minWear = 1.6;
            var maxDepth = 8;
            var currentDepth = Math.min(maxDepth, Math.max(minWear, wearValue));
            wearPercent = ((maxDepth - currentDepth) / (maxDepth - minWear)) * 100;
            wearPercent = Math.min(100, Math.max(0, wearPercent));
        } else {
            wearPercent = Math.min(100, Math.max(0, 100 - wearValue));
        }
        var statusColor = wearPercent < 50 ? '#2ecc71' : (wearPercent < 80 ? '#f39c12' : '#e74c3c');
        return '<div class="wear-card-item" style="flex:1; min-width:200px; background:var(--card-bg); padding:12px; border-radius:12px;">' +
            '<h4>' + type + ' шины</h4>' +
            '<p>Модель: ' + App.utils.escapeHtml(tire.model || '—') + '<br>Размер: ' + App.utils.escapeHtml(tire.size || '—') + '<br>Пробег на установке: ' + (tire.mileage || 0) + ' км</p>' +
            '<div style="margin-top:12px;">' +
                '<div style="display:flex; justify-content:space-between;"><span>Износ:</span><span>' + wearPercent.toFixed(0) + '%</span></div>' +
                '<div class="progress-bar-container" style="height:12px;"><div class="progress-bar" style="width:' + wearPercent + '%; background:' + statusColor + ';"></div></div>' +
                '<p class="hint">' + (type === 'Лето' ? 'Остаток протектора: ' + wearValue + ' мм (мин. 1.6 мм)' : 'Остаток шипов: ' + (100 - wearValue) + '%') + '</p>' +
            '</div>' +
        '</div>';
    }
    container.innerHTML = buildWearCard(summerLast, 'Лето') + buildWearCard(winterLast, 'Зима');
    App.initIcons();
};

App.ui.pages.renderTop5Widget = function() {
    var container = document.getElementById('top5-container');
    if (!container) return;
    var candidates = App.store.operations.filter(function(op) {
        if (!op.intervalKm && !op.intervalMonths && !op.intervalMotohours) return false;
        var plan = App.logic.calculatePlan(op);
        return plan.daysLeft !== null && isFinite(plan.daysLeft) && plan.planDate;
    });
    if (candidates.length === 0) { container.innerHTML = '<p class="hint">Нет данных</p>'; return; }

    var linkedPairs = App.config.LINKED_PAIRS || [];
    var groupedOps = [];
    var usedIds = new Set();
    candidates.forEach(function(op) {
        if (usedIds.has(op.id)) return;
        var isMainOfPair = false;
        var pair = null;
        for (var i = 0; i < linkedPairs.length; i++) {
            if (op.name === linkedPairs[i].main) { isMainOfPair = true; pair = linkedPairs[i]; break; }
        }
        if (isMainOfPair) {
            var linkedOp = candidates.find(function(o) { return o.name === pair.linked && !usedIds.has(o.id); });
            if (linkedOp) {
                var mainPlan = App.logic.calculatePlan(op);
                var linkedPlan = App.logic.calculatePlan(linkedOp);
                var primaryPlan = mainPlan.daysLeft <= linkedPlan.daysLeft ? mainPlan : linkedPlan;
                var primaryOp = mainPlan.daysLeft <= linkedPlan.daysLeft ? op : linkedOp;
                groupedOps.push({ name: pair.combinedName, op: primaryOp, plan: primaryPlan, isGroup: true });
                usedIds.add(op.id); usedIds.add(linkedOp.id); return;
            }
        }
        var isLinkedInPair = false;
        for (var j = 0; j < linkedPairs.length; j++) {
            if (op.name === linkedPairs[j].linked) { isLinkedInPair = true; break; }
        }
        if (isLinkedInPair) {
            var mainOp = candidates.find(function(o) {
                for (var k = 0; k < linkedPairs.length; k++) {
                    if (linkedPairs[k].linked === op.name && o.name === linkedPairs[k].main && !usedIds.has(o.id)) return true;
                }
                return false;
            });
            if (mainOp) return;
        }
        if (!usedIds.has(op.id)) {
            groupedOps.push({ name: op.name, op: op, plan: App.logic.calculatePlan(op), isGroup: false });
            usedIds.add(op.id);
        }
    });

    var sorted = groupedOps.sort(function(a, b) { return a.plan.daysLeft - b.plan.daysLeft; });
    var top5 = sorted.slice(0, 5);
    var html = '';
    top5.forEach(function(item) {
        var op = item.op, plan = item.plan;
        var motoFresh = true;
        if (op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1 && App.store.mileageHistory.length >= 1) {
            var lastEntry = App.store.mileageHistory[App.store.mileageHistory.length - 1];
            if ((App.store.settings.currentMotohours - lastEntry.motohours) > 20 ||
                (App.store.settings.currentMileage - lastEntry.mileage) > 500) motoFresh = false;
        }
        var percent = 0;
        if (op.intervalKm && plan.planMileage > (op.lastMileage || 0))
            percent = Math.min(100, Math.round((App.store.settings.currentMileage - (op.lastMileage || 0)) / (plan.planMileage - (op.lastMileage || 0)) * 100));
        else if (op.intervalMotohours && motoFresh && plan.recMotohours > (op.lastMotohours || 0))
            percent = Math.min(100, Math.round((App.store.settings.currentMotohours - (op.lastMotohours || 0)) / (plan.recMotohours - (op.lastMotohours || 0)) * 100));
        else if (op.intervalMonths) {
            var lastDate = op.lastDate ? new Date(op.lastDate) : new Date();
            var totalDays = op.intervalMonths * 30;
            var elapsed = Math.floor((new Date() - lastDate) / 86400000);
            percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
        }
        if (percent < 0) percent = 0;
        var daysLeft = plan.daysLeft;
        var mileageLeft = plan.planMileage - App.store.settings.currentMileage;
        var motoLeft = plan.recMotohours ? (plan.recMotohours - App.store.settings.currentMotohours) : null;
        var statusText = daysLeft < 0 ? '⚠ просрочено на ' + Math.abs(daysLeft) + ' дн.' : 'осталось ' + daysLeft + ' дн.';
        if (mileageLeft > 0 && op.intervalKm) statusText += ' / ' + mileageLeft + ' км';
        else if (motoLeft > 0 && op.intervalMotohours && motoFresh) statusText += ' / ' + motoLeft.toFixed(0) + ' м/ч';
        html += '<div class="top5-item"><div class="top5-header"><span class="top5-name">' + App.utils.escapeHtml(item.name) + '</span><span class="top5-stats">' + statusText + '</span></div><div class="top5-progress-container"><div class="top5-progress-bar" style="width:' + percent + '%;"></div></div></div>';
    });
    container.innerHTML = html;
    App.initIcons();
};

// ===== НОВЫЙ ДЕСКТОПНЫЙ ДАШБОРД =====

// Константа типов графиков (12 штук) – без эмодзи
App.ui.pages.CHART_TYPES = [
    { id: 1, name: 'Общие расходы + прогноз (линия)' },
    { id: 2, name: 'Затраты: топливо vs ТО (гистограмма)' },
    { id: 3, name: 'Средняя цена топлива (линия)' },
    { id: 4, name: 'Расход топлива л/100км (линия/столбцы)' },
    { id: 5, name: 'Затраты на ТО по категориям (гистограмма)' },
    { id: 6, name: 'Расходы на шины и запчасти (гистограмма)' },
    { id: 7, name: 'Прогноз пробега (линейная регрессия)' },
    { id: 8, name: 'Количество выполненных операций (столбцы)' },
    { id: 9, name: 'Стоимость 1 км пробега (линия)' },
    { id: 10, name: 'Средняя скорость км/ч (линия)' },
    { id: 11, name: 'Динамика пробега и моточасов (2 линии)' },
    { id: 12, name: 'Распределение расходов (круговая)' }
];

// Соответствие id графика -> иконка Lucide
App.ui.pages.getChartIcon = function(chartId) {
    var map = {
        1: 'trending-up',
        2: 'bar-chart-2',
        3: 'dollar-sign',
        4: 'fuel',
        5: 'wrench',
        6: 'package',
        7: 'target',
        8: 'calendar',
        9: 'receipt',
        10: 'gauge',
        11: 'activity',
        12: 'pie-chart'
    };
    return map[chartId] || 'bar-chart';
};

// Загрузка сохранённых выборов из localStorage
App.ui.pages.loadChartSelection = function() {
    var saved = localStorage.getItem('vesta_timeline_settings');
    var defaults = { chart1: 1, chart2: 2, chart3: 3 };
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            return {
                chart1: parsed.chart1 || defaults.chart1,
                chart2: parsed.chart2 || defaults.chart2,
                chart3: parsed.chart3 || defaults.chart3
            };
        } catch(e) {}
    }
    return defaults;
};

// Сохранение выборов в localStorage
App.ui.pages.saveChartSelection = function(chart1, chart2, chart3) {
    localStorage.setItem('vesta_timeline_settings', JSON.stringify({
        chart1: chart1,
        chart2: chart2,
        chart3: chart3
    }));
};

// Проверка дублирования и корректировка
App.ui.pages.validateAndFixSelection = function(select1, select2, select3) {
    var val1 = parseInt(select1.value);
    var val2 = parseInt(select2.value);
    var val3 = parseInt(select3.value);
    
    if (val2 === val1 && val2 !== undefined) {
        var newVal2 = val1 === 1 ? 2 : 1;
        select2.value = newVal2;
        App.toast('График уже выбран, автоматически заменён', 'warning');
    }
    if (val3 === val1 || val3 === val2) {
        var newVal3 = 1;
        while (newVal3 === val1 || newVal3 === val2) newVal3++;
        select3.value = newVal3;
        App.toast('График уже выбран, автоматически заменён', 'warning');
    }
};

// Отрисовка панели выбора графиков (только текстовые селекторы)
App.ui.pages.renderChartSelectors = function() {
    var container = document.getElementById('timeline-selectors');
    if (!container) return;
    
    var selection = App.ui.pages.loadChartSelection();
    var optionsHtml = '';
    App.ui.pages.CHART_TYPES.forEach(function(type) {
        optionsHtml += '<option value="' + type.id + '">' + type.name + '</option>';
    });
    
    var html = 
        '<div class="timeline-selectors-panel">' +
            '<div class="selector-group">' +
                '<label>График 1</label>' +
                '<select id="timeline-chart-1" class="timeline-chart-select">' + optionsHtml + '</select>' +
            '</div>' +
            '<div class="selector-group">' +
                '<label>График 2</label>' +
                '<select id="timeline-chart-2" class="timeline-chart-select">' + optionsHtml + '</select>' +
            '</div>' +
            '<div class="selector-group">' +
                '<label>График 3</label>' +
                '<select id="timeline-chart-3" class="timeline-chart-select">' + optionsHtml + '</select>' +
            '</div>' +
            '<div class="selector-actions">' +
                '<button id="apply-charts-btn" class="primary-btn"><i data-lucide="check"></i> Применить</button>' +
                '<button id="reset-charts-btn" class="secondary-btn"><i data-lucide="rotate-ccw"></i> Сбросить</button>' +
            '</div>' +
        '</div>';
    
    container.innerHTML = html;
    
    var select1 = document.getElementById('timeline-chart-1');
    var select2 = document.getElementById('timeline-chart-2');
    var select3 = document.getElementById('timeline-chart-3');
    if (select1) select1.value = selection.chart1;
    if (select2) select2.value = selection.chart2;
    if (select3) select3.value = selection.chart3;
    
    var applyBtn = document.getElementById('apply-charts-btn');
    if (applyBtn) {
        applyBtn.onclick = function() {
            App.ui.pages.validateAndFixSelection(select1, select2, select3);
            var newVal1 = parseInt(select1.value);
            var newVal2 = parseInt(select2.value);
            var newVal3 = parseInt(select3.value);
            App.ui.pages.saveChartSelection(newVal1, newVal2, newVal3);
            App.ui.pages.renderSelectedCharts();
            App.toast('Графики обновлены', 'success');
        };
    }
    
    var resetBtn = document.getElementById('reset-charts-btn');
    if (resetBtn) {
        resetBtn.onclick = function() {
            select1.value = 1;
            select2.value = 2;
            select3.value = 3;
            App.ui.pages.saveChartSelection(1, 2, 3);
            App.ui.pages.renderSelectedCharts();
            App.toast('Графики сброшены к стандартным', 'success');
        };
    }
    
    App.initIcons();
};

// Отрисовка всех трёх выбранных графиков
App.ui.pages.renderSelectedCharts = function() {
    var selection = App.ui.pages.loadChartSelection();
    var chartIds = [selection.chart1, selection.chart2, selection.chart3];
    
    for (var i = 1; i <= 3; i++) {
        var canvasId = 'timeline-canvas-' + i;
        var chartId = chartIds[i - 1];
        var periodSelect = document.querySelector('.chart-period-select[data-chart="' + i + '"]');
        var period = periodSelect ? periodSelect.value : 'month';
        
        // Обновляем заголовок карточки
        var card = document.querySelector('.timeline-chart-card[data-chart-num="' + i + '"]');
        if (card) {
            var chartType = App.ui.pages.CHART_TYPES.find(function(t) { return t.id === chartId; });
            var chartName = chartType ? chartType.name : 'График';
            var iconName = App.ui.pages.getChartIcon(chartId);
            var header = card.querySelector('.chart-header');
            if (header) {
                header.innerHTML = '<i data-lucide="' + iconName + '"></i><h3>' + App.utils.escapeHtml(chartName) + '</h3>';
                card.setAttribute('data-chart-id', chartId);
            }
        }
        
        // Вызов соответствующей функции рендеринга
        if (typeof App.timelineCharts !== 'undefined') {
            switch (chartId) {
                case 1:
                    if (typeof App.timelineCharts.renderTotalCostsWithForecast === 'function')
                        App.timelineCharts.renderTotalCostsWithForecast(canvasId, period);
                    break;
                case 2:
                    if (typeof App.timelineCharts.renderFuelVsTOCosts === 'function')
                        App.timelineCharts.renderFuelVsTOCosts(canvasId, period);
                    break;
                case 3:
                    if (typeof App.timelineCharts.renderAverageFuelPrice === 'function')
                        App.timelineCharts.renderAverageFuelPrice(canvasId, period);
                    break;
                default:
                    console.log('График типа ' + chartId + ' будет реализован позже');
                    break;
            }
        } else {
            console.warn('App.timelineCharts не загружен');
        }
    }
    
    App.initIcons();
};

// Генерация HTML для карточки графика (с заголовком и иконкой)
App.ui.pages.generateChartCardHtml = function(chartNumber, chartId) {
    var chartType = App.ui.pages.CHART_TYPES.find(function(t) { return t.id === chartId; });
    var chartName = chartType ? chartType.name : 'График';
    var iconName = App.ui.pages.getChartIcon(chartId);
    
    return '<div class="timeline-chart-card" data-chart-num="' + chartNumber + '" data-chart-id="' + chartId + '">' +
        '<div class="chart-header">' +
            '<i data-lucide="' + iconName + '"></i>' +
            '<h3>' + App.utils.escapeHtml(chartName) + '</h3>' +
        '</div>' +
        '<canvas id="timeline-canvas-' + chartNumber + '" width="500" height="200" style="width:100%; height:200px; display:block;"></canvas>' +
        '<div class="chart-footer">' +
            '<select class="chart-period-select" data-chart="' + chartNumber + '">' +
                '<option value="month">Месяц</option>' +
                '<option value="quarter">Квартал</option>' +
                '<option value="year">Год</option>' +
            '</select>' +
            '<button class="icon-btn chart-menu-btn" data-chart="' + chartNumber + '"><i data-lucide="more-horizontal"></i></button>' +
        '</div>' +
    '</div>';
};

// ===== КОЛОНКА 1: Стоимость владения =====
App.ui.pages.renderFinanceColumn = function() {
    var container = document.getElementById('bottom-col-finance');
    if (!container) return;
    
    // Получаем общие затраты (покупка + ТО + топливо + запчасти + шины)
    var purchaseCost = App.store.purchaseCost || 0;
    
    var totalMaint = App.store.serviceRecords.reduce(function(s, r) {
        return s + (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
    }, 0);
    
    var totalFuel = App.store.fuelLog.reduce(function(s, f) {
        return s + (Number(f.liters) || 0) * (Number(f.pricePerLiter) || 0);
    }, 0);
    
    var totalParts = App.store.parts.reduce(function(s, p) {
        return s + (Number(p.price) || 0);
    }, 0);
    
    var totalTires = App.store.tireLog.reduce(function(s, t) {
        return s + (Number(t.purchaseCost) || 0) + (Number(t.mountCost) || 0);
    }, 0);
    
    var totalCost = purchaseCost + totalMaint + totalFuel + totalParts + totalTires;
    var currentMileage = App.store.settings.currentMileage || 1;
    var costPerKm = totalCost / currentMileage;
    
    // Режим отображения (храним в localStorage)
    var displayMode = localStorage.getItem('vesta_cost_display_mode') || 'total';
    
    var displayValue = (displayMode === 'perKm') 
        ? costPerKm.toFixed(2) + ' ₽/км' 
        : totalCost.toLocaleString() + ' ₽';
    
    // Самый дорогой и дешёвый месяц (на основе общих расходов)
    var grouped = App.logic.groupTotalCostsByMonth(0);
    var months = grouped.months;
    var totalCosts = grouped.totalCosts;
    
    var maxMonth = '', maxCost = 0;
    var minMonth = '', minCost = Infinity;
    for (var i = 0; i < months.length; i++) {
        var cost = totalCosts[i];
        if (cost > maxCost) { maxCost = cost; maxMonth = months[i]; }
        if (cost < minCost && cost > 0) { minCost = cost; minMonth = months[i]; }
    }
    
    var html = 
        '<div class="finance-col-card">' +
            '<h3><i data-lucide="wallet"></i> Стоимость владения</h3>' +
            '<div class="cost-display">' +
                '<span class="cost-value" id="col-finance-value">' + displayValue + '</span>' +
                '<button class="icon-btn" id="toggle-cost-display" title="Переключить общая/за км"><i data-lucide="refresh-cw"></i></button>' +
            '</div>' +
            '<div class="cost-breakdown">' +
                '<div>Покупка: ' + purchaseCost.toLocaleString() + ' ₽</div>' +
                '<div>ТО: ' + totalMaint.toLocaleString() + ' ₽</div>' +
                '<div>Топливо: ' + totalFuel.toLocaleString() + ' ₽</div>' +
                '<div>Запчасти: ' + totalParts.toLocaleString() + ' ₽</div>' +
                '<div>Шины: ' + totalTires.toLocaleString() + ' ₽</div>' +
            '</div>' +
        '</div>' +
        '<div class="finance-col-card">' +
            '<h3><i data-lucide="calendar"></i> Экстремумы затрат</h3>' +
            '<div class="extreme-item">' +
                '<i data-lucide="trending-up" style="color:var(--danger);"></i> ' +
                '<strong>Самый дорогой месяц:</strong> ' + (maxMonth ? maxMonth + ' (' + maxCost.toLocaleString() + ' ₽)' : '—') +
            '</div>' +
            '<div class="extreme-item">' +
                '<i data-lucide="trending-down" style="color:var(--success);"></i> ' +
                '<strong>Самый дешёвый месяц:</strong> ' + (minMonth ? minMonth + ' (' + minCost.toLocaleString() + ' ₽)' : '—') +
            '</div>' +
        '</div>';
    
    container.innerHTML = html;
    
    // Обработчик переключения режима отображения
    var toggleBtn = document.getElementById('toggle-cost-display');
    if (toggleBtn) {
        toggleBtn.onclick = function() {
            var newMode = (localStorage.getItem('vesta_cost_display_mode') === 'total') ? 'perKm' : 'total';
            localStorage.setItem('vesta_cost_display_mode', newMode);
            App.ui.pages.renderFinanceColumn(); // перерисовываем
        };
    }
    
    App.initIcons();
};

// ===== КОЛОНКА 2: Планировщик ТО =====
App.ui.pages.renderPlannerColumn = function() {
    var container = document.getElementById('bottom-col-planner');
    if (!container) return;
    
    // Получаем текущую дату для календаря
    var today = new Date();
    var currentYear = today.getFullYear();
    var currentMonth = today.getMonth();
    
    // Функция получения событий для месяца
    function getEventMapForMonth(year, month) {
        var map = {};
        App.store.operations.forEach(function(op) {
            var pd = App.logic.calculatePlan(op);
            if (!pd.planDate) return;
            var d = new Date(pd.planDate);
            if (d.getFullYear() === year && d.getMonth() === month) {
                var key = pd.planDate;
                if (!map[key]) map[key] = [];
                map[key].push({ op: op, plan: pd });
            }
        });
        return map;
    }
    
    // Функция рендера календаря для заданного месяца
    function renderCalendar(year, month, containerEl) {
        var eventMap = getEventMapForMonth(year, month);
        var firstDay = new Date(year, month, 1).getDay();
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        
        var html = '<div class="planner-calendar">';
        html += '<div class="cal-nav">';
        html += '<button class="cal-nav-btn planner-prev-btn"><i data-lucide="chevron-left"></i></button>';
        html += '<span class="cal-month">' + new Date(year, month).toLocaleString('ru', { month: 'long', year: 'numeric' }) + '</span>';
        html += '<button class="cal-nav-btn planner-next-btn"><i data-lucide="chevron-right"></i></button>';
        html += '</div><div class="cal-weekdays">';
        ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].forEach(function(d) { html += '<div class="cal-weekday">' + d + '</div>'; });
        html += '</div><div class="cal-grid">';
        
        for (var i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
        for (var d = 1; d <= daysInMonth; d++) {
            var dateISO = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
            var events = eventMap[dateISO] || [];
            var hasEvents = events.length > 0;
            var todayClass = (dateISO === new Date().toISOString().split('T')[0]) ? ' today' : '';
            html += '<div class="cal-day' + todayClass + '" data-date="' + dateISO + '">';
            html += '<span class="cal-day-num">' + d + '</span>';
            if (hasEvents) {
                html += '<div class="cal-events">';
                events.forEach(function(ev) { 
                    html += '<span class="cal-event-dot" title="' + App.utils.escapeHtml(ev.op.name) + '"></span>'; 
                });
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div></div>';
        
        containerEl.innerHTML = html;
        
        // Привязываем обработчики кликов по дням
        containerEl.querySelectorAll('.cal-day:not(.empty)').forEach(function(dayEl) {
            dayEl.onclick = function() {
                var date = dayEl.dataset.date;
                var events = eventMap[date] || [];
                if (events.length === 0) return;
                var listHtml = '<ul style="margin-top:12px;">';
                events.forEach(function(ev) {
                    listHtml += '<li style="margin-bottom:8px;"><strong>' + App.utils.escapeHtml(ev.op.name) + '</strong> (' + App.utils.escapeHtml(ev.op.category) + ')<br>План: ' + App.utils.isoToDDMMYYYY(ev.plan.planDate) + ', ' + ev.plan.planMileage + ' км <button class="icon-btn" data-action="execute-plan" data-op-id="' + ev.op.id + '" data-op-name="' + App.utils.escapeHtml(ev.op.name) + '"><i data-lucide="check-circle"></i></button></li>';
                });
                listHtml += '</ul>';
                App.ui.createModal('События на ' + App.utils.isoToDDMMYYYY(date), listHtml);
                App.initIcons();
            };
        });
        
        App.initIcons();
    }
    
    // Создаём контейнер для календаря и список ближайших ТО
    var calendarContainer = document.createElement('div');
    calendarContainer.className = 'planner-calendar-container';
    var upcomingContainer = document.createElement('div');
    upcomingContainer.className = 'planner-upcoming-container';
    
    container.innerHTML = '';
    container.appendChild(calendarContainer);
    container.appendChild(upcomingContainer);
    
    // Текущие год и месяц для навигации
    var currentYear = today.getFullYear();
    var currentMonth = today.getMonth();
    
    function refreshCalendar() {
        renderCalendar(currentYear, currentMonth, calendarContainer);
        // Перепривязываем кнопки навигации после перерисовки
        var prevBtn = calendarContainer.querySelector('.planner-prev-btn');
        var nextBtn = calendarContainer.querySelector('.planner-next-btn');
        if (prevBtn) {
            prevBtn.onclick = function() {
                if (currentMonth === 0) { currentMonth = 11; currentYear--; }
                else { currentMonth--; }
                refreshCalendar();
                renderUpcomingList();
            };
        }
        if (nextBtn) {
            nextBtn.onclick = function() {
                if (currentMonth === 11) { currentMonth = 0; currentYear++; }
                else { currentMonth++; }
                refreshCalendar();
                renderUpcomingList();
            };
        }
    }
    
    function renderUpcomingList() {
    var candidates = App.store.operations.filter(function(op) {
        if (!op.intervalKm && !op.intervalMonths && !op.intervalMotohours) return false;
        var plan = App.logic.calculatePlan(op);
        return plan.daysLeft !== null && isFinite(plan.daysLeft) && plan.planDate;
    });
    
    var withDays = candidates.map(function(op) {
        var plan = App.logic.calculatePlan(op);
        return { op: op, plan: plan, daysLeft: plan.daysLeft };
    }).filter(function(item) { return item.daysLeft !== null; })
      .sort(function(a, b) { return a.daysLeft - b.daysLeft; })
      .slice(0, 5);
    
    if (withDays.length === 0) {
        upcomingContainer.innerHTML = '<p class="hint">Нет предстоящих ТО</p>';
        return;
    }
    
    var html = '<h3><i data-lucide="alert-circle"></i> Ближайшие ТО</h3><ul class="upcoming-list">';
    withDays.forEach(function(item) {
        var days = item.daysLeft;   // ← ИСПРАВЛЕНО
        var statusClass = days < 0 ? 'overdue' : (days <= 7 ? 'critical' : 'normal');
        var daysText = days < 0 ? 'просрочено на ' + Math.abs(days) + ' дн.' : 'через ' + days + ' дн.';
        html += '<li class="upcoming-item ' + statusClass + '">' +
            '<span class="upcoming-name">' + App.utils.escapeHtml(item.op.name) + '</span>' +
            '<span class="upcoming-date">' + App.utils.isoToDDMMYYYY(item.plan.planDate) + '</span>' +
            '<span class="upcoming-days">' + daysText + '</span>' +
            '<button class="icon-btn execute-upcoming" data-op-id="' + item.op.id + '" data-op-name="' + App.utils.escapeHtml(item.op.name) + '" title="Выполнить"><i data-lucide="check-circle"></i></button>' +
        '</li>';
    });
    html += '</ul>';
    upcomingContainer.innerHTML = html;
    
    upcomingContainer.querySelectorAll('.execute-upcoming').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var opId = this.dataset.opId;
            var opName = this.dataset.opName;
            App.ui.pages.openServiceModal(opId, opName);
        });
    });
    
    App.initIcons();
}
    
    refreshCalendar();
    renderUpcomingList();
};

// ===== КОЛОНКА 3: Шины + Склад + Поиск OEM =====
App.ui.pages.renderOtherColumn = function() {
    var container = document.getElementById('bottom-col-other');
    if (!container) return;
    
    var html = 
        '<div class="other-col-card">' +
            '<h3><i data-lucide="circle"></i> Состояние шин</h3>' +
            '<div id="col-tire-wear-compact"></div>' +
        '</div>' +
        '<div class="other-col-card">' +
            '<h3><i data-lucide="warehouse"></i> Складская сводка</h3>' +
            '<div id="col-warehouse-summary"></div>' +
        '</div>' +
        '<div class="other-col-card">' +
            '<h3><i data-lucide="search"></i> Поиск OEM</h3>' +
            '<div class="oem-search">' +
                '<input type="text" id="oem-search-input" placeholder="Введите OEM или аналог">' +
                '<button id="oem-search-btn" class="primary-btn" style="margin-top:8px;"><i data-lucide="search"></i> Найти</button>' +
            '</div>' +
            '<div id="oem-search-results" style="margin-top:12px;"></div>' +
        '</div>';
    
    container.innerHTML = html;
    
    // Рендер компактного износа шин
    App.ui.pages.renderTireWearCompact();
    
    // Компактная складская сводка (без зависимости от parts.js)
App.ui.pages.renderWarehouseSummaryCompact = function() {
    var container = document.getElementById('col-warehouse-summary');
    if (!container) return;
    
    var parts = App.store.parts || [];
    var totalPositions = parts.length;
    var totalSum = parts.reduce(function(s, p) { return s + (parseFloat(p.price) || 0); }, 0);
    var lowStock = parts.filter(function(p) { return (p.inStock || 0) === 1; }).length;
    var outOfStock = parts.filter(function(p) { return (p.inStock || 0) === 0; }).length;
    
    var html = 
        '<div>Всего позиций: <strong>' + totalPositions + '</strong></div>' +
        '<div>На сумму: <strong>' + totalSum.toLocaleString() + ' ₽</strong></div>' +
        '<div>Заканчиваются (≤1): <strong style="color:var(--warning)">' + lowStock + '</strong></div>' +
        '<div>Нет в наличии: <strong style="color:var(--danger)">' + outOfStock + '</strong></div>';
    
    container.innerHTML = html;
};
    
    // Компактная складская сводка (без зависимости от parts.js)
if (typeof App.ui.pages.renderWarehouseSummaryCompact === 'function') {
    App.ui.pages.renderWarehouseSummaryCompact();
} else {
    document.getElementById('col-warehouse-summary').innerHTML = '<p class="hint">Сводка недоступна</p>';
}
    
    // Обработчик поиска OEM
    var searchBtn = document.getElementById('oem-search-btn');
    var searchInput = document.getElementById('oem-search-input');
    if (searchBtn) {
        searchBtn.onclick = function() {
            var query = searchInput.value.trim().toLowerCase();
            if (!query) {
                App.toast('Введите OEM или аналог для поиска', 'warning');
                return;
            }
            var results = App.store.parts.filter(function(p) {
                return (p.oem && p.oem.toLowerCase().includes(query)) ||
                       (p.analog && p.analog.toLowerCase().includes(query));
            });
            
            if (results.length === 0) {
                App.ui.alertModal('По запросу "' + App.utils.escapeHtml(query) + '" ничего не найдено.');
                return;
            }
            
            var modalContent = '<div style="max-height:400px; overflow-y:auto;">';
            results.forEach(function(part) {
                modalContent += 
                    '<div class="search-result-item" data-part-id="' + part.id + '" style="padding:8px; border-bottom:1px solid var(--border); cursor:pointer;">' +
                        '<strong>' + App.utils.escapeHtml(part.oem || part.analog || '—') + '</strong><br>' +
                        '<span class="hint">Операция: ' + App.utils.escapeHtml(part.operation || '—') + '</span><br>' +
                        '<span>Цена: ' + (part.price ? part.price + ' ₽' : '—') + '</span>' +
                    '</div>';
            });
            modalContent += '</div>';
            
            var modal = App.ui.createModal('Результаты поиска: ' + App.utils.escapeHtml(query), modalContent);
            modal.querySelectorAll('.search-result-item').forEach(function(el) {
                el.addEventListener('click', function() {
                    var partId = this.dataset.partId;
                    var part = App.store.parts.find(function(p) { return p.id == partId; });
                    if (part && typeof App.ui.pages.openPartForm === 'function') {
                        modal.remove();
                        App.ui.pages.openPartForm(part);
                    }
                });
            });
            App.initIcons();
        };
    }
    
    App.initIcons();
};

// Компактный виджет износа шин (без кнопок, только прогресс-бары)
App.ui.pages.renderTireWearCompact = function() {
    var container = document.getElementById('col-tire-wear-compact');
    if (!container) return;
    
    var summerTires = App.store.tireLog.filter(function(t) { return t.type === 'Лето'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var winterTires = App.store.tireLog.filter(function(t) { return t.type === 'Зима'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var summerLast = summerTires[0];
    var winterLast = winterTires[0];
    
    function buildCompactWear(tire, type) {
        if (!tire) return '<div class="compact-wear-item"><span class="wear-label">' + type + '</span><span class="hint">Нет данных</span></div>';
        
        var wearPercent = 0;
        var wearValue = tire.wear ? parseFloat(tire.wear) : 0;
        if (type === 'Лето') {
            var minWear = 1.6;
            var maxDepth = 8;
            var currentDepth = Math.min(maxDepth, Math.max(minWear, wearValue));
            wearPercent = ((maxDepth - currentDepth) / (maxDepth - minWear)) * 100;
            wearPercent = Math.min(100, Math.max(0, wearPercent));
            var statusText = wearValue.toFixed(1) + ' мм';
        } else {
            wearPercent = Math.min(100, Math.max(0, 100 - wearValue));
            statusText = wearValue + '% шипов';
        }
        var color = wearPercent < 50 ? 'var(--success)' : (wearPercent < 80 ? 'var(--warning)' : 'var(--danger)');
        
        return '<div class="compact-wear-item">' +
            '<div class="wear-label">' + type + '</div>' +
            '<div class="wear-progress"><div class="wear-fill" style="width:' + wearPercent + '%; background:' + color + ';"></div></div>' +
            '<div class="wear-value">' + statusText + '</div>' +
        '</div>';
    }
    
    container.innerHTML = buildCompactWear(summerLast, 'Лето') + buildCompactWear(winterLast, 'Зима');
    App.initIcons();
};


// Основная функция десктопного дашборда
App.ui.pages.renderDesktopDashboard = function() {
    var container = document.getElementById('desktop-dashboard-container');
    if (!container) return;
    
    var selection = App.ui.pages.loadChartSelection();
    
    var html = 
        '<div class="timeline-section">' +
            '<div id="timeline-selectors"></div>' +
            '<div id="timeline-charts-container" class="timeline-charts-row">' +
                App.ui.pages.generateChartCardHtml(1, selection.chart1) +
                App.ui.pages.generateChartCardHtml(2, selection.chart2) +
                App.ui.pages.generateChartCardHtml(3, selection.chart3) +
            '</div>' +
        '</div>' +
        '<div class="dashboard-bottom-row">' +
            '<div class="bottom-col" id="bottom-col-finance"></div>' +
            '<div class="bottom-col" id="bottom-col-planner"></div>' +
            '<div class="bottom-col" id="bottom-col-other"></div>' +
        '</div>';
    
    container.innerHTML = html;
    
    App.ui.pages.renderChartSelectors();
    
    // Обработчики для селекторов периода (перерисовка только выбранного графика)
    document.querySelectorAll('.chart-period-select').forEach(function(select) {
        select.addEventListener('change', function() {
            var chartNum = parseInt(this.dataset.chart);
            var period = this.value;
            var selection = App.ui.pages.loadChartSelection();
            var chartId = selection['chart' + chartNum];
            var canvasId = 'timeline-canvas-' + chartNum;
            
            switch (chartId) {
                case 1:
                    if (typeof App.timelineCharts.renderTotalCostsWithForecast === 'function')
                        App.timelineCharts.renderTotalCostsWithForecast(canvasId, period);
                    break;
                case 2:
                    if (typeof App.timelineCharts.renderFuelVsTOCosts === 'function')
                        App.timelineCharts.renderFuelVsTOCosts(canvasId, period);
                    break;
                case 3:
                    if (typeof App.timelineCharts.renderAverageFuelPrice === 'function')
                        App.timelineCharts.renderAverageFuelPrice(canvasId, period);
                    break;
            }
        });
    });
    
    // Кнопки меню (пока заглушка)
    document.querySelectorAll('.chart-menu-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var chartNum = this.dataset.chart;
            App.ui.pages.showChartMenu(chartNum);
        });
    });
    
    App.initIcons();
    
    // Начальная отрисовка графиков
    App.ui.pages.renderSelectedCharts();
    App.ui.pages.renderFinanceColumn();
    App.ui.pages.renderPlannerColumn();
    App.ui.pages.renderOtherColumn();
};

// Функция для меню графика (модальное окно)
App.ui.pages.showChartMenu = function(chartNum) {
    var content = 
        '<div class="chart-menu-options">' +
            '<button id="menu-download-png" class="secondary-btn" style="width:100%; margin-bottom:8px;"><i data-lucide="image"></i> Скачать как PNG</button>' +
            '<button id="menu-view-data" class="secondary-btn" style="width:100%; margin-bottom:8px;"><i data-lucide="table"></i> Показать данные</button>' +
            '<button id="menu-reset-zoom" class="secondary-btn" style="width:100%;"><i data-lucide="zoom-out"></i> Сбросить масштаб</button>' +
        '</div>';
    var modal = App.ui.createModal('Меню графика ' + chartNum, content);
    
    document.getElementById('menu-download-png').onclick = function() {
        var canvas = document.getElementById('timeline-canvas-' + chartNum);
        if (canvas) {
            var link = document.createElement('a');
            link.download = 'chart-' + chartNum + '.png';
            link.href = canvas.toDataURL();
            link.click();
        }
        modal.remove();
    };
    
    document.getElementById('menu-view-data').onclick = function() {
        // Покажем таблицу с данными текущего графика (для первых трёх типов)
        var selection = App.ui.pages.loadChartSelection();
        var chartId = selection['chart' + chartNum];
        var periodSelect = document.querySelector('.chart-period-select[data-chart="' + chartNum + '"]');
        var period = periodSelect ? periodSelect.value : 'month';
        
        var tableHtml = '<table class="data-table"><thead><tr><th>Период</th><th>Значение</th></tr></thead><tbody>';
        
        if (chartId === 1 || chartId === 2) {
            var grouped = App.logic.groupTotalCostsByMonth(period === 'year' ? 12 : (period === 'quarter' ? 3 : 1));
            for (var i = 0; i < grouped.months.length; i++) {
                if (chartId === 1) {
                    tableHtml += '<tr><td>' + grouped.months[i] + '</td><td>' + grouped.totalCosts[i].toLocaleString() + ' ₽</td></tr>';
                } else if (chartId === 2) {
                    tableHtml += '<tr><td>' + grouped.months[i] + '</td><td>Топливо: ' + grouped.fuelCosts[i].toLocaleString() + ' ₽<br>ТО: ' + grouped.toCosts[i].toLocaleString() + ' ₽</td></tr>';
                }
            }
        } else if (chartId === 3) {
            var fuelLog = App.store.fuelLog || [];
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
            var monthsCount = period === 'year' ? 12 : (period === 'quarter' ? 3 : 1);
            if (months.length > monthsCount) months = months.slice(-monthsCount);
            months.forEach(function(m) {
                var data = monthlyData[m];
                var avg = data.totalLiters > 0 ? (data.totalCost / data.totalLiters).toFixed(2) : '—';
                tableHtml += '<tr><td>' + m + '</td><td>' + avg + ' ₽/л</td></tr>';
            });
        }
        
        tableHtml += '</tbody></table>';
        var dataModal = App.ui.createModal('Данные графика', '<div style="max-height:400px; overflow-y:auto;">' + tableHtml + '</div>');
        App.initIcons();
    };
    
    document.getElementById('menu-reset-zoom').onclick = function() {
        var chartId = 'timeline-canvas-' + chartNum;
        if (App.timelineCharts.activeCharts[chartId] && typeof App.timelineCharts.activeCharts[chartId].resetZoom === 'function') {
            App.timelineCharts.activeCharts[chartId].resetZoom();
        }
        modal.remove();
    };
    
    App.initIcons();
};



// ===== Мобильный дашборд (без изменений) =====
App.ui.pages.renderMobileDashboard = function() {
    // Восстанавливаем скролл
    document.body.style.overflow = '';
    // Сворачиваем все аккордеоны
    document.querySelectorAll('.accordion-body').forEach(function(b) { b.style.display = 'none'; });
    document.querySelectorAll('.accordion-arrow').forEach(function(a) { a.style.transform = 'rotate(0deg)'; });

    // 1. Режим
    var mode = App.logic.getDrivingMode();
    var modeTextMobile = document.getElementById('mobile-dash-driving-mode-text');
    var modeDotMobile = document.getElementById('mobile-mode-dot');
    if (modeTextMobile) {
        var raw = mode.text;
        if (raw.indexOf('Городской') !== -1) modeTextMobile.textContent = 'Город';
        else if (raw.indexOf('Трассовый') !== -1) modeTextMobile.textContent = 'Трасса';
        else if (raw.indexOf('Смешанный') !== -1) modeTextMobile.textContent = 'Смешанный';
        else modeTextMobile.textContent = raw;
    }
    if (modeDotMobile) {
        var cl = '';
        if (mode.text.indexOf('Городской') !== -1) cl = 'city';
        else if (mode.text.indexOf('Трассовый') !== -1) cl = 'highway';
        else if (mode.text.indexOf('Смешанный') !== -1) cl = 'mixed';
        modeDotMobile.className = 'mode-dot ' + cl;
    }

    // 3. Сводка
    var stats = App.logic.calculateStatistics('6months');
    document.getElementById('mobile-dash-mileage').textContent = App.store.settings.currentMileage.toLocaleString();
    document.getElementById('mobile-dash-motohours').textContent = App.store.settings.currentMotohours.toLocaleString();
    document.getElementById('mobile-dash-avg-consumption').textContent = stats.avgFuelConsumption.toFixed(1);
    document.getElementById('mobile-dash-cost-km').textContent = stats.costPerKm.toFixed(2);

    // 4. Аккордеон "Все затраты"
    var now = new Date();
    var monthYear = now.toLocaleString('ru', { month: 'long', year: 'numeric' });
    document.getElementById('current-month-year').textContent = 'Все затраты на ' + monthYear;

    var totalFuelCost = App.store.fuelLog.reduce(function(s, f) { return s + (f.liters * f.pricePerLiter); }, 0);
    var totalMaintCost = App.store.serviceRecords.reduce(function(s, r) { return s + (Number(r.parts_cost)||0) + (Number(r.work_cost)||0); }, 0);
    var totalPartsCost = App.store.parts.reduce(function(s, p) { return s + (Number(p.price)||0); }, 0);
    var totalTiresCost = App.store.tireLog.reduce(function(s, t) { return s + (Number(t.purchaseCost)||0) + (Number(t.mountCost)||0); }, 0);
    function formatMoney(num) { return num.toLocaleString() + ' ₽'; }
    document.getElementById('total-fuel-cost-mobile').textContent = formatMoney(totalFuelCost);
    document.getElementById('total-maint-cost-mobile').textContent = formatMoney(totalMaintCost);
    document.getElementById('total-parts-cost-mobile').textContent = formatMoney(totalPartsCost);
    document.getElementById('total-tires-cost-mobile').textContent = formatMoney(totalTiresCost);

    var costHeader = document.getElementById('cost-accordion-header');
    var costBody = document.getElementById('cost-accordion-body');
    if (costHeader && costBody) {
        costHeader.onclick = function() {
            var visible = costBody.style.display === 'block';
            costBody.style.display = visible ? 'none' : 'block';
            var arrow = costHeader.querySelector('.accordion-arrow');
            if (arrow) arrow.style.transform = visible ? 'rotate(0deg)' : 'rotate(180deg)';
        };
    }

    // 5. Планировщик ТО
    var dashPlanContainer = document.getElementById('dash-plan-container');
    if (dashPlanContainer) {
        var period = document.getElementById('dash-plan-period-select')?.value || 'month';
        var plan = App.logic.generateMaintenancePlan(period);
        var interval = App.logic.getPlanPeriodDates(period);
        var currentDate = new Date(interval.start);
        var displayMonth = currentDate.getMonth();
        var displayYear = currentDate.getFullYear();

        function getEventMapForMonth(year, month) {
            var map = {};
            App.store.operations.forEach(function(op) {
                var pd = App.logic.calculatePlan(op);
                if (!pd.planDate) return;
                var d = new Date(pd.planDate);
                if (d.getFullYear() === year && d.getMonth() === month) {
                    var key = pd.planDate;
                    if (!map[key]) map[key] = [];
                    map[key].push({ op: op, plan: pd });
                }
            });
            return map;
        }

        function renderCalendar(year, month) {
            var eventMap = getEventMapForMonth(year, month);
            var firstDay = new Date(year, month, 1).getDay();
            var daysInMonth = new Date(year, month + 1, 0).getDate();

            var html = '<div class="plan-calendar">';
            html += '<div class="cal-nav">';
            html += '<button class="cal-nav-btn cal-prev-btn"><i data-lucide="chevron-left"></i></button>';
            html += '<span class="cal-month">' + new Date(year, month).toLocaleString('ru', { month: 'long', year: 'numeric' }) + '</span>';
            html += '<button class="cal-nav-btn cal-next-btn"><i data-lucide="chevron-right"></i></button>';
            html += '</div><div class="cal-weekdays">';
            ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].forEach(function(d) { html += '<div class="cal-weekday">' + d + '</div>'; });
            html += '</div><div class="cal-grid">';

            for (var i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
            for (var d = 1; d <= daysInMonth; d++) {
                var dateISO = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
                var events = eventMap[dateISO] || [];
                var hasEvents = events.length > 0;
                var todayClass = (dateISO === new Date().toISOString().split('T')[0]) ? ' today' : '';
                html += '<div class="cal-day' + todayClass + '" data-date="' + dateISO + '">';
                html += '<span class="cal-day-num">' + d + '</span>';
                if (hasEvents) {
                    html += '<div class="cal-events">';
                    events.forEach(function(ev) { html += '<span class="cal-event-dot" title="' + App.utils.escapeHtml(ev.op.name) + '"></span>'; });
                    html += '</div>';
                }
                html += '</div>';
            }
            html += '</div></div>';
            return { html: html, eventMap: eventMap };
        }

        var firstRender = renderCalendar(displayYear, displayMonth);
        dashPlanContainer.innerHTML = firstRender.html;
        App.initIcons();   // инициализируем иконки сразу

        var upcomingContainer = document.getElementById('dash-upcoming-events');
        if (upcomingContainer) {
            var sortedPlan = plan.slice().sort(function(a,b) { return App.logic.calculatePlan(a).daysLeft - App.logic.calculatePlan(b).daysLeft; });
            var top3 = sortedPlan.slice(0,3);
            var upcomingHtml = '<h4>Ближайшие:</h4><ul>';
            top3.forEach(function(op) {
                var planData = App.logic.calculatePlan(op);
                upcomingHtml += '<li>' + App.utils.escapeHtml(op.name) + ' — ' + planData.daysLeft + ' дн.</li>';
            });
            upcomingHtml += '</ul>';
            upcomingContainer.innerHTML = upcomingHtml;
        }

        var currentYear = displayYear;
        var currentMonth = displayMonth;

        function bindCalendarEvents() {
            var prevBtn = dashPlanContainer.querySelector('.cal-prev-btn');
            var nextBtn = dashPlanContainer.querySelector('.cal-next-btn');
            if (prevBtn) {
                prevBtn.onclick = function() {
                    if (currentMonth === 0) { currentMonth = 11; currentYear--; } else currentMonth--;
                    var rend = renderCalendar(currentYear, currentMonth);
                    dashPlanContainer.innerHTML = rend.html;
                    App.initIcons();   // иконки после перерисовки
                    bindCalendarEvents();
                    bindDayClickEvents(rend.eventMap);
                };
            }
            if (nextBtn) {
                nextBtn.onclick = function() {
                    if (currentMonth === 11) { currentMonth = 0; currentYear++; } else currentMonth++;
                    var rend = renderCalendar(currentYear, currentMonth);
                    dashPlanContainer.innerHTML = rend.html;
                    App.initIcons();
                    bindCalendarEvents();
                    bindDayClickEvents(rend.eventMap);
                };
            }
        }

        function bindDayClickEvents(eventMap) {
            dashPlanContainer.querySelectorAll('.cal-day:not(.empty)').forEach(function(dayEl) {
                dayEl.onclick = function() {
                    var date = dayEl.dataset.date;
                    var events = eventMap[date] || [];
                    if (events.length === 0) return;
                    var listHtml = '<ul style="margin-top:12px;">';
                    events.forEach(function(ev) {
                        listHtml += '<li style="margin-bottom:8px;"><strong>' + App.utils.escapeHtml(ev.op.name) + '</strong> (' + App.utils.escapeHtml(ev.op.category) + ')<br>План: ' + App.utils.isoToDDMMYYYY(ev.plan.planDate) + ', ' + ev.plan.planMileage + ' км <button class="icon-btn" data-action="execute-plan" data-op-id="' + ev.op.id + '" data-op-name="' + App.utils.escapeHtml(ev.op.name) + '"><i data-lucide="check-circle"></i></button></li>';
                    });
                    listHtml += '</ul>';
                    App.ui.createModal('События на ' + App.utils.isoToDDMMYYYY(date), listHtml);
                };
            });
        }

        bindCalendarEvents();
        bindDayClickEvents(firstRender.eventMap);

        document.getElementById('dash-calendar-action-btn').onclick = function() {
            var period = document.getElementById('dash-plan-period-select')?.value || 'month';
            var modalContent = '<div style="display:flex; gap:12px; justify-content:center;">' +
                '<button id="modal-download-ics" class="primary-btn"><i data-lucide="download"></i> Скачать</button>' +
                '<button id="modal-subscribe-cal" class="secondary-btn"><i data-lucide="calendar-plus"></i> Подписаться</button>' +
                '</div>';
            var modal = App.ui.createModal('Выберите действие', modalContent);
            document.getElementById('modal-download-ics').onclick = function() {
                modal.remove();
                var plan = App.logic.generateMaintenancePlan(period);
                var icsContent = generateICS(plan);
                var blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                var link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'vesta_plan_' + new Date().toISOString().slice(0,10) + '.ics';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                App.toast('Календарь скачан', 'success');
            };
            document.getElementById('modal-subscribe-cal').onclick = function() {
                modal.remove();
                if (typeof App.ui.pages.subscribeToCalendar === 'function') App.ui.pages.subscribeToCalendar();
                else App.toast('Функция подписки недоступна', 'error');
            };
        };

        document.getElementById('dash-plan-period-select').onchange = function() {
            App.ui.pages.renderMobileDashboard();
        };
    }

    // 6. Ресурс деталей
    var candidates = App.store.operations.filter(function(op) { return op.intervalKm || op.intervalMonths || op.intervalMotohours; });
    var withPercents = candidates.map(function(op) {
        var plan = App.logic.calculatePlan(op);
        var percent = 0;
        if (op.intervalKm && plan.planMileage > (op.lastMileage||0))
            percent = Math.min(100, Math.round((App.store.settings.currentMileage - (op.lastMileage||0)) / (plan.planMileage - (op.lastMileage||0)) * 100));
        else if (op.intervalMotohours && plan.recMotohours > (op.lastMotohours||0))
            percent = Math.min(100, Math.round((App.store.settings.currentMotohours - (op.lastMotohours||0)) / (plan.recMotohours - (op.lastMotohours||0)) * 100));
        else if (op.intervalMonths && op.lastDate) {
            var totalDays = op.intervalMonths * 30;
            var elapsed = Math.floor((new Date() - new Date(op.lastDate)) / 86400000);
            percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
        }
        return { op: op, percent: percent };
    }).filter(function(item) { return item.percent > 0; }).sort(function(a,b) { return b.percent - a.percent; });
    var top3 = withPercents.slice(0,3);
    var resourceContainer = document.getElementById('resource-bars-container');
    if (resourceContainer) {
        var html = '';
        top3.forEach(function(item) {
            var p = item.percent;
            var color = p > 70 ? 'var(--success)' : (p > 30 ? 'var(--warning)' : 'var(--danger)');
            html += '<div style="margin-bottom:8px;">';
            html += '<div style="display:flex; justify-content:space-between; font-size:0.85rem;"><span>' + App.utils.escapeHtml(item.op.name) + '</span><span>' + p + '%</span></div>';
            html += '<div class="progress-bar-container"><div class="progress-bar" style="width:' + p + '%; background:' + color + ';"></div></div>';
            html += '</div>';
        });
        resourceContainer.innerHTML = html || '<p class="hint">Нет данных</p>';
    }

    // 7. Последние операции
    function renderAccordionBody(id, data, fields, tab, showDate, dateField) {
        dateField = dateField || 'date';
        var body = document.getElementById(id);
        if (!body) return;
        var latest = data.slice().sort(function(a, b) {
            var da = new Date(a[dateField]);
            var db = new Date(b[dateField]);
            return db - da;
        }).slice(0, 3);
        var html = '';
        if (latest.length === 0) {
            html = '<p class="hint">Нет данных</p>';
        } else {
            latest.forEach(function(rec) {
                var dateHtml = (showDate !== false) ? '<span>' + (rec[dateField] || '') + '</span>' : '';
                html += '<div class="last-row">' + dateHtml + '<span>' + fields.name(rec) + '</span><span>' + (fields.cost(rec) || '') + '</span></div>';
            });
            html += '<button class="secondary-btn more-btn" data-tab="' + tab + '">Больше данных</button>';
        }
        body.innerHTML = html;
    }

    renderAccordionBody('last-fuel-body', App.store.fuelLog, {
        name: function(f) { return f.fuelType || 'Бензин'; },
        cost: function(f) { return (f.liters * f.pricePerLiter).toFixed(0) + ' ₽'; }
    }, 'fuel');
    renderAccordionBody('last-to-body', App.store.serviceRecords, {
        name: function(r) { var op = App.store.operations.find(function(o) { return o.id == r.operation_id; }); return op ? op.name : 'Неизвестно'; },
        cost: function(r) { return (Number(r.parts_cost)+Number(r.work_cost)).toFixed(0) + ' ₽'; }
    }, 'to');
    renderAccordionBody('last-parts-body', App.store.parts, {
        name: function(p) { return p.oem || p.analog || p.operation || '—'; },
        cost: function(p) { return (p.price || '') + ' ₽'; }
    }, 'parts', true, 'dateAdded');
    renderAccordionBody('last-tires-body', App.store.tireLog, {
        name: function(t) { return t.type || 'Шины'; },
        cost: function(t) { return (Number(t.purchaseCost||0)+Number(t.mountCost||0)).toFixed(0) + ' ₽'; }
    }, 'tires');

    document.querySelectorAll('.accordion-header[data-accordion]').forEach(function(header) {
        header.onclick = function() {
            var body = document.getElementById('last-' + header.dataset.accordion + '-body');
            if (!body) return;
            var visible = body.style.display === 'block';
            body.style.display = visible ? 'none' : 'block';
            var arrow = header.querySelector('.accordion-arrow');
            if (arrow) arrow.style.transform = visible ? 'rotate(0deg)' : 'rotate(180deg)';
        };
    });

    document.querySelectorAll('.more-btn').forEach(function(btn) {
        btn.onclick = function() { App.events.switchToTab(btn.dataset.tab); };
    });

    // 8. Прогноз
    document.getElementById('calc-prediction-btn-mobile').onclick = function() {
        var target = parseFloat(document.getElementById('prediction-target-mobile')?.value);
        if (isNaN(target)) return;
        var result = App.logic.predictMileageDate(target);
        var resultEl = document.getElementById('prediction-result-mobile');
        if (resultEl) {
            if (result) resultEl.textContent = 'Ожидаемая дата: ' + result.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
            else resultEl.textContent = 'Недостаточно данных или некорректный пробег.';
        }
    };

    // Кнопка обновления пробега (мобильная)
    var updateBtn = document.getElementById('mobile-dash-update-mileage-btn');
    if (updateBtn) {
        updateBtn.onclick = function() {
            var newMileage = parseFloat(document.getElementById('dash-new-mileage').value);
            var newMotohours = parseFloat(document.getElementById('dash-new-motohours').value);
            if (isNaN(newMileage) || isNaN(newMotohours)) { App.toast('Введите пробег и моточасы', 'warning'); return; }
            App.store.settings.currentMileage = newMileage;
            App.store.settings.currentMotohours = newMotohours;
            App.events.updateMileageAndAverages();
        };
    }
};

// ===== Главный рендер дашборда =====
App.ui.pages.renderDashboard = function() {
    var dataPanel = document.getElementById('data-panel');
    if (!dataPanel) return;

    // Обновляем общие элементы, которые используются и в десктопной, и в мобильной версии
    var stats = App.logic.calculateStatistics('6months');
    var mileageEl = document.getElementById('dash-mileage');
    var motoEl = document.getElementById('dash-motohours');
    var avgConsEl = document.getElementById('dash-avg-consumption');
    var costKmEl = document.getElementById('dash-cost-km');
    if (mileageEl) mileageEl.textContent = App.store.settings.currentMileage.toLocaleString();
    if (motoEl) motoEl.textContent = App.store.settings.currentMotohours.toLocaleString();
    if (avgConsEl) avgConsEl.textContent = stats.avgFuelConsumption.toFixed(1);
    if (costKmEl) costKmEl.textContent = stats.costPerKm.toFixed(2);

    var mode = App.logic.getDrivingMode();
    var modeTextEl = document.getElementById('dash-driving-mode-text');
    var modeDotEl = document.getElementById('mode-dot');
    if (modeTextEl) {
        var rawMode = mode.text;
        if (rawMode.indexOf('Городской') !== -1) modeTextEl.textContent = 'Город';
        else if (rawMode.indexOf('Трассовый') !== -1) modeTextEl.textContent = 'Трасса';
        else if (rawMode.indexOf('Смешанный') !== -1) modeTextEl.textContent = 'Смешанный';
        else modeTextEl.textContent = rawMode;
    }
    if (modeDotEl) {
        var modeClass = '';
        if (mode.text.indexOf('Городской') !== -1) modeClass = 'city';
        else if (mode.text.indexOf('Трассовый') !== -1) modeClass = 'highway';
        else if (mode.text.indexOf('Смешанный') !== -1) modeClass = 'mixed';
        modeDotEl.className = 'mode-dot ' + modeClass;
    }

    // В зависимости от ширины экрана рендерим соответствующую версию дашборда
    if (window.innerWidth >= 768) {
        // Десктопная версия – полностью новая
        App.ui.pages.renderDesktopDashboard();
    } else {
        // Мобильная версия – существующая
        // Перед рендером мобильного дашборда вызываем необходимые функции, которые раньше были общими
        if (typeof App.charts.renderMiniFuelConsumptionChart === 'function') App.charts.renderMiniFuelConsumptionChart();
        if (typeof App.charts.renderMiniCostsChart === 'function') App.charts.renderMiniCostsChart();
        if (typeof App.charts.renderMiniExpensePieChart === 'function') App.charts.renderMiniExpensePieChart();
        App.ui.pages.renderTireWearMini();
        App.ui.pages.renderTop5Widget();
        var top5Container = document.getElementById('top5-container');
        var dashUpcoming = document.getElementById('dash-upcoming-container');
        if (top5Container && dashUpcoming) {
            dashUpcoming.innerHTML = top5Container.innerHTML;
            var items = dashUpcoming.querySelectorAll('.top5-item');
            items.forEach(function(item) {
                var nameEl = item.querySelector('.top5-name');
                if (!nameEl) return;
                var opName = nameEl.textContent;
                var op = App.store.operations.find(function(o) { return o.name === opName; });
                if (!op) return;
                var btn = document.createElement('button');
                btn.className = 'icon-btn execute-dash-btn';
                btn.innerHTML = '<i data-lucide="check-circle"></i>';
                btn.title = 'Выполнить';
                btn.addEventListener('click', function() { App.ui.pages.openServiceModal(op.id, op.name); });
                item.appendChild(btn);
            });
        }
        // Вызов мобильного дашборда
        App.ui.pages.renderMobileDashboard();
    }
    
    App.initIcons();
};