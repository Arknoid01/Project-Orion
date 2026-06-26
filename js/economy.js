/* ===================== ECONOMIE (DRACHMES) ===================== */
// Trésor de la cité en drachmes. Modèle léger et passif :
//   - les maisons paient une taxe par tick proportionnelle à leur population
//   - chaque bâtiment coûte un entretien par tick
//   - poser un bâtiment / une route dépense son coût immédiatement
// Pas de walker collecteur, pas de salaires par métier : tout est global.

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
  forEachBuilding((type, col, row) => {
    if (type === 'maison') collected += grid[row][col].population * TAX_PER_POP;
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
