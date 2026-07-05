/* ===================== EMBELLISSEMENT (CACHET) ===================== */
// Chaque décoration (statue, jardin, colonnade...) diffuse du "cachet" (beauty)
// aux cases autour d'elle, avec un dégradé linéaire selon la distance. Le cachet
// d'une case est la SOMME des contributions de toutes les décorations à portée :
// grouper les décorations fait donc monter le cachet d'une zone (effet recherché).
//
// Une maison dont la case atteint BEAUTY_THRESHOLD satisfait le besoin 'beauty'
// (voir houses.js -> NEED_CHECKERS), ce qui débloque le niveau 'domaine'.
//
// Recalculé après chaque changement de bâtiment et à chaque tick, comme la
// couverture des walkers — coût négligeable sur une grille 14x14, pas
// d'optimisation incrémentale.

function clearBeauty(){
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      grid[row][col].beauty = 0;
    }
  }
}

// Diffuse le cachet d'une décoration sur les cases dans sa portée.
// Distance de Chebyshev (zone carrée), dégradé linéaire : pleine intensité à
// l'épicentre, nulle juste au-delà de la portée.
function spreadBeauty(col, row, def){
  const range = def.range || 0;
  const strength = def.beauty || 0;
  for (let dr = -range; dr <= range; dr++){
    for (let dc = -range; dc <= range; dc++){
      const c = col + dc;
      const r = row + dr;
      if (!inBounds(c, r)) continue;
      const dist = Math.max(Math.abs(dc), Math.abs(dr));
      const contribution = strength * (1 - dist / (range + 1));
      if (contribution > 0) grid[r][c].beauty += contribution;
    }
  }
}

function recomputeBeauty(){
  clearBeauty();
  forEachBuilding((type, col, row) => {
    const def = BUILDING_DEFS[type];
    if (def.isDecoration || def.isVenue) spreadBeauty(col, row, def);
  });
}

function isTileBeautiful(col, row){
  return inBounds(col, row) && (grid[row][col].beauty || 0) >= BEAUTY_THRESHOLD;
}
