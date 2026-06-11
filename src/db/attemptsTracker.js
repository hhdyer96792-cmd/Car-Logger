// src/db/attemptsTracker.js
window.App = window.App || {};
App.db.attemptsTracker = App.db.attemptsTracker || {};

const STORE_NAME = 'local_auth';
const KEY_MASTER_ATTEMPTS = 'master_password_attempts';
const KEY_PIN_ATTEMPTS = 'pin_attempts';

// Общие настройки
const MAX_MASTER_ATTEMPTS = 5;
const MAX_PIN_ATTEMPTS = 3;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 минут

/**
 * Получить текущие данные о попытках для указанного типа
 * @param {string} type - 'master' или 'pin'
 * @returns {Promise<{count: number, blockedUntil: number}>}
 */
async function getAttempts(type) {
    const key = type === 'master' ? KEY_MASTER_ATTEMPTS : KEY_PIN_ATTEMPTS;
    try {
        const record = await App.db.getById(STORE_NAME, key);
        if (record && typeof record === 'object' && record.count !== undefined && record.blockedUntil !== undefined) {
            return { count: record.count, blockedUntil: record.blockedUntil };
        }
    } catch (e) {}
    return { count: 0, blockedUntil: 0 };
}

/**
 * Сохранить данные о попытках
 * @param {string} type - 'master' или 'pin'
 * @param {number} count
 * @param {number} blockedUntil
 */
async function saveAttempts(type, count, blockedUntil) {
    const key = type === 'master' ? KEY_MASTER_ATTEMPTS : KEY_PIN_ATTEMPTS;
    await App.db.put(STORE_NAME, { id: key, count, blockedUntil });
}

/**
 * Проверить, заблокирован ли ввод
 * @param {string} type
 * @returns {Promise<{blocked: boolean, remainingMs: number}>}
 */
App.db.attemptsTracker.isBlocked = async function(type) {
    const { count, blockedUntil } = await getAttempts(type);
    if (blockedUntil && Date.now() < blockedUntil) {
        return { blocked: true, remainingMs: blockedUntil - Date.now() };
    }
    // Если время блокировки истекло, сбрасываем счётчик
    if (blockedUntil && Date.now() >= blockedUntil) {
        await saveAttempts(type, 0, 0);
    }
    return { blocked: false, remainingMs: 0 };
};

/**
 * Зарегистрировать неудачную попытку
 * @param {string} type
 * @returns {Promise<boolean>} true – достигнут лимит и наступила блокировка
 */
App.db.attemptsTracker.recordFailedAttempt = async function(type) {
    const max = type === 'master' ? MAX_MASTER_ATTEMPTS : MAX_PIN_ATTEMPTS;
    let { count, blockedUntil } = await getAttempts(type);
    
    // Если уже заблокированы, ничего не меняем
    if (blockedUntil && Date.now() < blockedUntil) {
        return true;
    }
    
    count++;
    if (count >= max) {
        blockedUntil = Date.now() + BLOCK_DURATION_MS;
        await saveAttempts(type, count, blockedUntil);
        return true;
    } else {
        await saveAttempts(type, count, 0);
        return false;
    }
};

/**
 * Сбросить счётчик попыток после успешного входа
 * @param {string} type
 */
App.db.attemptsTracker.resetAttempts = async function(type) {
    await saveAttempts(type, 0, 0);
};

/**
 * Получить оставшееся количество попыток
 * @param {string} type
 * @returns {Promise<number>}
 */
App.db.attemptsTracker.getRemainingAttempts = async function(type) {
    const max = type === 'master' ? MAX_MASTER_ATTEMPTS : MAX_PIN_ATTEMPTS;
    const { count, blockedUntil } = await getAttempts(type);
    if (blockedUntil && Date.now() < blockedUntil) return 0;
    return Math.max(0, max - count);
};