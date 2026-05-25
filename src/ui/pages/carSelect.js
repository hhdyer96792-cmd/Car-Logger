// src/ui/pages/carSelect.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

/**
 * Показать модальное окно выбора автомобиля
 */
App.showCarSelectModal = function() {
    // Загружаем сохранённые профили
    App.store.loadProfiles();
    var profiles = App.store.carProfiles;
    var currentId = App.store.spreadsheetId;

    // Строим список профилей с радиокнопками и полями для имени
    var optionsHtml = '';
    profiles.forEach(function(p, i) {
        var checked = (p.id === currentId) ? 'checked' : '';
        optionsHtml +=
            '<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">' +
                '<input type="radio" name="carProfile" value="' + App.utils.escapeHtml(p.id) + '" id="profile_' + i + '" ' + checked + '>' +
                '<input type="text" id="name_' + i + '" value="' + App.utils.escapeHtml(p.name) + '" style="flex:1; min-width:150px" placeholder="Имя авто">' +
                '<button type="button" class="icon-btn delete-profile-btn" data-id="' + App.utils.escapeHtml(p.id) + '"><i data-lucide="trash-2"></i></button>' +
            '</div>';
    });

    var content =
        '<form id="car-select-form">' +
            '<div style="max-height:300px; overflow-y:auto; margin-bottom:16px;">' +
                (optionsHtml || '<p>Нет сохранённых автомобилей</p>') +
            '</div>' +
            '<div style="border-top:1px solid var(--border); padding-top:16px;">' +
                '<label>Добавить новый автомобиль</label>' +
                '<input type="text" id="new-profile-id" placeholder="ID таблицы Google Sheets" style="margin-bottom:8px;">' +
                '<input type="text" id="new-profile-name" placeholder="Название (например, Vesta)" value="Мой автомобиль">' +
            '</div>' +
            '<div class="modal-actions">' +
                '<button type="submit" class="primary-btn">Загрузить</button>' +
                '<button type="button" class="cancel-btn secondary-btn">Отмена</button>' +
            '</div>' +
        '</form>';

    var modal = App.ui.createModal('🚗 Выбор автомобиля', content);

    // Обработчик удаления профиля
    modal.querySelectorAll('.delete-profile-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var id = btn.dataset.id;
            App.store.carProfiles = App.store.carProfiles.filter(function(p) { return p.id !== id; });
            App.store.saveProfiles();
            modal.remove();
            App.showCarSelectModal(); // перерисовываем окно
        });
    });

    var form = modal.querySelector('#car-select-form');
    form.onsubmit = function(e) {
        e.preventDefault();

        // Сохраняем изменения имён существующих профилей
        profiles.forEach(function(p, i) {
            var nameInput = document.getElementById('name_' + i);
            if (nameInput) p.name = nameInput.value.trim() || p.name;
        });
        App.store.saveProfiles();

        // Определяем выбранный профиль
        var selectedRadio = form.querySelector('input[name="carProfile"]:checked');
        if (selectedRadio) {
            var selectedId = selectedRadio.value;
            modal.remove();
            // Загружаем данные выбранной таблицы
            App.store.spreadsheetId = selectedId;
            App.store.setLastUsedProfileId(selectedId);
            App.store.addOrUpdateProfile(selectedId);
            App.loadSheet();
        } else {
            // Попытка добавить новый профиль
            var newId = document.getElementById('new-profile-id').value.trim();
            var newName = document.getElementById('new-profile-name').value.trim();
            if (!newId) {
                App.toast('Введите ID таблицы', 'warning');
                return;
            }
            modal.remove();
            App.store.spreadsheetId = newId;
            App.store.setLastUsedProfileId(newId);
            App.store.addOrUpdateProfile(newId, newName || 'Мой автомобиль');
            App.loadSheet();
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};