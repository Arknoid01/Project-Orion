/* ===================== DISTRIBUTION DES BIENS (MARCHES) ===================== */
// Les marchés desservent les maisons à portée (couverture calculée dans walkers.js)
// et leur distribuent plusieurs biens : nourriture (blé), huile, vin, laine.
// Chaque bien consomme réellement le stock de la ville (cf. MARKET_GOODS dans config.js).
// S'il n'y a pas assez de stock pour tout le monde, les maisons les plus proches du
// marché dans le trajet de patrouille sont servies en priorité (ordre de servedHouses).
//
// houseSupply : tileKey -> Set des besoins satisfaits pour le jour en cours.
let houseSupply = {};
let lastMarketDay = -1;

function resetMarketDay(){ lastMarketDay = -1; houseSupply = {}; }

function processMarkets(){
  const day = Math.floor(DEBUG.tickCount / DAY_DURATION_TICKS);
  if (day === lastMarketDay) return;
  lastMarketDay = day;
  houseSupply = {};
  walkers
    .filter(w => w.serviceType === 'market')
    .forEach(w => {
      for (const house of w.servedHouses){
        const key = tileKey(house.col, house.row);
        const needed = (typeof houseMarketNeeds === 'function')
          ? houseMarketNeeds(house.col, house.row)
          : new Set(MARKET_GOODS.map(g => g.need));
        for (const good of MARKET_GOODS){
          if (!needed.has(good.need)) continue;
          if (resources[good.resource] < good.perHouse) continue;
          resources[good.resource] -= good.perHouse;
          if (!houseSupply[key]) houseSupply[key] = new Set();
          houseSupply[key].add(good.need);
        }
      }
    });
}

function isHouseSupplied(need, col, row){
  const set = houseSupply[tileKey(col, row)];
  return !!set && set.has(need);
}

// Conservé pour compatibilité : la nourriture est un bien de marché comme un autre.
function isHouseFed(col, row){
  return isHouseSupplied('food', col, row);
}
