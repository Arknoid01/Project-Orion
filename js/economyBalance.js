/* ===================== ESTIMATIONS D'EQUILIBRAGE ===================== */
// Aide le joueur à voir si production journalière >= consommation journalière.
// Les chiffres sont des estimations (emploi/taxes actuels, stock intermédiaire supposé disponible).

function estimateDailyProduction(){
  const out = mergeResources({});
  if (typeof industryFactor !== 'function') return out;
  const day = DAY_DURATION_TICKS;
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (!def) return;
    if (def.produces && !def.consumes){
      const f = industryFactor(def.produces);
      out[def.produces] += def.rate * f * day;
    }
  });
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (!def || !def.consumes) return;
    const f = industryFactor(def.produces);
    out[def.produces] += def.rate * f * day;
  });
  return out;
}

function estimateDailyMarketDemand(){
  const d = mergeResources({});
  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;
    const needs = (typeof houseMarketNeeds === 'function') ? houseMarketNeeds(col, row) : new Set();
    for (const good of MARKET_GOODS){
      if (!needs.has(good.need)) continue;
      d[good.resource] = (d[good.resource] || 0) + good.perHouse;
    }
  });
  return d;
}

function estimateDailyIntermediateUse(){
  const use = mergeResources({});
  if (typeof industryFactor !== 'function') return use;
  const day = DAY_DURATION_TICKS;
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (!def || !def.consumes) return;
    const f = industryFactor(def.produces);
    for (const [resName, amount] of Object.entries(def.consumes)){
      use[resName] = (use[resName] || 0) + amount * f * day;
    }
  });
  return use;
}

function renderEconomyBalance(){
  const el = document.getElementById('economyBalanceList');
  if (!el) return;
  const prod = estimateDailyProduction();
  const demand = estimateDailyMarketDemand();
  const interUse = estimateDailyIntermediateUse();
  const keys = ['wheat', 'fish', 'olives', 'grapes', 'marble', 'oil', 'wine', 'wool', 'clothing', 'coal', 'bronze', 'arms', 'sculpture'];
  el.innerHTML = keys.map(k => {
    const p = prod[k] || 0;
    const need = (demand[k] || 0) + (interUse[k] || 0);
    if (p < 0.05 && need < 0.05) return '';
    const ok = p >= need * 0.95;
    const icon = MANAGE_RESOURCE_ICONS[k] || '📦';
    return `<div class="row ${ok ? '' : 'eco-warn'}"><span>${icon} ${t('resource.' + k)}</span>`
      + `<b>+${p.toFixed(1)} / −${need.toFixed(1)} ${t('economy.perDay')}</b></div>`;
  }).filter(Boolean).join('') || `<div class="row"><span>${t('economy.noActivity')}</span></div>`;
}
