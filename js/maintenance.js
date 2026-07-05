/* ===================== MAINTENANCE (INCENDIES / MALADIES) ===================== */
// Chaque tick, tout bâtiment NON couvert par une tour de guet (serviceType='fire')
// risque un incendie ; les maisons non couvertes par une infirmerie (serviceType='health')
// risquent une épidémie. Une case couverte garde un risque résiduel très faible,
// jamais nul (cf. config.js pour les chiffres).
//
// Effet d'un sinistre sur une maison : perd un niveau (comme une dégradation classique),
// SAUF si déjà au niveau 0 (cabane) -> détruite. Les autres bâtiments brûlent entièrement.
function checkMaintenanceRisks(){
  forEachBuilding((type, col, row) => {
    const def = BUILDING_DEFS[type];
    if (!def || def.isDecoration) return;

    if (type === 'maison'){
      const fireChance = isHouseServedBy('fire', col, row) ? FIRE_CHANCE_COVERED : FIRE_CHANCE_UNCOVERED;
      if (Math.random() < fireChance){
        triggerDisaster(col, row, 'fire');
        return;
      }

      const diseaseBase = isHouseServedBy('health', col, row) ? DISEASE_CHANCE_COVERED : DISEASE_CHANCE_UNCOVERED;
      const diseaseChance = diseaseBase * ((typeof godDiseaseMultiplier === 'function') ? godDiseaseMultiplier() : 1);
      if (Math.random() < diseaseChance){
        triggerDisaster(col, row, 'disease');
      }
      return;
    }

    const fireServed = (typeof isTileFireServed === 'function') && isTileFireServed(col, row);
    const fireChance = fireServed ? FIRE_CHANCE_COVERED : FIRE_CHANCE_UNCOVERED;
    if (Math.random() < fireChance){
      triggerBuildingFire(col, row, type);
    }
  });
}

function triggerBuildingFire(col, row, type){
  const cell = grid[row][col];
  cell.building = null;
  cell.houseLevel = 0;
  cell.population = 0;
  if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
  if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads([{ col, row }]);
  if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
  debugWarn('Incendie : bâtiment détruit', { col, row, type });
  showNotification(t('maintenance.buildingFireDestroyed'), 'bad');
  recomputeAllWalkers();
  if (typeof markHouseIconsDirty === 'function') markHouseIconsDirty();
}

function triggerDisaster(col, row, kind){
  const cell = grid[row][col];

  if (cell.houseLevel > 0){
    if (typeof queueEmigration === 'function' && queueEmigration(col, row, false)){
      showNotification(t(kind === 'fire' ? 'maintenance.fireDamage' : 'maintenance.diseaseDamage'), 'bad');
    } else {
      cell.houseLevel--;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      debugWarn(kind === 'fire' ? 'Incendie : maison endommagée' : 'Épidémie : maison touchée', { col, row });
      showNotification(t(kind === 'fire' ? 'maintenance.fireDamage' : 'maintenance.diseaseDamage'), 'bad');
      if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
    }
  } else {
    if (typeof queueHouseDeparture === 'function' && queueHouseDeparture(col, row, false)){
      debugWarn(kind === 'fire' ? 'Incendie : maison détruite' : 'Épidémie : maison décimée', { col, row });
      showNotification(t(kind === 'fire' ? 'maintenance.fireDestroyed' : 'maintenance.diseaseDestroyed'), 'bad');
    } else {
      cell.building = null;
      cell.houseLevel = 0;
      cell.population = 0;
      if (typeof markHouseVisualDirty === 'function') markHouseVisualDirty();
      // Retire la dalle de sol Three.js (sinon la tuile reste après destruction).
      if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads([{ col, row }]);
      if (typeof patchThreeDecors === 'function') patchThreeDecors([{ col, row }]);
      debugWarn(kind === 'fire' ? 'Incendie : maison détruite' : 'Épidémie : maison décimée', { col, row });
      showNotification(t(kind === 'fire' ? 'maintenance.fireDestroyed' : 'maintenance.diseaseDestroyed'), 'bad');
      recomputeAllWalkers();
    }
  }
  if (typeof markHouseIconsDirty === 'function') markHouseIconsDirty();
}
