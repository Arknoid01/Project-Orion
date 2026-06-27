/* ===================== MAINTENANCE (INCENDIES / MALADIES) ===================== */
// Chaque tick, toute maison NON couverte par une tour de guet (serviceType='fire')
// risque un incendie ; non couverte par une infirmerie (serviceType='health'),
// elle risque une épidémie. Une maison couverte garde un risque résiduel très faible,
// jamais nul (cf. config.js pour les chiffres).
//
// Effet d'un sinistre : la maison perd un niveau (comme une dégradation classique),
// SAUF si elle est déjà au niveau 0 (cabane) -> dans ce cas elle est entièrement
// détruite (démolie). Une maison protégée a donc plus de marge avant de tout perdre.
function checkMaintenanceRisks(){
  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;

    const fireChance = isHouseServedBy('fire', col, row) ? FIRE_CHANCE_COVERED : FIRE_CHANCE_UNCOVERED;
    if (Math.random() < fireChance){
      triggerDisaster(col, row, 'fire');
      return; // un seul sinistre par maison et par tick
    }

    const diseaseChance = isHouseServedBy('health', col, row) ? DISEASE_CHANCE_COVERED : DISEASE_CHANCE_UNCOVERED;
    if (Math.random() < diseaseChance){
      triggerDisaster(col, row, 'disease');
    }
  });
}

function triggerDisaster(col, row, kind){
  const cell = grid[row][col];

  if (cell.houseLevel > 0){
    cell.houseLevel--;
    cell.population = HOUSE_LEVELS[cell.houseLevel].population;
    debugWarn(kind === 'fire' ? 'Incendie : maison endommagée' : 'Épidémie : maison touchée', { col, row });
    showNotification(t(kind === 'fire' ? 'maintenance.fireDamage' : 'maintenance.diseaseDamage'), 'bad');
  } else {
    cell.building = null;
    cell.houseLevel = 0;
    cell.population = 0;
    debugWarn(kind === 'fire' ? 'Incendie : maison détruite' : 'Épidémie : maison décimée', { col, row });
    showNotification(t(kind === 'fire' ? 'maintenance.fireDestroyed' : 'maintenance.diseaseDestroyed'), 'bad');
    recomputeAllWalkers(); // une case s'est libérée, un bâtiment a disparu
  }
}
