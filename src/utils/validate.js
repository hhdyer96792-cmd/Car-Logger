// src/utils/validate.js
window.App = window.App || {};
App.utils = App.utils || {};

/**
 * Проверяет числовое поле ввода и визуально подсвечивает ошибку.
 * @param {HTMLInputElement} input - элемент ввода
 * @param {boolean} [allowFloat=true] - разрешены ли дробные числа
 * @param {boolean} [allowEmpty=false] - разрешено ли пустое значение
 * @returns {number|null} числовое значение или null при ошибке
 */
App.utils.validateNumberInput = function(input, allowFloat, allowEmpty) {
    allowFloat = (allowFloat !== false);
    allowEmpty = (allowEmpty === true);
    var raw = input.value.trim();
    if (raw === '' && allowEmpty) {
        input.style.borderColor = '';
        return null;
    }
    var num = allowFloat ? parseFloat(raw) : parseInt(raw, 10);
    if (isNaN(num) || (allowFloat && raw.match(/[^0-9.,\-]/)) || (!allowFloat && raw.match(/[^0-9\-]/))) {
        input.style.borderColor = 'var(--danger)';
        input.focus();
        App.toast('Проверьте правильность числа', 'error');
        return null;
    }
    input.style.borderColor = '';
    return num;
};

/**
 * Быстрая проверка, что дата в поле соответствует формату YYYY-MM-DD или DD-MM-YYYY.
 * @param {string} dateStr
 * @param {string} format - 'iso' или 'ddmmyyyy'
 * @returns {string|null} дата в ISO или null
 */
App.utils.validateDateField = function(dateStr, format) {
    if (!dateStr) return null;
    if (format === 'iso') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            var d = new Date(dateStr);
            if (!isNaN(d.getTime())) return dateStr;
        }
    } else if (format === 'ddmmyyyy') {
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            var parts = dateStr.split('-');
            var d = new Date(parts[2], parts[1]-1, parts[0]);
            if (!isNaN(d.getTime())) return parts[2] + '-' + parts[1] + '-' + parts[0];
        }
    }
    App.toast('Неверный формат даты', 'error');
    return null;
};