/* ===================== NIVEAUX DE TERRAIN (BRIQUES LEGO) ===================== */

function terrainBlockMaxLevel(){
  return typeof TERRAIN_BLOCK_MAX_LEVEL === 'number' ? TERRAIN_BLOCK_MAX_LEVEL : 3;
}

/** Niveau entier 0–MAX à partir de la hauteur bruit + biome. */
function levelFromHeightAndTerrain(h, terrain){
  const maxL = terrainBlockMaxLevel();
  if (terrain === 'water' || h < MAP_WATER_THRESHOLD) return 0;

  if (terrain === 'sand' || terrain === 'wheat') return 1;

  if (terrain === 'marble') return maxL;
  if (terrain === 'rock'){
    if (h >= MAP_MARBLE_THRESHOLD - 0.06) return maxL;
    if (h >= MAP_HILL_THRESHOLD + 0.04) return Math.min(maxL, maxL - 1);
    return Math.min(maxL, 2);
  }

  if (terrain === 'hill'){
    if (h >= MAP_MARBLE_THRESHOLD - 0.10) return maxL;
    return Math.min(maxL, 2);
  }

  if (terrain === 'forest'){
    if (h >= MAP_HILL_THRESHOLD + 0.06) return Math.min(maxL, 2);
    return 1;
  }

  if (h >= MAP_MARBLE_THRESHOLD - 0.04) return maxL;
  if (h >= MAP_HILL_THRESHOLD + 0.02) return Math.min(maxL, 2);
  return 1;
}

function elevationFromLevel(level){
  const maxL = terrainBlockMaxLevel();
  return maxL > 0 ? level / maxL : 0;
}

function levelFromElevation(elev){
  const maxL = terrainBlockMaxLevel();
  return Math.max(0, Math.min(maxL, Math.round((elev || 0) * maxL)));
}

function syncCellLevelElevation(cell){
  if (!cell) return;
  if (typeof cell.level !== 'number'){
    cell.level = levelFromElevation(cell.elevation);
  }
  cell.elevation = elevationFromLevel(cell.level);
}

function cellLevel(col, row){
  if (!inBounds(col, row)) return 1;
  const cell = grid[row][col];
  if (typeof cell.level === 'number') return cell.level;
  return levelFromElevation(cell.elevation);
}

/** Espacement vertical entre briques empilées (px écran). */
function legoBrickStep(){
  if (typeof LEGO_BRICK_STEP === 'number') return LEGO_BRICK_STEP;
  return TILE_H;
}

/** Décalage iso : chaque niveau monte d'une brique ; l'eau est une brique plus bas. */
function blockElevationOffset(level){
  const step = legoBrickStep();
  if (level <= 0) return -step;
  return (level - 1) * step;
}

function cellBlockStep(){
  return legoBrickStep();
}

function blockFillKeyForCell(cell, tierLevel){
  const byLevel = typeof TERRAIN_BLOCK_LEVEL_FILL === 'object' && TERRAIN_BLOCK_LEVEL_FILL
    ? TERRAIN_BLOCK_LEVEL_FILL[tierLevel || cell.level]
    : null;
  if (byLevel) return byLevel;
  const byTerrain = typeof TERRAIN_BLOCK_FILL_MAP === 'object' && TERRAIN_BLOCK_FILL_MAP
    ? TERRAIN_BLOCK_FILL_MAP[cell.terrain]
    : null;
  if (byTerrain) return byTerrain;
  return typeof TERRAIN_BLOCK_FILL === 'string' ? TERRAIN_BLOCK_FILL : 'dirt';
}

function blockTopKeyForCell(cell){
  const map = typeof TERRAIN_BLOCK_MAP === 'object' ? TERRAIN_BLOCK_MAP : {};
  const key = map[cell.terrain];
  if (key === null || key === undefined) return 'grass';
  return key;
}

/** Clé sprite pour le calque texture — tient compte du niveau de pile. */
function capSpriteKeyForCell(cell, level){
  const lv = typeof level === 'number' ? level : 1;
  const biome = cell.terrain;
  if (biome === 'hill') return 'hill';
  if (biome === 'rock') return 'rock';

  const levelMap = typeof TERRAIN_LEVEL_CAP_MAP === 'object' && TERRAIN_LEVEL_CAP_MAP;
  const levelBiomes = typeof TERRAIN_LEVEL_CAP_BIOMES === 'object' && TERRAIN_LEVEL_CAP_BIOMES
    ? TERRAIN_LEVEL_CAP_BIOMES
    : ['grass', 'hill', 'wheat'];

  if (levelMap && lv >= 3 && levelMap[3] && biome !== 'marble'){
    if (levelBiomes.includes(biome) || biome === 'forest') return levelMap[3];
  }
  if (levelMap && lv >= 2 && levelMap[2] && levelBiomes.includes(biome)){
    return levelMap[2];
  }
  return blockTopKeyForCell(cell);
}

function usesTerrainBlocks(){
  return typeof TERRAIN_USE_BLOCKS === 'boolean' && TERRAIN_USE_BLOCKS;
}

function mapEdgeDistance(col, row){
  if (typeof GRID_COLS !== 'number' || typeof GRID_ROWS !== 'number') return 999;
  return Math.min(col, row, GRID_COLS - 1 - col, GRID_ROWS - 1 - row);
}

function isMapEdgeCell(col, row){
  const w = typeof MAP_EDGE_BORDER_WIDTH === 'number' ? MAP_EDGE_BORDER_WIDTH : 0;
  return w > 0 && mapEdgeDistance(col, row) < w;
}
