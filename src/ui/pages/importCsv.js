// src/ui/pages/importCsv.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

// Вспомогательная функция для проверки существования записи (поиск дубликатов)
async function checkDuplicate(type, record) {
    switch (type) {
        case 'to':
            return App.store.operations.some(op => 
                op.name === record.name && 
                op.category === record.category &&
                Math.abs((op.intervalKm || 0) - (record.intervalKm || 0)) < 100
            );
        case 'fuel':
            return App.store.fuelLog.some(f => 
                f.date === record.date && 
                Math.abs((f.mileage || 0) - (record.mileage || 0)) < 10
            );
        case 'tires':
            return App.store.tireLog.some(t => 
                t.date === record.date && 
                t.type === record.type
            );
        case 'parts':
            return App.store.parts.some(p => 
                (p.oem && record.oem && p.oem === record.oem) ||
                (p.analog && record.analog && p.analog === record.analog)
            );
        case 'mileage':
            // Проверка дубликата по дате и пробегу (±5 км)
            return App.store.mileageHistory.some(m => 
                m.date === record.date && Math.abs(m.mileage - record.mileage) <= 5
            );
        default:
            return false;
    }
}

// Валидация даты в формате YYYY-MM-DD или ДД.ММ.ГГГГ / ДД/ММ/ГГГГ
function isValidDate(dateStr) {
    if (!dateStr) return false;
    // Уже YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const d = new Date(dateStr);
        return !isNaN(d.getTime());
    }
    // DD.MM.YYYY или DD/MM/YYYY
    const parts = dateStr.split(/[.\/]/);
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900 && year < 2100) {
            const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const d = new Date(iso);
            return !isNaN(d.getTime());
        }
    }
    return false;
}

// Нормализация даты в ISO
function normalizeDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return isValidDate(dateStr) ? dateStr : null;
    }
    const parts = dateStr.split(/[.\/]/);
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900 && year < 2100) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    return null;
}

App.ui.pages.initCsvImport = function() {
    var container = document.getElementById('csv-import-container');
    if (!container) return;

    var html = '<p class="hint">Выберите тип данных и загрузите CSV‑файл. Первая строка должна содержать заголовки.</p>';
    html += '<div style="display:flex; gap:8px; margin-bottom:12px;">';
    html += '<select id="csv-import-type" style="flex:1;">';
    html += '<option value="to">Журнал ТО</option>';
    html += '<option value="fuel">Топливо</option>';
    html += '<option value="tires">Шины</option>';
    html += '<option value="parts">Запчасти</option>';
    html += '<option value="mileage">История пробега</option>';  // ДОБАВЛЕНО
    html += '</select>';
    html += '<button id="csv-download-template" class="secondary-btn">Шаблон</button>';
    html += '</div>';
    html += '<input type="file" id="csv-file-input" accept=".csv" style="display:none;">';
    html += '<button id="csv-import-btn" class="primary-btn">Загрузить и импортировать</button>';
    html += '<div id="csv-import-message" class="hint" style="margin-top:8px;"></div>';

    container.innerHTML = html;
    App.initIcons();

    var fileInput = document.getElementById('csv-file-input');
    var typeSelect = document.getElementById('csv-import-type');
    var importBtn = document.getElementById('csv-import-btn');
    var templateBtn = document.getElementById('csv-download-template');
    var msgDiv = document.getElementById('csv-import-message');

    // Кнопка "Шаблон" – скачивает CSV с заголовками
    templateBtn.addEventListener('click', function() {
        var type = typeSelect.value;
        var headers = [];
        var example = [];
        switch (type) {
            case 'to':
                headers = ['Категория', 'Операция', 'Последняя дата', 'Последний пробег', 'Последние моточасы', 'Интервал км', 'Интервал мес', 'Интервал м/ч'];
                example = ['ДВС', 'Замена масла', '2025-01-15', '50000', '1100', '10000', '12', '250'];
                break;
            case 'fuel':
                headers = ['Дата', 'Пробег', 'Литры', 'Цена/л', 'Полный бак', 'Тип топлива', 'Примечание'];
                example = ['2025-01-15', '50000', '45', '51.2', 'Да', 'Бензин', 'Заправка на трассе'];
                break;
            case 'tires':
                headers = ['Дата', 'Тип', 'Пробег', 'Модель', 'Размер', 'Износ', 'Примечание', 'Стоимость покупки', 'Стоимость монтажа', 'DIY'];
                example = ['2025-04-10', 'Лето', '52000', 'Pirelli Cinturato P7', '205/55R16', '7.5', '', '32000', '1500', 'Нет'];
                break;
            case 'parts':
                headers = ['Операция', 'OEM', 'Аналог', 'Цена', 'Поставщик', 'Ссылка', 'Комментарий', 'В наличии (шт.)', 'Место хранения'];
                example = ['Замена масла', '15208-65F0A', 'MANN W 610/80', '1200', 'Автодок', 'https://example.com', 'Масляный фильтр', '2', 'Гараж, полка 3'];
                break;
            case 'mileage':
                headers = ['Дата', 'Пробег', 'Моточасы'];
                example = ['2025-01-15', '12500', '320'];
                break;
        }
        var csvContent = headers.join(';') + '\n' + example.join(';');
        var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'template_' + type + '.csv';
        link.click();
    });

    importBtn.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            var text = ev.target.result;
            var lines = text.split(/\r?\n/).filter(function(line) { return line.trim() !== ''; });
            if (lines.length < 2) {
                msgDiv.textContent = 'Файл пуст или содержит только заголовки.';
                return;
            }
            var headers = lines[0].split(';').map(function(h) { return h.trim(); });
            var records = [];
            var errors = [];
            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(';');
                var obj = {};
                headers.forEach(function(header, idx) {
                    obj[header] = values[idx] ? values[idx].trim() : '';
                });
                records.push(obj);
            }
            msgDiv.textContent = 'Обработка ' + records.length + ' записей...';
            importRecordsWithValidation(typeSelect.value, records, msgDiv, headers);
        };
        reader.readAsText(file, 'UTF-8');
    });
};

// Функция импорта с валидацией и проверкой дубликатов
async function importRecordsWithValidation(type, records, msgDiv, headers) {
    var carId = App.store.activeCarId;
    if (!carId) {
        msgDiv.textContent = 'Сначала выберите автомобиль';
        return;
    }
    
    var success = 0;
    var errors = 0;
    var duplicates = 0;
    var invalidDates = 0;
    
    for (var i = 0; i < records.length; i++) {
        try {
            var rec = records[i];
            var isValid = true;
            
            switch (type) {
                case 'to':
                    if (rec['Последняя дата'] && !isValidDate(rec['Последняя дата']) && !normalizeDate(rec['Последняя дата'])) {
                        invalidDates++;
                        console.warn(`[Import] Неверный формат даты в строке ${i+2}: ${rec['Последняя дата']}`);
                        isValid = false;
                    }
                    if (!isValid) {
                        errors++;
                        continue;
                    }
                    var toRecord = {
                        category: rec['Категория'] || '',
                        name: rec['Операция'] || '',
                        lastDate: rec['Последняя дата'] ? (isValidDate(rec['Последняя дата']) ? rec['Последняя дата'] : normalizeDate(rec['Последняя дата'])) : null,
                        lastMileage: parseFloat(rec['Последний пробег']) || 0,
                        lastMotohours: parseFloat(rec['Последние моточасы']) || 0,
                        intervalKm: parseFloat(rec['Интервал км']) || 0,
                        intervalMonths: parseFloat(rec['Интервал мес']) || 0,
                        intervalMotohours: rec['Интервал м/ч'] ? parseFloat(rec['Интервал м/ч']) : null
                    };
                    if (await checkDuplicate('to', toRecord)) {
                        duplicates++;
                        continue;
                    }
                    await App.supa.saveOperation(toRecord);
                    success++;
                    break;
                    
                case 'fuel':
                    var fuelDate = normalizeDate(rec['Дата']);
                    if (!fuelDate) {
                        invalidDates++;
                        console.warn(`[Import] Неверный формат даты в строке ${i+2}: ${rec['Дата']}`);
                        errors++;
                        continue;
                    }
                    var fuelRecord = {
                        date: fuelDate,
                        mileage: parseFloat(rec['Пробег']) || 0,
                        liters: parseFloat(rec['Литры']) || 0,
                        pricePerLiter: parseFloat(rec['Цена/л']) || 0,
                        fullTank: rec['Полный бак'] === 'Да' ? 'TRUE' : '',
                        fuelType: rec['Тип топлива'] || 'Бензин',
                        notes: rec['Примечание'] || ''
                    };
                    if (await checkDuplicate('fuel', fuelRecord)) {
                        duplicates++;
                        continue;
                    }
                    await App.supa.saveFuelRecord(null, fuelRecord);
                    success++;
                    break;
                    
                case 'tires':
                    var tireDate = normalizeDate(rec['Дата']);
                    if (!tireDate) {
                        invalidDates++;
                        console.warn(`[Import] Неверный формат даты в строке ${i+2}: ${rec['Дата']}`);
                        errors++;
                        continue;
                    }
                    var tireRecord = {
                        date: tireDate,
                        type: rec['Тип'] || '',
                        mileage: parseFloat(rec['Пробег']) || 0,
                        model: rec['Модель'] || '',
                        size: rec['Размер'] || '',
                        wear: rec['Износ'] || '',
                        notes: rec['Примечание'] || '',
                        purchaseCost: parseFloat(rec['Стоимость покупки']) || 0,
                        mountCost: parseFloat(rec['Стоимость монтажа']) || 0,
                        isDIY: rec['DIY'] === 'Да' ? true : false
                    };
                    if (await checkDuplicate('tires', tireRecord)) {
                        duplicates++;
                        continue;
                    }
                    await App.supa.saveTireRecord(null, tireRecord);
                    success++;
                    break;
                    
                case 'parts':
                    var partsRecord = {
                        operation: rec['Операция'] || '',
                        oem: rec['OEM'] || '',
                        analog: rec['Аналог'] || '',
                        price: parseFloat(rec['Цена']) || 0,
                        supplier: rec['Поставщик'] || '',
                        link: rec['Ссылка'] || '',
                        comment: rec['Комментарий'] || '',
                        inStock: parseFloat(rec['В наличии (шт.)']) || 0,
                        location: rec['Место хранения'] || ''
                    };
                    if (await checkDuplicate('parts', partsRecord)) {
                        duplicates++;
                        continue;
                    }
                    await App.supa.savePart(partsRecord);
                    success++;
                    break;
                    
                case 'mileage':
                    var mileageDate = normalizeDate(rec['Дата']);
                    if (!mileageDate) {
                        invalidDates++;
                        console.warn(`[Import] Неверный формат даты в строке ${i+2}: ${rec['Дата']}`);
                        errors++;
                        continue;
                    }
                    var mileage = parseFloat(rec['Пробег']);
                    if (isNaN(mileage)) {
                        errors++;
                        console.warn(`[Import] Некорректный пробег в строке ${i+2}: ${rec['Пробег']}`);
                        continue;
                    }
                    var motohours = rec['Моточасы'] ? parseFloat(rec['Моточасы']) : 0;
                    if (isNaN(motohours)) motohours = 0;
                    
                    var mileageRecord = { date: mileageDate, mileage: mileage, motohours: motohours };
                    if (await checkDuplicate('mileage', mileageRecord)) {
                        duplicates++;
                        continue;
                    }
                    // Используем storage.addMileageRecord, чтобы запись попала в локальную БД и очередь синхронизации
                    await App.storage.addMileageRecord(mileageDate, mileage, motohours);
                    success++;
                    break;
            }
        } catch (e) {
            errors++;
            console.error('Import error:', e, records[i]);
        }
    }
    
    var message = `Готово: импортировано ${success} записей`;
    if (duplicates > 0) message += `, пропущено дубликатов: ${duplicates}`;
    if (invalidDates > 0) message += `, ошибок формата даты: ${invalidDates}`;
    if (errors > 0) message += `, ошибок: ${errors}`;
    msgDiv.textContent = message;
    
    // Обновляем данные в хранилище
    await App.storage.loadAllData();
    if (typeof App.ui.pages.renderHistoryCards === 'function') App.ui.pages.renderHistoryCards();
    if (typeof App.ui.pages.renderFuelTab === 'function') App.ui.pages.renderFuelTab();
    if (typeof App.ui.pages.renderTiresTab === 'function') App.ui.pages.renderTiresTab();
    if (typeof App.ui.pages.renderPartsTab === 'function') App.ui.pages.renderPartsTab();
    if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
    if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
}