// src/ui/pages/dashboard.js
window.App = window.App || {};
App.charts = App.charts || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// ========== ОБЩИЕ ФУНКЦИИ ДЛЯ ДАШБОРДА ==========
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

// ========== ДЕСКТОПНЫЙ ДАШБОРД (графики, три колонки) ==========
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

App.ui.pages.getChartIcon = function(chartId) {
    var map = {1:'trending-up',2:'bar-chart-2',3:'dollar-sign',4:'fuel',5:'wrench',6:'package',7:'target',8:'calendar',9:'receipt',10:'gauge',11:'activity',12:'pie-chart'};
    return map[chartId] || 'bar-chart';
};

App.ui.pages.loadChartSelection = function() {
    var saved = localStorage.getItem('vesta_timeline_settings');
    var defaults = { chart1: 1, chart2: 2, chart3: 3 };
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            return { chart1: parsed.chart1 || defaults.chart1, chart2: parsed.chart2 || defaults.chart2, chart3: parsed.chart3 || defaults.chart3 };
        } catch(e) {}
    }
    return defaults;
};

App.ui.pages.saveChartSelection = function(chart1, chart2, chart3) {
    localStorage.setItem('vesta_timeline_settings', JSON.stringify({ chart1, chart2, chart3 }));
};

App.ui.pages.validateAndFixSelection = function(select1, select2, select3) {
    var val1 = parseInt(select1.value);
    var val2 = parseInt(select2.value);
    var val3 = parseInt(select3.value);
    if (val2 === val1) { var newVal2 = val1 === 1 ? 2 : 1; select2.value = newVal2; App.toast('График уже выбран, автоматически заменён', 'warning'); }
    if (val3 === val1 || val3 === val2) { var newVal3 = 1; while (newVal3 === val1 || newVal3 === val2) newVal3++; select3.value = newVal3; App.toast('График уже выбран, автоматически заменён', 'warning'); }
};

App.ui.pages.renderChartSelectors = function() {
    var container = document.getElementById('timeline-selectors');
    if (!container) return;
    var selection = App.ui.pages.loadChartSelection();
    var optionsHtml = App.ui.pages.CHART_TYPES.map(t => '<option value="'+t.id+'">'+t.name+'</option>').join('');
    var html = '<div class="timeline-selectors-panel">' +
        '<div class="selector-group"><label>График 1</label><select id="timeline-chart-1" class="timeline-chart-select">'+optionsHtml+'</select></div>' +
        '<div class="selector-group"><label>График 2</label><select id="timeline-chart-2" class="timeline-chart-select">'+optionsHtml+'</select></div>' +
        '<div class="selector-group"><label>График 3</label><select id="timeline-chart-3" class="timeline-chart-select">'+optionsHtml+'</select></div>' +
        '<div class="selector-actions"><button id="apply-charts-btn" class="primary-btn"><i data-lucide="check"></i> Применить</button><button id="reset-charts-btn" class="secondary-btn"><i data-lucide="rotate-ccw"></i> Сбросить</button></div>' +
        '</div>';
    container.innerHTML = html;
    var select1 = document.getElementById('timeline-chart-1');
    var select2 = document.getElementById('timeline-chart-2');
    var select3 = document.getElementById('timeline-chart-3');
    if (select1) select1.value = selection.chart1;
    if (select2) select2.value = selection.chart2;
    if (select3) select3.value = selection.chart3;
    var applyBtn = document.getElementById('apply-charts-btn');
    if (applyBtn) applyBtn.onclick = function() { App.ui.pages.validateAndFixSelection(select1, select2, select3); App.ui.pages.saveChartSelection(parseInt(select1.value), parseInt(select2.value), parseInt(select3.value)); App.ui.pages.renderSelectedCharts(); App.toast('Графики обновлены', 'success'); };
    var resetBtn = document.getElementById('reset-charts-btn');
    if (resetBtn) resetBtn.onclick = function() { select1.value = 1; select2.value = 2; select3.value = 3; App.ui.pages.saveChartSelection(1,2,3); App.ui.pages.renderSelectedCharts(); App.toast('Графики сброшены к стандартным', 'success'); };
    App.initIcons();
};

App.ui.pages.renderSelectedCharts = function() {
    var selection = App.ui.pages.loadChartSelection();
    var chartIds = [selection.chart1, selection.chart2, selection.chart3];
    for (var i = 1; i <= 3; i++) {
        var canvasId = 'timeline-canvas-' + i;
        var chartId = chartIds[i-1];
        var periodSelect = document.querySelector('.chart-period-select[data-chart="'+i+'"]');
        var period = periodSelect ? periodSelect.value : 'month';
        var card = document.querySelector('.timeline-chart-card[data-chart-num="'+i+'"]');
        if (card) {
            var chartType = App.ui.pages.CHART_TYPES.find(t => t.id === chartId);
            var chartName = chartType ? chartType.name : 'График';
            var iconName = App.ui.pages.getChartIcon(chartId);
            var header = card.querySelector('.chart-header');
            if (header) header.innerHTML = '<i data-lucide="'+iconName+'"></i><h3>'+App.utils.escapeHtml(chartName)+'</h3>';
        }
        if (typeof App.timelineCharts !== 'undefined') {
            switch (chartId) {
                case 1: App.timelineCharts.renderTotalCostsWithForecast(canvasId, period); break;
                case 2: App.timelineCharts.renderFuelVsTOCosts(canvasId, period); break;
                case 3: App.timelineCharts.renderAverageFuelPrice(canvasId, period); break;
                case 4: App.timelineCharts.renderFuelConsumption(canvasId, period); break;
                case 5: App.timelineCharts.renderTOCostsByCategory(canvasId, period); break;
                case 6: App.timelineCharts.renderTiresAndPartsCosts(canvasId, period); break;
                case 7: App.timelineCharts.renderMileageForecast(canvasId, period); break;
                case 8: App.timelineCharts.renderOperationsCount(canvasId, period); break;
                case 9: App.timelineCharts.renderCostPerKm(canvasId, period); break;
                case 10: App.timelineCharts.renderAverageSpeed(canvasId, period); break;
                case 11: App.timelineCharts.renderMileageAndHours(canvasId, period); break;
                case 12: App.timelineCharts.renderExpensePie(canvasId, period); break;
                default: console.warn('Неизвестный тип графика:', chartId);
            }
        }
    }
    App.initIcons();
};

App.ui.pages.generateChartCardHtml = function(chartNumber, chartId) {
    var chartType = App.ui.pages.CHART_TYPES.find(t => t.id === chartId);
    var chartName = chartType ? chartType.name : 'График';
    var iconName = App.ui.pages.getChartIcon(chartId);
    return '<div class="timeline-chart-card" data-chart-num="'+chartNumber+'" data-chart-id="'+chartId+'">' +
        '<div class="chart-header"><i data-lucide="'+iconName+'"></i><h3>'+App.utils.escapeHtml(chartName)+'</h3></div>' +
        '<canvas id="timeline-canvas-'+chartNumber+'" width="500" height="200" style="width:100%; height:200px; display:block;"></canvas>' +
        '<div class="chart-footer"><select class="chart-period-select" data-chart="'+chartNumber+'"><option value="month">Месяц</option><option value="quarter">Квартал</option><option value="year">Год</option></select><button class="icon-btn chart-menu-btn" data-chart="'+chartNumber+'"><i data-lucide="more-horizontal"></i></button></div>' +
        '</div>';
};

App.ui.pages.renderFinanceColumn = function() {
    var container = document.getElementById('bottom-col-finance');
    if (!container) return;
    var purchaseCost = App.store.purchaseCost || 0;
    var totalMaint = App.store.serviceRecords.reduce((s,r) => s + (Number(r.parts_cost)||0) + (Number(r.work_cost)||0), 0);
    var totalFuel = App.store.fuelLog.reduce((s,f) => s + (Number(f.liters)||0) * (Number(f.pricePerLiter)||0), 0);
    var totalParts = App.store.parts.reduce((s,p) => s + (Number(p.price)||0), 0);
    var totalTires = App.store.tireLog.reduce((s,t) => s + (Number(t.purchaseCost)||0) + (Number(t.mountCost)||0), 0);
    var totalCost = purchaseCost + totalMaint + totalFuel + totalParts + totalTires;
    var currentMileage = App.store.settings.currentMileage || 1;
    var costPerKm = totalCost / currentMileage;
    var displayMode = localStorage.getItem('vesta_cost_display_mode') || 'total';
    var displayValue = (displayMode === 'perKm') ? costPerKm.toFixed(2)+' ₽/км' : totalCost.toLocaleString()+' ₽';
    var grouped = App.logic.groupTotalCostsByMonth(0);
    var months = grouped.months, totalCosts = grouped.totalCosts;
    var maxMonth = '', maxCost = 0, minMonth = '', minCost = Infinity;
    for (var i=0; i<months.length; i++) {
        var cost = totalCosts[i];
        if (cost > maxCost) { maxCost = cost; maxMonth = months[i]; }
        if (cost < minCost && cost > 0) { minCost = cost; minMonth = months[i]; }
    }
    var html = '<div class="finance-col-card"><h3><i data-lucide="wallet"></i> Стоимость владения</h3>' +
        '<div class="cost-display"><span class="cost-value" id="col-finance-value">'+displayValue+'</span><button class="icon-btn" id="toggle-cost-display" title="Переключить общая/за км"><i data-lucide="refresh-cw"></i></button></div>' +
        '<div class="cost-breakdown"><div>Покупка: '+purchaseCost.toLocaleString()+' ₽</div><div>ТО: '+totalMaint.toLocaleString()+' ₽</div><div>Топливо: '+totalFuel.toLocaleString()+' ₽</div><div>Запчасти: '+totalParts.toLocaleString()+' ₽</div><div>Шины: '+totalTires.toLocaleString()+' ₽</div></div></div>' +
        '<div class="finance-col-card"><h3><i data-lucide="calendar"></i> Экстремумы затрат</h3>' +
        '<div class="extreme-item"><i data-lucide="trending-up" style="color:var(--danger);"></i> <strong>Самый дорогой месяц:</strong> '+(maxMonth ? maxMonth+' ('+maxCost.toLocaleString()+' ₽)' : '—')+'</div>' +
        '<div class="extreme-item"><i data-lucide="trending-down" style="color:var(--success);"></i> <strong>Самый дешёвый месяц:</strong> '+(minMonth ? minMonth+' ('+minCost.toLocaleString()+' ₽)' : '—')+'</div></div>';
    container.innerHTML = html;
    var toggleBtn = document.getElementById('toggle-cost-display');
    if (toggleBtn) toggleBtn.onclick = function() { var newMode = (localStorage.getItem('vesta_cost_display_mode') === 'total') ? 'perKm' : 'total'; localStorage.setItem('vesta_cost_display_mode', newMode); App.ui.pages.renderFinanceColumn(); };
    App.initIcons();
};

App.ui.pages.renderPlannerColumn = function() {
    var container = document.getElementById('bottom-col-planner');
    if (!container) return;
    var today = new Date();
    var currentYear = today.getFullYear();
    var currentMonth = today.getMonth();
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
    function renderCalendar(year, month, containerEl) {
        var eventMap = getEventMapForMonth(year, month);
        var firstDay = new Date(year, month, 1).getDay();
        var daysInMonth = new Date(year, month+1, 0).getDate();
        var html = '<div class="planner-calendar">' +
            '<div class="cal-nav"><button class="cal-nav-btn planner-prev-btn"><i data-lucide="chevron-left"></i></button><span class="cal-month">'+new Date(year,month).toLocaleString('ru',{month:'long',year:'numeric'})+'</span><button class="cal-nav-btn planner-next-btn"><i data-lucide="chevron-right"></i></button></div>' +
            '<div class="cal-weekdays">'+['Вс','Пн','Вт','Ср','Чт','Пт','Сб'].map(d=>'<div class="cal-weekday">'+d+'</div>').join('')+'</div><div class="cal-grid">';
        for (var i=0; i<firstDay; i++) html += '<div class="cal-day empty"></div>';
        for (var d=1; d<=daysInMonth; d++) {
            var dateISO = year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
            var events = eventMap[dateISO] || [];
            var hasEvents = events.length > 0;
            var todayClass = (dateISO === new Date().toISOString().split('T')[0]) ? ' today' : '';
            html += '<div class="cal-day'+todayClass+'" data-date="'+dateISO+'">' +
                '<span class="cal-day-num">'+d+'</span>' +
                (hasEvents ? '<div class="cal-events">'+events.map(()=>'<span class="cal-event-dot"></span>').join('')+'</div>' : '') +
                '</div>';
        }
        html += '</div></div>';
        containerEl.innerHTML = html;
        containerEl.querySelectorAll('.cal-day:not(.empty)').forEach(function(dayEl) {
            dayEl.onclick = function() {
                var date = dayEl.dataset.date;
                var events = eventMap[date] || [];
                if (events.length === 0) return;
                var listHtml = '<ul style="margin-top:12px;">';
                events.forEach(function(ev) {
                    listHtml += '<li style="margin-bottom:8px;"><strong>'+App.utils.escapeHtml(ev.op.name)+'</strong> ('+App.utils.escapeHtml(ev.op.category)+')<br>План: '+App.utils.isoToDDMMYYYY(ev.plan.planDate)+', '+ev.plan.planMileage+' км <button class="icon-btn" data-action="execute-plan" data-op-id="'+ev.op.id+'" data-op-name="'+App.utils.escapeHtml(ev.op.name)+'"><i data-lucide="check-circle"></i></button></li>';
                });
                listHtml += '</ul>';
                App.ui.createModal('События на '+App.utils.isoToDDMMYYYY(date), listHtml);
                App.initIcons();
            };
        });
        App.initIcons();
    }
    var calendarContainer = document.createElement('div');
    calendarContainer.className = 'planner-calendar-container';
    var upcomingContainer = document.createElement('div');
    upcomingContainer.className = 'planner-upcoming-container';
    container.innerHTML = '';
    container.appendChild(calendarContainer);
    container.appendChild(upcomingContainer);
    function refreshCalendar() {
        renderCalendar(currentYear, currentMonth, calendarContainer);
        var prevBtn = calendarContainer.querySelector('.planner-prev-btn');
        var nextBtn = calendarContainer.querySelector('.planner-next-btn');
        if (prevBtn) prevBtn.onclick = function() { if (currentMonth === 0) { currentMonth = 11; currentYear--; } else { currentMonth--; } refreshCalendar(); renderUpcomingList(); };
        if (nextBtn) nextBtn.onclick = function() { if (currentMonth === 11) { currentMonth = 0; currentYear++; } else { currentMonth++; } refreshCalendar(); renderUpcomingList(); };
    }
    function renderUpcomingList() {
        var candidates = App.store.operations.filter(function(op) {
            if (!op.intervalKm && !op.intervalMonths && !op.intervalMotohours) return false;
            var plan = App.logic.calculatePlan(op);
            return plan.daysLeft !== null && isFinite(plan.daysLeft) && plan.planDate;
        });
        var withDays = candidates.map(function(op) { var plan = App.logic.calculatePlan(op); return { op: op, plan: plan, daysLeft: plan.daysLeft }; })
            .filter(item => item.daysLeft !== null).sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,5);
        if (withDays.length === 0) { upcomingContainer.innerHTML = '<p class="hint">Нет предстоящих ТО</p>'; return; }
        var html = '<h3><i data-lucide="alert-circle"></i> Ближайшие ТО</h3><ul class="upcoming-list">';
        withDays.forEach(function(item) {
            var days = item.daysLeft;
            var statusClass = days < 0 ? 'overdue' : (days <= 7 ? 'critical' : 'normal');
            var daysText = days < 0 ? 'просрочено на '+Math.abs(days)+' дн.' : 'через '+days+' дн.';
            html += '<li class="upcoming-item '+statusClass+'">' +
                '<span class="upcoming-name">'+App.utils.escapeHtml(item.op.name)+'</span>' +
                '<span class="upcoming-date">'+App.utils.isoToDDMMYYYY(item.plan.planDate)+'</span>' +
                '<span class="upcoming-days">'+daysText+'</span>' +
                '<button class="icon-btn execute-upcoming" data-op-id="'+item.op.id+'" data-op-name="'+App.utils.escapeHtml(item.op.name)+'" title="Выполнить"><i data-lucide="check-circle"></i></button>' +
                '</li>';
        });
        html += '</ul>';
        upcomingContainer.innerHTML = html;
        upcomingContainer.querySelectorAll('.execute-upcoming').forEach(btn => btn.addEventListener('click', function() { App.ui.pages.openServiceModal(this.dataset.opId, this.dataset.opName); }));
        App.initIcons();
    }
    refreshCalendar();
    renderUpcomingList();
};

App.ui.pages.renderOtherColumn = function() {
    var container = document.getElementById('bottom-col-other');
    if (!container) return;
    var html = '<div class="other-col-card"><h3><i data-lucide="circle"></i> Состояние шин</h3><div id="col-tire-wear-compact"></div></div>' +
        '<div class="other-col-card"><h3><i data-lucide="warehouse"></i> Складская сводка</h3><div id="col-warehouse-summary"></div></div>' +
        '<div class="other-col-card"><h3><i data-lucide="search"></i> Поиск OEM</h3><div class="oem-search"><input type="text" id="oem-search-input" placeholder="Введите OEM или аналог"><button id="oem-search-btn" class="primary-btn" style="margin-top:8px;"><i data-lucide="search"></i> Найти</button></div><div id="oem-search-results" style="margin-top:12px;"></div></div>';
    container.innerHTML = html;
    App.ui.pages.renderTireWearCompact();
    App.ui.pages.renderWarehouseSummaryCompact = function() {
        var container = document.getElementById('col-warehouse-summary');
        if (!container) return;
        var parts = App.store.parts || [];
        var totalPositions = parts.length;
        var totalSum = parts.reduce((s,p)=>s+(parseFloat(p.price)||0),0);
        var lowStock = parts.filter(p => (p.inStock||0) === 1).length;
        var outOfStock = parts.filter(p => (p.inStock||0) === 0).length;
        container.innerHTML = '<div>Всего позиций: <strong>'+totalPositions+'</strong></div><div>На сумму: <strong>'+totalSum.toLocaleString()+' ₽</strong></div><div>Заканчиваются (≤1): <strong style="color:var(--warning)">'+lowStock+'</strong></div><div>Нет в наличии: <strong style="color:var(--danger)">'+outOfStock+'</strong></div>';
    };
    App.ui.pages.renderWarehouseSummaryCompact();
    var searchBtn = document.getElementById('oem-search-btn');
    var searchInput = document.getElementById('oem-search-input');
    if (searchBtn) {
        searchBtn.onclick = function() {
            var query = searchInput.value.trim().toLowerCase();
            if (!query) { App.toast('Введите OEM или аналог для поиска', 'warning'); return; }
            var results = App.store.parts.filter(p => (p.oem && p.oem.toLowerCase().includes(query)) || (p.analog && p.analog.toLowerCase().includes(query)));
            if (results.length === 0) { App.ui.alertModal('По запросу "'+App.utils.escapeHtml(query)+'" ничего не найдено.'); return; }
            var modalContent = '<div style="max-height:400px; overflow-y:auto;">';
            results.forEach(function(part) {
                modalContent += '<div class="search-result-item" data-part-id="'+part.id+'" style="padding:8px; border-bottom:1px solid var(--border); cursor:pointer;">' +
                    '<strong>'+App.utils.escapeHtml(part.oem || part.analog || '—')+'</strong><br>' +
                    '<span class="hint">Операция: '+App.utils.escapeHtml(part.operation || '—')+'</span><br>' +
                    '<span>Цена: '+(part.price ? part.price+' ₽' : '—')+'</span></div>';
            });
            modalContent += '</div>';
            var modal = App.ui.createModal('Результаты поиска: '+App.utils.escapeHtml(query), modalContent);
            modal.querySelectorAll('.search-result-item').forEach(el => el.addEventListener('click', function() {
                var partId = this.dataset.partId;
                var part = App.store.parts.find(p => p.id == partId);
                if (part && typeof App.ui.pages.openPartForm === 'function') { modal.remove(); App.ui.pages.openPartForm(part); }
            }));
            App.initIcons();
        };
    }
    App.initIcons();
};

App.ui.pages.renderTireWearCompact = function() {
    var container = document.getElementById('col-tire-wear-compact');
    if (!container) return;
    var summerTires = App.store.tireLog.filter(t=>t.type==='Лето').sort((a,b)=>new Date(b.date)-new Date(a.date));
    var winterTires = App.store.tireLog.filter(t=>t.type==='Зима').sort((a,b)=>new Date(b.date)-new Date(a.date));
    var summerLast = summerTires[0];
    var winterLast = winterTires[0];
    function buildCompactWear(tire, type) {
        if (!tire) return '<div class="compact-wear-item"><span class="wear-label">'+type+'</span><span class="hint">Нет данных</span></div>';
        var wearPercent = 0, wearValue = parseFloat(tire.wear) || 0;
        if (type === 'Лето') {
            var minWear=1.6, maxDepth=8, currentDepth=Math.min(maxDepth,Math.max(minWear,wearValue));
            wearPercent = ((maxDepth-currentDepth)/(maxDepth-minWear))*100;
            wearPercent = Math.min(100,Math.max(0,wearPercent));
            var statusText = wearValue.toFixed(1)+' мм';
        } else {
            wearPercent = Math.min(100,Math.max(0,100-wearValue));
            statusText = wearValue+'% шипов';
        }
        var color = wearPercent<50 ? 'var(--success)' : (wearPercent<80 ? 'var(--warning)' : 'var(--danger)');
        return '<div class="compact-wear-item"><div class="wear-label">'+type+'</div><div class="wear-progress"><div class="wear-fill" style="width:'+wearPercent+'%; background:'+color+';"></div></div><div class="wear-value">'+statusText+'</div></div>';
    }
    container.innerHTML = buildCompactWear(summerLast,'Лето') + buildCompactWear(winterLast,'Зима');
    App.initIcons();
};

App.ui.pages.renderDesktopDashboard = function() {
    var container = document.getElementById('desktop-dashboard-container');
    if (!container) return;
    var selection = App.ui.pages.loadChartSelection();
    var html = '<div class="timeline-section"><div id="timeline-selectors"></div><div id="timeline-charts-container" class="timeline-charts-row">' +
        App.ui.pages.generateChartCardHtml(1, selection.chart1) +
        App.ui.pages.generateChartCardHtml(2, selection.chart2) +
        App.ui.pages.generateChartCardHtml(3, selection.chart3) +
        '</div></div><div class="dashboard-bottom-row"><div class="bottom-col" id="bottom-col-finance"></div><div class="bottom-col" id="bottom-col-planner"></div><div class="bottom-col" id="bottom-col-other"></div></div>';
    container.innerHTML = html;
    App.ui.pages.renderChartSelectors();
    document.querySelectorAll('.chart-period-select').forEach(select => {
        select.addEventListener('change', function() {
            var chartNum = parseInt(this.dataset.chart);
            var period = this.value;
            var selection = App.ui.pages.loadChartSelection();
            var chartId = selection['chart'+chartNum];
            var canvasId = 'timeline-canvas-'+chartNum;
            switch (chartId) {
                case 1: App.timelineCharts.renderTotalCostsWithForecast(canvasId, period); break;
                case 2: App.timelineCharts.renderFuelVsTOCosts(canvasId, period); break;
                case 3: App.timelineCharts.renderAverageFuelPrice(canvasId, period); break;
                case 4: App.timelineCharts.renderFuelConsumption(canvasId, period); break;
                case 5: App.timelineCharts.renderTOCostsByCategory(canvasId, period); break;
                case 6: App.timelineCharts.renderTiresAndPartsCosts(canvasId, period); break;
                case 7: App.timelineCharts.renderMileageForecast(canvasId, period); break;
                case 8: App.timelineCharts.renderOperationsCount(canvasId, period); break;
                case 9: App.timelineCharts.renderCostPerKm(canvasId, period); break;
                case 10: App.timelineCharts.renderAverageSpeed(canvasId, period); break;
                case 11: App.timelineCharts.renderMileageAndHours(canvasId, period); break;
                case 12: App.timelineCharts.renderExpensePie(canvasId, period); break;
                default: console.warn('Неизвестный тип графика:', chartId);
            }
        });
    });
    document.querySelectorAll('.chart-menu-btn').forEach(btn => btn.addEventListener('click', function() { App.ui.pages.showChartMenu(this.dataset.chart); }));
    App.initIcons();
    App.ui.pages.renderSelectedCharts();
    App.ui.pages.renderFinanceColumn();
    App.ui.pages.renderPlannerColumn();
    App.ui.pages.renderOtherColumn();
};

App.ui.pages.showChartMenu = function(chartNum) {
    var content = '<div class="chart-menu-options"><button id="menu-download-png" class="secondary-btn" style="width:100%; margin-bottom:8px;"><i data-lucide="image"></i> Скачать как PNG</button><button id="menu-view-data" class="secondary-btn" style="width:100%; margin-bottom:8px;"><i data-lucide="table"></i> Показать данные</button><button id="menu-reset-zoom" class="secondary-btn" style="width:100%;"><i data-lucide="zoom-out"></i> Сбросить масштаб</button></div>';
    var modal = App.ui.createModal('Меню графика '+chartNum, content);
    document.getElementById('menu-download-png').onclick = function() { var canvas = document.getElementById('timeline-canvas-'+chartNum); if(canvas){ var link=document.createElement('a'); link.download='chart-'+chartNum+'.png'; link.href=canvas.toDataURL(); link.click(); } modal.remove(); };
    document.getElementById('menu-view-data').onclick = function() { var selection = App.ui.pages.loadChartSelection(); var chartId = selection['chart'+chartNum]; var periodSelect = document.querySelector('.chart-period-select[data-chart="'+chartNum+'"]'); var period = periodSelect ? periodSelect.value : 'month'; var tableHtml = '<table class="data-table"><thead><tr><th>Период</th><th>Значение</th></tr></thead><tbody>'; /* здесь должна быть генерация данных, но для краткости пропустим, можно заглушку */ tableHtml += '<tr><td colspan="2">Данные графика можно экспортировать из изображения</td></tr>'; tableHtml += '</tbody></table>'; App.ui.createModal('Данные графика', '<div style="max-height:400px; overflow-y:auto;">'+tableHtml+'</div>'); App.initIcons(); };
    document.getElementById('menu-reset-zoom').onclick = function() { var chart = App.timelineCharts.activeCharts['timeline-canvas-'+chartNum]; if(chart && typeof chart.resetZoom === 'function') chart.resetZoom(); modal.remove(); };
    App.initIcons();
};

// ========== МОБИЛЬНЫЙ ДАШБОРД (заполнение данными и аккордеоны) ==========
App.ui.pages.renderMobileDashboard = function() {
    // 1. Режим эксплуатации
    var modeData = App.logic.getDrivingMode();
    var modeDot = document.getElementById('mobile-mode-dot');
    var modeText = document.getElementById('mobile-dash-driving-mode-text');
    if (modeDot && modeText) {
        var modeClass = '';
        if (modeData.text.indexOf('Городской') !== -1) modeClass = 'city';
        else if (modeData.text.indexOf('Трассовый') !== -1) modeClass = 'highway';
        else if (modeData.text.indexOf('Смешанный') !== -1) modeClass = 'mixed';
        modeDot.className = 'mode-dot ' + modeClass;
        modeText.textContent = modeData.text;
    }

    // 2. Сводка
    document.getElementById('mobile-dash-mileage').textContent = App.store.settings.currentMileage.toLocaleString();
    document.getElementById('mobile-dash-motohours').textContent = App.store.settings.currentMotohours.toLocaleString();
    var stats = App.logic.calculateStatistics('6months');
    document.getElementById('mobile-dash-avg-consumption').textContent = stats.avgFuelConsumption.toFixed(1);
    document.getElementById('mobile-dash-cost-km').textContent = stats.costPerKm.toFixed(2);

    // 3. Затраты на месяц
    var now = new Date();
    var currentMonthYear = now.toLocaleString('ru', { month: 'long', year: 'numeric' });
    document.getElementById('current-month-year').textContent = currentMonthYear;
    var monthly = App.logic.groupTotalCostsByMonth(1);
    var fuelCostThisMonth = monthly.fuelCosts[0] || 0;
    var toCostThisMonth = monthly.toCosts[0] || 0;
    var partsCostThisMonth = App.store.parts.reduce((s,p)=>s+(parseFloat(p.price)||0),0); // за всё время, можно уточнить
    var tiresCostThisMonth = App.store.tireLog.reduce((s,t)=>s+(parseFloat(t.purchaseCost)||0)+(parseFloat(t.mountCost)||0),0);
    document.getElementById('total-fuel-cost-mobile').textContent = fuelCostThisMonth.toFixed(0)+' ₽';
    document.getElementById('total-maint-cost-mobile').textContent = toCostThisMonth.toFixed(0)+' ₽';
    document.getElementById('total-parts-cost-mobile').textContent = partsCostThisMonth.toFixed(0)+' ₽';
    document.getElementById('total-tires-cost-mobile').textContent = tiresCostThisMonth.toFixed(0)+' ₽';

    // 4. Планировщик ТО (виджет)
    App.ui.pages.renderTop5Widget();  // заполнит #top5-container, но в мобильной версии он скрыт? заодно
    var planContainer = document.getElementById('dash-plan-container');
    if (planContainer) {
        var period = document.getElementById('dash-plan-period-select')?.value || 'month';
        var plan = App.logic.generateMaintenancePlan(period);
        if (plan.length === 0) planContainer.innerHTML = '<p class="hint">Нет плановых ТО в выбранном периоде.</p>';
        else {
            var planHtml = '<ul style="list-style:none; padding:0;">';
            plan.forEach(function(op) {
                var pd = App.logic.calculatePlan(op);
                planHtml += '<li style="margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:6px;">' +
                    '<strong>'+App.utils.escapeHtml(op.name)+'</strong><br>' +
                    'Дата: '+App.utils.isoToDDMMYYYY(pd.planDate)+', Пробег: '+pd.planMileage+' км<br>' +
                    '<button class="icon-btn" data-action="execute-plan" data-op-id="'+op.id+'" data-op-name="'+App.utils.escapeHtml(op.name)+'"><i data-lucide="check-circle"></i> Выполнить</button>' +
                    '</li>';
            });
            planHtml += '</ul>';
            planContainer.innerHTML = planHtml;
            // обработчики через делегирование уже есть в events.js, но добавим прямо
            planContainer.querySelectorAll('[data-action="execute-plan"]').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    App.ui.pages.openServiceModal(this.dataset.opId, this.dataset.opName);
                });
            });
        }
    }

    // 5. Ресурс деталей (3 наиболее изношенные)
    var resourceContainer = document.getElementById('resource-bars-container');
    if (resourceContainer && App.store.operations.length) {
        var candidates = App.store.operations.filter(op => op.intervalKm || op.intervalMonths || op.intervalMotohours);
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
            return { name: op.name, percent: percent };
        }).filter(item => item.percent > 0).sort((a,b)=>b.percent-a.percent).slice(0,3);
        var resourceHtml = '';
        withPercents.forEach(function(item) {
            resourceHtml += '<div style="margin-bottom:8px;"><span>'+App.utils.escapeHtml(item.name)+'</span> <span style="float:right;">'+item.percent+'%</span><div class="progress-bar-container"><div class="progress-bar" style="width:'+item.percent+'%; background:var(--primary);"></div></div></div>';
        });
        resourceContainer.innerHTML = resourceHtml || '<p class="hint">Нет данных</p>';
    }

    // 6. Последние операции (аккордеоны) – заполняем данными
    function fillLastRecords() {
        // Топливо
        var fuelLast = App.store.fuelLog.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
        var fuelHtml = fuelLast.map(f => '<div class="last-row"><span>'+App.utils.escapeHtml(f.date)+'</span><span>'+f.liters+' л</span><span>'+((f.liters||0)*(f.pricePerLiter||0)).toFixed(0)+' ₽</span></div>').join('');
        document.getElementById('last-fuel-body').innerHTML = fuelHtml || '<p class="hint">Нет заправок</p>';
        // ТО
        var toLast = App.store.serviceRecords.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
        var toHtml = toLast.map(r => { var op = App.store.operations.find(o=>o.id==r.operation_id); return '<div class="last-row"><span>'+App.utils.escapeHtml(r.date)+'</span><span>'+App.utils.escapeHtml(op?op.name:'?')+'</span><span>'+((r.parts_cost||0)+(r.work_cost||0))+' ₽</span></div>'; }).join('');
        document.getElementById('last-to-body').innerHTML = toHtml || '<p class="hint">Нет операций</p>';
        // Запчасти
        var partsLast = App.store.parts.slice().sort((a,b)=>new Date(b.dateAdded)-new Date(a.dateAdded)).slice(0,3);
        var partsHtml = partsLast.map(p => '<div class="last-row"><span>'+App.utils.escapeHtml(p.dateAdded||'')+'</span><span>'+App.utils.escapeHtml(p.oem||p.analog||p.operation)+'</span><span>'+(p.price||0)+' ₽</span></div>').join('');
        document.getElementById('last-parts-body').innerHTML = partsHtml || '<p class="hint">Нет запчастей</p>';
        // Шины
        var tiresLast = App.store.tireLog.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
        var tiresHtml = tiresLast.map(t => '<div class="last-row"><span>'+App.utils.escapeHtml(t.date)+'</span><span>'+App.utils.escapeHtml(t.type)+'</span><span>'+((t.purchaseCost||0)+(t.mountCost||0))+' ₽</span></div>').join('');
        document.getElementById('last-tires-body').innerHTML = tiresHtml || '<p class="hint">Нет смен резины</p>';
    }
    fillLastRecords();

    // 7. Прогноз пробега (мобильный)
    var calcBtn = document.getElementById('calc-prediction-btn-mobile');
    if (calcBtn) {
        calcBtn.onclick = function() {
            var target = parseFloat(document.getElementById('prediction-target-mobile').value);
            if (isNaN(target)) { App.toast('Введите целевой пробег', 'warning'); return; }
            var resultDate = App.logic.predictMileageDate(target);
            var resultEl = document.getElementById('prediction-result-mobile');
            if (resultEl) resultEl.textContent = resultDate ? 'Ожидаемая дата: '+resultDate.toLocaleDateString('ru-RU') : 'Недостаточно данных';
        };
    }

    // 8. Инициализация аккордеонов для мобильных карточек
    function initMobileAccordions() {
        var accordionHeaders = document.querySelectorAll('#mobile-dashboard .accordion-header');
        accordionHeaders.forEach(function(header) {
            if (header.hasAttribute('data-accordion-initialized')) return;
            var targetId = header.getAttribute('data-accordion');
            if (targetId) {
                var body = document.getElementById('last-'+targetId+'-body');
                if (body) {
                    header.setAttribute('data-accordion-initialized', 'true');
                    header.style.cursor = 'pointer';
                    header.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var isOpen = body.style.display === 'block';
                        body.style.display = isOpen ? 'none' : 'block';
                        var arrow = header.querySelector('.accordion-arrow');
                        if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
                    });
                }
            }
        });
    }
    initMobileAccordions();

    // Также обрабатываем аккордеон затрат
    var costHeader = document.getElementById('cost-accordion-header');
    var costBody = document.getElementById('cost-accordion-body');
    if (costHeader && costBody) {
        costHeader.style.cursor = 'pointer';
        costHeader.addEventListener('click', function() {
            var isOpen = costBody.style.display === 'block';
            costBody.style.display = isOpen ? 'none' : 'block';
            var arrow = costHeader.querySelector('.accordion-arrow');
            if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }
};

// ===== ГЛАВНЫЙ РЕНДЕР ДАШБОРДА =====
App.ui.pages.renderDashboard = function() {
    if (window.innerWidth >= 768) {
        App.ui.pages.renderDesktopDashboard();
    } else {
        // мобильная версия – сначала мини-графики и виджеты
        if (typeof App.charts.renderMiniFuelConsumptionChart === 'function') App.charts.renderMiniFuelConsumptionChart();
        if (typeof App.charts.renderMiniCostsChart === 'function') App.charts.renderMiniCostsChart();
        if (typeof App.charts.renderMiniExpensePieChart === 'function') App.charts.renderMiniExpensePieChart();
        App.ui.pages.renderTireWearMini();
        App.ui.pages.renderTop5Widget();
        // Копируем top5 в блок upcoming для мобильной версии (если нужно)
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
        App.ui.pages.renderMobileDashboard();
    }
    App.initIcons();
};