// src/modules/localAuth.js
window.App = window.App || {};
App.localAuth = App.localAuth || {};

const AUTH_STORE = 'local_auth';
const AUTH_KEY = 'encrypted_master_password';

// ========== Лимит попыток ==========
const PIN_ATTEMPTS_KEY = 'vesta_pin_attempts';
const MAX_PIN_ATTEMPTS = 3;
const PIN_BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 минут

// Состояние блокировки
async function getPinAttempts() {
    const data = localStorage.getItem(PIN_ATTEMPTS_KEY);
    if (!data) return { count: 0, blockedUntil: 0 };
    try {
        return JSON.parse(data);
    } catch {
        return { count: 0, blockedUntil: 0 };
    }
}

async function savePinAttempts(attempts) {
    localStorage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(attempts));
}

async function resetPinAttempts() {
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
}

// ========== Вспомогательные функции (без изменений) ==========
async function deriveKeyFromPin(pin, salt, iterations = 100000) {
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
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyFromPin(pin, salt);
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
    const key = await deriveKeyFromPin(pin, salt);
    const encrypted = new Uint8Array(encryptedData.encrypted);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );
    return new TextDecoder().decode(decrypted);
}

// ========== Публичные методы ==========
App.localAuth.isPinSupported = function() {
    return typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined';
};

App.localAuth.isPinSet = async function() {
    const record = await App.db.getById(AUTH_STORE, AUTH_KEY);
    return !!record;
};

App.localAuth.setPin = async function(pin, masterPassword) {
    if (!App.localAuth.isPinSupported()) {
        throw new Error('PIN-код не поддерживается в этом браузере');
    }
    if (!pin || pin.length < 4) {
        throw new Error('PIN-код должен содержать минимум 4 цифры');
    }
    const salt = App.db.encryption.getStoredSalt();
    const isValid = await App.db.encryption.verifyMasterKey(masterPassword, salt);
    if (!isValid) {
        throw new Error('Неверный мастер-пароль');
    }
    const encrypted = await encryptMasterPassword(masterPassword, pin);
    await App.db.put(AUTH_STORE, {
        id: AUTH_KEY,
        ...encrypted,
        createdAt: Date.now()
    });
    // При успешной установке сбрасываем счётчик попыток
    await resetPinAttempts();
    return true;
};

App.localAuth.verifyPin = async function(pin) {
    // Проверка блокировки
    const attempts = await getPinAttempts();
    if (attempts.blockedUntil && Date.now() < attempts.blockedUntil) {
        const minutesLeft = Math.ceil((attempts.blockedUntil - Date.now()) / 60000);
        throw new Error(`PIN заблокирован на ${minutesLeft} мин. Введите мастер-пароль.`);
    }
    // Если время блокировки истекло, но записи ещё есть – сбрасываем
    if (attempts.blockedUntil && Date.now() >= attempts.blockedUntil) {
        await resetPinAttempts();
    }

    const record = await App.db.getById(AUTH_STORE, AUTH_KEY);
    if (!record) return null;
    try {
        const masterPassword = await decryptMasterPassword(pin, record);
        const salt = App.db.encryption.getStoredSalt();
        const isValid = await App.db.encryption.verifyMasterKey(masterPassword, salt);
        if (!isValid) throw new Error('Invalid master password');
        // Успех – сбрасываем счётчик
        await resetPinAttempts();
        return masterPassword;
    } catch (err) {
        console.warn('[LocalAuth] PIN verification failed:', err);
        // Увеличиваем счётчик неудачных попыток
        const newCount = (attempts.count || 0) + 1;
        if (newCount >= MAX_PIN_ATTEMPTS) {
            // Блокируем PIN и удаляем его
            await App.localAuth.resetPin();
            const blockedUntil = Date.now() + PIN_BLOCK_DURATION_MS;
            await savePinAttempts({ count: newCount, blockedUntil });
            throw new Error(`Превышено количество попыток (${MAX_PIN_ATTEMPTS}). PIN заблокирован на 5 минут. Введите мастер-пароль.`);
        } else {
            await savePinAttempts({ count: newCount, blockedUntil: 0 });
            throw new Error(`Неверный PIN. Осталось попыток: ${MAX_PIN_ATTEMPTS - newCount}.`);
        }
        return null;
    }
};

App.localAuth.resetPin = async function() {
    await App.db.delete(AUTH_STORE, AUTH_KEY);
    // Также сбрасываем счётчик попыток
    await resetPinAttempts();
};