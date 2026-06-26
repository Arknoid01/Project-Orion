/* ===================== BESOINS DES MAISONS ===================== */
function hasAdjacentRoad(col, row){
  const neighbors = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  return neighbors.some(([c, r]) => inBounds(c, r) && grid[r][c].hasRoad);
}

// Un seul besoin est réellement vérifiable aujourd'hui. Les autres sont des stubs
// volontaires : ils renvoient toujours false jusqu'à ce que le système correspondant
// existe (aqueduc pour 'water', marché pour 'food', embellissement pour 'beauty').
// Remplacer le stub par la vraie vérification suffira, le reste du code n'a pas à changer.
const NEED_CHECKERS = {
  route: hasAdjacentRoad,
  water: (col, row) => false,
  food:  (col, row) => false,
  beauty:(col, row) => false,
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
