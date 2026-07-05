/* ===================== RÉCOLTES SAISONNIÈRES (blé, carottes) ===================== */
// Deux mois de récolte par an et par culture : gros apport au changement de mois
// (calendar.js). Entre les récoltes, production nulle au tick.

function getSeasonalCropConfig(resource){
  return (typeof SEASONAL_CROP_HARVEST !== 'undefined' && SEASONAL_CROP_HARVEST[resource])
    ? SEASONAL_CROP_HARVEST[resource]
    : null;
}

function isSeasonalHarvestMonth(resource, monthIndex){
  const cfg = getSeasonalCropConfig(resource);
  return !!(cfg && cfg.monthIndices.includes(monthIndex));
}

function getSeasonalHarvestMonthLabels(resource){
  const cfg = getSeasonalCropConfig(resource);
  if (!cfg || typeof MONTHS === 'undefined') return [];
  return cfg.monthIndices.map(i => {
    const m = MONTHS[i];
    return m ? t('calendar.month.' + m.key) : String(i);
  });
}

function processSeasonalHarvest(monthIndex){
  if (typeof SEASONAL_CROP_HARVEST === 'undefined' || !Array.isArray(grid) || !grid.length) return;
  const caps = (typeof computeCaps === 'function') ? computeCaps() : { ...(typeof BASE_CAP !== 'undefined' ? BASE_CAP : {}) };

  for (const [resource, cfg] of Object.entries(SEASONAL_CROP_HARVEST)){
    if (!cfg.monthIndices.includes(monthIndex)) continue;

    let buildingCount = 0;
    let addedTotal = 0;
    forEachBuilding((type) => {
      if (!cfg.buildingTypes.includes(type)) return;
      buildingCount++;
      const factor = (typeof industryFactor === 'function') ? industryFactor(resource) : 1;
      const amount = cfg.yieldBase * factor;
      const cap = caps[resource];
      const before = resources[resource] || 0;
      resources[resource] = Math.min(cap != null ? cap : Infinity, before + amount);
      addedTotal += resources[resource] - before;
    });

    if (buildingCount <= 0 || addedTotal <= 0) continue;

    if (resource === 'wheat' && typeof totalWheatProduced !== 'undefined'){
      totalWheatProduced += addedTotal;
    }

    const month = MONTHS[monthIndex];
    const monthLabel = month ? t('calendar.month.' + month.key) : '';
    if (typeof showNotification === 'function'){
      showNotification(t('harvest.' + resource, {
        amount: Math.floor(addedTotal),
        month: monthLabel,
      }), 'good');
    }
    if (typeof debugInfo === 'function'){
      debugInfo('Récolte saisonnière', { resource, monthIndex, buildings: buildingCount, added: addedTotal });
    }
  }
}

window.getSeasonalCropConfig = getSeasonalCropConfig;
window.isSeasonalHarvestMonth = isSeasonalHarvestMonth;
window.getSeasonalHarvestMonthLabels = getSeasonalHarvestMonthLabels;
window.processSeasonalHarvest = processSeasonalHarvest;
