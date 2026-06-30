/* ===================== GENERATION PROCEDURALE DE CARTE ===================== */
// Relief : bruit domain-warp + massifs ridgés + humidité → biomes cohérents.
// Modes : continent (terre continue) ou île (avec couloir terrestre vers le bord sud).

/* --- Overlay de chargement + cession de contrôle au navigateur ---
   IMPORTANT : sans ce yield, la barre de progression ne s'affiche JAMAIS,
   même avec un délai/setTimeout autour de l'appel global, car tant que le
   JS tourne en synchrone le navigateur ne repaint rien. Double requestAnimationFrame
   = on attend qu'une frame ait réellement été peinte avant de continuer. */
function yieldFrame(){
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function showGenLoading(){
  const el = document.getElementById('genLoadingOverlay');
  if (el) el.classList.add('open');
  const errBox = document.getElementById('genErrorBox');
  if (errBox){ errBox.style.display = 'none'; errBox.textContent = ''; }
  reportGenProgress(0, 'Initialisation…');
}

function hideGenLoading(){
  const el = document.getElementById('genLoadingOverlay');
  if (el) el.classList.remove('open');
}

function reportGenProgress(pct, label){
  const bar = document.getElementById('genProgressBar');
  const lbl = document.getElementById('genProgressLabel');
  if (bar) bar.style.width = Math.max(0, Math.min(100, Math.round(pct))) + '%';
  if (lbl && label) lbl.textContent = label;
}

/** Affiche l'erreur réelle dans l'overlay au lieu de laisser un freeze silencieux. */
function showGenError(err){
  console.error('[Olympos] Erreur génération du monde :', err);
  const box = document.getElementById('genErrorBox');
  if (box){
    box.style.display = 'block';
    box.textContent = (err && err.stack) ? err.stack : String(err);
  }
  const lbl = document.getElementById('genProgressLabel');
  if (lbl) lbl.textContent = 'Échec de la génération — détail ci-dessous (F12 aussi).';
}

let mapSeed = 0;
let mapLandStyle = 'continent';
let mapWalkerEntry = null;
let mapEntryCorridorCells = null;

function pickMapLandStyle(seed){
  const mode = typeof MAP_LAND_STYLE === 'string' ? MAP_LAND_STYLE : 'mixed';
  if (mode === 'continent' || mode === 'island') return mode;
  const chance = typeof MAP_ISLAND_CHANCE === 'number' ? MAP_ISLAND_CHANCE : 0.38;
  return mulberry32(seed + 44000)() < chance ? 'island' : 'continent';
}

function effectiveEdgeBorderWidth(){
  if (mapLandStyle === 'island'){
    return typeof MAP_ISLAND_EDGE_BORDER === 'number'
      ? MAP_ISLAND_EDGE_BORDER
      : (typeof MAP_EDGE_BORDER_WIDTH === 'number' ? MAP_EDGE_BORDER_WIDTH : 4);
  }
  return typeof MAP_CONTINENT_EDGE_BORDER === 'number' ? MAP_CONTINENT_EDGE_BORDER : 0;
}

function mountainRangeFactor(nx, ny, seed){
  const mul = typeof MAP_RANGE_SCALE_MUL === 'number' ? MAP_RANGE_SCALE_MUL : 0.46;
  const strength = typeof MAP_RANGE_STRENGTH === 'number' ? MAP_RANGE_STRENGTH : 0.24;
  const ridges = ridgedNoise(nx * mul + 7, ny * mul + 7, seed + 7100);
  return ridges * ridges * strength;
}

let mapLandBridgePath = null;

function entryCorridorHalfWidth(){
  const w = typeof MAP_ENTRY_CORRIDOR_WIDTH === 'number' ? MAP_ENTRY_CORRIDOR_WIDTH : 4;
  return Math.max(1, Math.floor(w / 2));
}

function isEntryCorridorCell(col, row){
  if (!mapEntryCorridorCells) return false;
  return mapEntryCorridorCells.has(`${col},${row}`);
}

/** Chemin sinueux du bord sud vers l'intérieur (suit le relief existant). */
function buildLandBridgePath(seed, heights){
  const rng = mulberry32(seed + 88001);
  const colStart = typeof MIGRANT_ENTRY_COL === 'number' ? MIGRANT_ENTRY_COL : Math.floor(GRID_COLS / 2);
  const wind = typeof MAP_LAND_BRIDGE_WIND === 'number' ? MAP_LAND_BRIDGE_WIND : 0.38;
  const endRow = mapLandStyle === 'island'
    ? Math.max(Math.floor(GRID_ROWS * 0.42), (typeof MAP_FLATTEN_RADIUS === 'number' ? MAP_FLATTEN_RADIUS : 12) + 10)
    : GRID_ROWS - 2;

  let col = colStart;
  const path = [{ col, row: GRID_ROWS - 1 }];

  for (let row = GRID_ROWS - 2; row >= endRow; row--){
    let bestCol = col;
    let bestScore = -Infinity;
    for (let dc = -2; dc <= 2; dc++){
      const c = clampInt(col + dc, 2, GRID_COLS - 3);
      let score = 0;
      if (heights && heights[row] && heights[row][c] != null){
        score += heights[row][c] * 1.4;
      }
      score += fbm(c * 0.13, row * 0.11, seed + 88002, 3) * wind;
      score += fbm(c * 0.05 + 40, row * 0.04 + 20, seed + 88004, 2) * (wind * 0.55);
      score -= Math.abs(c - colStart) * 0.006;
      score += (rng() - 0.5) * 0.04;
      if (score > bestScore){
        bestScore = score;
        bestCol = c;
      }
    }
    col = bestCol;
    path.push({ col, row });
  }
  return path;
}

/** Zone d'influence organique autour du chemin (pas une bande rectiligne). */
function buildEntryCorridorCellSet(path, seed){
  const set = new Set();
  if (!path || !path.length) return set;
  const baseHalf = entryCorridorHalfWidth();

  path.forEach((pt, i) => {
    const t = i / Math.max(1, path.length - 1);
    const widthNoise = fbm(pt.col * 0.17 + 3, pt.row * 0.14 + 7, seed + 88003, 2);
    const halfW = Math.max(1, Math.round(baseHalf * (0.65 + widthNoise * 0.75)));
    const vPad = t < 0.15 || t > 0.88 ? 1 : 0;
    for (let dc = -halfW; dc <= halfW; dc++){
      for (let dr = -vPad; dr <= vPad; dr++){
        const c = pt.col + dc;
        const r = pt.row + dr;
        if (c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS) set.add(`${c},${r}`);
      }
    }
  });
  return set;
}

function dryLandMountainFactor(h, land){
  const minH = typeof MAP_MOUNTAIN_MIN_HEIGHT === 'number' ? MAP_MOUNTAIN_MIN_HEIGHT : 0.27;
  const fromHeight = smoothstep(clamp01((h - minH) / 0.14));
  if (mapLandStyle === 'continent') return fromHeight;
  const minLand = typeof MAP_MOUNTAIN_MIN_LAND === 'number' ? MAP_MOUNTAIN_MIN_LAND : 0.28;
  const fromMask = smoothstep(clamp01((land - minLand) / 0.42));
  return fromHeight * fromMask;
}

/** Remonte le relief le long de l'isthme (îles uniquement). */
function carveLandBridgeHeights(heights, seed){
  if (mapLandStyle !== 'island' || !mapEntryCorridorCells) return;
  const lift = typeof MAP_LAND_BRIDGE_LIFT === 'number' ? MAP_LAND_BRIDGE_LIFT : 0.34;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      if (!isEntryCorridorCell(col, row)) continue;
      const t = row / Math.max(1, GRID_ROWS - 1);
      const target = lerp(lift + 0.03, MAP_PLAYABLE_ELEVATION, t * 0.62);
      heights[row][col] = clamp01(Math.max(heights[row][col], target));
    }
  }
}

function clampInt(v, min, max){
  return Math.max(min, Math.min(max, v));
}

function maxHeightInRadius(heights, col, row, radius){
  let maxH = heights[row][col];
  for (let dr = -radius; dr <= radius; dr++){
    for (let dc = -radius; dc <= radius; dc++){
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      maxH = Math.max(maxH, heights[nr][nc]);
    }
  }
  return maxH;
}

function plainMarbleAt(col, row, height, slope, heights){
  if (height >= MAP_HILL_THRESHOLD || slope > 0.042) return false;
  if (isNearWater(heights, col, row)) return false;
  if (maxHeightInRadius(heights, col, row, 5) < MAP_MARBLE_THRESHOLD - 0.04) return false;
  const chance = typeof MAP_PLAIN_MARBLE_CHANCE === 'number' ? MAP_PLAIN_MARBLE_CHANCE : 0.028;
  return mulberry32(hashSeed(col, row) ^ mapSeed ^ 0x4d415242)() < chance;
}

function isMountainTerrain(terrain){
  return terrain === 'marble' || terrain === 'rock';
}

function isDryLandHeight(height){
  const minH = typeof MAP_MOUNTAIN_MIN_HEIGHT === 'number' ? MAP_MOUNTAIN_MIN_HEIGHT : 0.27;
  return height >= minH;
}

function isLandEnoughForMountain(col, row, height){
  if (!isDryLandHeight(height)) return false;
  if (mapLandStyle === 'continent') return true;
  const land = landCoverageFactor(col, row, mapSeed);
  const minLand = typeof MAP_MOUNTAIN_MIN_LAND === 'number' ? MAP_MOUNTAIN_MIN_LAND : 0.28;
  return land >= minLand;
}

function getMapWalkerEntry(){
  if (mapWalkerEntry) return { col: mapWalkerEntry.col, row: mapWalkerEntry.row };
  return {
    col: typeof MIGRANT_ENTRY_COL === 'number' ? MIGRANT_ENTRY_COL : Math.floor(GRID_COLS / 2),
    row: typeof MIGRANT_ENTRY_ROW === 'number' ? MIGRANT_ENTRY_ROW : GRID_ROWS - 1,
  };
}

function computeMapWalkerEntry(){
  if (mapLandBridgePath && mapLandBridgePath.length){
    const edgePt = mapLandBridgePath[0];
    if (isWalkableEntryTile(edgePt.col, edgePt.row)) return { col: edgePt.col, row: edgePt.row };
  }
  const preferredRow = GRID_ROWS - 1;
  const col0 = typeof MIGRANT_ENTRY_COL === 'number' ? MIGRANT_ENTRY_COL : Math.floor(GRID_COLS / 2);
  for (let dc = 0; dc < GRID_COLS; dc++){
    for (const col of [col0 - dc, col0 + dc]){
      if (col < 0 || col >= GRID_COLS) continue;
      if (isWalkableEntryTile(col, preferredRow)) return { col, row: preferredRow };
    }
  }
  const edges = [];
  for (let col = 0; col < GRID_COLS; col++){
    edges.push({ col, row: 0 }, { col, row: GRID_ROWS - 1 });
  }
  for (let row = 1; row < GRID_ROWS - 1; row++){
    edges.push({ col: 0, row }, { col: GRID_COLS - 1, row });
  }
  let best = null;
  let bestScore = Infinity;
  const cx = Math.floor(GRID_COLS / 2);
  edges.forEach(pt => {
    if (!isWalkableEntryTile(pt.col, pt.row)) return;
    if (!hasInteriorWalkableReach(pt.col, pt.row)) return;
    const score = Math.abs(pt.col - cx) + (pt.row === GRID_ROWS - 1 ? 0 : 40);
    if (score < bestScore){
      bestScore = score;
      best = pt;
    }
  });
  return best || getMapWalkerEntry();
}

function isWalkableEntryTile(col, row){
  if (!inBounds(col, row) || !grid[row] || !grid[row][col]) return false;
  const t = grid[row][col].terrain;
  return typeof isPassableTerrain === 'function' ? isPassableTerrain(t) : (t !== 'water' && t !== 'rock');
}

function hasInteriorWalkableReach(col, row){
  const minDist = Math.max(12, Math.floor(Math.min(GRID_COLS, GRID_ROWS) * 0.12));
  const seen = new Set();
  const q = [[col, row]];
  let head = 0;
  seen.add(`${col},${row}`);
  while (head < q.length){
    const [c, r] = q[head++];
    if (mapEdgeDistance(c, r) >= minDist) return true;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      const nc = c + dc, nr = r + dr;
      const key = `${nc},${nr}`;
      if (seen.has(key) || !inBounds(nc, nr)) return;
      if (!isWalkableEntryTile(nc, nr)) return;
      seen.add(key);
      q.push([nc, nr]);
    });
  }
  return false;
}

/** Corrige le littoral le long de l'isthme d'accès. */
function ensureWalkerEntryCorridor(heights){
  if (!mapEntryCorridorCells && mapLandBridgePath){
    mapEntryCorridorCells = buildEntryCorridorCellSet(mapLandBridgePath, mapSeed);
  }
  if (!mapEntryCorridorCells) return;

  const lift = typeof MAP_LAND_BRIDGE_LIFT === 'number' ? MAP_LAND_BRIDGE_LIFT : 0.34;
  const rowMin = mapLandStyle === 'island'
    ? 0
    : Math.max(0, GRID_ROWS - (mapLandBridgePath ? mapLandBridgePath.length + 2 : 4));

  for (let row = GRID_ROWS - 1; row >= rowMin; row--){
    for (let col = 0; col < GRID_COLS; col++){
      if (!inBounds(col, row) || !grid[row][col]) continue;
      if (!isEntryCorridorCell(col, row)) continue;

      const cell = grid[row][col];
      const dist = mapEdgeDistance(col, row);
      const h = Math.max(heights[row][col], lift);
      heights[row][col] = h;

      if (dist === 0){
        cell.terrain = 'sand';
      } else if (dist <= 2){
        cell.terrain = h < MAP_WATER_THRESHOLD + 0.02 ? 'sand' : 'grass';
      } else if (cell.terrain === 'water' || cell.terrain === 'rock'){
        cell.terrain = h > MAP_HILL_THRESHOLD ? 'hill' : 'grass';
      }

      cell.level = dist === 0 ? 1 : Math.max(1, cell.level || 1);
      applyCellHeight(cell, h);
    }
  }
}
function lerp(a, b, t){ return a + (b - a) * t; }
function smoothstep(t){ return t * t * (3 - 2 * t); }
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function valueNoise(x, y, seed){
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const rng = (ix, iy) => mulberry32(hashSeed(ix + seed * 17, iy + seed * 31))();

  const v00 = rng(xi, yi);
  const v10 = rng(xi + 1, yi);
  const v01 = rng(xi, yi + 1);
  const v11 = rng(xi + 1, yi + 1);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
}

function fbm(x, y, seed, octaves){
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++){
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.05;
  }
  return sum / norm;
}

function ridgedNoise(x, y, seed){
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < 4; i++){
    let n = valueNoise(x * freq, y * freq, seed + i * 73);
    n = 1 - Math.abs(n * 2 - 1);
    n *= n;
    sum += n * amp;
    norm += amp;
    amp *= 0.55;
    freq *= 2.2;
  }
  return sum / norm;
}

function domainWarpCoords(x, y, seed){
  const strength = typeof MAP_DOMAIN_WARP === 'number' ? MAP_DOMAIN_WARP : 0.35;
  const dx = fbm(x + 11.7, y + 3.9, seed + 8001, 3) - 0.5;
  const dy = fbm(x + 5.3, y + 14.2, seed + 8002, 3) - 0.5;
  return { x: x + dx * strength, y: y + dy * strength };
}

/** Facteur 0=eau profonde, 1=terre — forme d'île avec baies. */
function islandLandFactor(col, row, seed){
  const cx = (GRID_COLS - 1) / 2;
  const cy = (GRID_ROWS - 1) / 2;
  const radius = typeof MAP_ISLAND_RADIUS === 'number' ? MAP_ISLAND_RADIUS : 0.38;
  const dx = (col - cx) / (GRID_COLS * radius);
  const dy = (row - cy) / (GRID_ROWS * radius);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const shape = fbm(col * 0.052 + 30, row * 0.052 + 30, seed + 6100, 4);
  const edge = 0.80 + (shape - 0.5) * 0.30;
  return smoothstep(clamp01((edge - dist) / 0.13));
}

function softenHeightMap(heights, passes){
  const n = typeof passes === 'number' ? passes : 0;
  if (n <= 0) return heights;

  for (let p = 0; p < n; p++){
    const next = heights.map(row => row.slice());
    for (let row = 1; row < GRID_ROWS - 1; row++){
      for (let col = 1; col < GRID_COLS - 1; col++){
        let sum = 0, count = 0;
        for (let dr = -1; dr <= 1; dr++){
          for (let dc = -1; dc <= 1; dc++){
            sum += heights[row + dr][col + dc];
            count++;
          }
        }
        const avg = sum / count;
        const diff = heights[row][col] - avg;
        next[row][col] = clamp01(heights[row][col] - diff * 0.32);
      }
    }
    for (let row = 0; row < GRID_ROWS; row++){
      for (let col = 0; col < GRID_COLS; col++){
        heights[row][col] = next[row][col];
      }
    }
  }
  return heights;
}

function landCoverageFactor(col, row, seed){
  if (mapLandStyle === 'continent') return 1;
  return islandLandFactor(col, row, seed);
}

function generateHeightMap(seed){
  const scale = MAP_NOISE_SCALE;
  const islandStr = typeof MAP_ISLAND_STRENGTH === 'number' ? MAP_ISLAND_STRENGTH : 0.88;
  const valleyStr = typeof MAP_VALLEY_STRENGTH === 'number' ? MAP_VALLEY_STRENGTH : 0.11;
  const sea = typeof MAP_EDGE_WATER_LEVEL === 'number' ? MAP_EDGE_WATER_LEVEL : 0.06;
  const heights = [];

  for (let row = 0; row < GRID_ROWS; row++){
    heights[row] = [];
    for (let col = 0; col < GRID_COLS; col++){
      const rawX = col * scale;
      const rawY = row * scale;
      const warped = domainWarpCoords(rawX, rawY, seed);
      const nx = warped.x;
      const ny = warped.y;

      const base = fbm(nx, ny, seed, MAP_HEIGHT_OCTAVES);
      const ridges = ridgedNoise(nx * 1.35 + 20, ny * 1.35 + 20, seed + 500) * MAP_RIDGE_STRENGTH;
      const detail = fbm(nx * 4.2, ny * 4.2, seed + 2000, 2) * MAP_DETAIL_STRENGTH;
      const valleys = ridgedNoise(nx * 0.75 + 90, ny * 0.75 + 90, seed + 9000);
      const ranges = mountainRangeFactor(nx, ny, seed);

      const landBias = typeof MAP_LAND_BASE_BIAS === 'number' ? MAP_LAND_BASE_BIAS : 0.06;
      let h = base * 0.52 + detail * 0.10 + landBias;

      const land = landCoverageFactor(col, row, seed);
      if (mapLandStyle === 'island'){
        const islandBlend = clamp01(lerp(1 - islandStr, 1, land));
        h = lerp(sea, h, islandBlend);
        h = clamp01(h - valleys * valleyStr * land);
      } else {
        h = clamp01(h - valleys * valleyStr * 0.55);
      }

      const mountMask = dryLandMountainFactor(h, land);
      h = clamp01(h + ridges * 0.34 * mountMask + ranges * 0.12 * mountMask);

      const mcx = (GRID_COLS - 1) / 2;
      const mcy = (GRID_ROWS - 1) / 2;
      const mDist = Math.sqrt((col - mcx) ** 2 + (row - mcy) ** 2) / (GRID_COLS * 0.28);
      const mBoost = typeof MAP_MOUNTAIN_CENTER_BOOST === 'number' ? MAP_MOUNTAIN_CENTER_BOOST : 0.08;
      h = clamp01(h + clamp01(1 - mDist) * mBoost * mountMask);

      if (mapLandStyle === 'island'){
        const edgeX = Math.min(col, GRID_COLS - 1 - col) / (GRID_COLS * 0.1);
        const edgeY = Math.min(row, GRID_ROWS - 1 - row) / (GRID_ROWS * 0.1);
        const edgeFactor = clamp01(Math.min(edgeX, edgeY));
        h = h * (0.72 + 0.28 * edgeFactor);
      }

      const borderW = effectiveEdgeBorderWidth();
      if (borderW > 0){
        const distEdge = Math.min(col, row, GRID_COLS - 1 - col, GRID_ROWS - 1 - row);
        if (distEdge < borderW){
          const t = distEdge / borderW;
          h = lerp(sea, h, t * t);
        }
      }

      heights[row][col] = clamp01(h);
    }
  }

  const smoothPasses = typeof MAP_HEIGHT_SMOOTH_PASSES === 'number' ? MAP_HEIGHT_SMOOTH_PASSES : 0;
  softenHeightMap(heights, smoothPasses);

  mapLandBridgePath = buildLandBridgePath(seed, heights);
  mapEntryCorridorCells = buildEntryCorridorCellSet(mapLandBridgePath, seed);
  carveLandBridgeHeights(heights, seed);
  flattenPlayableCenter(heights);
  return heights;
}

function flattenPlayableCenter(heights){
  const cx = Math.floor(GRID_COLS / 2);
  const cy = Math.floor(GRID_ROWS / 2);
  const r = MAP_FLATTEN_RADIUS;
  const strength = typeof MAP_FLATTEN_STRENGTH === 'number' ? MAP_FLATTEN_STRENGTH : 0.48;
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const dx = col - cx, dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= r) continue;
      const t = 1 - dist / r;
      heights[row][col] = lerp(heights[row][col], MAP_PLAYABLE_ELEVATION, t * t * strength);
    }
  }
}

/** Arrondit l'altitude en paliers discrets (mode sans blocs). */
function quantizeElevation(h){
  const levels = typeof TERRAIN_BLOCK_MAX_LEVEL === 'number' ? TERRAIN_BLOCK_MAX_LEVEL * 3 : 10;
  return Math.round(clamp01(h) * levels) / levels;
}

function applyCellHeight(cell, rawHeight){
  if (typeof usesTerrainBlocks === 'function' && usesTerrainBlocks()){
    cell.level = levelFromHeightAndTerrain(rawHeight, cell.terrain);
    cell.elevation = elevationFromLevel(cell.level);
  } else {
    cell.elevation = quantizeElevation(rawHeight);
    if (typeof syncCellLevelElevation === 'function') syncCellLevelElevation(cell);
  }
}

function rainShadowFactor(col, row, heights){
  const wx = typeof MAP_WIND_X === 'number' ? MAP_WIND_X : 0.62;
  const wy = typeof MAP_WIND_Y === 'number' ? MAP_WIND_Y : 0.28;
  const len = Math.sqrt(wx * wx + wy * wy) || 1;
  const dx = wx / len, dy = wy / len;
  const h0 = heights[row][col];
  let barrier = 0;

  const shadowSteps = typeof MAP_RAIN_SHADOW_STEPS === 'number' ? MAP_RAIN_SHADOW_STEPS : 12;
  for (let i = 1; i <= shadowSteps; i++){
    const nc = Math.round(col - dx * i);
    const nr = Math.round(row - dy * i);
    if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) break;
    const hu = heights[nr][nc];
    barrier = Math.max(barrier, hu - h0);
  }
  return clamp01(Math.max(0, barrier - 0.06));
}

/** Recalcule elevation + pente depuis mapSeed (sauvegardes, colonies) sans toucher au terrain. */
function applyHeightMapToGrid(seed){
  if (typeof seed === 'number') mapSeed = seed;
  if (!mapSeed || !Array.isArray(grid) || grid.length === 0) return;
  const heights = generateHeightMap(mapSeed);
  const slopes = computeSlopeMap(heights);
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row] && grid[row][col];
      if (!cell) continue;
      applyCellHeight(cell, heights[row][col]);
      cell.slope = slopes[row][col];
    }
  }
  if (typeof polishMapEdges === 'function') polishMapEdges();
  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
  else if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
}

function computeSlopeMap(heights){
  const slopes = [];
  for (let row = 0; row < GRID_ROWS; row++){
    slopes[row] = [];
    for (let col = 0; col < GRID_COLS; col++){
      let maxDiff = 0;
      const h = heights[row][col];
      [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dc, dr]) => {
        const nc = col + dc, nr = row + dr;
        if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS){
          maxDiff = Math.max(maxDiff, Math.abs(h - heights[nr][nc]));
        }
      });
      slopes[row][col] = maxDiff;
    }
  }
  return slopes;
}

function generateMoistureMap(seed, heights){
  const moisture = [];
  const scale = MAP_NOISE_SCALE;
  const rainShadow = typeof MAP_RAIN_SHADOW === 'number' ? MAP_RAIN_SHADOW : 0.24;

  for (let row = 0; row < GRID_ROWS; row++){
    moisture[row] = [];
    for (let col = 0; col < GRID_COLS; col++){
      const h = heights[row][col];
      const m = fbm(col * scale * 1.2 + 50, row * scale * 1.2 + 50, seed + 999, 4);
      const river = ridgedNoise(col * scale * 2.4 + 80, row * scale * 2.4 + 80, seed + 3333);
      const riverBand = (1 - river) * (1 - river);

      let wet = m * 0.50 + (1 - h) * 0.22 + riverBand * 0.18;

      if (isNearWater(heights, col, row)) wet += 0.14;
      wet -= rainShadowFactor(col, row, heights) * rainShadow;

      const land = landCoverageFactor(col, row, seed);
      wet *= 0.85 + land * 0.15;

      moisture[row][col] = clamp01(wet);
    }
  }
  return moisture;
}

function isNearWater(heights, col, row, threshold){
  threshold = threshold || MAP_WATER_THRESHOLD;
  for (let dr = -1; dr <= 1; dr++){
    for (let dc = -1; dc <= 1; dc++){
      const nc = col + dc, nr = row + dr;
      if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS){
        if (heights[nr][nc] < threshold) return true;
      }
    }
  }
  return false;
}

function terrainFromMaps(height, moisture, slope, col, row, heights){
  if (height < MAP_WATER_THRESHOLD) return 'water';

  const nearWater = isNearWater(heights, col, row);
  const beachSlope = typeof MAP_COAST_BEACH_SLOPE === 'number' ? MAP_COAST_BEACH_SLOPE : 0.046;

  if (nearWater){
    if (slope > beachSlope * 1.35 || height > MAP_SAND_THRESHOLD + 0.08) return 'rock';
    if (height < MAP_SAND_THRESHOLD + 0.04) return 'sand';
  }

  if (plainMarbleAt(col, row, height, slope, heights)) return 'marble';

  const canMountain = isLandEnoughForMountain(col, row, height);

  if (canMountain && height > MAP_MARBLE_THRESHOLD - 0.04){
    return slope > MAP_ROCK_SLOPE * 0.62 ? 'rock' : 'marble';
  }

  if (canMountain && slope > MAP_ROCK_SLOPE) return 'rock';

  if (height > MAP_HILL_THRESHOLD){
    if (canMountain && height < MAP_MARBLE_THRESHOLD && slope < MAP_ROCK_SLOPE * 0.55){
      return slope > MAP_ROCK_SLOPE * 0.42 ? 'rock' : 'marble';
    }
    return 'hill';
  }

  const isPlain = height < MAP_HILL_THRESHOLD && slope < 0.048;

  if (isPlain
      && moisture > MAP_FOREST_MOISTURE
      && height >= MAP_FOREST_MIN_HEIGHT
      && height <= MAP_FOREST_MAX_HEIGHT
      && slope < MAP_FOREST_MAX_SLOPE){
    return 'forest';
  }

  if (isPlain
      && moisture > MAP_WHEAT_MOISTURE
      && moisture < 0.72
      && height >= MAP_WHEAT_MIN_HEIGHT
      && height <= MAP_WHEAT_MAX_HEIGHT
      && slope < 0.045){
    return 'wheat';
  }

  if (moisture < 0.34 && height > 0.38 && height < MAP_HILL_THRESHOLD && slope < 0.040){
    return 'hill';
  }

  return 'grass';
}

/** Évite marbre/roche en eau ou en mer — les massifs restent à l'intérieur des terres. */
function polishMountainBiomes(heights){
  if (!Array.isArray(grid) || grid.length === 0) return;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row][col];
      if (!cell || !isMountainTerrain(cell.terrain)) continue;

      const h = heights[row][col];
      const nearWater = isNearWater(heights, col, row);

      if (h < MAP_WATER_THRESHOLD || !isLandEnoughForMountain(col, row, h)){
        cell.terrain = h < MAP_WATER_THRESHOLD ? 'water' : (nearWater ? 'sand' : 'grass');
        applyCellHeight(cell, h);
        continue;
      }

      if (nearWater && h < MAP_HILL_THRESHOLD){
        cell.terrain = h < MAP_SAND_THRESHOLD + 0.03 ? 'sand' : 'hill';
        applyCellHeight(cell, h);
      }
    }
  }
}

/** Regroupe les biomes voisins (évite le bruit « confetti »). */
function smoothTerrainMap(passes){
  const n = typeof passes === 'number' ? passes : 0;
  if (n <= 0 || !Array.isArray(grid) || grid.length === 0) return;

  const preserve = new Set(['water', 'sand', 'marble']);

  for (let p = 0; p < n; p++){
    const next = [];
    for (let row = 0; row < GRID_ROWS; row++){
      next[row] = [];
      for (let col = 0; col < GRID_COLS; col++){
        next[row][col] = grid[row][col].terrain;
      }
    }

    for (let row = 0; row < GRID_ROWS; row++){
      for (let col = 0; col < GRID_COLS; col++){
        const cell = grid[row][col];
        if (preserve.has(cell.terrain)) continue;

        const counts = {};
        for (let dr = -1; dr <= 1; dr++){
          for (let dc = -1; dc <= 1; dc++){
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
            const t = grid[nr][nc].terrain;
            if (t === 'water') continue;
            counts[t] = (counts[t] || 0) + 1;
          }
        }

        counts[cell.terrain] = (counts[cell.terrain] || 0) + 1;
        let best = cell.terrain;
        let bestN = 0;
        Object.entries(counts).forEach(([t, c]) => {
          if (c > bestN){ bestN = c; best = t; }
        });

        const majority = typeof MAP_BIOME_SMOOTH_MAJORITY === 'number' ? MAP_BIOME_SMOOTH_MAJORITY : 5;
        if (best !== cell.terrain && bestN >= majority){
          next[row][col] = best;
        }
      }
    }

    for (let row = 0; row < GRID_ROWS; row++){
      for (let col = 0; col < GRID_COLS; col++){
        grid[row][col].terrain = next[row][col];
      }
    }
  }
}

/** Falaises côtières et plages cohérentes sur les voisins de l'eau. */
function polishCoastBiomes(heights, slopes){
  if (!Array.isArray(grid) || grid.length === 0) return;
  const beachSlope = typeof MAP_COAST_BEACH_SLOPE === 'number' ? MAP_COAST_BEACH_SLOPE : 0.046;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row][col];
      if (!cell || cell.terrain === 'water') continue;
      if (!isNearWater(heights, col, row)) continue;

      const h = heights[row][col];
      const slope = slopes[row][col];

      if (slope > beachSlope){
        if (cell.terrain !== 'sand') cell.terrain = 'rock';
      } else if (h < MAP_SAND_THRESHOLD + 0.05 && cell.terrain !== 'rock'){
        cell.terrain = 'sand';
      }
    }
  }
}

/** Lisse le pourtour : eau, plage, pas de falaises abruptes au bord. */
function polishMapEdges(){
  if (!Array.isArray(grid) || grid.length === 0) return;
  const borderW = effectiveEdgeBorderWidth();
  if (borderW <= 0) return;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const dist = mapEdgeDistance(col, row);
      const cell = grid[row][col];
      if (!cell) continue;
      if (isEntryCorridorCell(col, row)) continue;

      if (dist === 0){
        cell.terrain = 'water';
        cell.level = 0;
        cell.elevation = 0;
        continue;
      }
      if (dist === 1 && cell.terrain !== 'water'){
        cell.terrain = 'sand';
        cell.level = 1;
        cell.elevation = elevationFromLevel(1);
        continue;
      }
      if (dist < borderW){
        if (cell.level > 1){
          cell.level = 1;
          cell.elevation = elevationFromLevel(1);
        }
        if (dist <= 2 && (cell.terrain === 'rock' || cell.terrain === 'marble' || cell.terrain === 'hill')){
          cell.terrain = 'sand';
        }
      }
    }
  }

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row][col];
      if (!cell || cell.terrain === 'water' || cell.level <= 1) continue;
      let nearWater = false;
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dc, dr]) => {
        const nc = col + dc, nr = row + dr;
        if (!inBounds(nc, nr)) nearWater = true;
        else if (grid[nr][nc].terrain === 'water' || grid[nr][nc].level === 0) nearWater = true;
      });
      if (nearWater){
        cell.level = 1;
        cell.elevation = elevationFromLevel(1);
      }
    }
  }
}

function syncAllCellHeights(heights){
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      applyCellHeight(grid[row][col], heights[row][col]);
    }
  }
}

async function generateProceduralMap(seed){
  mapSeed = (typeof seed === 'number') ? seed : Math.floor(Math.random() * 1e9);
  mapLandStyle = pickMapLandStyle(mapSeed);
  mapWalkerEntry = null;
  mapLandBridgePath = null;
  mapEntryCorridorCells = null;

  reportGenProgress(5, 'Relief (hauteurs)…');
  await yieldFrame();
  const heights = generateHeightMap(mapSeed);

  reportGenProgress(30, 'Humidité…');
  await yieldFrame();
  const moisture = generateMoistureMap(mapSeed, heights);

  reportGenProgress(45, 'Pentes…');
  await yieldFrame();
  const slopes = computeSlopeMap(heights);

  reportGenProgress(55, 'Biomes…');
  await yieldFrame();
  grid = [];
  for (let row = 0; row < GRID_ROWS; row++){
    const line = [];
    for (let col = 0; col < GRID_COLS; col++){
      const rawH = heights[row][col];
      const terrain = terrainFromMaps(rawH, moisture[row][col], slopes[row][col], col, row, heights);
      const cell = {
        terrain,
        building: null,
        hasRoad: false,
        houseLevel: 0,
        population: 0,
        patrolBlock: false,
        beauty: 0,
        elevation: 0,
        level: 1,
        slope: slopes[row][col],
      };
      applyCellHeight(cell, rawH);
      line.push(cell);
    }
    grid.push(line);
  }

  reportGenProgress(68, 'Lissage des biomes…');
  await yieldFrame();
  smoothTerrainMap(typeof MAP_BIOME_SMOOTH === 'number' ? MAP_BIOME_SMOOTH : 0);
  syncAllCellHeights(heights);

  reportGenProgress(78, 'Côtes et montagnes…');
  await yieldFrame();
  polishCoastBiomes(heights, slopes);
  polishMountainBiomes(heights);
  syncAllCellHeights(heights);

  reportGenProgress(88, 'Bords de carte…');
  await yieldFrame();
  if (typeof polishMapEdges === 'function') polishMapEdges();

  reportGenProgress(94, 'Corridor d\'entrée…');
  await yieldFrame();
  ensureWalkerEntryCorridor(heights);
  syncAllCellHeights(heights);
  mapWalkerEntry = computeMapWalkerEntry();

  reportGenProgress(100, 'Finalisation…');
  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  debugInfo('Carte procédurale générée', {
    seed: mapSeed,
    size: `${GRID_COLS}×${GRID_ROWS}`,
    landStyle: mapLandStyle,
    entry: mapWalkerEntry,
  });
  return mapSeed;
}

function terrainAt(col, row){
  if (!grid.length || !grid[row] || !grid[row][col]) return 'grass';
  return grid[row][col].terrain;
}

function cellElevation(col, row){
  if (!inBounds(col, row)) return 0;
  return grid[row][col].elevation || 0;
}

/** Centroïde des cases non-eau de la grille (plus fiable que le centre géométrique
 * fixe quand le style de carte ne place pas l'île au milieu — important en portrait,
 * où la vue est étroite horizontalement et révèle moins de marge d'erreur). */
function computeLandCentroid(){
  if (!Array.isArray(grid) || !grid.length) return null;
  let sumCol = 0, sumRow = 0, count = 0;
  for (let row = 0; row < grid.length; row++){
    const line = grid[row];
    if (!Array.isArray(line)) continue;
    for (let col = 0; col < line.length; col++){
      const cell = line[col];
      if (cell && cell.terrain && cell.terrain !== 'water'){
        sumCol += col; sumRow += row; count++;
      }
    }
  }
  if (!count) return null;
  return { col: sumCol / count, row: sumRow / count };
}

function centerMapView(){
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return;
  const land = computeLandCentroid();
  const targetCol = land ? Math.round(land.col) : Math.floor(GRID_COLS / 2);
  const targetRow = land ? Math.round(land.row) : Math.floor(GRID_ROWS / 2);
  const center = tileCenter(targetCol, targetRow);
  wrap.scrollLeft = Math.max(0, center.x * zoomLevel - wrap.clientWidth / 2);
  wrap.scrollTop = Math.max(0, center.y * zoomLevel - wrap.clientHeight / 2);
}
