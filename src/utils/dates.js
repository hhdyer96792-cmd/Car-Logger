// src/utils/dates.js
window.App = window.App || {};
App.utils = App.utils || {};

/**
 * Преобразование ДД-ММ-ГГГГ → YYYY-MM-DD
 * @param {string} dateStr - Дата в формате ДД-ММ-ГГГГ
 * @returns {string} Дата в формате YYYY-MM-DD или исходная строка
 */
App.utils.ddmmYYYYtoISO = function(dateStr) {
    if (!dateStr || !/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
    var parts = dateStr.split('-');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
};

/**
 * Преобразование YYYY-MM-DD → ДД-ММ-ГГГГ
 * @param {string} isoStr - Дата в формате YYYY-MM-DD
 * @returns {string} Дата в формате ДД-ММ-ГГГГ или исходная строка
 */
App.utils.isoToDDMMYYYY = function(isoStr) {
    if (!isoStr || isoStr.length !== 10) return isoStr;
    var parts = isoStr.split('-');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
};

/**
 * Маска ввода ISO (YYYY-MM-DD)
 * @param {Event} event - Событие ввода
 */
App.utils.applyDateMaskISO = function(event) {
    var input = event.target;
    var value = input.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    var formatted = '';
    if (value.length > 0) {
        formatted = value.substring(0, 4);
        if (value.length >= 5) formatted += '-' + value.substring(4, 6);
        if (value.length >= 7) formatted += '-' + value.substring(6, 8);
    }
    input.value = formatted;
};

/**
 * Маска ввода ДД-ММ-ГГГГ
 * @param {Event} event - Событие ввода
 */
App.utils.applyDateMaskDDMMYYYY = function(event) {
    var input = event.target;
    var value = input.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    var formatted = '';
    if (value.length > 0) {
        formatted = value.substring(0, 2);
        if (value.length >= 3) formatted += '-' + value.substring(2, 4);
        if (value.length >= 5) formatted += '-' + value.substring(4, 8);
    }
    input.value = formatted;
};

/**
 * Серийный номер даты Excel → ISO
 * @param {number} serial - Серийный номер даты Excel
 * @returns {string} YYYY-MM-DD или пустая строка
 */
App.utils.excelDateToISO = function(serial) {
    if (!serial || typeof serial !== 'number') return '';
    var d = new Date((serial - 25569) * 86400000);
    return d.toISOString().split('T')[0];
};

/**
 * Нормализация названия операции по ключевым словам.
 * @param {string} userInput - Ввод пользователя
 * @param {Array} operationsList - Список операций (объекты с полем name)
 * @returns {string} Нормализованное название или исходный ввод
 */
App.utils.normalizeOperationName = function(userInput, operationsList) {
    if (!userInput) return null;
    var input = userInput.trim().toLowerCase();
    var keywordsMap = App.config.KEYWORDS_MAP || [];
    for (var i = 0; i < keywordsMap.length; i++) {
        var map = keywordsMap[i];
        var match = map.keywords.every(function(kw) {
            return input.indexOf(kw) !== -1;
        });
        if (match) {
            var found = operationsList.find(function(op) {
                return op.name.toLowerCase() === map.canonicalPart.toLowerCase();
            });
            if (found) return found.name;
        }
    }
    var exactMatch = operationsList.find(function(op) {
        return op.name.toLowerCase() === input;
    });
    return exactMatch ? exactMatch.name : userInput;
};