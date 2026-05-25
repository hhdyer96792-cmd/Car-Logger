// src/ui/pages/tires.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// ---------- Главная точка входа при открытии вкладки ----------
App.ui.pages.renderTiresTab = function() {
    App.ui.pages.renderTotalTiresCost();
    App.ui.pages.renderTireWearBars();
    App.ui.pages.renderTiresCards();
    App.ui.pages.renderTireCalculator(); // калькулятор не меняется
};

// Поддержка старого вызова из events.js
App.ui.pages.renderTiresTable = function() {
    App.ui.pages.renderTiresTab();
};

// ---------- 1. Карточка «Всего затрат на колёса» ----------
App.ui.pages.renderTotalTiresCost = function() {
    var total = (App.store.tireLog || []).reduce(function(sum, t) {
        return sum + (parseFloat(t.purchaseCost) || 0) + (parseFloat(t.mountCost) || 0) + (parseFloat(t.diskCost) || 0);
    }, 0);
    var el = document.getElementById('tires-total-cost');
    if (el) el.textContent = total.toLocaleString() + ' ₽';
};

// ---------- 3. Прогресс-бары остатка протектора ----------
App.ui.pages.renderTireWearBars = function() {
    var container = document.getElementById('tire-wear-container');
    if (!container) return;

    var summerTires = App.store.tireLog.filter(function(t) { return t.type === 'Лето'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var winterTires = App.store.tireLog.filter(function(t) { return t.type === 'Зима'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var summer = summerTires[0];
    var winter = winterTires[0];

    function buildWearBar(tire, type) {
        if (!tire) {
            return '<div class="wear-item"><h4>' + type + '</h4><p class="hint">Нет данных</p></div>';
        }
        var depth = parseFloat(tire.wear) || 0;
        var newDepth, critical;
        if (type === 'Лето') {
            newDepth = 7.0; critical = 1.6;
        } else {
            newDepth = 8.0; critical = 4.0;
        }
        depth = Math.max(0, depth);
        var percent = ((depth - critical) / (newDepth - critical)) * 100;
        percent = Math.min(100, Math.max(0, percent));
        var color, statusText;
        if (type === 'Лето') {
            if (depth > 4.0) { color = 'var(--success)'; statusText = 'Безопасно'; }
            else if (depth >= 3.0) { color = 'var(--warning)'; statusText = 'Внимание'; }
            else if (depth >= 2.5) { color = '#f39c12'; statusText = 'Предел'; }
            else { color = 'var(--danger)'; statusText = 'Критично'; }
        } else {
            if (depth > 6.0) { color = 'var(--success)'; statusText = 'Безопасно'; }
            else if (depth >= 5.0) { color = 'var(--warning)'; statusText = 'Внимание'; }
            else if (depth >= 4.0) { color = '#f39c12'; statusText = 'Предел'; }
            else { color = 'var(--danger)'; statusText = 'Критично'; }
        }
        var totalCost = (parseFloat(tire.purchaseCost) || 0) + (parseFloat(tire.mountCost) || 0) + (parseFloat(tire.diskCost) || 0);
        var pricePerKm = 0;
        if (tire.mileage > 0) {
            pricePerKm = totalCost / tire.mileage;
        }
        return '<div class="wear-item" style="flex:1; min-width:200px;">' +
            '<h4>' + type + ': ' + App.utils.escapeHtml(tire.model || '') + ' ' + App.utils.escapeHtml(tire.size || '') + '</h4>' +
            '<div>Пробег: ' + (tire.mileage || 0) + ' км · Глубина: ' + depth.toFixed(1) + ' мм</div>' +
            '<div>Цена/пробег: ' + pricePerKm.toFixed(2) + ' ₽/км</div>' +
            '<div class="progress-label">Остаток протектора</div>' +
            '<div class="progress-bar-container" style="height:14px;"><div class="progress-bar" style="width:' + percent + '%; background:' + color + ';"></div></div>' +
            '<div style="display:flex; justify-content:space-between; font-size:0.8rem;">' +
                '<span>' + statusText + '</span><span>' + percent.toFixed(0) + '%</span>' +
            '</div>' +
        '</div>';
    }

    container.innerHTML = buildWearBar(summer, 'Лето') + buildWearBar(winter, 'Зима');
    App.initIcons();
};

// ---------- 5. Карточки истории шин ----------
App.ui.pages.renderTiresCards = function() {
    var container = document.getElementById('tires-cards-container');
    if (!container) return;
    var sorted = (App.store.tireLog || []).filter(function(t) { return t.date; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    if (sorted.length === 0) {
        container.innerHTML = '<p class="hint">Нет данных</p>';
        return;
    }
    var html = '';
    sorted.forEach(function(t) {
        var originalIndex = App.store.tireLog.indexOf(t);
        var depth = parseFloat(t.wear) || 0;
        var totalCost = (parseFloat(t.purchaseCost) || 0) + (parseFloat(t.mountCost) || 0) + (parseFloat(t.diskCost) || 0);
        html += '<div class="card-item">';
        html += '<div class="card-header" style="justify-content:space-between;">';
        html += '<div class="card-summary">';
        html += '<strong>' + App.utils.escapeHtml(t.date) + ' · ' + (t.type || '—') + ' · ' + App.utils.escapeHtml(t.model || '') + ' ' + App.utils.escapeHtml(t.size || '') + '</strong>';
        html += '<div class="card-meta">Пробег: ' + (t.mileage || '—') + ' км · Глубина протектора: ' + depth.toFixed(1) + ' мм</div>';
        html += '<div class="card-meta">Покупка: ' + (t.purchaseCost || '0') + ' ₽ · Монтаж: ' + (t.mountCost || '0') + ' ₽' + (t.isDIY ? ' (DIY)' : '') + '</div>';
        if (t.diskCost > 0) html += '<div class="card-meta">Диски: ' + t.diskCost + ' ₽</div>';
        if (t.notes) html += '<div class="card-meta">Прим.: ' + App.utils.escapeHtml(t.notes) + '</div>';
        html += '</div>';
        html += '<button class="icon-btn tire-toggle-btn"><i data-lucide="more-vertical"></i></button>';
        html += '</div>'; // card-header
        html += '<div class="card-detail-actions" style="display:none; padding:8px 12px; justify-content:flex-end;">';
        html += '<button class="icon-btn" data-action="edit-tire" data-idx="' + originalIndex + '"><i data-lucide="pencil"></i></button>';
        html += '<button class="icon-btn" data-action="delete-tire" data-idx="' + originalIndex + '"><i data-lucide="trash-2"></i></button>';
        html += '</div>';
        html += '</div>'; // card-item
    });

    container.innerHTML = html;

    container.querySelectorAll('.tire-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var card = btn.closest('.card-item');
            var actions = card.querySelector('.card-detail-actions');
            if (actions) {
                var visible = actions.style.display === 'flex';
                actions.style.display = visible ? 'none' : 'flex';
                var icon = btn.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', visible ? 'more-vertical' : 'more-horizontal');
                    App.initIcons();
                }
            }
        });
    });

    App.initIcons();
};

// ---------- КАЛЬКУЛЯТОР (существующий код, без изменений) ----------
App.ui.pages.parseTireSize = function(sizeStr) {
    var match = sizeStr.match(/(\d+)[\/\-](\d+)[\/\-R](\d+)/i);
    if (!match) return null;
    return { width: parseInt(match[1]), aspect: parseInt(match[2]), diameter: parseInt(match[3]) };
};

App.ui.pages.calculateTireDiameter = function(width, aspect, diameter) {
    var sidewallHeight = (width * aspect) / 100;
    var diameterMm = diameter * 25.4;
    return diameterMm + sidewallHeight * 2;
};

App.ui.pages.formatTireInput = function(inputElement) {
    var val = inputElement.value.replace(/\D/g, '');
    if (val.length === 0) return;
    var formatted = '';
    if (val.length <= 3) {
        formatted = val;
    } else if (val.length <= 5) {
        formatted = val.slice(0, 3) + '/' + val.slice(3);
    } else {
        formatted = val.slice(0, 3) + '/' + val.slice(3, 5) + 'R' + val.slice(5, 7);
    }
    inputElement.value = formatted;
};

App.ui.pages.initTireInputs = function() {
    if (App.ui.pages._tireInputsInitialized) return;
    var oldInput = document.getElementById('old-tire-size');
    var newInput = document.getElementById('new-tire-size');
    if (!oldInput || !newInput) return;
    var handler = function(e) { App.ui.pages.formatTireInput(e.target); };
    oldInput.addEventListener('input', handler);
    newInput.addEventListener('input', handler);
    App.ui.pages._tireInputsInitialized = true;
};

App.ui.pages.renderTireCalculator = function() {
    var oldInput = document.getElementById('old-tire-size');
    var newInput = document.getElementById('new-tire-size');
    var calcBtn = document.getElementById('calc-tire-btn');
    var resultDiv = document.getElementById('tire-calc-result');
    if (!calcBtn) return;
    App.ui.pages.initTireInputs();
    var newBtn = calcBtn.cloneNode(true);
    calcBtn.parentNode.replaceChild(newBtn, calcBtn);
    newBtn.addEventListener('click', function() {
        var oldSize = oldInput ? oldInput.value.trim() : '';
        var newSize = newInput ? newInput.value.trim() : '';
        if (!oldSize || !newSize) {
            resultDiv.innerHTML = '<i data-lucide="alert-triangle"></i> Введите оба размера (пример: 205/55R16)';
            App.initIcons();
            return;
        }
        oldSize = oldSize.replace(/\s/g, '');
        newSize = newSize.replace(/\s/g, '');
        var oldParsed = App.ui.pages.parseTireSize(oldSize);
        var newParsed = App.ui.pages.parseTireSize(newSize);
        if (!oldParsed || !newParsed) {
            resultDiv.innerHTML = '<i data-lucide="alert-circle"></i> Неверный формат. Используйте: Ширина/ПрофильRДиаметр (205/55R16)';
            App.initIcons();
            return;
        }
        var oldDiameter = App.ui.pages.calculateTireDiameter(oldParsed.width, oldParsed.aspect, oldParsed.diameter);
        var newDiameter = App.ui.pages.calculateTireDiameter(newParsed.width, newParsed.aspect, newParsed.diameter);
        var diffPercent = ((newDiameter - oldDiameter) / oldDiameter) * 100;
        var recommendation = Math.abs(diffPercent) > 2.5
            ? '<i data-lucide="alert-triangle"></i> Отклонение более 2.5% — не рекомендуется, спидометр будет врать.'
            : '<i data-lucide="check-circle"></i> Отклонение в пределах нормы (до 2.5%).';
        resultDiv.innerHTML =
            '<i data-lucide="ruler"></i> Диаметр старой шины: ' + oldDiameter.toFixed(1) + ' мм<br>' +
            '<i data-lucide="ruler"></i> Диаметр новой шины: ' + newDiameter.toFixed(1) + ' мм<br>' +
            '<i data-lucide="bar-chart-2"></i> Разница: ' + diffPercent.toFixed(2) + '%<br>' +
            '<i data-lucide="car"></i> При реальной скорости 100 км/ч спидометр будет показывать ' + (100 / (1 + diffPercent/100)).toFixed(1) + ' км/ч<br>' +
            recommendation;
        App.initIcons();
    });
};

// ---------- МОДАЛЬНОЕ ОКНО (с добавленными дисками) ----------
App.ui.pages.openTireModal = function(record) {
    var isEdit = !!(record && record.id);
    var defaultDate = record ? App.utils.isoToDDMMYYYY(record.date) : App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);
    var typeValue = record ? (record.type || 'Лето') : 'Лето';
    var isNewSet = record ? (record.mileage === 0 && record.purchaseCost) : false;
    var hasDisks = !!(record && record.diskCost && parseFloat(record.diskCost) > 0);

    var content =
        '<form id="tire-form">' +
            (isEdit ? '<input type="hidden" name="id" value="' + record.id + '">' : '') +
            '<div style="display:flex; gap:8px; align-items:center;">' +
                '<label style="margin-bottom:0;">Дата</label>' +
                '<input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + App.utils.escapeHtml(defaultDate) + '" style="width:110px;">' +
                '<label style="margin-bottom:0;">Пробег</label>' +
                '<input type="number" name="currentMileage" value="' + (record ? record.mileage : App.store.settings.currentMileage) + '" required style="width:100px;">' +
                '<button type="button" id="tire-type-toggle" class="tire-type-btn ' + (typeValue === 'Лето' ? 'summer' : 'winter') + '" style="padding:8px 12px;">' + typeValue + '</button>' +
                '<input type="hidden" name="type" value="' + typeValue + '">' +
            '</div>' +
            '<div style="display:flex; gap:8px; align-items:center; margin-top:8px;">' +
                '<label style="margin-bottom:0;">Шиномонтаж (₽)</label>' +
                '<input type="number" name="mountCost" step="0.01" value="' + (record ? (record.mountCost || '') : '') + '" style="width:100px;">' +
                '<label style="margin-bottom:0;">Протектор</label>' +
                '<input type="number" name="wear" step="0.1" value="' + (record ? (record.wear || '') : '') + '" style="width:70px;">' +
                '<span style="font-size:0.85rem;">мм</span>' +
            '</div>' +
            '<div style="display:flex; gap:12px; align-items:center; margin:8px 0;">' +
                '<label><input type="checkbox" name="isNewSet" id="isNewSetCheckbox" ' + (isNewSet ? 'checked' : '') + '> Новый комплект</label>' +
                '<label><input type="checkbox" name="hasDisks" ' + (hasDisks ? 'checked' : '') + '> Диски</label>' +
                '<label><input type="checkbox" name="isDIY" value="true" ' + (record && record.isDIY ? 'checked' : '') + '> Сделал сам</label>' +
            '</div>' +
            '<div id="diskFields" style="display:' + (hasDisks ? 'block' : 'none') + '; margin-bottom:8px;">' +
                '<label>Стоимость дисков (₽)</label>' +
                '<input type="number" name="diskCost" step="0.01" value="' + (record ? (record.diskCost || '') : '') + '">' +
            '</div>' +
            '<label>Примечание</label>' +
            '<input type="text" name="notes" value="' + App.utils.escapeHtml(record ? (record.notes || '') : '') + '">' +
            '<div id="newSetFields" style="display:' + (isNewSet ? 'block' : 'none') + ';">' +
                '<label>Название модели</label><input type="text" name="model" value="' + App.utils.escapeHtml(record ? (record.model || '') : '') + '">' +
                '<label>Размерность</label><input type="text" name="size" placeholder="205/55R16" oninput="App.ui.pages.formatTireInput(this)" value="' + App.utils.escapeHtml(record ? (record.size || '') : '') + '">' +
                '<label>Стоимость покупки (₽)</label><input type="number" name="purchaseCost" step="0.01" value="' + (record ? (record.purchaseCost || '') : '') + '">' +
            '</div>' +
            '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '<i data-lucide="circle"></i> Редактировать запись шин' : '<i data-lucide="circle"></i> Сменить резину', content);

    // Переключатель Лето/Зима с цветом
    var typeToggle = modal.querySelector('#tire-type-toggle');
    var typeInput = modal.querySelector('[name="type"]');
    if (typeToggle && typeInput) {
        typeToggle.addEventListener('click', function() {
            var newType = typeInput.value === 'Лето' ? 'Зима' : 'Лето';
            typeInput.value = newType;
            typeToggle.textContent = newType;
            typeToggle.className = 'tire-type-btn ' + (newType === 'Лето' ? 'summer' : 'winter');
            // обновить подсказку глубины
            var wearUnit = modal.querySelector('#wear-unit');
            if (wearUnit) wearUnit.textContent = newType === 'Зима' ? '%' : 'мм';
        });
    }

    // Чекбоксы
    modal.querySelector('#isNewSetCheckbox').addEventListener('change', function(e) {
        modal.querySelector('#newSetFields').style.display = e.target.checked ? 'block' : 'none';
    });

    var diskCheckbox = modal.querySelector('[name="hasDisks"]');
    var diskFields = modal.querySelector('#diskFields');
    if (diskCheckbox && diskFields) {
        diskCheckbox.addEventListener('change', function() {
            diskFields.style.display = this.checked ? 'block' : 'none';
        });
    }

    var form = modal.querySelector('#tire-form');
    form.onsubmit = function(e) {
        e.preventDefault();
        var formEl = e.target;
        var d = Object.fromEntries(new FormData(formEl));
        var isNew = d.isNewSet === 'on';
        var currentMileage = App.utils.validateNumberInput(formEl.querySelector('[name="currentMileage"]'), false);
        if (currentMileage === null) return;

        var mountCost = App.utils.validateNumberInput(formEl.querySelector('[name="mountCost"]'), true, true) || 0;
        var purchaseCost = App.utils.validateNumberInput(formEl.querySelector('[name="purchaseCost"]'), true, true) || 0;
        var diskCost = App.utils.validateNumberInput(formEl.querySelector('[name="diskCost"]'), true, true) || 0;

        var dateISO = App.utils.ddmmYYYYtoISO(d.date);
        modal.remove();

        var existingUuid = (record && record.uuid) ? record.uuid : crypto.randomUUID();
        var existingUpdatedAt = (record && record.updated_at) ? record.updated_at : new Date().toISOString();

        var rowData = {
            id: d.id || null,
            uuid: existingUuid,
            updated_at: existingUpdatedAt,
            date: dateISO,
            type: d.type,
            mileage: currentMileage,
            model: d.model || '',
            size: d.size || '',
            wear: d.wear || '',
            notes: d.notes || '',
            purchaseCost: purchaseCost,
            mountCost: mountCost,
            diskCost: diskCost,
            isDIY: d.isDIY === 'true'
        };

        if (App.config.USE_SUPABASE) {
            App.storage.saveTireRecord(d.id, rowData)
                .then(function(res) {
                    if (res && res.data && res.data.length > 0) rowData.id = res.data[0].id;
                    if (isEdit) {
                        var idx = App.store.tireLog.findIndex(function(t) { return t.id == d.id; });
                        if (idx !== -1) App.store.tireLog[idx] = rowData;
                    } else {
                        App.store.tireLog.push(rowData);
                    }
                    App.store.saveToLocalStorage();
                    App.ui.pages.renderTiresTab();
                    App.toast(isEdit ? 'Запись о шинах обновлена' : 'Резина добавлена', 'success');
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка сохранения в Supabase', 'error');
                });
        } else {
            if (isEdit) {
                var idx = App.store.tireLog.findIndex(function(t) { return t.id == d.id; });
                if (idx !== -1) App.store.tireLog[idx] = rowData;
            } else {
                App.store.tireLog.push(rowData);
            }
            App.store.saveToLocalStorage();
            App.ui.pages.renderTiresTab();
            App.toast(isEdit ? 'Запись о шинах обновлена' : 'Резина добавлена', 'success');
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.deleteTireEntry = function(idx) {
    var tire = App.store.tireLog[idx];
    if (!tire || !tire.id) { App.toast('Запись не найдена', 'error'); return; }
    App.storage.deleteTireRecord(tire.id).then(function() {
        App.storage.loadAllData();
        App.ui.pages.renderTiresTab();
        App.toast('Запись о шинах удалена', 'success');
    }).catch(function(err) {
        console.error(err);
        App.toast('Не удалось удалить запись (недостаточно прав)', 'error');
    });
};