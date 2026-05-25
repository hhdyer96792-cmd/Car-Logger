// src/modules/premium/fleetComparison.js
export function init() {
    console.log('[Premium] Fleet Comparison module initialized');
}

export async function compareCars(car1Id, car2Id) {
    await App.ui.alertModal('Premium функция: сравнение двух автомобилей. Реализация будет добавлена позже.');
}