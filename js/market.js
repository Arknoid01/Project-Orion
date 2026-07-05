/* ===================== DISTRIBUTION DES BIENS (MARCHES) ===================== */
// Mode classique : batch 1×/jour pour toutes les maisons éligibles.
// Mode WALKER_PASS_DELIVERY : livraison au passage du walker (walkers.js).
let houseSupply = {};
let lastMarketDay = -1;

function resetMarketDay(){ lastMarketDay = -1; houseSupply = {}; }

function marketPassMode(){
  return typeof WALKER_PASS_DELIVERY !== 'undefined' && WALKER_PASS_DELIVERY;
}

function ensureHouseSupplyKey(col, row){
  const key = tileKey(col, row);
  if (!houseSupply[key]) houseSupply[key] = new Set();
  return key;
}

/** Livraison marché au passage — appelée depuis walkers.js. Retourne true si au moins un bien livré. */
function deliverMarketAtHouse(walker, col, row){
  const needed = (typeof houseMarketNeeds === 'function')
    ? houseMarketNeeds(col, row)
    : new Set(MARKET_GOODS.map(g => g.need));
  if (!needed.size) return false;

  const def = BUILDING_DEFS[walker.type];
  const range = def && def.range != null ? def.range : 18;
  const granaryOk = (typeof isGranaryRoadLinked === 'function')
    ? isGranaryRoadLinked(walker.col, walker.row, range)
    : true;

  let delivered = false;
  const key = ensureHouseSupplyKey(col, row);

  for (const good of MARKET_GOODS){
    if (!needed.has(good.need)) continue;
    if (houseSupply[key].has(good.need)) continue;
    if (good.need === 'food' && !granaryOk) continue;
    if ((resources[good.resource] || 0) < good.perHouse) continue;
    resources[good.resource] -= good.perHouse;
    houseSupply[key].add(good.need);
    delivered = true;
  }
  return delivered;
}

function processMarkets(){
  if (marketPassMode()) return;
  const day = Math.floor(DEBUG.tickCount / DAY_DURATION_TICKS);
  if (day === lastMarketDay) return;
  lastMarketDay = day;
  houseSupply = {};
  walkers
    .filter(w => w.serviceType === 'market')
    .forEach(w => {
      for (const house of w.servedHouses){
        deliverMarketAtHouse(w, house.col, house.row);
      }
    });
}

function isHouseSupplied(need, col, row){
  const set = houseSupply[tileKey(col, row)];
  return !!set && set.has(need);
}

function isHouseFed(col, row){
  return isHouseSupplied('food', col, row);
}

window.deliverMarketAtHouse = deliverMarketAtHouse;
