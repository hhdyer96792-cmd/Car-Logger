// src/config/defaults.js
window.App = window.App || {};

App.defaults = {
    settings: {
        currentMileage: 0,
        currentMotohours: 0,
        avgDailyMileage: 45,
        avgDailyMotohours: 1.8,
        notificationMethod: 'telegram'
        reminderDays: '7,2',
        telegramEnabled: true
    },
    operations: [],
    parts: [],
    fuelLog: [],
    tireLog: [],
    workCosts: [],
    serviceRecords: [],
    mileageHistory: [],
    carProfiles: [],
    baseMileage: 0,
    baseMotohours: 0,
    purchaseDate: '',
    ownershipDays: 0,
    ownershipDisplayMode: 'days',
    driveFolderId: null
};