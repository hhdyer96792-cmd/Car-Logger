// src/modules/auth.js
window.App = window.App || {};
App.auth = App.auth || {};

/**
 * Запрос мастер-пароля у пользователя.
 * @param {boolean} isFirstTime - true при первом входе (предлагается установить пароль)
 * @returns {Promise<string|null>} - мастер-пароль или null при отказе
 */
App.auth.requestMasterPassword = async function(isFirstTime = false) {
    const message = isFirstTime
        ? 'Установите мастер-пароль для шифрования данных (запомните его!). Длина: не менее 8 символов.'
        : 'Введите мастер-пароль. Длина: не менее 8 символов.';
    try {
        const password = await App.ui.promptModalAsync('Мастер-пароль', message, true);
        return password;
    } catch (err) {
        console.error('[Auth] Ошибка при запросе мастер-пароля:', err);
        return null;
    }
};

/**
 * Инициализация мастер-пароля и загрузка данных.
 * @returns {Promise<boolean>} - успешность инициализации
 */

App.auth.initializeMasterPassword = async function() {
    const hasMasterPassword = await App.db.getById('encrypted_secrets', 'master_salt') !== null;
    let masterPassword = null;
    
    // 1. Сначала пробуем PIN
    const hasPin = App.localAuth && await App.localAuth.isPinSet();
    if (hasPin) {
        try {
            const pin = await App.ui.promptModalAsync('Быстрый доступ', 'Введите PIN-код', true);
            if (pin) {
                masterPassword = await App.localAuth.verifyPin(pin);
                if (masterPassword) {
                    const salt = await App.db.encryption.getEncryptedSalt();
                    if (!salt) throw new Error('Соль не найдена');
                    const { key } = await App.db.encryption.initMasterKey(masterPassword, salt);
                    App.db.encryption.setMasterKey(key, salt);
                    await App.store.loadFromIndexedDB();
                    if (typeof App.renderAll === 'function') App.renderAll();
                    App.toast('Расшифровка по PIN успешна', 'success');
                    return true;
                }
            }
        } catch (pinError) {
            console.warn('[Auth] PIN error:', pinError.message);
            App.toast(pinError.message, 'error');
            masterPassword = null;
        }
    }
    
    // 2. Если PIN не помог – запрашиваем мастер-пароль
    if (!masterPassword) {
        const password = await App.auth.requestMasterPassword(!hasMasterPassword);
        if (!password) {
            App.toast('Без мастер-пароля чувствительные данные будут недоступны', 'warning');
            await App.auth.loadDataWithoutEncryption();
            return false;
        }
        
        let isValid = false;
        let key, finalSalt;
        
        if (hasMasterPassword) {
            const salt = await App.db.encryption.getEncryptedSalt();
            if (!salt) {
                // Старая схема? пытаемся получить из localStorage
                const legacySalt = App.db.encryption.getStoredSalt();
                if (legacySalt) {
                    isValid = await App.db.encryption.verifyMasterKey(password, legacySalt);
                    if (isValid) {
                        const res = await App.db.encryption.initMasterKey(password, legacySalt);
                        key = res.key;
                        finalSalt = legacySalt;
                        // Переносим соль в IndexedDB
                        await App.db.encryption.saveEncryptedSalt(finalSalt);
                        localStorage.removeItem('vesta_encryption_salt_legacy');
                    }
                } else {
                    throw new Error('Соль не найдена');
                }
            } else {
                isValid = await App.db.encryption.verifyMasterKey(password, salt);
                if (isValid) {
                    const res = await App.db.encryption.initMasterKey(password, salt);
                    key = res.key;
                    finalSalt = salt;
                }
            }
        } else {
            // Первая установка мастер-пароля
            const res = await App.db.encryption.initMasterKey(password, null);
            key = res.key;
            finalSalt = res.salt;
            await App.db.encryption.saveEncryptedSalt(finalSalt);
            await App.db.encryption.saveVerificationString(key);
            isValid = true;
        }
        
        if (isValid) {
            App.db.encryption.setMasterKey(key, finalSalt);
            await App.store.loadFromIndexedDB();
            if (typeof App.renderAll === 'function') App.renderAll();
            App.toast(hasMasterPassword ? 'Расшифровка успешна' : 'Мастер-пароль сохранён', 'success');
            // Сбрасываем счётчик попыток PIN
            if (App.db.attemptsTracker && App.db.attemptsTracker.resetAttempts) {
                await App.db.attemptsTracker.resetAttempts('pin');
            }
            // Предлагаем настроить PIN, если ещё не настроен
            await App.auth.offerPinSetup(password);
            return true;
        } else {
            App.toast('Неверный мастер-пароль', 'error');
            return false;
        }
    }
    return false;
};

/**
 * Загрузка данных без шифрования (режим без мастер-пароля)
 */
App.auth.loadDataWithoutEncryption = async function() {
    try {
        const [operations, fuelLog, tireLog, parts, history, mileageHistory] = await Promise.all([
            App.supa.loadOperations(),
            App.supa.loadFuelLog(),
            App.supa.loadTires(),
            App.supa.loadParts(),
            App.supa.loadHistory(),
            App.supa.loadMileageHistory()
        ]);
        App.store.operations = operations;
        App.store.fuelLog = fuelLog;
        App.store.tireLog = tireLog;
        App.store.parts = parts;
        App.store.serviceRecords = history;
        App.store.mileageHistory = mileageHistory;
        for (const op of operations) await App.store.saveOperationToDB(op);
        for (const f of fuelLog) await App.store.saveFuelRecordToDB(f);
        for (const t of tireLog) await App.store.saveTireRecordToDB(t);
        for (const p of parts) await App.store.savePartToDB(p);
        for (const h of history) await App.store.saveHistoryRecordToDB(h);
        for (const m of mileageHistory) await App.store.saveMileageRecordToDB(m);
        if (typeof App.renderAll === 'function') App.renderAll();
        App.toast('Данные загружены (режим без шифрования)', 'info');
    } catch (err) {
        console.error('[Auth] Ошибка загрузки данных без шифрования:', err);
        App.toast('Не удалось загрузить данные', 'error');
    }
};

/**
 * Предложение настроить PIN-код (если поддерживается и ещё не установлен)
 * @param {string} masterPassword
 */
App.auth.offerPinSetup = async function(masterPassword) {
    if (!masterPassword) return;
    const hasPin = App.localAuth && await App.localAuth.isPinSet();
    const supported = App.localAuth && App.localAuth.isPinSupported();
    if (!hasPin && supported) {
        const wantPin = await App.ui.confirmModalAsync('Настроить быстрый вход по PIN-коду?');
        if (wantPin) {
            let pinSet = false;
            while (!pinSet) {
                const pin = await App.ui.promptModalAsync('PIN-код', 'Введите 4+ цифры', true);
                if (pin && pin.length >= 4 && /^\d+$/.test(pin)) {
                    const confirmPin = await App.ui.promptModalAsync('Подтвердите PIN', 'Повторите PIN', true);
                    if (confirmPin === pin) {
                        try {
                            await App.localAuth.setPin(pin, masterPassword);
                            App.toast('PIN сохранён', 'success');
                            pinSet = true;
                        } catch (err) {
                            App.toast('Ошибка: ' + err.message, 'error');
                        }
                    } else {
                        App.toast('PIN не совпадают', 'error');
                    }
                } else {
                    App.toast('PIN должен быть 4+ цифры', 'error');
                }
            }
        }
    }
};
