/* ===================== DISTRIBUTION DES BIENS (MARCHES) ===================== */
// Les marchés desservent les maisons à portée (couverture calculée dans walkers.js)
// et leur distribuent plusieurs biens : nourriture (blé), huile, vin, laine.
// Chaque bien consomme réellement le stock de la ville (cf. MARKET_GOODS dans config.js).
// S'il n'y a pas assez de stock pour tout le monde, les maisons les plus proches du
// marché dans le trajet de patrouille sont servies en priorité (ordre de servedHouses).
//
// houseSupply : tileKey -> Set des besoins satisfaits ce tick ('food','oil','wine','wool').
let houseSupply = {};

function processMarkets(){
  houseSupply = {};
  walkers
    .filter(w => w.serviceType === 'market')
    .forEach(w => {
      for (const house of w.servedHouses){
        const key = tileKey(house.col, house.row);
        for (const good of MARKET_GOODS){
          if (resources[good.resource] < good.perHouse) continue; // stock épuisé pour ce bien
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
