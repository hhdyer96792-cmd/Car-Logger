// src/events.js
window.App = window.App || {};
App.events = App.events || {};

App.events.currentActiveTab = null;

App.events.init = function() {
    App.events.setupDelegation();
    App.events.initNavigation();
    App.events.initTheme();
    App.events.initDirectListeners();
    App.events.initHistoryFilters();
    App.events.initStatsListeners();
    
    window.addEventListener('online', function() {
        if (typeof App.toast === 'function') {
            App.toast('Сеть восстановлена. Запускаем синхронизацию...', 'success');
        }
        if (typeof App.db.sync.forceSync === 'function') {
            App.db.sync.forceSync();
        }
    });

    window.addEventListener('offline', function() {
        if (typeof App.toast === 'function') {
            App.toast('Вы офлайн. Изменения будут сохранены локально и синхронизируются позже.', 'warning');
        }
    });
};

App.events.setupDelegation = function() {
    document.body.addEventListener('click', async function(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;

        switch (action) {
            case 'add-record':
                const opId = target.dataset.opId;
                const opName = target.dataset.opName;
                if (opId && opName) App.ui.pages.openServiceModal(opId, opName);
                break;
                
            case 'edit-op':
                const editOpId = target.dataset.opId;
                if (editOpId) {
                    const editOp = App.store.operations.find(o => o.id == editOpId);
                    if (editOp) App.ui.pages.openOperationForm(editOp);
                }
                break;
                
            case 'shopping-list':
                const shopOpId = target.dataset.opId;
                if (shopOpId) App.ui.pages.generateShoppingList(shopOpId);
                break;
                
            case 'delete-op':
                const delOpId = target.dataset.opId;
                if (!delOpId) return;
                if (await App.ui.confirmModalAsync('Удалить операцию? Это действие нельзя отменить.')) {
                    try {
                        await App.storage.deleteOperation(delOpId);
                        await App.storage.loadAllData();
                        App.toast('Операция удалена', 'success');
                    } catch (err) {
                        console.error(err);
                        App.toast('Не удалось удалить операцию (недостаточно прав)', 'error');
                    }
                }
                break;
                
            case 'calendar':
                const calOpId = target.dataset.opId;
                const calOpName = target.dataset.opName;
                const calPlanDate = target.dataset.planDate;
                const calPlanMileage = target.dataset.planMileage;
                if (calOpId && calPlanDate) {
                    App.events.addToCalendar(calOpId, calOpName, calPlanDate, calPlanMileage);
                }
                break;
                
            case 'execute-plan':
                const planOpId = target.dataset.opId;
                const planOpName = target.dataset.opName;
                if (planOpId && planOpName) App.ui.pages.openServiceModal(planOpId, planOpName);
                break;
                
            case 'execute-upcoming':
                const upcomingOpId = target.dataset.opId;
                const upcomingOpName = target.dataset.opName;
                if (upcomingOpId && upcomingOpName) App.ui.pages.openServiceModal(upcomingOpId, upcomingOpName);
                break;
                
            case 'edit-part':
                const partId = target.dataset.id;
                const part = App.store.parts.find(p => p.id == partId);
                if (part) App.ui.pages.openPartForm(part);
                break;
                
            case 'delete-part':
                const delPartId = target.dataset.id;
                if (!delPartId) return;
                if (await App.ui.confirmModalAsync('Удалить запчасть?')) {
                    App.ui.pages.deletePart(delPartId);
                }
                break;
                
            case 'search-part':
                const oem = target.dataset.oem;
                if (oem) App.ui.pages.showCatalogMenu(target, oem);
                break;
                
            case 'price-history':
                const histPartId = target.dataset.id;
                const histPart = App.store.parts.find(p => p.id == histPartId);
                if (histPart) App.ui.pages.showPriceHistoryChart(histPart);
                break;
                
            case 'edit-fuel':
                const fuelIdx = parseInt(target.dataset.idx);
                const fuelRec = App.store.fuelLog[fuelIdx];
                if (fuelRec) {
                    fuelRec.id = fuelRec.id;
                    App.ui.pages.openFuelModal(fuelRec);
                }
                break;
                
            case 'delete-fuel':
                const delFuelIdx = parseInt(target.dataset.idx);
                if (isNaN(delFuelIdx)) return;
                if (await App.ui.confirmModalAsync('Удалить заправку?')) {
                    App.ui.pages.deleteFuelEntry(delFuelIdx);
                }
                break;
                
            case 'edit-tire':
                const tireIdx = parseInt(target.dataset.idx);
                const tireRec = App.store.tireLog[tireIdx];
                if (tireRec) {
                    App.ui.pages.openTireModal(tireRec);
                }
                break;
                
            case 'delete-tire':
                const delTireIdx = parseInt(target.dataset.idx);
                if (isNaN(delTireIdx)) return;
                if (await App.ui.confirmModalAsync('Удалить запись о шинах?')) {
                    App.ui.pages.deleteTireEntry(delTireIdx);
                }
                break;
                
            case 'edit-history':
                const histRow = target.dataset.row;
                if (histRow) App.ui.pages.openHistoryEdit(histRow);
                break;
                
            case 'delete-history':
                const delHistRow = target.dataset.row;
                if (!delHistRow) return;
                if (await App.ui.confirmModalAsync('Удалить запись из истории? Это действие нельзя отменить.')) {
                    App.ui.pages.deleteHistoryEntry(delHistRow);
                }
                break;
        }
    });
};

App.events.addToCalendar = function(opId, opName, planDate, planMileage) {
    const parts = App.store.parts.filter(p => {
        const op = App.store.operations.find(o => o.id == opId);
        return p.operation === opName || p.operation === (op ? op.category : '');
    });

    let partsList = '';
    if (parts.length > 0) {
        partsList = '\\n\\nСписок запчастей:\\n';
        parts.forEach(p => {
            const status = (p.inStock && p.inStock > 0) ? '✅' : '☐';
            partsList += status + ' ' + (p.oem || p.analog || p.operation) + (p.price ? ' (' + p.price + '₽)' : '') + '\\n';
        });
    }

    const description = 'Пробег: ' + (planMileage || '—') + ' км.' + partsList;
    const uid = opId + '-vesta-' + planDate;
    const dtStart = planDate.replace(/-/g, '') + 'T090000';
    const dtEnd   = planDate.replace(/-/g, '') + 'T100000';
    const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    const icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vesta Dashboard//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n' +
        'BEGIN:VEVENT\r\n' +
        'UID:' + uid + '\r\n' +
        'DTSTART:' + dtStart + '\r\n' +
        'DTEND:' + dtEnd + '\r\n' +
        'SUMMARY:ТО: ' + opName + '\r\n' +
        'DESCRIPTION:' + description + '\r\n' +
        'DTSTAMP:' + now + '\r\n' +
        'END:VEVENT\r\n' +
        'END:VCALENDAR';
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = opName.replace(/\s/g, '_') + '_' + planDate + '.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    App.toast('Событие календаря скачано', 'success');
};

App.events.initNavigation = function() {
    document.querySelectorAll('.sidebar-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) App.events.switchToTab(tab);
        });
    });

    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        if (btn.id === 'more-menu-btn') return;
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab) App.events.switchToTab(tab);
            App.events.closeDrawer();
        });
    });

    const moreBtn = document.getElementById('more-menu-btn');
    if (moreBtn) moreBtn.addEventListener('click', App.events.openDrawer);

    const drawer = document.getElementById('drawer-menu');
    if (drawer) {
        drawer.querySelector('.drawer-overlay').addEventListener('click', App.events.closeDrawer);
        drawer.querySelectorAll('.drawer-item[data-tab]').forEach(item => {
            item.addEventListener('click', () => {
                App.events.switchToTab(item.dataset.tab);
                App.events.closeDrawer();
            });
        });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && drawer && !drawer.classList.contains('hidden')) {
            App.events.closeDrawer();
        }
    });
};

App.events.switchToTab = function(tabId) {
    if (App.events.currentActiveTab === tabId) return;

    document.body.style.overflow = '';
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => {
        if (tab.id === 'tab-' + tabId) {
            tab.classList.remove('active');
            setTimeout(() => tab.classList.add('active'), 10);
        } else {
            tab.classList.remove('active');
        }
    });

    document.querySelectorAll('.sidebar-item, .bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });

    App.events.closeDrawer();
    App.events.currentActiveTab = tabId;

    switch (tabId) {
        case 'dashboard':
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
            break;
        case 'to':
            (async function() {
                const container = document.getElementById('to-cards-container');
                if (container && (!App.store.operations || App.store.operations.length === 0)) {
                    container.innerHTML = '<div class="spinner"></div><p class="hint">Загрузка данных...</p>';
                }
                try {
                    if (!App.store.operations || App.store.operations.length === 0) {
                        await App.storage.loadAllData();
                    }
                    if (typeof App.ui.pages.renderTotalCost === 'function') App.ui.pages.renderTotalCost();
                    if (typeof App.ui.pages.renderTOStats === 'function') App.ui.pages.renderTOStats();
                    if (typeof App.ui.pages.renderOilResourceCard === 'function') App.ui.pages.renderOilResourceCard();
                    if (typeof App.ui.pages.renderResourceBars === 'function') App.ui.pages.renderResourceBars();
                    if (typeof App.ui.pages.renderTOCostChart === 'function') App.ui.pages.renderTOCostChart();
                    if (typeof App.ui.pages.renderTOCategoryPieChart === 'function') App.ui.pages.renderTOCategoryPieChart();
                    if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
                } catch (err) {
                    console.error('[Events] Ошибка загрузки вкладки ТО:', err);
                    if (container) container.innerHTML = '<p class="hint error">Ошибка загрузки данных. Попробуйте обновить страницу.</p>';
                }
            })();
            break;
        case 'stats':
            if (typeof App.ui.pages.renderFinanceTab === 'function') App.ui.pages.renderFinanceTab();
            break;
        case 'history':
            if (typeof App.ui.pages.initHistoryFilters === 'function') App.ui.pages.initHistoryFilters();
            if (typeof App.ui.pages.renderHistoryCards === 'function') App.ui.pages.renderHistoryCards();
            break;
        case 'fuel':
            if (typeof App.ui.pages.renderFuelTab === 'function') App.ui.pages.renderFuelTab();
            break;
        case 'tires':
            if (typeof App.ui.pages.renderTiresTab === 'function') App.ui.pages.renderTiresTab();
            break;
        case 'parts':
            if (typeof App.ui.pages.renderPartsTab === 'function') App.ui.pages.renderPartsTab();
            break;
        case 'car':
            if (typeof App.ui.pages.renderCarTab === 'function') App.ui.pages.renderCarTab();
            break;
        case 'settings':
            if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
            if (typeof App.ui.pages.checkPushSubscriptionStatus === 'function') {
                App.ui.pages.checkPushSubscriptionStatus();
            }
            break;
    }

    setTimeout(() => { App.initIcons(); }, 150);
};

App.events.openDrawer = function() {
    const drawer = document.getElementById('drawer-menu');
    if (drawer) {
        drawer.classList.remove('hidden');
        document.body.classList.add('drawer-open');
    }
};

App.events.closeDrawer = function() {
    const drawer = document.getElementById('drawer-menu');
    if (drawer) {
        drawer.classList.add('hidden');
        document.body.classList.remove('drawer-open');
    }
};

App.events.initTheme = function() {
    const savedTheme = localStorage.getItem(App.config.THEME_KEY);
    if (savedTheme) {
        App.events.applyTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        App.events.applyTheme(prefersDark ? 'dark' : 'light');
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', App.events.toggleTheme);

    const sidebarTheme = document.getElementById('sidebar-theme');
    if (sidebarTheme) sidebarTheme.addEventListener('click', App.events.toggleTheme);
};

App.events.applyTheme = function(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark');
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="sun"></i>';
        const sidebarTheme = document.getElementById('sidebar-theme');
        if (sidebarTheme) sidebarTheme.innerHTML = '<i data-lucide="sun"></i>';
    } else {
        document.body.classList.remove('dark');
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="moon"></i>';
        const sidebarTheme = document.getElementById('sidebar-theme');
        if (sidebarTheme) sidebarTheme.innerHTML = '<i data-lucide="moon"></i>';
    }
    localStorage.setItem(App.config.THEME_KEY, theme);
    App.initIcons();
};

App.events.toggleTheme = function() {
    const isDark = document.body.classList.contains('dark');
    App.events.applyTheme(isDark ? 'light' : 'dark');
};

App.events.initDirectListeners = function() {
    const addOperationBtn = document.getElementById('add-operation-btn');
    if (addOperationBtn) addOperationBtn.addEventListener('click', () => { App.ui.pages.openOperationForm(null); });

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', App.ui.pages.exportToExcelAll);

    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => { importFile.click(); });
        importFile.addEventListener('change', App.events.handleImport);
    }

    const updateMileageBtn = document.getElementById('update-mileage-btn');
    if (updateMileageBtn) updateMileageBtn.addEventListener('click', App.events.updateMileageAndAverages);

    const addFuelBtn = document.getElementById('add-fuel-btn');
    if (addFuelBtn) addFuelBtn.addEventListener('click', () => { App.ui.pages.openFuelModal(null); });

    const voiceFuelBtn = document.getElementById('voice-fuel-btn');
    if (voiceFuelBtn) voiceFuelBtn.addEventListener('click', App.ui.pages.startVoiceFuelInput);

    const addTireBtn = document.getElementById('add-tire-btn');
    if (addTireBtn) addTireBtn.addEventListener('click', () => { App.ui.pages.openTireModal(null); });

    const addPartBtn = document.getElementById('add-part-btn');
    if (addPartBtn) addPartBtn.addEventListener('click', () => { App.ui.pages.openPartForm(null); });

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', App.ui.pages.saveSettings);

    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', App.ui.pages.handleExport);

    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    if (generatePdfBtn) generatePdfBtn.addEventListener('click', App.ui.pages.generateServiceReport);

    const toggleOwnershipBtn = document.getElementById('toggle-ownership-unit');
    if (toggleOwnershipBtn) toggleOwnershipBtn.addEventListener('click', App.ui.pages.toggleOwnershipUnit);

    const dashUpdateMileageBtn = document.getElementById('dash-update-mileage-btn');
    if (dashUpdateMileageBtn) dashUpdateMileageBtn.addEventListener('click', () => {
        App.events.switchToTab('to');
        const newMileageInput = document.getElementById('new-mileage');
        if (newMileageInput) setTimeout(() => newMileageInput.focus(), 200);
    });

    const dashAddFuelBtn = document.getElementById('dash-add-fuel-btn');
    if (dashAddFuelBtn) dashAddFuelBtn.addEventListener('click', () => { App.ui.pages.openFuelModal(null); });

    const dashAddServiceBtn = document.getElementById('dash-add-service-btn');
    if (dashAddServiceBtn) dashAddServiceBtn.addEventListener('click', () => {
        const upcoming = document.getElementById('dash-upcoming-container');
        const firstOp = upcoming?.querySelector('.top5-name');
        if (firstOp) {
            const opName = firstOp.textContent;
            const op = App.store.operations.find(o => o.name === opName);
            if (op) App.ui.pages.openServiceModal(op.id, op.name);
            else App.events.switchToTab('to');
        } else {
            App.events.switchToTab('to');
        }
    });

    const dashPredictBtn = document.getElementById('dash-predict-btn');
    if (dashPredictBtn) dashPredictBtn.addEventListener('click', () => {
        const target = parseFloat(document.getElementById('dash-target-mileage')?.value);
        if (isNaN(target)) return;
        const result = App.logic.predictMileageDate(target);
        const resultEl = document.getElementById('dash-prediction-result');
        if (resultEl) {
            if (result) {
                resultEl.textContent = 'Ожидаемая дата: ' + result.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
            } else {
                resultEl.textContent = 'Недостаточно данных или некорректный пробег.';
            }
        }
        App.initIcons();
    });

    const resetZoomBtn = document.getElementById('reset-all-zoom');
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', () => {
        ['fuelConsumptionChart', 'fuelPriceChart', 'costsChart'].forEach(id => {
            const chart = App.charts.activeCharts[id];
            if (chart && typeof chart.resetZoom === 'function') chart.resetZoom();
        });
    });

    const toCostPeriod = document.getElementById('to-cost-period');
    if (toCostPeriod) {
        toCostPeriod.addEventListener('change', () => {
            if (document.getElementById('tab-to')?.classList.contains('active')) {
                App.ui.pages.renderTOCostChart();
            }
        });
    }

    const settingsThemeToggle = document.getElementById('settings-theme-toggle');
    if (settingsThemeToggle) {
        settingsThemeToggle.addEventListener('click', () => {
            App.events.toggleTheme();
            const isDark = document.body.classList.contains('dark');
            this.innerHTML = isDark ? '<i data-lucide="sun"></i> Светлая тема' : '<i data-lucide="moon"></i> Тёмная тема';
            App.initIcons();
        });
    }
};

App.events.initHistoryFilters = function() {
    ['history-period-select', 'history-operation-filter', 'history-category-filter', 'history-executor-filter',
     'history-search', 'history-diy-only', 'history-cost-min', 'history-cost-max', 'history-mileage-min', 'history-mileage-max', 'history-sort-order'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventType = (el.tagName === 'INPUT' && el.type === 'checkbox') ? 'change' : (el.tagName === 'INPUT' ? 'input' : 'change');
            el.addEventListener(eventType, App.ui.pages.renderHistoryCards);
        }
    });

    const resetFiltersBtn = document.getElementById('history-reset-filters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            ['history-period-select', 'history-operation-filter', 'history-category-filter', 'history-executor-filter',
             'history-search', 'history-diy-only', 'history-cost-min', 'history-cost-max', 'history-mileage-min', 'history-mileage-max', 'history-sort-order'
            ].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = false;
                    else el.value = '';
                }
            });
            document.getElementById('history-sort-order').value = 'date-desc';
            App.ui.pages.renderHistoryCards();
        });
    }
};

App.events.initStatsListeners = function() {
    const periodSelect = document.getElementById('stats-period-select');
    if (periodSelect) {
        periodSelect.value = localStorage.getItem(App.config.STATS_PERIOD_KEY) || 'all';
        periodSelect.addEventListener('change', () => {
            localStorage.setItem(App.config.STATS_PERIOD_KEY, periodSelect.value);
            if (document.getElementById('tab-stats')?.classList.contains('active')) {
                App.ui.pages.renderFinanceTab();
            }
        });
    }
};

App.events.handleImport = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const d = JSON.parse(ev.target.result);
            App.store.operations = d.operations || [];
            App.store.settings = d.settings || App.defaults.settings;
            App.store.parts = d.parts || [];
            App.store.fuelLog = d.fuelLog || [];
            App.store.tireLog = d.tireLog || [];
            App.store.workCosts = d.workCosts || [];
            App.store.saveToLocalStorage();
            if (typeof App.renderAll === 'function') App.renderAll();
            App.toast('Импорт выполнен', 'success');
        } catch (err) {
            App.toast('Ошибка импорта', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

App.events.updateMileageAndAverages = function() {
    let m = document.getElementById('dash-new-mileage');
    let h = document.getElementById('dash-new-motohours');
    if (!m) m = document.getElementById('new-mileage');
    if (!h) h = document.getElementById('new-motohours');
    if (!m || !h) {
        console.warn('Поля пробега/моточасов не найдены на текущей странице');
        return;
    }

    const newM = App.utils.validateNumberInput(m, false);
    const newH = App.utils.validateNumberInput(h, true);
    if (newM === null || newH === null) return;

    if (newM < (App.store.baseMileage || 0)) {
        App.toast('Значение пробега меньше базового. Исправьте базовое значение на вкладке Автомобиль', 'error');
        return;
    }
    if (newH < (App.store.baseMotohours || 0)) {
        App.toast('Значение моточасов меньше базового. Исправьте базовое значение на вкладке Автомобиль', 'error');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    App.storage.addMileageRecord(today, newM, newH);
    App.store.mileageHistory.push({
        uuid: crypto.randomUUID(),
        date: today,
        mileage: newM,
        motohours: newH
    });
    App.store.mileageHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (App.store.mileageHistory.length >= 2) {
        const last = App.store.mileageHistory[App.store.mileageHistory.length - 1];
        const prev = App.store.mileageHistory[App.store.mileageHistory.length - 2];
        const days = (new Date(last.date) - new Date(prev.date)) / 86400000;
        if (days > 0) {
            App.store.settings.avgDailyMileage = (last.mileage - prev.mileage) / days;
            App.store.settings.avgDailyMotohours = (last.motohours - prev.motohours) / days;
        }
    } else {
        App.store.settings.avgDailyMileage = App.store.baseMileage > 0 ? (newM - App.store.baseMileage) / 30 : 20;
        App.store.settings.avgDailyMotohours = App.store.baseMotohours > 0 ? (newH - App.store.baseMotohours) / 30 : 1.65;
    }

    App.store.settings.currentMileage = newM;
    App.store.settings.currentMotohours = newH;

    if (App.config.USE_SUPABASE) {
        App.storage.addMileageRecord(today, newM, newH)
            .then(() => App.storage.saveSettings({
                currentMileage: newM,
                currentMotohours: newH,
                avgDailyMileage: App.store.settings.avgDailyMileage,
                avgDailyMotohours: App.store.settings.avgDailyMotohours,
                telegramToken: App.store.settings.telegramToken,
                telegramChatId: App.store.settings.telegramChatId,
                notificationMethod: App.store.settings.notificationMethod
            }))
            .catch(err => console.error('Ошибка сохранения пробега в Supabase:', err));
    }

    if (typeof App.renderAll === 'function') App.renderAll();
    if (typeof App.ui.pages.renderTop5Widget === 'function') App.ui.pages.renderTop5Widget();
    App.toast('Пробег и моточасы обновлены', 'success');
};
