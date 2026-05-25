// src/modules/premium/partsSearch.js
let vinInfoCache = new Map()
let partsCache = new Map()
let decoder = null // для @cardog/corgi

// Инициализация (загружаем локальный декодер VIN)
export async function init() {
    console.log('[PartsSearch] Premium module initialized')
    try {
        // Динамический импорт библиотеки corgi
        const { createDecoder } = await import('https://unpkg.com/@cardog/corgi@0.2.0/dist/browser/index.js')
        decoder = await createDecoder({
            databasePath: 'https://corgi.cardog.io/vpic.lite.db.gz'
        })
        console.log('[PartsSearch] Local VIN decoder ready')
    } catch (err) {
        console.warn('[PartsSearch] Local VIN decoder not available:', err)
    }
}

// Закрыть декодер (при необходимости)
export async function close() {
    if (decoder) await decoder.close()
}

// Получение характеристик по VIN (локально + NHTSA)
export async function getVehicleInfo(vin) {
    if (!vin || vin.length !== 17) throw new Error('Неверный VIN')
    
    if (vinInfoCache.has(vin)) return vinInfoCache.get(vin)
    const cached = await App.db.getById('vin_info', vin)
    if (cached && (Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000)) {
        vinInfoCache.set(vin, cached.data)
        return cached.data
    }

    // 1. Локальное декодирование (бесплатно, офлайн)
    let localData = null
    if (decoder) {
        try {
            const result = await decoder.decode(vin)
            if (result.valid && result.components.vehicle) {
                localData = result.components.vehicle
            }
        } catch (e) {}
    }

    // 2. Запрос к Edge Function (NHTSA)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        const { data, error } = await App.supabase.functions.invoke('vin-lookup', {
            body: { vin },
            signal: controller.signal
        })
        clearTimeout(timeout)
        if (error) throw new Error(error.message)
        // Объединяем с локальными данными (локальные могут быть точнее для некоторых полей)
        const combined = { ...data, ...localData }
        await App.db.put('vin_info', { id: vin, data: combined, timestamp: Date.now() })
        vinInfoCache.set(vin, combined)
        return combined
    } catch (err) {
        clearTimeout(timeout)
        if (localData) return localData
        throw new Error(`Ошибка получения данных по VIN: ${err.message}`)
    }
}

// Получение информации по номерному знаку (Великобритания / Нидерланды)
export async function getVehicleInfoByPlate(plate, country) {
    if (!plate || !country) throw new Error('Требуется номер и страна')
    country = country.toLowerCase()
    if (!['uk', 'nl'].includes(country)) throw new Error('Поддерживаются только UK и NL')
    const cacheKey = `${country}:${plate.toUpperCase()}`
    if (vinInfoCache.has(cacheKey)) return vinInfoCache.get(cacheKey)
    const cached = await App.db.getById('plate_info', cacheKey)
    if (cached && (Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000)) {
        vinInfoCache.set(cacheKey, cached.data)
        return cached.data
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        const funcName = country === 'uk' ? 'dvla-lookup' : 'rdw-lookup'
        const { data, error } = await App.supabase.functions.invoke(funcName, {
            body: { registrationNumber: plate, plate: plate },
            signal: controller.signal
        })
        clearTimeout(timeout)
        if (error) throw new Error(error.message)
        await App.db.put('plate_info', { id: cacheKey, data, timestamp: Date.now() })
        vinInfoCache.set(cacheKey, data)
        return data
    } catch (err) {
        clearTimeout(timeout)
        throw new Error(`Ошибка получения данных по номеру: ${err.message}`)
    }
}

// Поиск запчастей через платное API (только для премиум)
export async function searchPartsByVIN(vin, options = {}) {
    if (!App.store.isPremium) throw new Error('Доступно только в Premium')
    if (!vin || vin.length !== 17) throw new Error('Неверный VIN')
    if (partsCache.has(vin) && !options.force) return partsCache.get(vin)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        const { data, error } = await App.supabase.functions.invoke('parts-search', {
            body: { vin },
            signal: controller.signal
        })
        clearTimeout(timeout)
        if (error) throw new Error(error.message)
        partsCache.set(vin, data)
        return data
    } catch (err) {
        clearTimeout(timeout)
        throw new Error(`Ошибка поиска запчастей: ${err.message}`)
    }
}

// Поиск по OEM номеру (премиум)
export async function searchPartsByOEM(oem, options = {}) {
    if (!App.store.isPremium) throw new Error('Доступно только в Premium')
    if (!oem) throw new Error('OEM номер обязателен')
    const cacheKey = `oem:${oem}`
    if (partsCache.has(cacheKey) && !options.force) return partsCache.get(cacheKey)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        const { data, error } = await App.supabase.functions.invoke('parts-search', {
            body: { oem },
            signal: controller.signal
        })
        clearTimeout(timeout)
        if (error) throw new Error(error.message)
        partsCache.set(cacheKey, data)
        return data
    } catch (err) {
        clearTimeout(timeout)
        throw new Error(`Ошибка поиска по OEM: ${err.message}`)
    }
}

// Модальное окно с информацией об автомобиле (бесплатно) – теперь поддерживает и VIN, и номер
export async function showVehicleInfoModal(query, type = 'vin') {
    const modal = App.ui.createModal('Информация об автомобиле', '<div class="spinner"></div><p class="hint">Загрузка...</p>')
    try {
        let info
        if (type === 'vin') info = await getVehicleInfo(query)
        else if (type === 'plate') {
            const parts = query.split(':')
            if (parts.length !== 2) throw new Error('Формат: страна:номер (uk:TE57VRN или nl:12ABC3)')
            info = await getVehicleInfoByPlate(parts[1], parts[0])
        } else throw new Error('Неверный тип запроса')
        modal.remove()
        const html = `
            <table class="data-table">
                <tr><th>Марка</th><td>${App.utils.escapeHtml(info.make || info.merk || '—')}</td></tr>
                <tr><th>Модель</th><td>${App.utils.escapeHtml(info.model || info.handelsbenaming || '—')}</td></tr>
                <tr><th>Год</th><td>${info.year || info.datum_eerste_toelating || '—'}</td></tr>
                <tr><th>Двигатель</th><td>${App.utils.escapeHtml(info.engine || info.motor || '—')}</td></tr>
                <tr><th>Трансмиссия</th><td>${App.utils.escapeHtml(info.transmission || info.transmissie || '—')}</td></tr>
                <tr><th>Тип кузова</th><td>${App.utils.escapeHtml(info.bodyType || info.carrosserie || '—')}</td></tr>
            </table>
            ${App.store.isPremium ? '<hr><button id="search-parts-btn" class="primary-btn"><i data-lucide="wrench"></i> Найти запчасти</button>' : '<p class="hint"><i data-lucide="lock"></i> Поиск запчастей доступен в Premium-подписке</p>'}
        `
        const resultModal = App.ui.createModal('Автомобиль по запросу', html)
        if (App.store.isPremium) {
            const searchBtn = resultModal.querySelector('#search-parts-btn')
            if (searchBtn) {
                searchBtn.onclick = async () => {
                    resultModal.remove()
                    // Если у нас есть VIN – используем его, иначе пробуем найти по номеру (может не быть)
                    const vin = info.vin || (type === 'vin' ? query : null)
                    if (vin) await showPartsModal(vin)
                    else App.toast('VIN не найден, поиск запчастей недоступен', 'error')
                }
            }
        }
    } catch (err) {
        modal.remove()
        App.ui.createModal('Ошибка', `<p>${App.utils.escapeHtml(err.message)}</p>`)
    }
}

// Модальное окно с результатами поиска запчастей (премиум) – без изменений
export async function showPartsModal(vin) {
    if (!App.store.isPremium) {
        App.ui.createModal('Premium функция', '<p>Поиск запчастей доступен только в Premium-подписке</p><button id="upgrade-btn" class="primary-btn">Активировать Premium</button>')
        document.getElementById('upgrade-btn')?.addEventListener('click', () => App.modules.showUpgradeModal())
        return
    }
    const modal = App.ui.createModal('Поиск запчастей', '<div class="spinner"></div><p class="hint">Загрузка данных...</p>')
    try {
        const data = await searchPartsByVIN(vin)
        modal.remove()
        let html = '<h3>Результаты поиска запчастей</h3><table class="data-table"><thead><tr><th>OEM</th><th>Название</th><th>Цена</th><th>Поставщик</th></tr></thead><tbody>'
        if (data.parts && data.parts.length) {
            data.parts.forEach(part => {
                html += `<tr>
                             <td>${App.utils.escapeHtml(part.oem || '—')}</td>
                             <td>${App.utils.escapeHtml(part.name || '—')}</td>
                             <td>${part.price ? part.price + ' ₽' : '—'}</td>
                             <td>${App.utils.escapeHtml(part.supplier || '—')}</td>
                          </tr>`
            })
        } else {
            html += '<tr><td colspan="4">Запчасти не найдены</td></tr>'
        }
        html += '</tbody></table>'
        App.ui.createModal('Результаты поиска по VIN', html)
    } catch (err) {
        modal.remove()
        App.ui.createModal('Ошибка', `<p>${App.utils.escapeHtml(err.message)}</p>`)
    }
}