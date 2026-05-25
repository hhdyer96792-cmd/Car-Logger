// src/db/encryption.js
window.App = window.App || {};
App.db = App.db || {};
App.db.encryption = App.db.encryption || {};

const ENCRYPTION_CONFIG = {
    name: 'AES-GCM',
    ivLength: 12,
    saltLength: 16,
    iterations: 100000,
    hash: 'SHA-256'
};

App.db.encryption.deriveKey = async function(password, salt) {
    if (!password) throw new Error('Пароль не может быть пустым');
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ENCRYPTION_CONFIG.iterations, hash: ENCRYPTION_CONFIG.hash },
        keyMaterial,
        { name: ENCRYPTION_CONFIG.name, length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
};

App.db.encryption.generateSalt = function() {
    return crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.saltLength));
};

App.db.encryption.generateIV = function() {
    return crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.ivLength));
};

App.db.encryption.encrypt = async function(plainText, key, iv) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainText);
    const encrypted = await crypto.subtle.encrypt({ name: ENCRYPTION_CONFIG.name, iv }, key, data);
    return new Uint8Array(encrypted);
};

App.db.encryption.decrypt = async function(encryptedData, key, iv) {
    const decrypted = await crypto.subtle.decrypt({ name: ENCRYPTION_CONFIG.name, iv }, key, encryptedData);
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
};

App.db.encryption.saveSecret = async function(keyId, plainText, masterKey) {
    const iv = App.db.encryption.generateIV();
    const encrypted = await App.db.encryption.encrypt(plainText, masterKey, iv);
    await App.db.put('encrypted_secrets', {
        id: keyId,
        encryptedData: Array.from(encrypted),
        iv: Array.from(iv),
        version: 1
    });
    return true;
};

App.db.encryption.getSecret = async function(keyId, masterKey) {
    const record = await App.db.getById('encrypted_secrets', keyId);
    if (!record) return null;
    const encrypted = new Uint8Array(record.encryptedData);
    const iv = new Uint8Array(record.iv);
    return await App.db.encryption.decrypt(encrypted, masterKey, iv);
};

App.db.encryption.deleteSecret = async function(keyId) {
    await App.db.delete('encrypted_secrets', keyId);
};

App.db.encryption.initMasterKey = async function(password, salt) {
    let finalSalt = salt;
    if (!finalSalt) {
        finalSalt = App.db.encryption.generateSalt();
        localStorage.setItem('vesta_encryption_salt', JSON.stringify(Array.from(finalSalt)));
    } else if (typeof finalSalt === 'string') {
        finalSalt = new Uint8Array(JSON.parse(finalSalt));
    }
    const key = await App.db.encryption.deriveKey(password, finalSalt);
    return { key, salt: finalSalt };
};

App.db.encryption.getStoredSalt = function() {
    const saltStr = localStorage.getItem('vesta_encryption_salt');
    if (!saltStr) return null;
    return new Uint8Array(JSON.parse(saltStr));
};

App.db.encryption.clearMasterKey = function() {
    App.db.encryption._masterKey = null;
    App.db.encryption._salt = null;
};

App.db.encryption.setMasterKey = function(key, salt) {
    App.db.encryption._masterKey = key;
    App.db.encryption._salt = salt;
};

App.db.encryption.getMasterKey = function() {
    return App.db.encryption._masterKey;
};

// === НОВЫЕ ФУНКЦИИ ===
App.db.encryption.saveVerificationString = async function(masterKey) {
    const testString = "CarLoggerVerified";
    const iv = App.db.encryption.generateIV();
    const encrypted = await App.db.encryption.encrypt(testString, masterKey, iv);
    await App.db.put('encrypted_secrets', {
        id: 'verification',
        encryptedData: Array.from(encrypted),
        iv: Array.from(iv)
    });
};

App.db.encryption.verifyMasterKey = async function(password, storedSalt) {
    try {
        const { key } = await App.db.encryption.initMasterKey(password, storedSalt);
        const record = await App.db.getById('encrypted_secrets', 'verification');
        if (!record) return false;
        const encrypted = new Uint8Array(record.encryptedData);
        const iv = new Uint8Array(record.iv);
        const decrypted = await App.db.encryption.decrypt(encrypted, key, iv);
        return decrypted === "CarLoggerVerified";
    } catch(e) {
        return false;
    }
};

App.db.encryption.reencryptAllSecrets = async function(oldKey, newKey) {
    const settings = await App.db.getById('settings', 1);
    if (settings) {
        const decryptedSettings = await App.db.encryption.decryptSettings(settings, oldKey);
        const reencryptedSettings = await App.db.encryption.encryptSettings(decryptedSettings, newKey);
        await App.db.put('settings', reencryptedSettings);
    }
    const allSecrets = await App.db.getAll('encrypted_secrets');
    for (const secret of allSecrets) {
        if (secret.id === 'verification') continue;
        try {
            const iv = new Uint8Array(secret.iv);
            const encrypted = new Uint8Array(secret.encryptedData);
            const decrypted = await App.db.encryption.decrypt(encrypted, oldKey, iv);
            const newIv = App.db.encryption.generateIV();
            const newEncrypted = await App.db.encryption.encrypt(decrypted, newKey, newIv);
            secret.encryptedData = Array.from(newEncrypted);
            secret.iv = Array.from(newIv);
            await App.db.put('encrypted_secrets', secret);
        } catch (e) {
            console.warn(`Не удалось перешифровать секрет ${secret.id}:`, e);
        }
    }
    await App.db.encryption.saveVerificationString(newKey);
};

App.db.encryption.changeMasterPassword = async function(oldPassword, newPassword) {
    const salt = App.db.encryption.getStoredSalt();
    const isValid = await App.db.encryption.verifyMasterKey(oldPassword, salt);
    if (!isValid) throw new Error('Неверный старый пароль');
    const { key: oldKey } = await App.db.encryption.initMasterKey(oldPassword, salt);
    const { key: newKey } = await App.db.encryption.initMasterKey(newPassword, salt);
    await App.db.encryption.reencryptAllSecrets(oldKey, newKey);
    App.db.encryption.setMasterKey(newKey, salt);
    return true;
};

// === Шифрование/дешифрование настроек ===
App.db.encryption.encryptSettings = async function(settings, masterKey) {
    const encryptedSettings = { ...settings };
    const sensitiveFields = ['telegramToken', 'telegramChatId', 'vin', 'plateNumber'];
    for (const field of sensitiveFields) {
        if (settings[field]) {
            const iv = App.db.encryption.generateIV();
            const encrypted = await App.db.encryption.encrypt(settings[field], masterKey, iv);
            encryptedSettings[field] = {
                encrypted: Array.from(encrypted),
                iv: Array.from(iv)
            };
        }
    }
    return encryptedSettings;
};

App.db.encryption.decryptSettings = async function(encryptedSettings, masterKey) {
    const settings = { ...encryptedSettings };
    const sensitiveFields = ['telegramToken', 'telegramChatId', 'vin', 'plateNumber'];
    for (const field of sensitiveFields) {
        if (settings[field] && typeof settings[field] === 'object' && settings[field].encrypted) {
            const encrypted = new Uint8Array(settings[field].encrypted);
            const iv = new Uint8Array(settings[field].iv);
            const decrypted = await App.db.encryption.decrypt(encrypted, masterKey, iv);
            settings[field] = decrypted;
        }
    }
    return settings;
};
}