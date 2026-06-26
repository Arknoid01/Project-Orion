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
//   beauty   -> cachet accumulé sur la case (voir beauty.js)
const NEED_CHECKERS = {
  route:    hasAdjacentRoad,
  water:    (col, row) => isHouseServedBy('water', col, row),
  food:     (col, row) => isHouseSupplied('food', col, row),
  oil:      (col, row) => isHouseSupplied('oil', col, row),
  wine:     (col, row) => isHouseSupplied('wine', col, row),
  wool:     (col, row) => isHouseSupplied('wool', col, row),
  religion: (col, row) => isHouseServedBy('religion', col, row),
  health:   (col, row) => isHouseServedBy('health', col, row),
  beauty:   (col, row) => isTileBeautiful(col, row),
};

function needsMet(requires, col, row){
  return requires.every(need => NEED_CHECKERS[need] && NEED_CHECKERS[need](col, row));
}

/* ===================== EVOLUTION ===================== */
function evaluateHouses(){
  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;
    const cell = grid[row][col];
    const currentDef = HOUSE_LEVELS[cell.houseLevel];
    const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];

    if (nextDef && needsMet(nextDef.requires, col, row)){
      cell.houseLevel++;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      debugInfo(`Maison évoluée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
    } else if (cell.houseLevel > 0 && !needsMet(currentDef.requires, col, row)){
      cell.houseLevel--;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      debugWarn(`Maison dégradée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
    }
  });
}

function computeTotalPopulation(){
  let total = 0;
  forEachBuilding((type, col, row) => {
    if (type === 'maison') total += grid[row][col].population;
  });
  return total;
}
