// src/renderAll.js (или добавить в main.js, но для чистоты вынесем)
// Глобальная функция перерисовки всех вкладок в зависимости от текущей активной
window.App = window.App || {};

App.renderAll = function() {
    var activeTab = App.events.currentActiveTab;
    if (!activeTab) {
        // Определяем активную вкладку по классу
        var activeTabElement = document.querySelector('.tab-content.active');
        if (activeTabElement) {
            activeTab = activeTabElement.id.replace('tab-', '');
        } else {
            activeTab = 'dashboard';
        }
    }
    
    // Вызываем соответствующий рендер в зависимости от вкладки
    switch (activeTab) {
        case 'dashboard':
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
            break;
        case 'to':
            if (typeof App.ui.pages.renderTotalCost === 'function') App.ui.pages.renderTotalCost();
            if (typeof App.ui.pages.renderTOStats === 'function') App.ui.pages.renderTOStats();
            if (typeof App.ui.pages.renderOilResourceCard === 'function') App.ui.pages.renderOilResourceCard();
            if (typeof App.ui.pages.renderResourceBars === 'function') App.ui.pages.renderResourceBars();
            if (typeof App.ui.pages.renderTOCostChart === 'function') App.ui.pages.renderTOCostChart();
            if (typeof App.ui.pages.renderTOCategoryPieChart === 'function') App.ui.pages.renderTOCategoryPieChart();
            if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
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
            if (typeof App.ui.pages.checkPushSubscriptionStatus === 'function') App.ui.pages.checkPushSubscriptionStatus();
            break;
        default:
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
    }
};