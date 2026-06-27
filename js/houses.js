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
  wool:     (col, row) => isHouseSupplied('wool', col, row),
  religion: (col, row) => isHouseServedBy('religion', col, row),
  health:   (col, row) => isHouseServedBy('health', col, row),
  fire:     (col, row) => isHouseServedBy('fire', col, row),
  beauty:   (col, row) => isTileBeautiful(col, row),
};

function needsMet(requires, col, row){
  return requires.every(need => NEED_CHECKERS[need] && NEED_CHECKERS[need](col, row));
}

/* ===================== EVOLUTION ===================== */
function evaluateHouses(){
  checkEmigrationWarning();
  renderTaxPanel(); // la faveur évolue seule (mythology.js) : le panneau doit suivre chaque tick

  forEachBuilding((type, col, row) => {
    if (type !== 'maison') return;
    const cell = grid[row][col];
    const currentDef = HOUSE_LEVELS[cell.houseLevel];
    const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];

    // La croissance est probabiliste (pas instantanée) : taux d'imposition haut et/ou
    // faveur basse la ralentissent (voir growthChance dans migration.js).
    // La dégradation par besoin manquant reste immédiate (perdre un service n'est
    // pas une question de politique, c'est un échec direct du joueur à le couvrir).
    if (nextDef && needsMet(nextDef.requires, col, row) && Math.random() < growthChance()){
      cell.houseLevel++;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      debugInfo(`Maison évoluée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
    } else if (cell.houseLevel > 0 && !needsMet(currentDef.requires, col, row)){
      cell.houseLevel--;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      debugWarn(`Maison dégradée : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
    } else if (cell.houseLevel > 0 && Math.random() < emigrationChance()){
      // Émigration : la ville est si peu attractive (faveur basse / taxe haute) que des
      // habitants partent, même si les besoins de ce niveau sont pourtant remplis.
      cell.houseLevel--;
      cell.population = HOUSE_LEVELS[cell.houseLevel].population;
      debugWarn(`Émigration : ${t(HOUSE_LEVELS[cell.houseLevel].nameKey)}`, { col, row });
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

/* ===================== ICONES DE STATUT ===================== */
// Risques actifs (incendie/maladie) en premier -- ils s'appliquent à TOUTE maison,
// peu importe son niveau (une cabane peut brûler tout comme un palais). Ensuite,
// les besoins manquants pour le palier suivant. Pas de cap artificiel arbitraire,
// mais en pratique une maison bien gérée n'a presque jamais plus de 1-2 icônes.
function getHouseStatusIcons(col, row, cell){
  const icons = [];

  if (!isHouseServedBy('fire', col, row)) icons.push(NEED_ICONS.fire);
  if (!isHouseServedBy('health', col, row)) icons.push(NEED_ICONS.health);

  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];
  if (nextDef){
    for (const need of nextDef.requires){
      if (need === 'fire' || need === 'health') continue; // déjà couverts ci-dessus
      if (!NEED_CHECKERS[need](col, row)) icons.push(NEED_ICONS[need]);
    }
  }

  return icons;
}
