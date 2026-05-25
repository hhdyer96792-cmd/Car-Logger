// src/ui/pages/importCsv.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.initCsvImport = function() {
    var container = document.getElementById('csv-import-container');
    if (!container) return;

     var html = '<p class="hint">Выберите тип данных и загрузите CSV‑файл. Первая строка должна содержать заголовки.</p>';
 html += '<div style="display:flex; gap:8px; margin-bottom:12px;">';
 html += '<select id="csv-import-type" style="flex:1;">';
 html += '<option value="to">📋 Журнал ТО</option>';
 html += '<option value="fuel">⛽ Топливо</option>';
 html += '<option value="tires">🛞 Шины</option>';
 html += '<option value="parts">📦 Запчасти</option>';
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
        }
        var csvContent = headers.join(';') + '\n' + example.join(';');
        var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'template_' + type + '.csv';
        link.click();
    });

    // Открываем выбор файла при клике на кнопку импорта
    importBtn.addEventListener('click', function() {
        fileInput.click();
    });

    // Обработка выбранного файла
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
            // Первая строка – заголовки
            var headers = lines[0].split(';').map(function(h) { return h.trim(); });
            var records = [];
            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(';');
                var obj = {};
                headers.forEach(function(header, idx) {
                    obj[header] = values[idx] ? values[idx].trim() : '';
                });
                records.push(obj);
            }
            msgDiv.textContent = 'Импортируем ' + records.length + ' записей...';
            importRecords(typeSelect.value, records, msgDiv);
        };
        reader.readAsText(file, 'UTF-8');
    });
};

// Функция, сохраняющая записи в Supabase
async function importRecords(type, records, msgDiv) {
    var carId = App.store.activeCarId;
    if (!carId) {
        msgDiv.textContent = 'Сначала выберите автомобиль';
        return;
    }
    var success = 0;
    var errors = 0;

    for (var i = 0; i < records.length; i++) {
        try {
            var rec = records[i];
            switch (type) {
                case 'to':
                    await App.supa.saveOperation({
                        category: rec['Категория'] || '',
                        name: rec['Операция'] || '',
                        lastDate: rec['Последняя дата'] || null,
                        lastMileage: rec['Последний пробег'] || 0,
                        lastMotohours: rec['Последние моточасы'] || 0,
                        intervalKm: rec['Интервал км'] || 0,
                        intervalMonths: rec['Интервал мес'] || 0,
                        intervalMotohours: rec['Интервал м/ч'] || null
                    });
                    break;
                case 'fuel':
                    await App.supa.saveFuelRecord({
                        date: rec['Дата'] || '',
                        mileage: parseFloat(rec['Пробег']) || 0,
                        liters: parseFloat(rec['Литры']) || 0,
                        pricePerLiter: parseFloat(rec['Цена/л']) || 0,
                        fullTank: rec['Полный бак'] === 'Да' ? 'TRUE' : '',
                        fuelType: rec['Тип топлива'] || 'Бензин',
                        notes: rec['Примечание'] || ''
                    });
                    break;
                case 'tires':
                    await App.supa.saveTireRecord({
                        date: rec['Дата'] || '',
                        type: rec['Тип'] || '',
                        mileage: parseFloat(rec['Пробег']) || 0,
                        model: rec['Модель'] || '',
                        size: rec['Размер'] || '',
                        wear: rec['Износ'] || '',
                        notes: rec['Примечание'] || '',
                        purchaseCost: parseFloat(rec['Стоимость покупки']) || 0,
                        mountCost: parseFloat(rec['Стоимость монтажа']) || 0,
                        isDIY: rec['DIY'] === 'Да' ? true : false
                    });
                    break;
                case 'parts':
                    await App.supa.savePart({
                        operation: rec['Операция'] || '',
                        oem: rec['OEM'] || '',
                        analog: rec['Аналог'] || '',
                        price: parseFloat(rec['Цена']) || 0,
                        supplier: rec['Поставщик'] || '',
                        link: rec['Ссылка'] || '',
                        comment: rec['Комментарий'] || '',
                        inStock: parseFloat(rec['В наличии (шт.)']) || 0,
                        location: rec['Место хранения'] || ''
                    });
                    break;
            }
            success++;
        } catch (e) {
            errors++;
            console.error('Import error:', e);
        }
    }
    msgDiv.textContent = 'Готово: импортировано ' + success + ' записей' + (errors > 0 ? ', ошибок: ' + errors : '');
    App.storage.loadAllData(); // обновим данные
}