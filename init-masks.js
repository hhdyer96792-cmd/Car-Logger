// src/init-masks.js
// Инициализация масок ввода для дат (вынесено из inline-атрибутов для CSP)
(function() {
    // Маска для полей с датой в формате ДД-ММ-ГГГГ
    function applyDateMaskDDMMYYYY(event) {
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
    }

    // Маска для полей с датой в формате ГГГГ-ММ-ДД
    function applyDateMaskISO(event) {
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
    }

    // Вешаем обработчики на все поля с датой (динамически, так как они могут появляться после рендера)
    // Используем делегирование
    document.body.addEventListener('input', function(e) {
        var target = e.target;
        // Поля с атрибутом pattern или классом, указывающим на формат даты
        if (target.matches('input[pattern="\\d{2}-\\d{2}-\\d{4}"]') || 
            target.matches('input[placeholder*="ДД-ММ-ГГГГ"]') ||
            (target.id && (target.id.indexOf('date') !== -1 || target.id.indexOf('Date') !== -1))) {
            applyDateMaskDDMMYYYY(e);
        } else if (target.matches('input[pattern="\\d{4}-\\d{2}-\\d{2}"]') ||
                   target.matches('input[placeholder*="ГГГГ-ММ-ДД"]')) {
            applyDateMaskISO(e);
        }
    });

    // Также инициализируем маски для уже существующих полей при загрузке (на всякий случай)
    window.addEventListener('DOMContentLoaded', function() {
        var ddmmyyFields = document.querySelectorAll('input[pattern="\\d{2}-\\d{2}-\\d{4}"], input[placeholder*="ДД-ММ-ГГГГ"]');
        ddmmyyFields.forEach(function(field) {
            if (field.value && !field._maskInitialized) {
                var event = new Event('input', { bubbles: true });
                field.dispatchEvent(event);
                field._maskInitialized = true;
            }
        });
        var isoFields = document.querySelectorAll('input[pattern="\\d{4}-\\d{2}-\\d{2}"], input[placeholder*="ГГГГ-ММ-ДД"]');
        isoFields.forEach(function(field) {
            if (field.value && !field._maskInitialized) {
                var event = new Event('input', { bubbles: true });
                field.dispatchEvent(event);
                field._maskInitialized = true;
            }
        });
    });
})();