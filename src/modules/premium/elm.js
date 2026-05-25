// src/modules/premium/elm.js
let device = null;
let characteristic = null;
let pendingResolve = null;
let pendingReject = null;
let timeoutId = null;
let isSyncing = false;

export async function init() {
    console.log('[ELM] Premium module initialized');
}

async function sendCommand(cmd) {
    if (!characteristic) throw new Error('Не подключено');
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(cmd + '\r'));
}

function sendCommandWithResponse(cmd, timeout = 5000) {
    return new Promise((resolve, reject) => {
        if (pendingResolve) {
            reject(new Error('Another command in progress'));
            return;
        }
        pendingResolve = resolve;
        pendingReject = reject;
        timeoutId = setTimeout(() => {
            if (pendingReject) {
                pendingReject(new Error('Command timeout'));
                pendingResolve = null;
                pendingReject = null;
            }
        }, timeout);
        sendCommand(cmd).catch(err => {
            if (pendingReject) {
                clearTimeout(timeoutId);
                pendingReject(err);
                pendingResolve = null;
                pendingReject = null;
            }
        });
    });
}

function parseOBDResponse(response) {
    const cleaned = response.replace(/[\r\n>]+/g, ' ').trim();
    const parts = cleaned.split(' ');
    if (parts.length < 3) return null;
    if (parts[0] === '41') {
        const pid = parts[1];
        const data = parts.slice(2);
        switch (pid) {
            case '0D': // скорость
                const speed = parseInt(data[0], 16);
                return { type: 'speed', value: speed };
            case '0C': // обороты
                const rpm = (parseInt(data[0], 16) * 256 + parseInt(data[1], 16)) / 4;
                return { type: 'rpm', value: rpm };
            case '46': // пробег (нестандартно)
                const odometer = (parseInt(data[0],16)*256*256*256 + parseInt(data[1],16)*256*256 + parseInt(data[2],16)*256 + parseInt(data[3],16)) / 10;
                return { type: 'odometer', value: odometer };
            case '5E': // время работы двигателя (секунды)
                const engineSeconds = (parseInt(data[0],16)*256 + parseInt(data[1],16));
                const engineHours = engineSeconds / 3600;
                return { type: 'engine_hours', value: engineHours };
            default:
                return { type: 'unknown', pid, data };
        }
    }
    return null;
}

function handleELMData(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const response = decoder.decode(value);
    if (pendingResolve) {
        clearTimeout(timeoutId);
        pendingResolve(response);
        pendingResolve = null;
        pendingReject = null;
    }
    const parsed = parseOBDResponse(response);
    if (parsed) {
        console.log('[ELM] Parsed:', parsed);
        // Здесь можно генерировать событие для UI, например через событие
        window.dispatchEvent(new CustomEvent('elm-data', { detail: parsed }));
    }
}

export async function connectELM() {
    if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth не поддерживается в этом браузере');
    }
    try {
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['fff0'] }],
            optionalServices: ['fff0']
        });
        device.addEventListener('gattserverdisconnected', () => {
            console.log('[ELM] Device disconnected');
            if (characteristic) {
                characteristic.removeEventListener('characteristicvaluechanged', handleELMData);
                characteristic = null;
            }
            device = null;
            if (pendingReject) {
                pendingReject(new Error('Device disconnected'));
                pendingResolve = null;
                pendingReject = null;
            }
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('fff0');
        characteristic = await service.getCharacteristic('fff1');
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleELMData);
        return true;
    } catch (e) {
        console.error('[ELM] Connection failed:', e);
        throw e;
    }
}

export async function getOdometer() {
    const response = await sendCommandWithResponse('0146');
    const parsed = parseOBDResponse(response);
    if (parsed && parsed.type === 'odometer') return parsed.value;
    return null;
}

export async function getEngineHours() {
    const response = await sendCommandWithResponse('015E');
    const parsed = parseOBDResponse(response);
    if (parsed && parsed.type === 'engine_hours') return parsed.value;
    return null;
}

export async function getVehicleSpeed() {
    const response = await sendCommandWithResponse('010D');
    const parsed = parseOBDResponse(response);
    if (parsed && parsed.type === 'speed') return parsed.value;
    throw new Error('Invalid response');
}

export async function getRPM() {
    const response = await sendCommandWithResponse('010C');
    const parsed = parseOBDResponse(response);
    if (parsed && parsed.type === 'rpm') return parsed.value;
    throw new Error('Invalid response');
}

// Сравнение данных с текущими значениями в приложении и запрос на обновление
async function compareAndAsk(title, elmValue, currentValue, unit, fieldName) {
    if (elmValue === null || elmValue === undefined) return false;
    const diff = Math.abs(elmValue - currentValue);
    const diffPercent = currentValue ? (diff / currentValue) * 100 : 100;
    if (diffPercent > 5) { // расхождение более 5%
        const message = `${title} по данным ELM: ${elmValue.toFixed(1)} ${unit}\nТекущее значение в приложении: ${currentValue.toFixed(1)} ${unit}\nРасхождение: ${diff.toFixed(1)} ${unit} (${diffPercent.toFixed(1)}%).\nОбновить данные в приложении?`;
        const result = await App.ui.confirmModalAsync(message);
        if (result) {
            if (fieldName === 'mileage') {
                App.store.settings.currentMileage = elmValue;
                await App.events.updateMileageAndAverages();
            } else if (fieldName === 'motohours') {
                App.store.settings.currentMotohours = elmValue;
                await App.events.updateMileageAndAverages();
            }
            return true;
        }
    }
    return false;
}

// Основная функция, вызываемая после подключения: проверяет пробег и моточасы
export async function syncVehicleData() {
    if (isSyncing) {
        console.log('[ELM] Sync already in progress');
        return;
    }
    isSyncing = true;
    if (typeof App.toast === 'function') {
        App.toast('Чтение данных с ELM...', 'info');
    }
    const currentMileage = App.store.settings.currentMileage;
    const currentMotohours = App.store.settings.currentMotohours;
    let mileageFromELM = null;
    let hoursFromELM = null;

    try {
        mileageFromELM = await getOdometer();
    } catch (e) {
        console.warn('[ELM] Odometer not available:', e);
    }
    try {
        hoursFromELM = await getEngineHours();
    } catch (e) {
        console.warn('[ELM] Engine hours not available:', e);
    }

    if (mileageFromELM !== null) {
        await compareAndAsk('Пробег', mileageFromELM, currentMileage, 'км', 'mileage');
    }
    if (hoursFromELM !== null) {
        await compareAndAsk('Моточасы', hoursFromELM, currentMotohours, 'ч', 'motohours');
    }
    if (typeof App.toast === 'function') {
        App.toast('Синхронизация завершена', 'success');
    }
    isSyncing = false;
}

export async function disconnectELM() {
    if (characteristic) {
        try {
            await characteristic.stopNotifications();
            characteristic.removeEventListener('characteristicvaluechanged', handleELMData);
        } catch (e) {}
        characteristic = null;
    }
    if (device && device.gatt.connected) {
        await device.gatt.disconnect();
    }
    device = null;
    if (pendingReject) {
        pendingReject(new Error('Disconnected manually'));
        pendingResolve = null;
        pendingReject = null;
    }
    if (timeoutId) clearTimeout(timeoutId);
}