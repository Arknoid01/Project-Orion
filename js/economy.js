/* ===================== ECONOMIE (DRACHMES) ===================== */
// Trésor de la cité en drachmes. Modèle léger :
//   - les maisons DESSERVIES par un bureau des impôts (walker) paient une taxe par tick,
//     proportionnelle à leur population ET au taux réglable par le joueur (voir taxes.js)
//   - chaque bâtiment coûte un entretien par tick
//   - poser un bâtiment / une route dépense son coût immédiatement
// Pas de salaires par métier : tout le reste est global.

let treasury = STARTING_TREASURY;

// Au-dessous de zéro, on plancher le trésor et on alerte une seule fois jusqu'à
// ce qu'il repasse positif (évite de spammer la notification chaque tick).
let bankruptNotified = false;

function canAfford(amount){
  return treasury >= amount;
}

// Dépense si possible. Renvoie true si la dépense a eu lieu, false sinon.
function spend(amount){
  if (!canAfford(amount)) return false;
  treasury -= amount;
  return true;
}

function collectTaxes(){
  let collected = 0;
  const perPop = taxCollectionRate();
  walkers
    .filter(w => w.serviceType === 'tax')
    .forEach(w => {
      for (const house of w.servedHouses){
        collected += grid[house.row][house.col].population * perPop;
      }
    });
  treasury += collected;
  return collected;
}

function totalUpkeep(){
  let total = 0;
  forEachBuilding((type) => { total += BUILDING_DEFS[type].upkeep || 0; });
  return total;
}

function payUpkeep(){
  const due = totalUpkeep();
  treasury -= due;
  if (treasury < 0){
    treasury = 0;
    if (!bankruptNotified){
      debugWarn('Trésor vide : entretien impayé');
      if (typeof showNotification === 'function') showNotification(t('economy.bankrupt'), 'bad');
      bankruptNotified = true;
    }
  } else {
    bankruptNotified = false;
  }
  return due;
}

/* ===================== REMBOURSEMENT DEMOLITION ===================== */
function demolishRefundParts(type, godPatron){
  if (type === 'road'){
    return { gold: Math.floor(ROAD_COST * DEMOLISH_REFUND_RATE), resources: {} };
  }
  if (type === 'grandTemple' && godPatron && typeof godByKey === 'function'){
    const god = godByKey(godPatron);
    if (!god) return { gold: 0, resources: {} };
    const resRefund = {};
    if (god.costResources){
      for (const [res, amt] of Object.entries(god.costResources)){
        const refund = Math.floor(amt * DEMOLISH_REFUND_RATE);
        if (refund > 0) resRefund[res] = refund;
      }
    }
    const gold = god.cost ? Math.floor(god.cost * DEMOLISH_REFUND_RATE) : 0;
    return { gold, resources: resRefund };
  }
  const def = BUILDING_DEFS[type];
  if (!def) return { gold: 0, resources: {} };
  const resRefund = {};
  if (def.costResources){
    for (const [res, amt] of Object.entries(def.costResources)){
      const refund = Math.floor(amt * DEMOLISH_REFUND_RATE);
      if (refund > 0) resRefund[res] = refund;
    }
  }
  const gold = def.cost ? Math.floor(def.cost * DEMOLISH_REFUND_RATE) : 0;
  return { gold, resources: resRefund };
}

function formatDemolishRefund(parts){
  const bits = [];
  if (parts.gold > 0) bits.push(`🪙 ${parts.gold} dr.`);
  for (const [res, amt] of Object.entries(parts.resources || {})){
    if (amt > 0) bits.push(`${amt} ${t('resource.' + res)}`);
  }
  return bits.join(' · ');
}

function applyDemolishRefund(type, godPatron){
  const parts = demolishRefundParts(type, godPatron);
  if (parts.gold > 0) treasury += parts.gold;
  const caps = (typeof computeCaps === 'function') ? computeCaps() : null;
  for (const [res, amt] of Object.entries(parts.resources || {})){
    if (amt <= 0) continue;
    const next = (resources[res] || 0) + amt;
    resources[res] = caps ? Math.min(caps[res] || next, next) : next;
  }
  return parts;
}

function notifyDemolishRefund(type, godPatron){
  const parts = applyDemolishRefund(type, godPatron);
  const details = formatDemolishRefund(parts);
  if (details && typeof showNotification === 'function'){
    showNotification(t('demolish.refund', { details }), 'good');
  }
  return parts;
}
