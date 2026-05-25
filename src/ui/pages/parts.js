// src/ui/pages/parts.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// ---------- Точка входа ----------
App.ui.pages.renderPartsTab = function() {
    App.ui.pages.renderTotalPartsCost();
    App.ui.pages.renderPartsPeriodSwitch();
    App.ui.pages.renderPartsPieChart();
    App.ui.pages.renderWarehouseSummary();
    App.ui.pages.renderPartsCards(); // также рендерит строку поиска
};

// Поддержка старого вызова из events.js
App.ui.pages.renderPartsTable = function() { App.ui.pages.renderPartsTab(); };

// ---------- 1. Карточка «Всего затрат на запчасти» ----------
App.ui.pages.renderTotalPartsCost = function() {
    var total = (App.store.parts || []).reduce(function(s, p) { return s + (parseFloat(p.price) || 0); }, 0);
    var el = document.getElementById('parts-total-cost');
    if (el) el.textContent = total.toLocaleString() + ' ₽';
};

// ---------- 2. Селектор периода ----------
App.ui.pages.partsPeriod = 'all';
App.ui.pages.renderPartsPeriodSwitch = function() {
    var container = document.getElementById('parts-period-switch');
    if (!container) return;
    container.querySelectorAll('.period-btn').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.period === App.ui.pages.partsPeriod) btn.classList.add('active');
        btn.onclick = function() {
            App.ui.pages.partsPeriod = this.dataset.period;
            App.ui.pages.renderPartsPeriodSwitch();
            App.ui.pages.renderPartsPieChart();
            App.ui.pages.renderPartsCards(); // обновим карточки с фильтром по периоду, если нужно
        };
    });
};

// ---------- 3. Круговая диаграмма затрат по категориям ----------
App.ui.pages.renderPartsPieChart = function() {
    var canvas = document.getElementById('partsPieChart');
    if (!canvas) return;
    if (App.charts._partsPie) App.charts._partsPie.destroy();

    var parts = App.store.parts || [];
    var period = App.ui.pages.partsPeriod;
    var now = new Date();

    // Фильтрация по периоду, если не 'all' и есть dateAdded
    if (period !== 'all') {
        parts = parts.filter(function(p) {
            if (!p.dateAdded) return false;
            var d = new Date(p.dateAdded);
            if (period === 'month') {
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            } else if (period === 'quarter') {
                var qStart = Math.floor(now.getMonth() / 3) * 3;
                return d.getFullYear() === now.getFullYear() && d.getMonth() >= qStart && d.getMonth() < qStart + 3;
            } else if (period === 'year') {
                return d.getFullYear() === now.getFullYear();
            }
            return false;
        });
    }

    // Суммируем по категориям (operation)
    var catSums = {};
    parts.forEach(function(p) {
        var cat = p.operation || 'Без категории';
        catSums[cat] = (catSums[cat] || 0) + (parseFloat(p.price) || 0);
    });
    var labels = Object.keys(catSums);
    var data = labels.map(function(l) { return catSums[l]; });
    if (labels.length === 0) return;

    var ctx = canvas.getContext('2d');
    App.charts._partsPie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: ['#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'] }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
};

// ---------- 4. Сводка по складу ----------
App.ui.pages.renderWarehouseSummary = function() {
    var parts = App.store.parts || [];
    var totalPositions = parts.length;
    var totalSum = parts.reduce(function(s, p) { return s + (parseFloat(p.price) || 0); }, 0);
    var lowStock = parts.filter(function(p) { return (p.inStock || 0) === 1; }).length;
    var outOfStock = parts.filter(function(p) { return (p.inStock || 0) === 0; }).length;
    var html = '<div>Всего позиций: <strong>' + totalPositions + '</strong></div>' +
               '<div>На сумму: <strong>' + totalSum.toLocaleString() + ' ₽</strong></div>' +
               '<div>Заканчиваются (≤1): <strong style="color:var(--warning)">' + lowStock + '</strong></div>' +
               '<div>Нет в наличии: <strong style="color:var(--danger)">' + outOfStock + '</strong></div>';
    var container = document.getElementById('warehouse-summary');
    if (container) container.innerHTML = html;
};

// ---------- 5. Поиск и карточки запчастей ----------
App.ui.pages.renderPartsCards = function() {
    var container = document.getElementById('parts-cards-container');
    if (!container) return;

    // Строка поиска
    var searchHtml = '<div class="parts-search"><i data-lucide="search"></i><input type="text" id="parts-search-input" placeholder="Введите OEM или аналог..."></div>';
    container.innerHTML = searchHtml + '<div id="parts-accordions"></div>';

    // Функция фильтрации и рендера аккордеонов
    function filterAndRender() {
        var query = (document.getElementById('parts-search-input')?.value || '').toLowerCase();
        var allParts = App.store.parts || [];
        // Дополнительно фильтруем по периоду, если задан (только для дат)
        var period = App.ui.pages.partsPeriod;
        var now = new Date();
        var filtered = allParts.filter(function(p) {
            if (query && (p.oem || '').toLowerCase().indexOf(query) === -1 && (p.analog || '').toLowerCase().indexOf(query) === -1) return false;
            if (period !== 'all') {
                if (!p.dateAdded) return false;
                var d = new Date(p.dateAdded);
                if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
                if (period === 'quarter') {
                    var qStart = Math.floor(now.getMonth() / 3) * 3;
                    return d.getFullYear() === now.getFullYear() && d.getMonth() >= qStart && d.getMonth() < qStart + 3;
                }
                if (period === 'year') return d.getFullYear() === now.getFullYear();
                return false;
            }
            return true;
        });

        // Группировка по категориям
        var grouped = {};
        filtered.forEach(function(p) {
            var cat = p.operation || 'Без категории';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        });
        var cats = Object.keys(grouped).sort(function(a, b) {
            if (a === 'Прочее' || a === 'Без категории') return 1;
            if (b === 'Прочее' || b === 'Без категории') return -1;
            return a.localeCompare(b);
        });

        var html = '';
        cats.forEach(function(cat, idx) {
            var parts = grouped[cat];
            var openClass = '';
            html += '<div class="accordion-group">';
            html += '<div class="accordion-header' + openClass + '">';
            html += '<i data-lucide="tag"></i> ' + App.utils.escapeHtml(cat) + ' (' + parts.length + ')';
            html += '<i data-lucide="chevron-down" class="accordion-arrow" style="margin-left:auto;"></i>';
            html += '</div>';
            html += '<div class="accordion-body' + openClass + '">';
            parts.forEach(function(p) {
                var stock = p.inStock || 0;
                var stockColor = stock > 1 ? 'var(--success)' : (stock === 1 ? 'var(--warning)' : 'var(--danger)');
                html += '<div class="card-item expandable">';
                html += '<div class="card-header">';
                html += '<div class="card-summary">';
                html += '<strong>' + App.utils.escapeHtml(p.oem || p.analog || p.operation || '—') + '</strong>';
                html += '<div class="card-meta">' + (p.price ? p.price + ' ₽' : '—') + ' · В наличии: <span style="color:' + stockColor + '">' + stock + ' шт</span></div>';
                html += '</div>';
                html += '<button class="icon-btn card-toggle-btn"><i data-lucide="more-vertical"></i></button>';
                html += '</div>'; // card-header
                // Раскрывающиеся детали
                html += '<div class="card-details">';
                if (p.operation) html += '<div><strong>Операция:</strong> ' + App.utils.escapeHtml(p.operation) + '</div>';
                if (p.oem) html += '<div><strong>OEM:</strong> ' + App.utils.escapeHtml(p.oem) + '</div>';
                if (p.analog) html += '<div><strong>Аналог:</strong> ' + App.utils.escapeHtml(p.analog) + '</div>';
                html += '<div><strong>Цена:</strong> ' + (p.price || '—') + ' ₽</div>';
                html += '<div><strong>В наличии:</strong> <span style="color:' + stockColor + '">' + stock + ' шт</span></div>';
                if (p.supplier) html += '<div><strong>Поставщик:</strong> ' + App.utils.escapeHtml(p.supplier) + '</div>';
                if (p.link) html += '<div><strong>Ссылка:</strong> <a href="' + App.utils.escapeHtml(p.link) + '" target="_blank">' + App.utils.escapeHtml(p.link) + '</a></div>';
                if (p.location) html += '<div><strong>Место:</strong> ' + App.utils.escapeHtml(p.location) + '</div>';
                if (p.dateAdded) html += '<div><strong>Приобретено:</strong> ' + App.utils.escapeHtml(p.dateAdded) + '</div>';
                if (p.comment) html += '<div><strong>Прим.:</strong> ' + App.utils.escapeHtml(p.comment) + '</div>';
                html += '<div class="card-detail-actions">';
                html += '<button class="icon-btn" data-action="edit-part" data-id="' + p.id + '"><i data-lucide="pencil"></i></button>';
                html += '<button class="icon-btn" data-action="delete-part" data-id="' + p.id + '"><i data-lucide="trash-2"></i></button>';
                if (p.priceHistory && p.priceHistory.length > 1)
                    html += '<button class="icon-btn" data-action="price-history" data-id="' + p.id + '"><i data-lucide="trending-up"></i></button>';
                html += '<button class="icon-btn" data-action="search-part" data-oem="' + App.utils.escapeHtml(p.oem) + '"><i data-lucide="search"></i></button>';
                html += '</div>';
                html += '</div>'; // card-details
                html += '</div>'; // card-item
            });
            html += '</div></div>'; // accordion-body, accordion-group
        });

        var accordionsContainer = document.getElementById('parts-accordions');
        if (accordionsContainer) accordionsContainer.innerHTML = html;

        // Обработчики аккордеонов и раскрытия
        var allHeaders = document.querySelectorAll('#parts-accordions .accordion-header');
        allHeaders.forEach(function(header) {
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

        var toggleBtns = document.querySelectorAll('#parts-accordions .card-toggle-btn');
        toggleBtns.forEach(function(btn) {
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
    }

    // Первичный рендер
    filterAndRender();

    // Слушатель поиска
    var searchInput = document.getElementById('parts-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterAndRender();
        });
    }
};

// ---------- 6. Модальное окно (компактная форма) ----------
App.ui.pages.openPartForm = function(part) {
    var isEdit = !!part && !!part.id;
    var todayStr = App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);

    // Список операций для селекта
    var operationOptions = '<option value="">-- Выберите --</option>';
    (App.store.operations || []).forEach(function(op) {
        var selected = part && part.operation === op.name ? ' selected' : '';
        operationOptions += '<option value="' + App.utils.escapeHtml(op.name) + '"' + selected + '>' + App.utils.escapeHtml(op.name) + '</option>';
    });

    var content =
        '<form id="part-form">' +
            (isEdit ? '<input type="hidden" name="id" value="' + part.id + '">' : '') +
            '<div class="part-form-row">' +
                '<select name="operation" style="flex:2;">' + operationOptions + '</select>' +
                '<input type="text" name="oem" placeholder="OEM" value="' + App.utils.escapeHtml(part ? (part.oem || '') : '') + '" style="flex:2;">' +
                '<input type="text" name="analog" placeholder="Аналог" value="' + App.utils.escapeHtml(part ? (part.analog || '') : '') + '" style="flex:2;">' +
                '<input type="text" name="dateAdded" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + (part ? (part.dateAdded ? App.utils.isoToDDMMYYYY(part.dateAdded) : '') : todayStr) + '" style="flex:1;">' +
                '<input type="number" name="price" step="0.01" placeholder="Цена" value="' + (part ? (part.price || '') : '') + '" style="flex:1;">' +
            '</div>' +
            '<div class="part-form-row">' +
                '<input type="text" name="supplier" placeholder="Поставщик" value="' + App.utils.escapeHtml(part ? (part.supplier || '') : '') + '" style="flex:2;">' +
                '<input type="url" name="link" placeholder="Ссылка" value="' + App.utils.escapeHtml(part ? (part.link || '') : '') + '" style="flex:2;">' +
            '</div>' +
            '<div class="part-form-row">' +
                '<input type="text" name="location" placeholder="Место хранения" value="' + App.utils.escapeHtml(part ? (part.location || '') : '') + '" style="flex:2;">' +
                '<input type="number" name="inStock" min="0" step="1" placeholder="В наличии" value="' + (part ? (part.inStock || 0) : 0) + '" style="flex:1;">' +
            '</div>' +
            '<div class="part-form-row">' +
                '<textarea name="comment" placeholder="Примечание" rows="2" style="flex:1;">' + App.utils.escapeHtml(part ? (part.comment || '') : '') + '</textarea>' +
            '</div>' +
            '<div class="modal-actions" style="justify-content:flex-end;">' +
                '<button type="submit" class="primary-btn">Сохранить</button>' +
                '<button type="button" class="cancel-btn secondary-btn">Отмена</button>' +
            '</div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '<i data-lucide="pencil"></i> Запчасть' : '<i data-lucide="plus"></i> Запчасть', content);
    var form = modal.querySelector('#part-form');

    form.onsubmit = function(e) {
        e.preventDefault();
        var d = Object.fromEntries(new FormData(form));
        // Преобразование даты
        var dateAdded = d.dateAdded ? App.utils.ddmmYYYYtoISO(d.dateAdded) : null;
        var rowData = {
            id: d.id || null,
            uuid: part ? part.uuid : null,
            operation: d.operation,
            oem: d.oem,
            analog: d.analog,
            price: d.price,
            supplier: d.supplier,
            link: d.link,
            comment: d.comment,
            inStock: parseFloat(d.inStock) || 0,
            location: d.location,
            dateAdded: dateAdded
        };
        // Если редактируем и цена изменилась – добавим в историю цен
        if (isEdit && part && parseFloat(part.price) !== parseFloat(rowData.price)) {
            if (!part.priceHistory) part.priceHistory = [];
            part.priceHistory.push({ date: new Date().toISOString().split('T')[0], price: parseFloat(rowData.price), supplier: rowData.supplier || '' });
            rowData.priceHistory = part.priceHistory;
            App.store.savePriceHistory();
        } else if (!isEdit) {
            rowData.priceHistory = [];
        }

        modal.remove();

        if (App.config.USE_SUPABASE) {
            // Добавляем purchase_date для API
            rowData.purchaseDate = dateAdded;
            App.storage.savePart(rowData).then(function(res) {
                if (res && res.data && res.data.length > 0) rowData.id = res.data[0].id;
                var existingIdx = App.store.parts.findIndex(function(p) { return p.id == rowData.id; });
                if (existingIdx !== -1) {
                    App.store.parts[existingIdx] = rowData;
                } else {
                    App.store.parts.push(rowData);
                }
                App.store.saveToLocalStorage();
                App.ui.pages.renderPartsTab();
                App.toast(isEdit ? 'Запчасть обновлена' : 'Запчасть добавлена', 'success');
            }).catch(function(err) {
                console.error(err);
                App.toast('Ошибка сохранения', 'error');
            });
        } else {
            if (isEdit) {
                var idx = App.store.parts.findIndex(function(p) { return p.id == part.id; });
                if (idx !== -1) App.store.parts[idx] = rowData;
            } else {
                rowData.id = crypto.randomUUID();
                App.store.parts.push(rowData);
            }
            App.store.saveToLocalStorage();
            App.ui.pages.renderPartsTab();
            App.toast(isEdit ? 'Запчасть обновлена' : 'Запчасть добавлена', 'success');
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

// Остальные функции (deletePart, showCatalogMenu, showPriceHistoryChart) оставить без изменений
App.ui.pages.deletePart = function(partId) {
    if (!partId) return;
    App.storage.deletePart(partId).then(function() {
        App.storage.loadAllData();
        App.ui.pages.renderPartsTab();
        App.toast('Запчасть удалена', 'success');
    }).catch(function(err) { console.error(err); App.toast('Не удалось удалить запчасть', 'error'); });
};

App.ui.pages.showCatalogMenu = function(button, oem) {
    var existingMenu = document.querySelector('.catalog-popup-menu');
    if (existingMenu) existingMenu.remove();

    var rect = button.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'catalog-popup-menu';
    menu.style.cssText = 'position:fixed; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:8px 0; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:10000; min-width:150px;';

    var catalogs = [
        { name: 'Exist', url: 'https://exist.ru/price/?pcode=' + encodeURIComponent(oem) },
        { name: 'Drive2', url: 'https://www.drive2.ru/search?text=' + encodeURIComponent(oem) },
        { name: 'Basis', url: 'https://basis.ru/search?q=' + encodeURIComponent(oem) },
        { name: 'ZZap', url: 'https://www.zzap.ru/search?part_number=' + encodeURIComponent(oem) }
    ];

    catalogs.forEach(function(cat) {
        var item = document.createElement('div');
        item.textContent = cat.name;
        item.style.cssText = 'padding:8px 16px; cursor:pointer; white-space:nowrap; color:var(--text);';
        item.addEventListener('mouseenter', function() { item.style.background = 'var(--bg)'; });
        item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
        item.addEventListener('click', function() {
            window.open(cat.url, '_blank');
            menu.remove();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    var menuRect = menu.getBoundingClientRect();
    var top = rect.bottom + 5;
    var left = rect.left;
    if (left + menuRect.width > window.innerWidth - 10) left = window.innerWidth - menuRect.width - 10;
    if (left < 10) left = 10;
    if (top + menuRect.height > window.innerHeight - 10) top = rect.top - menuRect.height - 5;
    if (top < 10) top = Math.max(10, (window.innerHeight - menuRect.height) / 2);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    setTimeout(function() {
        var closeHandler = function(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
};

App.ui.pages.showPriceHistoryChart = function(part) {
    var history = part.priceHistory;
    if (!history || history.length < 2) {
        App.toast('Недостаточно данных для графика (нужно минимум 2 записи)', 'warning');
        return;
    }
    var sorted = history.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    var labels = sorted.map(function(h) { return h.date; });
    var prices = sorted.map(function(h) { return h.price; });

    var content = '<div style="width:100%; height:300px;"><canvas id="priceHistoryChart" style="width:100%; height:100%;"></canvas></div>' +
                  '<p class="hint">Изменение цены во времени. Данные сохраняются локально.</p>';
    var modal = App.ui.createModal('История цен: ' + part.operation + ' (' + (part.oem || part.analog) + ')', content);

    setTimeout(function() {
        var canvas = document.getElementById('priceHistoryChart');
        if (!canvas) return;

        if (App.charts.activeCharts['priceHistoryChart']) {
            App.charts.activeCharts['priceHistoryChart'].destroy();
            delete App.charts.activeCharts['priceHistoryChart'];
        }

        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['priceHistoryChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Цена (₽)',
                    data: prices,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52,152,219,0.1)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: { callbacks: { label: function(ctx) { return ctx.raw + ' ₽'; } } },
                    legend: { position: 'top' }
                },
                scales: { y: { title: { display: true, text: 'Цена (₽)' }, beginAtZero: false } }
            }
        });
        App.initIcons();
    }, 50);
};
