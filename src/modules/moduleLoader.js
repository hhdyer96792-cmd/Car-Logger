// src/modules/moduleLoader.js
window.App = window.App || {};
App.modules = App.modules || {};

// Кэш загруженных модулей
App.modules._loaded = new Map();

// Загрузка модуля по имени (с проверкой премиум-доступа)
App.modules.load = async function(moduleName, requiredPremium = false) {
    // Проверка премиум-доступа, если требуется
    if (requiredPremium && !App.store.isPremium) {
        App.modules.showUpgradeModal();
        return null;
    }
    
    if (App.modules._loaded.has(moduleName)) {
        return App.modules._loaded.get(moduleName);
    }
    
    try {
        const module = await import(`./${moduleName}.js`);
        App.modules._loaded.set(moduleName, module);
        if (module.onLoad && typeof module.onLoad === 'function') {
            await module.onLoad();
        }
        return module;
    } catch (err) {
        console.error(`[ModuleLoader] Ошибка загрузки модуля ${moduleName}:`, err);
        return null;
    }
};

// Показать модальное окно предложения купить Premium
App.modules.showUpgradeModal = function() {
    // Сбрасываем флаг, если модалка уже была показана ранее
    if (App.modules._upgradeModalShown) {
        // Не блокируем повторный показ, а просто сбрасываем флаг
        App.modules._upgradeModalShown = false;
    }
    App.modules._upgradeModalShown = true;
    
    const content = `
        <div style="text-align: center;">
            <i data-lucide="crown" style="width: 48px; height: 48px; color: var(--warning); margin-bottom: 12px;"></i>
            <h3>Premium функция</h3>
            <p>Эта функция доступна только в Premium-подписке.</p>
            <div class="premium-key-input" style="margin: 16px 0;">
                <input type="text" id="premium-key-input" placeholder="Введите ключ активации" style="width: 100%;">
                <button id="premium-activate-btn" class="primary-btn" style="margin-top: 8px;">Активировать</button>
            </div>
            <div id="premium-status-message"></div>
            <button class="cancel-btn secondary-btn">Закрыть</button>
        </div>
    `;
    
    const modal = App.ui.createModal('Доступно в Premium', content);
    
    const activateBtn = modal.querySelector('#premium-activate-btn');
    const keyInput = modal.querySelector('#premium-key-input');
    const statusDiv = modal.querySelector('#premium-status-message');
    
    if (activateBtn && keyInput) {
        activateBtn.onclick = async () => {
            const key = keyInput.value.trim();
            if (!key) {
                statusDiv.innerHTML = '<span style="color: var(--danger);">Введите ключ</span>';
                return;
            }
            try {
                const result = await App.premium.activateKey(key);
                if (result.success) {
                    statusDiv.innerHTML = '<span style="color: var(--success);">✅ Подписка активирована! Обновите страницу.</span>';
                    setTimeout(() => {
                        modal.remove();
                        window.location.reload();
                    }, 2000);
                } else {
                    statusDiv.innerHTML = `<span style="color: var(--danger);">❌ ${result.error}</span>`;
                }
            } catch (err) {
                statusDiv.innerHTML = `<span style="color: var(--danger);">❌ Ошибка: ${err.message}</span>`;
            }
        };
    }
    
    // Сбрасываем флаг при закрытии модалки
    const cancelBtn = modal.querySelector('.cancel-btn');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.remove();
            App.modules._upgradeModalShown = false;
        };
    }
    // Также сбрасываем при клике на оверлей
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            App.modules._upgradeModalShown = false;
        }
    });
    App.initIcons();
};