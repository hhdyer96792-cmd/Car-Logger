// src/ui/pages/maintenance.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// Флаг для однократного закрытия аккордеонов при первом рендере
App.ui.pages._toAccordionsInitialized = false;

// throttle для renderTOTable
let lastRenderTime = 0;
let renderTimer = null;
var originalRenderTOTable = App.ui.pages.renderTOTable;
App.ui.pages.renderTOTable = function() {
    var now = Date.now();
    if (now - lastRenderTime < 100) {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(function() {
            originalRenderTOTable();
            lastRenderTime = Date.now();
        }, 100);
        return;
    }
    lastRenderTime = now;
    originalRenderTOTable();
};

// 0. Карточка «Всего затрат на ТО»
App.ui.pages.renderTotalCost = function() {
    var total = App.store.serviceRecords.reduce(function(sum, r) {
        return sum + (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
    }, 0);
    var el = document.getElementById('to-total-cost-value');
    if (el) el.textContent = total.toLocaleString() + ' ₽';
};

// 1. Объединённая статистика 2×2
App.ui.pages.renderTOStats = function() {
    document.getElementById('to-mileage').textContent = App.store.settings.currentMileage.toLocaleString();
    document.getElementById('to-motohours').textContent = App.store.settings.currentMotohours.toLocaleString();
    document.getElementById('to-avg-mileage').textContent = (App.store.settings.avgDailyMileage || 0).toFixed(1);
    document.getElementById('to-avg-motohours').textContent = (App.store.settings.avgDailyMotohours || 1.65).toFixed(2);
};

// 2. Прогресс-бары ресурса (три наиболее изношенные операции)
App.ui.pages.renderResourceBars = function() {
    var container = document.getElementById('to-resource-bars-container');
    if (!container) return;
    if (!App.store.operations || App.store.operations.length === 0) {
        container.innerHTML = '<p class="hint">Нет данных</p>';
        return;
    }

    var candidates = App.store.operations.filter(function(op) {
        return op.intervalKm || op.intervalMonths || op.intervalMotohours;
    });

    var withPercents = candidates.map(function(op) {
        var plan = App.logic.calculatePlan(op);
        var percent = 0;
        if (op.intervalKm && plan.planMileage > (op.lastMileage || 0))
            percent = Math.min(100, Math.round((App.store.settings.currentMileage - (op.lastMileage || 0)) / (plan.planMileage - (op.lastMileage || 0)) * 100));
        else if (op.intervalMotohours && plan.recMotohours > (op.lastMotohours || 0))
            percent = Math.min(100, Math.round((App.store.settings.currentMotohours - (op.lastMotohours || 0)) / (plan.recMotohours - (op.lastMotohours || 0)) * 100));
        else if (op.intervalMonths && op.lastDate) {
            var totalDays = op.intervalMonths * 30;
            var elapsed = Math.floor((new Date() - new Date(op.lastDate)) / 86400000);
            percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
        }
        return { name: op.name, percent: percent };
    }).filter(function(item) { return item.percent > 0; }).sort(function(a, b) { return b.percent - a.percent; });

    var top3 = withPercents.slice(0, 3);
    var html = '';
    top3.forEach(function(item) {
        var p = item.percent;
        var color = p > 70 ? 'var(--danger)' : (p > 30 ? 'var(--warning)' : 'var(--success)');
        html += '<div class="resource-row">';
        html += '<span class="resource-name">' + App.utils.escapeHtml(item.name) + '</span>';
        html += '<span class="resource-percent">' + p + '%</span>';
        html += '</div>';
        html += '<div class="progress-bar-container"><div class="progress-bar" style="width:' + p + '%; background:' + color + ';"></div></div>';
    });
    container.innerHTML = html || '<p class="hint">Нет данных</p>';
};

// 3. Гистограмма затрат на ТО
App.ui.pages.renderTOCostChart = function() {
    var period = document.getElementById('to-cost-period')?.value || 'month';
    var canvas = document.getElementById('toCostChart');
    if (!canvas) return;
    if (App.charts._toCostChart) App.charts._toCostChart.destroy();

    var records = App.store.serviceRecords.slice().filter(function(r) { return r.date; });
    if (records.length === 0) {
        var chartCard = canvas.closest('.chart-card');
        if (chartCard) chartCard.innerHTML = '<h3><i data-lucide="bar-chart-3"></i> Затраты на ТО</h3><p class="hint">Нет данных</p>';
        App.initIcons();
        return;
    }

    var now = new Date();
    var data = [];
    var labels = [];
    if (period === 'month') {
        for (var w = 0; w < 4; w++) {
            var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() || 7) + 1 - (3 - w) * 7);
            var end = new Date(start);
            end.setDate(start.getDate() + 6);
            labels.push((w + 1).toString());
            var sum = 0;
            records.forEach(function(r) {
                var d = new Date(r.date);
                if (d >= start && d <= end) sum += (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
            });
            data.push(sum);
        }
    } else {
        var monthsCount = period === 'quarter' ? 3 : (period === '6months' ? 6 : 12);
        var currentMonth = now.getMonth();
        var currentYear = now.getFullYear();
        for (var i = monthsCount - 1; i >= 0; i--) {
            var m = currentMonth - i;
            var y = currentYear;
            if (m < 0) { m += 12; y--; }
            labels.push(new Date(y, m, 1).toLocaleString('ru', { month: 'short', year: '2-digit' }));
            var sum = 0;
            records.forEach(function(r) {
                var d = new Date(r.date);
                if (d.getMonth() === m && d.getFullYear() === y) sum += (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
            });
            data.push(sum);
        }
    }

    var ctx = canvas.getContext('2d');
    App.charts._toCostChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Затраты на ТО (₽)',
                data: data,
                backgroundColor: 'rgba(231, 76, 60, 0.7)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
};

// 4. Круговая диаграмма категорий ТО
App.ui.pages.renderTOCategoryPieChart = function() {
    var canvas = document.getElementById('toCategoryPieChart');
    if (!canvas) return;
    if (App.charts._toCategoryPieChart) App.charts._toCategoryPieChart.destroy();

    if (App.store.serviceRecords.length === 0) {
        var chartCard = canvas.closest('.chart-card');
        if (chartCard) chartCard.innerHTML = '<h3><i data-lucide="pie-chart"></i> Затраты по категориям</h3><p class="hint">Нет данных</p>';
        App.initIcons();
        return;
    }

    var categoryCosts = {};
    App.store.serviceRecords.forEach(function(rec) {
        var op = App.store.operations.find(function(o) { return o.id == rec.operation_id; });
        if (!op) return;
        var cat = op.category || 'Прочее';
        var cost = (Number(rec.parts_cost) || 0) + (Number(rec.work_cost) || 0);
        categoryCosts[cat] = (categoryCosts[cat] || 0) + cost;
    });

    var labels = Object.keys(categoryCosts);
    var data = labels.map(function(cat) { return categoryCosts[cat]; });
    var total = data.reduce(function(a, b) { return a + b; }, 0);

    var ctx = canvas.getContext('2d');
    App.charts._toCategoryPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            var value = context.raw;
                            var percent = ((value / total) * 100).toFixed(1);
                            return context.label + ': ' + value.toFixed(0) + ' ₽ (' + percent + '%)';
                        }
                    }
                }
            }
        }
    });
};

// Карточка ресурса масла (прогресс-бар)
App.ui.pages.renderOilResourceCard = function() {
    if (typeof App.charts.renderOilResourceBar === 'function') {
        App.charts.renderOilResourceBar();
    }
    var container = document.getElementById('oil-resource-bar');
    if (!container) return;
    var fill = container.querySelector('.oil-resource-fill');
    if (!fill || fill.style.width === '0%' || fill.style.width === '') {
        container.style.display = 'none';
    } else {
        container.style.display = '';
    }
};

// 5. Карточки операций (аккордеоны по категориям)
App.ui.pages.renderTOTable = function() {
    var container = document.getElementById('to-cards-container');
    if (!container) return;
    if (!App.store.operations || App.store.operations.length === 0) {
        container.innerHTML = '<p class="hint">Нет данных</p>';
        return;
    }

    var grouped = {};
    App.store.operations.forEach(function(op) {
        if (!grouped[op.category]) grouped[op.category] = [];
        grouped[op.category].push(op);
    });

    var categories = Object.keys(grouped).sort(function(a, b) {
        if (a === 'Прочее') return 1;
        if (b === 'Прочее') return -1;
        return a.localeCompare(b);
    });

    var categoryIcons = {
        'ДВС': 'settings',
        'Вариатор': 'git-branch',
        'Тормозная система': 'disc',
        'Подвеска': 'activity',
        'Зажигание': 'zap',
        'Охлаждение': 'thermometer',
        'ГРМ': 'clock',
        'Навесное': 'pocket',
        'Трансмиссия': 'git-merge',
        'Топливная система': 'fuel',
        'Сезонное': 'sun',
        'Документы': 'file-text',
        'Прочее': 'more-horizontal'
    };

    var html = '';
    categories.forEach(function(cat) {
        var ops = grouped[cat].sort(function(a, b) {
            return App.logic.calculatePlan(a).daysLeft - App.logic.calculatePlan(b).daysLeft;
        });
        html += '<div class="accordion-group">';
        html += '<div class="accordion-header">';
        html += '<i data-lucide="' + (categoryIcons[cat] || 'folder') + '"></i>';
        html += '<span>' + App.utils.escapeHtml(cat) + ' (' + ops.length + ')</span>';
        html += '<i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>';
        html += '</div>';
        html += '<div class="accordion-body">';

        ops.forEach(function(op) {
            var plan = App.logic.calculatePlan(op);
            var motoFresh = true;
            if (op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1 && App.store.mileageHistory.length >= 1) {
                var lastEntry = App.store.mileageHistory[App.store.mileageHistory.length - 1];
                if ((App.store.settings.currentMotohours - lastEntry.motohours) > 20 ||
                    (App.store.settings.currentMileage - lastEntry.mileage) > 500) {
                    motoFresh = false;
                }
            }

            var daysLeft = plan.daysLeft;
            var statusClass = '';
            if (daysLeft < 0) statusClass = 'overdue';
            else if (daysLeft <= 10) statusClass = 'critical';
            else statusClass = 'ok';

            var percent = 0;
            if (op.intervalKm && plan.planMileage > (op.lastMileage || 0))
                percent = Math.min(100, Math.round((App.store.settings.currentMileage - (op.lastMileage || 0)) / (plan.planMileage - (op.lastMileage || 0)) * 100));
            else if (op.intervalMotohours && motoFresh && plan.recMotohours > (op.lastMotohours || 0))
                percent = Math.min(100, Math.round((App.store.settings.currentMotohours - (op.lastMotohours || 0)) / (plan.recMotohours - (op.lastMotohours || 0)) * 100));
            else if (op.intervalMonths && op.lastDate) {
                var totalDays = op.intervalMonths * 30;
                var elapsed = Math.floor((new Date() - new Date(op.lastDate)) / 86400000);
                percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
            }
            var progressColor = percent > 70 ? 'var(--danger)' : (percent > 30 ? 'var(--warning)' : 'var(--success)');
            html += '<div class="card-item expandable" data-op-id="' + op.id + '">';
            html += '<div class="card-header">';
            html += '<span class="status-dot ' + statusClass + '"></span>';
            html += '<div class="card-summary">';
            html += '<strong>' + App.utils.escapeHtml(op.name) + '</strong>';
            html += '<div class="card-meta">' +
                (op.lastDate ? App.utils.isoToDDMMYYYY(op.lastDate) : '—') + ' · ' +
                (op.lastMileage || '—') + ' км · ' +
                (op.lastMotohours || '—') + ' м/ч' +
            '</div>';
            html += '<div class="card-plan">План: ' + App.utils.isoToDDMMYYYY(plan.planDate) + ' (' + plan.planMileage + ' км)';
            if (daysLeft < 0) html += ' <span class="text-danger">просрочено на ' + Math.abs(daysLeft) + ' дн.</span>';
            else html += ' осталось ' + daysLeft + ' дн.';
            html += '</div>';
            html += '</div>';
            html += '<div class="card-actions">';
            html += '<button class="icon-btn" data-action="add-record" data-op-id="' + op.id + '" data-op-name="' + App.utils.escapeHtml(op.name) + '"><i data-lucide="check"></i></button>';
            html += '<button class="icon-btn card-toggle-btn"><i data-lucide="more-vertical"></i></button>';
            html += '</div>';
            html += '</div>';

            html += '<div class="card-details">';
            html += '<div class="progress-percent">Износ: ' + percent + '%</div>';
            html += '<div class="progress-bar-container"><div class="progress-bar" style="width:' + percent + '%; background:' + progressColor + ';"></div></div>';
            html += '<div class="card-detail-actions">';
            html += '<button class="icon-btn" data-action="edit-op" data-op-id="' + op.id + '"><i data-lucide="pencil"></i></button>';
            html += '<button class="icon-btn" data-action="shopping-list" data-op-id="' + op.id + '"><i data-lucide="shopping-cart"></i></button>';
            html += '<button class="icon-btn" data-action="delete-op" data-op-id="' + op.id + '"><i data-lucide="trash-2"></i></button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });

        html += '</div></div>';
    });

    container.innerHTML = html;

    // При первом рендере закрываем все аккордеоны, при повторных – оставляем как есть
    if (!App.ui.pages._toAccordionsInitialized) {
        container.querySelectorAll('.accordion-body').forEach(function(body) {
            body.classList.remove('open');
        });
        container.querySelectorAll('.accordion-header').forEach(function(header) {
            header.classList.remove('open');
        });
        App.ui.pages._toAccordionsInitialized = true;
    }

    // Обработчики аккордеонов
    container.querySelectorAll('.accordion-header').forEach(function(header) {
        header.addEventListener('click', function() {
            var body = header.nextElementSibling;
            if (body && body.classList.contains('accordion-body')) {
                body.classList.toggle('open');
                header.classList.toggle('open');
                var arrow = header.querySelector('.accordion-arrow');
                if (arrow) arrow.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    });

    container.querySelectorAll('.card-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var card = btn.closest('.card-item');
            if (card) {
                card.classList.toggle('expanded');
                var icon = btn.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', card.classList.contains('expanded') ? 'more-horizontal' : 'more-vertical');
                    App.initIcons();
                }
            }
        });
    });

    App.initIcons();
};

// === СУЩЕСТВУЮЩИЕ ФУНКЦИИ (БЕЗ ДУБЛИКАТОВ) ===

App.ui.pages.openServiceModal = function(opId, opName) {
    var op = App.store.operations.find(function(o) { return o.id == opId; });
    if (!op) return;
    var isOsago = (op.category === 'Документы' && op.name.indexOf('ОСАГО') !== -1);
    var today = App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);

    var content = '<form id="service-form" enctype="multipart/form-data">' +
        '<input type="hidden" name="opId" value="' + opId + '"><p><strong>' + App.utils.escapeHtml(opName) + '</strong></p>' +
        '<label>Дата (ДД-ММ-ГГГГ)</label>' +
        '<input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + today + '">' +
        '<label>Пробег, км</label><input type="number" name="mileage" value="' + App.store.settings.currentMileage + '">' +
        '<label>Моточасы</label><input type="text" inputmode="decimal" name="motohours" value="' + App.store.settings.currentMotohours + '">';

    if (isOsago) {
        content += '<label>Стоимость полиса, ₽</label><input type="number" name="cost" step="0.01">' +
            '<label>Ссылка на файл (Google Drive)</label><input type="url" name="fileLink" placeholder="https://drive.google.com/...">' +
            '<label>Срок действия (мес.)</label><input type="number" name="osagoMonths" value="12" min="1" max="12">';
    } else {
        content += '<h4><i data-lucide="wrench"></i> Запчасти</h4><label>Стоимость, ₽</label><input type="number" name="cost" step="0.01">' +
            '<h4><i data-lucide="wrench"></i> Работы</h4><label>Стоимость, ₽</label><input type="number" name="workCost" step="0.01">' +
            '<label><input type="checkbox" name="isDIY" value="true"> Сделал сам</label>';
    }

    content += '<h4><i data-lucide="camera"></i> Фото</h4>' +
        '<div id="drop-area" class="drop-area"><i data-lucide="upload-cloud"></i> <span class="drop-text">Перетащите фото сюда или кликните для выбора</span><input type="file" id="photo-input" name="photo" accept="image/*" multiple style="display:none;"></div>' +
        '<div id="photo-preview" class="photo-preview"></div>' +
        '<label>Примечание</label><input type="text" name="notes">' +
        '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal('<i data-lucide="wrench"></i> Выполнить ТО', content);
    var dropArea = modal.querySelector('#drop-area');
    var fileInput = modal.querySelector('#photo-input');
    var previewContainer = modal.querySelector('#photo-preview');
    var selectedFiles = [];

    function updatePreview(files, container) {
        container.innerHTML = '';
        files.forEach(function(file, idx) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                var img = document.createElement('img');
                img.src = ev.target.result;
                img.title = file.name;
                container.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    }

    dropArea.addEventListener('click', function() { fileInput.click(); });
    dropArea.addEventListener('dragover', function(e) { e.preventDefault(); dropArea.classList.add('drag-over'); });
    dropArea.addEventListener('dragleave', function() { dropArea.classList.remove('drag-over'); });
    dropArea.addEventListener('drop', function(e) {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        var files = Array.from(e.dataTransfer.files).filter(function(f) { return f.type.startsWith('image/'); });
        if (files.length) {
            selectedFiles = files;
            updatePreview(selectedFiles, previewContainer);
        }
    });
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length) {
            selectedFiles = Array.from(e.target.files);
            updatePreview(selectedFiles, previewContainer);
        }
    });

    var form = modal.querySelector('#service-form');
    form.onsubmit = function(e) {
        e.preventDefault();
        var formEl = e.target;
        var mileage = App.utils.validateNumberInput(formEl.querySelector('[name="mileage"]'), false);
        var motohours = App.utils.validateNumberInput(formEl.querySelector('[name="motohours"]'), true, true);
        var cost = App.utils.validateNumberInput(formEl.querySelector('[name="cost"]'), true, true);
        var workCost = App.utils.validateNumberInput(formEl.querySelector('[name="workCost"]'), true, true);
        if (mileage === null) return;

        var formattedDate = App.utils.ddmmYYYYtoISO(formEl.querySelector('[name="date"]').value);
        if (!formattedDate) {
            App.toast('Неверный формат даты', 'error');
            return;
        }

        var refPoint = {
            purchaseDate: App.store.purchaseDate,
            baseMileage: App.store.baseMileage || 0,
            baseMotohours: App.store.baseMotohours || 0
        };
        var validationError = App.logic.validateMaintenanceRecord(
            formattedDate, mileage, motohours, refPoint, App.store.serviceRecords,
            opName, op.category
        );
        if (validationError) {
            App.toast(validationError, 'error');
            return;
        }

        var data = new FormData(formEl);
        modal.remove();

        var notes = data.get('notes') || '';
        var isDIY = data.get('isDIY') === 'true';

        var uploadPromises = [];
        if (selectedFiles.length > 0) {
            for (var i = 0; i < selectedFiles.length; i++) {
                uploadPromises.push(App.supa.uploadPhoto(selectedFiles[i]).catch(function(err) {
                    console.error('Photo upload error:', err);
                    return '';
                }));
            }
        }

        if (!navigator.onLine) {
            var offlineRecord = {
                operation_id: op.id,
                date: formattedDate,
                mileage: mileage,
                motohours: motohours || 0,
                parts_cost: cost || 0,
                work_cost: workCost || 0,
                is_diy: isDIY,
                notes: notes,
                photo_url: ''
            };
            App.store.serviceRecords.unshift(offlineRecord);
            App.store.addPendingAction({
                type: 'service',
                opId: op.id,
                date: formattedDate,
                mileage: mileage,
                motohours: motohours || 0,
                partsCost: cost || 0,
                workCost: workCost || 0,
                isDIY: isDIY,
                notes: notes,
                photoUrl: ''
            });
            op.lastDate = formattedDate;
            op.lastMileage = mileage;
            op.lastMotohours = motohours || 0;
            App.store.saveToLocalStorage();
            App.toast('Запись сохранена локально. Синхронизируется при подключении к сети.', 'warning');
            if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
            return;
        }

        Promise.all(uploadPromises).then(function(photoUrls) {
            var photoUrl = photoUrls.filter(function(url) { return url !== ''; })[0] || '';
            var fullNotes = notes;
            if (isOsago) fullNotes = 'ОСАГО. Стоимость: ' + cost + ' ₽. Срок: ' + (data.get('osagoMonths') || '12') + ' мес. Ссылка: ' + (data.get('fileLink') || '') + '. ' + notes;
           // if (photoUrls.length) fullNotes += '\nФото: ' + photoUrls.join(', ');

            if (App.config.USE_SUPABASE) {
                var record = {
                    operation_id: op.id,
                    date: formattedDate,
                    mileage: mileage,
                    motohours: motohours || 0,
                    parts_cost: cost || 0,
                    work_cost: workCost || 0,
                    is_diy: isDIY,
                    notes: fullNotes,
                    photo_url: photoUrl
                };
                App.storage.addHistoryRecord(record)
                    .then(function() {
                        op.lastDate = formattedDate;
                        op.lastMileage = mileage;
                        op.lastMotohours = motohours || 0;
                        return App.storage.saveOperation(op);
                    })
                    .then(function() {
                        App.toast('ТО успешно выполнено', 'success');
                        App.storage.loadAllData();
                    }).catch(function(err) {
                        console.error(err);
                        App.toast('Ошибка сохранения ТО', 'error');
                    });
            } else {
                App.logic.addServiceRecord(opId, formattedDate, mileage, motohours, cost, workCost, isDIY, fullNotes, photoUrl)
                    .then(function() {
                        var normalizedMainName = App.utils.normalizeOperationName(opName, App.store.operations);
                        var partsForOp = App.store.parts.filter(function(p) {
                            var normPartOp = App.utils.normalizeOperationName(p.operation, App.store.operations);
                            return normPartOp === normalizedMainName || p.operation === op.category;
                        });
                        partsForOp.forEach(function(part) {
                            var stock = part.inStock || 0;
                            if (stock > 0) {
                                part.inStock = stock - 1;
                                App.storage.savePart(part);
                            }
                        });
                        App.logic.addDependentOperations(opName, opId, formattedDate, mileage, motohours, 'Автоматически');
                        App.toast('ТО успешно выполнено', 'success');
                    })
                    .catch(function(error) {
                        console.error(error);
                        App.toast('Ошибка сохранения', 'error');
                    });
            }
        });
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.openOperationForm = function(op) {
    var isEdit = !!op;
    var categoryOptions = ['ДВС', 'Вариатор', 'Тормозная система', 'Подвеска', 'Зажигание', 'Охлаждение', 'ГРМ', 'Навесное', 'Трансмиссия', 'Топливная система', 'Сезонное', 'Документы', 'Прочее'];
    var optionsHtml = '';
    categoryOptions.forEach(function(cat) {
        var selected = (op && op.category === cat) ? ' selected' : '';
        optionsHtml += '<option value="' + cat + '"' + selected + '>' + cat + '</option>';
    });

    var content = '<form id="op-form"><input type="hidden" name="id" value="' + (op ? op.id : '') + '"><input type="hidden" name="rowIndex" value="' + (op ? op.rowIndex : '') + '">' +
        '<label>Категория</label><select name="category" required>' + optionsHtml + '</select>' +
        '<label>Название</label><input type="text" name="name" value="' + App.utils.escapeHtml(op ? op.name : '') + '" required>' +
        '<label>Интервал, км</label><input type="number" name="km" value="' + (op ? op.intervalKm : '') + '">' +
        '<label>Интервал, мес</label><input type="number" name="months" value="' + (op ? op.intervalMonths : '') + '">' +
        '<label>Интервал, моточасов</label><input type="number" name="moto" value="' + (op ? op.intervalMotohours : '') + '">' +
        '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '<i data-lucide="pencil"></i> Редактировать' : '<i data-lucide="plus"></i> Новая операция', content);
    var form = modal.querySelector('#op-form');
    form.onsubmit = function(e) {
        e.preventDefault();
        var d = Object.fromEntries(new FormData(form));
        modal.remove();
        App.logic.saveOperation(d).catch(function(err) { console.warn(err); });
    };
    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.generateShoppingList = function(opId) {
    var op = App.store.operations.find(function(o) { return o.id == opId; });
    if (!op) return;
    var items = App.store.parts.filter(function(p) { return p.operation === op.name || p.operation === op.category; });
    if (!items.length) { alert('Нет запчастей для этой операции'); return; }
    var list = '🛒 ' + op.name + ':\n';
    items.forEach(function(p) {
        var stock = p.inStock || 0;
        var location = p.location ? ' (' + p.location + ')' : '';
        if (stock > 0) {
            list += '- ' + (p.oem || p.analog) + ' ' + (p.price ? p.price + '₽' : '') + ' — ✅ есть на складе: ' + stock + ' шт.' + location + '\n';
        } else {
            list += '- ' + (p.oem || p.analog) + ' ' + (p.price ? p.price + '₽' : '') + ' — ❌ нужно купить\n';
        }
    });
    alert(list);
};

// Глобальная функция генерации ICS (используется в events.js и dashboard.js)
function generateICS(plan) {
    var now = new Date().toISOString().replace(/[-:]/g, '').slice(0,15) + 'Z';
    var ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vesta Dashboard//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
    plan.forEach(function(op) {
        var planData = App.logic.calculatePlan(op);
        if (!planData.planDate) return;
        var dtStart = planData.planDate.replace(/-/g, '') + 'T090000';
        var dtEnd = planData.planDate.replace(/-/g, '') + 'T100000';
        var uid = op.id + '-vesta-' + planData.planDate;
        var summary = 'ТО: ' + op.name;

        var parts = App.store.parts.filter(function(p) {
            return p.operation === op.name || p.operation === op.category;
        });
        var partsList = '';
        if (parts.length > 0) {
            partsList = '\\n\\nСписок запчастей:\\n';
            parts.forEach(function(p) {
                var status = (p.inStock && p.inStock > 0) ? '✅' : '☐';
                partsList += status + ' ' + (p.oem || p.analog || p.operation) + (p.price ? ' (' + p.price + '₽)' : '') + '\\n';
            });
        }

        var description = 'Пробег: ' + planData.planMileage + ' км. Категория: ' + (op.category || '') + partsList;

        ics += 'BEGIN:VEVENT\r\n';
        ics += 'UID:' + uid + '\r\n';
        ics += 'DTSTART:' + dtStart + '\r\n';
        ics += 'DTEND:' + dtEnd + '\r\n';
        ics += 'SUMMARY:' + summary + '\r\n';
        ics += 'DESCRIPTION:' + description + '\r\n';
        ics += 'DTSTAMP:' + now + '\r\n';
        ics += 'END:VEVENT\r\n';
    });
    ics += 'END:VCALENDAR\r\n';
    return ics;
}
