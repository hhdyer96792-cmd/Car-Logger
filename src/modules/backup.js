// src/modules/backup.js
window.App = window.App || {};
App.backup = App.backup || {};

/**
 * Экспортирует все данные пользователя в зашифрованный ZIP-архив.
 * @param {string} masterPassword - мастер-пароль для шифрования
 * @returns {Promise<Blob>} - Blob с ZIP-архивом
 */
App.backup.exportAllData = async function(masterPassword) {
    if (!masterPassword || masterPassword.length < 8) {
        throw new Error('Мастер-пароль не задан или слишком короткий');
    }

    // 1. Собираем все данные из IndexedDB и Store
    const data = {
        version: App.config.APP_VERSION || '2.1.0',
        timestamp: Date.now(),
        cars: App.store.cars || [],
        operations: App.store.operations || [],
        fuelLog: App.store.fuelLog || [],
        tireLog: App.store.tireLog || [],
        parts: App.store.parts || [],
        serviceRecords: App.store.serviceRecords || [],
        mileageHistory: App.store.mileageHistory || [],
        carDocuments: App.ui.pages?._carDocuments || [],
        settings: App.store.settings || {},
        baseMileage: App.store.baseMileage,
        baseMotohours: App.store.baseMotohours,
        purchaseDate: App.store.purchaseDate,
        purchaseCost: App.store.purchaseCost,
        premiumTier: App.store.premiumTier,
        premiumExpiresAt: App.store.premiumExpiresAt
    };

    // 2. Преобразуем в JSON
    const jsonStr = JSON.stringify(data, null, 2);
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(jsonStr);

    // 3. Генерируем случайную соль и IV
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 4. Выводим ключ из пароля (PBKDF2)
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterPassword),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 600000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt']
    );

    // 5. Шифруем данные
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        plaintext
    );

    // 6. Формируем массив для ZIP: [salt, iv, encryptedData]
    const encryptedArray = new Uint8Array(encrypted);
    const saltArray = salt;
    const ivArray = iv;

    // 7. Создаём ZIP через JSZip
    const JSZip = window.JSZip;
    if (!JSZip) throw new Error('JSZip не загружен');

    const zip = new JSZip();
    zip.file('data.enc', encryptedArray);
    zip.file('salt.bin', saltArray);
    zip.file('iv.bin', ivArray);
    // Добавляем метаинформацию
    zip.file('meta.json', JSON.stringify({
        version: data.version,
        timestamp: data.timestamp,
        algorithm: 'AES-GCM',
        saltLength: saltArray.length,
        ivLength: ivArray.length
    }));

    // 8. Генерируем ZIP-архив как Blob
    const blob = await zip.generateAsync({ type: 'blob' });
    return blob;
};

/**
 * Импортирует данные из зашифрованного ZIP-архива.
 * @param {File} file - ZIP-файл, созданный exportAllData
 * @param {string} masterPassword - мастер-пароль
 * @param {boolean} replaceAll - заменить все данные (true) или объединить (false)
 * @returns {Promise<Object>} - результат импорта (количество записей)
 */
App.backup.importFromZip = async function(file, masterPassword, replaceAll = false) {
    if (!file || !masterPassword) {
        throw new Error('Не указан файл или пароль');
    }

    const JSZip = window.JSZip;
    if (!JSZip) throw new Error('JSZip не загружен');

    // 1. Читаем ZIP как ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 2. Извлекаем компоненты
    const saltFile = zip.file('salt.bin');
    const ivFile = zip.file('iv.bin');
    const dataFile = zip.file('data.enc');
    const metaFile = zip.file('meta.json');

    if (!saltFile || !ivFile || !dataFile) {
        throw new Error('Некорректный файл резервной копии (отсутствуют необходимые компоненты)');
    }

    const saltArray = new Uint8Array(await saltFile.async('arraybuffer'));
    const ivArray = new Uint8Array(await ivFile.async('arraybuffer'));
    const encryptedArray = new Uint8Array(await dataFile.async('arraybuffer'));

    // 3. Восстанавливаем ключ
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterPassword),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltArray,
            iterations: 600000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['decrypt']
    );

    // 4. Дешифруем
    let decrypted;
    try {
        decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivArray },
            key,
            encryptedArray
        );
    } catch (e) {
        throw new Error('Неверный мастер-пароль или повреждённые данные');
    }

    // 5. Парсим JSON
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decrypted);
    const imported = JSON.parse(jsonStr);

    // 6. Проверяем версию (предупреждение, если версия не совпадает)
    if (imported.version !== App.config.APP_VERSION) {
        console.warn(`Версия бэкапа (${imported.version}) отличается от текущей (${App.config.APP_VERSION})`);
        // Не прерываем, но предупреждаем пользователя
        if (typeof App.toast === 'function') {
            App.toast('Версия бэкапа отличается от версии приложения. Возможны проблемы.', 'warning');
        }
    }

    // 7. Импортируем данные (с заменой или слиянием)
    if (replaceAll) {
        // Очищаем все существующие данные (кроме автомобилей, если они уже есть – решаем по ситуации)
        await App.backup._clearAllUserData();
    }

    const stats = {
        cars: 0,
        operations: 0,
        fuelLog: 0,
        tireLog: 0,
        parts: 0,
        serviceRecords: 0,
        mileageHistory: 0,
        carDocuments: 0
    };

    // Импорт автомобилей (с проверкой дубликатов)
    for (const car of imported.cars || []) {
        const exists = App.store.cars.some(c => c.id === car.id);
        if (!exists || !replaceAll) {
            await App.db.put('cars', car);
            if (!exists) App.store.cars.push(car);
            stats.cars++;
        }
    }

    // Импорт операций
    for (const op of imported.operations || []) {
        const exists = App.store.operations.some(o => o.id === op.id);
        if (!exists || !replaceAll) {
            await App.db.put('operations', op);
            if (!exists) App.store.operations.push(op);
            stats.operations++;
        }
    }

    // Импорт заправок
    for (const f of imported.fuelLog || []) {
        const exists = App.store.fuelLog.some(item => item.id === f.id);
        if (!exists || !replaceAll) {
            await App.db.put('fuel_log', f);
            if (!exists) App.store.fuelLog.push(f);
            stats.fuelLog++;
        }
    }

    // Импорт шин
    for (const t of imported.tireLog || []) {
        const exists = App.store.tireLog.some(item => item.id === t.id);
        if (!exists || !replaceAll) {
            await App.db.put('tires', t);
            if (!exists) App.store.tireLog.push(t);
            stats.tireLog++;
        }
    }

    // Импорт запчастей
    for (const p of imported.parts || []) {
        const exists = App.store.parts.some(item => item.id === p.id);
        if (!exists || !replaceAll) {
            await App.db.put('parts', p);
            if (!exists) App.store.parts.push(p);
            stats.parts++;
        }
    }

    // Импорт истории ТО
    for (const h of imported.serviceRecords || []) {
        const exists = App.store.serviceRecords.some(item => item.id === h.id);
        if (!exists || !replaceAll) {
            await App.db.put('service_records', h);
            if (!exists) App.store.serviceRecords.push(h);
            stats.serviceRecords++;
        }
    }

    // Импорт истории пробега
    for (const m of imported.mileageHistory || []) {
        const exists = App.store.mileageHistory.some(item => item.id === m.id);
        if (!exists || !replaceAll) {
            await App.db.put('mileage_log', m);
            if (!exists) App.store.mileageHistory.push(m);
            stats.mileageHistory++;
        }
    }

    // Импорт документов
    for (const d of imported.carDocuments || []) {
        const exists = (App.ui.pages._carDocuments || []).some(item => item.id === d.id);
        if (!exists || !replaceAll) {
            await App.db.put('car_documents', d);
            if (!exists) App.ui.pages._carDocuments?.push(d);
            stats.carDocuments++;
        }
    }

    // Импорт настроек (слияние)
    if (imported.settings) {
        // Не перезаписываем чувствительные настройки, если они есть в текущей сессии
        const merged = { ...imported.settings, ...App.store.settings };
        App.store.settings = merged;
        await App.db.put('car_settings', { ...merged, car_id: App.store.activeCarId });
    }

    // Обновляем базовые параметры
    if (imported.baseMileage !== undefined) App.store.baseMileage = imported.baseMileage;
    if (imported.baseMotohours !== undefined) App.store.baseMotohours = imported.baseMotohours;
    if (imported.purchaseDate) App.store.purchaseDate = imported.purchaseDate;
    if (imported.purchaseCost) App.store.purchaseCost = imported.purchaseCost;

    // Сохраняем всё в IndexedDB
    await App.store.saveSettingsToDB();

    return stats;
};

/**
 * Вспомогательная функция: полная очистка всех пользовательских данных (кроме автомобилей, если не указано иное)
 * @private
 */
App.backup._clearAllUserData = async function() {
    const stores = ['operations', 'fuel_log', 'tires', 'parts', 'service_records', 'mileage_log', 'car_documents'];
    for (const store of stores) {
        try {
            await App.db.clear(store);
        } catch (e) {
            console.warn(`Ошибка очистки ${store}:`, e);
        }
    }
    // Очищаем массивы в store
    App.store.operations = [];
    App.store.fuelLog = [];
    App.store.tireLog = [];
    App.store.parts = [];
    App.store.serviceRecords = [];
    App.store.mileageHistory = [];
    if (App.ui.pages._carDocuments) App.ui.pages._carDocuments = [];
};

/**
 * Показывает модальное окно выбора файла и импорта
 */
App.backup.showImportModal = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const masterPassword = await App.ui.promptModalAsync('Восстановление данных', 'Введите мастер-пароль для расшифровки', true);
        if (!masterPassword) return;
        
        const replaceAll = await App.ui.confirmModalAsync('Заменить все существующие данные? (Да – полная замена, Нет – объединение)');
        
        try {
            const stats = await App.backup.importFromZip(file, masterPassword, replaceAll);
            await App.store.loadFromIndexedDB();
            if (typeof App.renderAll === 'function') App.renderAll();
            App.toast(`Импорт завершён: добавлено ${stats.cars} авто, ${stats.operations} операций, ${stats.fuelLog} заправок...`, 'success');
        } catch (err) {
            App.toast('Ошибка импорта: ' + err.message, 'error');
            App.errorHandler?.logError(err, 'backup_import');
        }
    };
    input.click();
};