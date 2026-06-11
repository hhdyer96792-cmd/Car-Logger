// src/modules/localAuth.js
window.App = window.App || {};
App.localAuth = App.localAuth || {};

const AUTH_STORE = 'local_auth';
const AUTH_KEY = 'encrypted_master_password';

// Новые параметры безопасности
const MIN_PIN_LENGTH = 6;          // увеличено с 4
const MAX_PIN_ATTEMPTS = 3;        // оставляем 3
const PIN_BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 минут
const PIN_DELAY_MS = 2000;          // задержка между попытками (экспоненциально)

// Хранение времени следующей разрешённой попытки для PIN
let pinNextAttemptTime = 0;

App.localAuth.isPinSupported = function() {
    return typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined';
};

App.localAuth.isPinSet = async function() {
    const record = await App.db.getById(AUTH_STORE, AUTH_KEY);
    return !!record;
};

async function deriveKeyFromPin(pin, salt, iterations = 200000) { // увеличил итерации
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(pin),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

async function encryptMasterPassword(masterPassword, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyFromPin(pin, salt, 200000);
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(masterPassword)
    );
    return {
        salt: Array.from(salt),
        iv: Array.from(iv),
        encrypted: Array.from(new Uint8Array(encrypted))
    };
}

async function decryptMasterPassword(pin, encryptedData) {
    const salt = new Uint8Array(encryptedData.salt);
    const iv = new Uint8Array(encryptedData.iv);
    const key = await deriveKeyFromPin(pin, salt, 200000);
    const encrypted = new Uint8Array(encryptedData.encrypted);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );
    return new TextDecoder().decode(decrypted);
}

App.localAuth.setPin = async function(pin, masterPassword) {
    if (!App.localAuth.isPinSupported()) {
        throw new Error('PIN-код не поддерживается в этом браузере');
    }
    if (!pin || pin.length < MIN_PIN_LENGTH || !/^\d+$/.test(pin)) {
        throw new Error(`PIN-код должен содержать минимум ${MIN_PIN_LENGTH} цифр`);
    }
    const salt = await App.db.encryption.getEncryptedSalt();
    if (!salt) throw new Error('Соль не найдена');
    const isValid = await App.db.encryption.verifyMasterKey(masterPassword, salt);
    if (!isValid) throw new Error('Неверный мастер-пароль');
    
    const encrypted = await encryptMasterPassword(masterPassword, pin);
    await App.db.put(AUTH_STORE, {
        id: AUTH_KEY,
        ...encrypted,
        createdAt: Date.now()
    });
    // Сбрасываем счётчик попыток PIN
    await App.db.attemptsTracker.resetAttempts('pin');
    pinNextAttemptTime = 0;
    return true;
};

App.localAuth.verifyPin = async function(pin) {
    // Проверка блокировки
    const { blocked, remainingMs } = await App.db.attemptsTracker.isBlocked('pin');
    if (blocked) {
        const minutes = Math.ceil(remainingMs / 60000);
        throw new Error(`PIN заблокирован на ${minutes} мин. Введите мастер-пароль.`);
    }
    
    // Защита от быстрого перебора: задержка между попытками
    const now = Date.now();
    if (pinNextAttemptTime > now) {
        const wait = pinNextAttemptTime - now;
        throw new Error(`Подождите ${Math.ceil(wait / 1000)} секунд перед следующей попыткой.`);
    }
    
    const record = await App.db.getById(AUTH_STORE, AUTH_KEY);
    if (!record) return null;
    try {
        const masterPassword = await decryptMasterPassword(pin, record);
        const salt = await App.db.encryption.getEncryptedSalt();
        const isValid = await App.db.encryption.verifyMasterKey(masterPassword, salt);
        if (!isValid) throw new Error('Invalid master password');
        // Успех – сбрасываем счётчик и задержку
        await App.db.attemptsTracker.resetAttempts('pin');
        pinNextAttemptTime = 0;
        return masterPassword;
    } catch (err) {
        console.warn('[LocalAuth] PIN verification failed:', err);
        // Увеличиваем счётчик неудачных попыток
        const blocked = await App.db.attemptsTracker.recordFailedAttempt('pin');
        if (blocked) {
            throw new Error(`Превышено количество попыток (${MAX_PIN_ATTEMPTS}). PIN заблокирован на 15 минут.`);
        }
        // Устанавливаем экспоненциальную задержку
        const remaining = await App.db.attemptsTracker.getRemainingAttempts('pin');
        const delay = Math.min(2000 * (MAX_PIN_ATTEMPTS - remaining), 10000);
        pinNextAttemptTime = Date.now() + delay;
        throw new Error(`Неверный PIN. Осталось попыток: ${remaining}. Подождите ${Math.ceil(delay / 1000)} секунд.`);
    }
};

App.localAuth.resetPin = async function() {
    await App.db.delete(AUTH_STORE, AUTH_KEY);
    await App.db.attemptsTracker.resetAttempts('pin');
    pinNextAttemptTime = 0;
};