/* ===================== BESOINS DES MAISONS ===================== */
function hasAdjacentRoad(col, row){
  const neighbors = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  return neighbors.some(([c, r]) => inBounds(c, r) && grid[r][c].hasRoad);
}

// Chaque besoin est câblé à son système :
//   route    -> adjacence d'une route
//   water    -> couverture d'une fontaine (walker)
//   food/oil/wine/wool -> biens distribués par un marché (consomme le stock)
//   religion -> couverture d'un temple (walker)
//   health   -> couverture d'une infirmerie (walker)
//   fire     -> couverture d'une tour de guet (walker) -- voir maintenance.js
//   beauty   -> cachet accumulé sur la case (voir beauty.js)
const NEED_CHECKERS = {
  route:    hasAdjacentRoad,
  water:    (col, row) => isHouseServedBy('water', col, row),
  food:     (col, row) => isHouseSupplied('food', col, row),
  oil:      (col, row) => isHouseSupplied('oil', col, row),
  wine:     (col, row) => isHouseSupplied('wine', col, row),
  fish:     (col, row) => isHouseSupplied('fish', col, row),
  clothing: (col, row) => isHouseSupplied('clothing', col, row),
  religion: (col, row) => isHouseServedBy('religion', col, row),
  culture:  (col, row) => isHouseServedBy('culture', col, row),
  health:   (col, row) => isHouseServedBy('health', col, row),
  fire:     (col, row) => isHouseServedBy('fire', col, row),
  beauty:   (col, row) => isTileBeautiful(col, row),
};

function needsMet(requires, col, row){
  return requires.every(need => NEED_CHECKERS[need] && NEED_CHECKERS[need](col, row));
}

// Besoins alimentaires distribués par le marché pour une maison (palier actuel + suivant).
function houseMarketNeeds(col, row){
  const cell = grid[row][col];
  if (!cell || cell.building !== 'maison') return new Set();
  const needs = new Set();
  for (const level of [HOUSE_LEVELS[cell.houseLevel], HOUSE_LEVELS[cell.houseLevel + 1]]){
    if (!level) continue;
    for (const need of level.requires){
      if (need === 'food' || need === 'oil' || need === 'wine' || need === 'fish' || need === 'clothing') needs.add(need);
    }
  }
  return needs;
}

/* ===================== EVOLUTION ===================== */
function isHouseEvolutionDay(){
  return DEBUG.tickCount > 0 && DEBUG.tickCount % DAY_DURATION_TICKS === 0;
}

function evaluateHouses(){
  checkEmigrationWarning();
  renderTaxPanel();
  const evolutionDay = isHouseEvolutionDay();
  let levelChanged = false;

  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;
    const cell = grid[row][col];
    const currentDef = HOUSE_LEVELS[cell.houseLevel];
    const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];

    // Dégradation si un besoin du palier actuel manque — colon repart vers la sortie.
    if (cell.houseLevel > 0 && !needsMet(currentDef.requires, col, row)){
      if (typeof queueEmigration === 'function' && queueEmigration(col, row)){
        // habitant en route
      } else {
        cell.houseLevel--;
        cell.population = HOUSE_LEVELS[cell.houseLevel].population;
        debugWarn(`Maison dégradée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
        markHouseVisualDirty();
        levelChanged = true;
      }
      return;
    }

    if (!evolutionDay) return;

    // Croissance et émigration : une fois par jour de jeu.
    if (nextDef && needsMet(nextDef.requires, col, row) && Math.random() < growthChance()){
      if (typeof queueImmigration === 'function' && queueImmigration(col, row)){
        // colon en route
      } else {
        cell.houseLevel++;
        cell.population = HOUSE_LEVELS[cell.houseLevel].population;
        debugInfo(`Maison évoluée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
        markHouseVisualDirty();
        levelChanged = true;
      }
    } else if (cell.houseLevel > 0 && Math.random() < emigrationChance()){
      if (typeof queueEmigration === 'function' && queueEmigration(col, row)){
        // habitant en route
      } else {
        cell.houseLevel--;
        cell.population = HOUSE_LEVELS[cell.houseLevel].population;
        debugWarn(`Émigration : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
        markHouseVisualDirty();
        levelChanged = true;
      }
    }
  });
  // Ne rafraîchir les icônes que si un niveau a vraiment changé — évite le
  // clignotement quotidien lors du reset du marché en début de journée.
  if (levelChanged && typeof markHouseIconsDirty === 'function') markHouseIconsDirty();
}

/** Rafraîchit le sprite overlay quand le niveau d'une maison change. */
function markHouseVisualDirty(){
  if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}
window.markHouseVisualDirty = markHouseVisualDirty;

function computeTotalPopulation(){
  let total = 0;
  forEachBuilding((type, col, row) => {
    if (type === 'maison') total += grid[row][col].population;
  });
  return total;
}

/* ===================== ICONES DE STATUT ===================== */
// En mode pass (Zeus) : missing = hors réseau ; pending = marché en attente de livraison.
function walkerPassIconsEnabled(){
  return typeof WALKER_PASS_DELIVERY !== 'undefined' && WALKER_PASS_DELIVERY;
}

function marketNeedBlocked(need, col, row){
  if (need !== 'food') return false;
  const walker = typeof findServingWalker === 'function'
    ? findServingWalker('market', col, row)
    : walkers.find(w => w.serviceType === 'market'
      && w.servedHouses.some(h => h.col === col && h.row === row));
  if (!walker) return true;
  const def = BUILDING_DEFS[walker.type];
  return typeof isGranaryRoadLinked === 'function'
    && !isGranaryRoadLinked(walker.col, walker.row, def && def.range != null ? def.range : 18);
}

function cultureNeedBlocked(col, row){
  const walker = typeof findServingWalker === 'function'
    ? findServingWalker('culture', col, row)
    : walkers.find(w => w.serviceType === 'culture'
      && w.servedHouses.some(h => h.col === col && h.row === row));
  if (!walker) return true;
  const def = BUILDING_DEFS[walker.type];
  return typeof isCultureVenueLinked === 'function'
    && !isCultureVenueLinked(walker.col, walker.row, def && def.range != null ? def.range : 18);
}

function needIconState(need, col, row){
  const checker = NEED_CHECKERS[need];
  if (!checker) return 'missing';

  const marketNeeds = ['food', 'oil', 'wine', 'fish', 'clothing'];
  const walkerNeeds = ['water', 'religion', 'health', 'fire', 'culture'];

  if (marketNeeds.includes(need)){
    if (!walkerPassIconsEnabled()) return checker(col, row) ? 'ok' : 'missing';
    if (checker(col, row)) return 'ok';
    if (!isHouseEligibleForService('market', col, row)) return 'missing';
    if (!houseMarketNeeds(col, row).has(need)) return 'ok';
    if (marketNeedBlocked(need, col, row)) return 'missing';
    return 'pending';
  }

  if (walkerNeeds.includes(need)){
    if (!walkerPassIconsEnabled()) return checker(col, row) ? 'ok' : 'missing';
    if (checker(col, row)) return 'ok';
    if (need === 'culture' && cultureNeedBlocked(col, row)) return 'missing';
    if (isHouseEligibleForService(need, col, row)) return 'pending';
    return 'missing';
  }

  return checker(col, row) ? 'ok' : 'missing';
}

function pushNeedIcon(icons, need, col, row){
  const state = needIconState(need, col, row);
  // 'pending' = walker en route → ne pas afficher (revient chaque jour, crée du bruit visuel)
  // 'ok'      = besoin satisfait  → ne pas afficher
  if (state !== 'missing') return;
  icons.push({ text: NEED_ICONS[need], status: state });
}

// Risques actifs (incendie/maladie) en premier -- ils s'appliquent à TOUTE maison,
// peu importe son niveau (une cabane peut brûler tout comme un palais). Ensuite,
// les besoins manquants pour le palier suivant. Pas de cap artificiel arbitraire,
// mais en pratique une maison bien gérée n'a presque jamais plus de 1-2 icônes.
function getHouseStatusIcons(col, row, cell){
  const icons = [];

  pushNeedIcon(icons, 'fire', col, row);
  pushNeedIcon(icons, 'health', col, row);

  const currentDef = HOUSE_LEVELS[cell.houseLevel];
  if (currentDef && cell.houseLevel > 0){
    for (const need of currentDef.requires){
      if (need === 'fire' || need === 'health') continue;
      pushNeedIcon(icons, need, col, row);
    }
  }

  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];
  if (nextDef){
    for (const need of nextDef.requires){
      if (need === 'fire' || need === 'health') continue;
      if (currentDef && currentDef.requires.includes(need)) continue;
      pushNeedIcon(icons, need, col, row);
    }
  }

  return icons;
}

/** Icônes de statut pour bâtiments non résidentiels (incendie via tour de guet). */
function getBuildingStatusIcons(col, row, type){
  const def = BUILDING_DEFS[type];
  if (!def || def.isHouse || def.isDecoration) return [];
  const icons = [];
  if (typeof isTileFireServed !== 'function') return icons;
  // Couvert par une tour → aucun risque, aucune icône.
  if (isTileFireServed(col, row)) return icons;
  // Aucune tour de guet à portée → icône manquant (pas d'état "en attente").
  icons.push({ text: NEED_ICONS.fire, status: 'missing' });
  return icons;
}
window.getHouseStatusIcons = getHouseStatusIcons;
window.getBuildingStatusIcons = getBuildingStatusIcons;
window.needIconState = needIconState;
