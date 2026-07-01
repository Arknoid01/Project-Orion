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

let terrainGenerationInProgress = false;

function isTerrainGenerationInProgress(){
  return terrainGenerationInProgress;
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

/**
 * Retourne une Promise qui se résout dès que tous les sprites de terrain sont
 * chargés et bakés (areIsoTerrainReady() === true), avec un timeout de sécurité.
 * Utilisé pour garder l'overlay "Génération du monde…" affiché jusqu'à ce que
 * le premier rendu 3D complet soit possible.
 */
function waitForTerrainReady(timeoutMs){
  timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 6000;
  return new Promise(function(resolve){
    if (typeof areIsoTerrainReady === 'function' && areIsoTerrainReady()){
      resolve(); return;
    }
    const deadline = Date.now() + timeoutMs;
    function tick(){
      if (typeof areIsoTerrainReady === 'function' && areIsoTerrainReady()){
        resolve(); return;
      }
      if (Date.now() >= deadline){ resolve(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
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

/** Chaînes orientées (2 axes depuis la seed) — relief grec type Pindus / Taygetus. */
function greekRidgeFactor(nx, ny, seed){
  const str = typeof MAP_GREEK_RIDGE_STRENGTH === 'number' ? MAP_GREEK_RIDGE_STRENGTH : 0.26;
  const rng = mulberry32(seed + 77000);
  const angle1 = rng() * Math.PI;
  const angle2 = angle1 + (0.55 + rng() * 0.85);

  function ridgeAlong(angle, offset){
    const along = nx * Math.cos(angle) + ny * Math.sin(angle);
    const across = nx * Math.sin(angle) - ny * Math.cos(angle);
    const ridge = ridgedNoise(along * 2.1 + offset, across * 0.38 + 5, seed + Math.floor(angle * 1000) + offset);
    return ridge * ridge;
  }

  const r1 = ridgeAlong(angle1, 0);
  const r2 = ridgeAlong(angle2, 17) * 0.62;
  return Math.max(r1, r2) * str;
}

/** Creux côtier le long des bords (sauf bande d'accès connectée). */
function greekEdgeSeaDepression(col, row){
  const seaWidth = typeof MAP_GREEK_EDGE_SEA_WIDTH === 'number' ? MAP_GREEK_EDGE_SEA_WIDTH : 12;
  const seaDepth = typeof MAP_GREEK_EDGE_SEA_DEPTH === 'number' ? MAP_GREEK_EDGE_SEA_DEPTH : 0.11;
  const connectedDist = connectedLandEdgeDistance(col, row);
  const edgeDist = mapEdgeDistance(col, row);
  const connectedGuard = (typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 4)
    + (typeof MAP_CONNECTED_EDGE_FADE === 'number' ? MAP_CONNECTED_EDGE_FADE : 10);
  if (connectedDist < connectedGuard) return 0;
  if (edgeDist >= seaWidth) return 0;
  const t = 1 - edgeDist / seaWidth;
  return seaDepth * t * t;
}

let mapLandBridgePath = null;

function entryCorridorHalfWidth(){
  const w = typeof MAP_ENTRY_CORRIDOR_WIDTH === 'number' ? MAP_ENTRY_CORRIDOR_WIDTH : 4;
  return Math.max(0, Math.floor(w / 2));
}

function isEntryCorridorCell(col, row){
  if (!mapEntryCorridorCells) return false;
  return mapEntryCorridorCells.has(`${col},${row}`);
}

function connectedLandEdgeSide(){
  const side = typeof MAP_CONNECTED_LAND_EDGE === 'string' ? MAP_CONNECTED_LAND_EDGE : 'south';
  return ['north', 'south', 'east', 'west'].includes(side) ? side : 'south';
}

function connectedLandEdgeDistance(col, row){
  switch (connectedLandEdgeSide()){
    case 'north': return row;
    case 'east': return GRID_COLS - 1 - col;
    case 'west': return col;
    case 'south':
    default: return GRID_ROWS - 1 - row;
  }
}

function migrantEntryCol(){
  return typeof MIGRANT_ENTRY_COL === 'number' ? MIGRANT_ENTRY_COL : Math.floor(GRID_COLS / 2);
}

function isthmusColDistance(col){
  return Math.abs(col - migrantEntryCol());
}

/** Largeur latérale de l'isthme — étroite au bord, suit le couloir vers l'intérieur. */
function isthmusAllowedHalfWidth(col, row, seed){
  if (isEntryCorridorCell(col, row)) return entryCorridorHalfWidth();
  const edgeDist = connectedLandEdgeDistance(col, row);
  const width = typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 2;
  if (edgeDist >= width) return -1;
  const baseHalf = typeof MAP_ISTHMUS_HALF_WIDTH === 'number' ? MAP_ISTHMUS_HALF_WIDTH : 1;
  const wobble = typeof fbm === 'function'
    ? fbm(col * 0.14 + 2, row * 0.11 + 6, (seed || mapSeed) + 88221, 2)
    : 0.5;
  return Math.max(0, baseHalf + Math.round((wobble - 0.5) * 0.8) - Math.floor(edgeDist * 0.65));
}

function isIsthmusAccessCell(col, row, seed){
  const edgeDist = connectedLandEdgeDistance(col, row);
  const maxDepth = typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 2;
  const maxLen = typeof MAP_ISTHMUS_LENGTH === 'number' ? MAP_ISTHMUS_LENGTH : 8;
  if (isEntryCorridorCell(col, row)) return true;
  if (edgeDist > maxDepth) return false;
  const southRows = GRID_ROWS - 1 - row;
  if (southRows > maxLen) return false;
  const halfW = isthmusAllowedHalfWidth(col, row, seed);
  if (halfW < 0) return false;
  return isthmusColDistance(col) <= halfW;
}

function isConnectedLandEdgeCell(col, row){
  const width = typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 0;
  if (width <= 0) return false;
  return connectedLandEdgeDistance(col, row) < width && isIsthmusAccessCell(col, row, mapSeed);
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
    const halfW = Math.max(0, Math.round(baseHalf * (0.35 + widthNoise * 0.25)));
    const vPad = t < 0.12 || t > 0.90 ? 0 : 0;
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

/** Remonte le relief le long de l'isthme / couloir d'accès sud. */
function carveLandBridgeHeights(heights, seed){
  if (!mapEntryCorridorCells) return;
  const lift = typeof MAP_LAND_BRIDGE_LIFT === 'number' ? MAP_LAND_BRIDGE_LIFT : 0.34;
  const connectedGuard = (typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 4) + 8;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      if (!isEntryCorridorCell(col, row)) continue;
      if (mapLandStyle === 'continent' && connectedLandEdgeDistance(col, row) > connectedGuard) continue;
      const t = row / Math.max(1, GRID_ROWS - 1);
      const target = lerp(lift + 0.03, MAP_PLAYABLE_ELEVATION, t * 0.62);
      heights[row][col] = clamp01(Math.max(heights[row][col], target));
    }
  }
}

/** Garantit qu'un côté de carte reste terrestre, avec une transition douce vers l'intérieur. */
function carveConnectedLandEdgeHeights(heights, seed){
  const width = typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 0;
  if (width <= 0) return;

  const fade = typeof MAP_CONNECTED_EDGE_FADE === 'number' ? MAP_CONNECTED_EDGE_FADE : 8;
  const lift = typeof MAP_CONNECTED_EDGE_LIFT === 'number' ? MAP_CONNECTED_EDGE_LIFT : 0.32;
  const maxDist = Math.max(width, width + fade);

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const dist = connectedLandEdgeDistance(col, row);
      if (dist >= maxDist) continue;
      if (!isIsthmusAccessCell(col, row, seed)) continue;

      const noise = typeof fbm === 'function'
        ? fbm(col * 0.09 + 20, row * 0.09 + 14, seed + 88220, 2)
        : mulberry32(hashSeed(col, row) ^ (seed + 88220))();
      const t = dist < width ? 1 : 1 - (dist - width + 1) / Math.max(1, fade);
      const target = lift + (noise - 0.5) * 0.035;
      heights[row][col] = clamp01(Math.max(heights[row][col], lerp(MAP_WATER_THRESHOLD + 0.025, target, clamp01(t))));
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
  if (maxHeightInRadius(heights, col, row, 3) < MAP_MARBLE_THRESHOLD - 0.02) return false;
  const chance = typeof MAP_PLAIN_MARBLE_CHANCE === 'number' ? MAP_PLAIN_MARBLE_CHANCE : 0.012;
  return mulberry32(hashSeed(col, row) ^ mapSeed ^ 0x4d415242)() < chance;
}

/** Bruit ridgé étroit — filons de marbre plutôt que des massifs continus. */
function marbleVeinFactor(col, row, seed){
  const mul = typeof MAP_MARBLE_VEIN_SCALE === 'number' ? MAP_MARBLE_VEIN_SCALE : 3.6;
  const nx = col * MAP_NOISE_SCALE * mul + 19;
  const ny = row * MAP_NOISE_SCALE * mul + 37;
  const ridge = ridgedNoise(nx, ny, seed + 0x4d5242);
  return ridge * ridge;
}

function isMarbleVeinCell(col, row, height, slope, heights){
  if (height < MAP_MARBLE_THRESHOLD - 0.03) return false;
  if (slope > MAP_ROCK_SLOPE * 0.72) return false;
  if (!isLandEnoughForMountain(col, row, height)) return false;
  if (isNearWater(heights, col, row)) return false;
  const threshold = typeof MAP_MARBLE_VEIN_THRESHOLD === 'number' ? MAP_MARBLE_VEIN_THRESHOLD : 0.58;
  return marbleVeinFactor(col, row, mapSeed) >= threshold;
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

/** Facteur 0=eau profonde, 1=terre — côte organique (capes, baies) + isthme sud étroit. */
function islandLandFactor(col, row, seed){
  const cx = (GRID_COLS - 1) / 2;
  const cy = (GRID_ROWS - 1) / 2;
  const radiusMul = typeof MAP_ISLAND_RADIUS === 'number' ? MAP_ISLAND_RADIUS : 0.38;
  const baseRadius = Math.min(GRID_COLS, GRID_ROWS) * radiusMul;

  const dx = col - cx;
  const dy = row - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  const coastMacro = fbm(Math.cos(angle) * 2.8 + 18, Math.sin(angle) * 2.8 + 36, seed + 6100, 4);
  const coastMeso = fbm(col * 0.075 + 12, row * 0.075 + 24, seed + 6101, 3);
  const coastFine = fbm(col * 0.16 + 70, row * 0.16 + 40, seed + 6102, 2);
  const macroAmp = typeof MAP_ISLAND_COAST_MACRO === 'number' ? MAP_ISLAND_COAST_MACRO : 0.24;
  const radialNoise = coastMacro * 0.50 + coastMeso * 0.32 + coastFine * 0.18;
  const effectiveRadius = baseRadius * (0.90 + (radialNoise - 0.5) * macroAmp);

  const soft = typeof MAP_ISLAND_COAST_SOFT === 'number' ? MAP_ISLAND_COAST_SOFT : 0.075;
  const transition = Math.max(baseRadius * soft, 2.5 + coastFine * 3.5);
  let land = smoothstep(clamp01((effectiveRadius - dist) / transition));

  const isthmusLen = typeof MAP_ISTHMUS_LENGTH === 'number' ? MAP_ISTHMUS_LENGTH : 8;
  const southRows = GRID_ROWS - 1 - row;
  if (southRows <= isthmusLen + 1){
    const halfW = typeof MAP_ISTHMUS_HALF_WIDTH === 'number' ? MAP_ISTHMUS_HALF_WIDTH : 0;
    const wobble = fbm(col * 0.19 + 5, row * 0.14 + 9, seed + 6104, 2);
    const allowedHalf = Math.max(0, halfW + (wobble > 0.72 ? 1 : 0) - Math.floor(southRows * 0.35));
    if (isthmusColDistance(col) <= allowedHalf){
      const neckT = 1 - southRows / Math.max(1, isthmusLen + 1);
      land = clamp01(Math.max(land, smoothstep(neckT) * 0.94));
    }
  }

  return land;
}

function usesIslandLandShape(){
  if (mapLandStyle === 'island') return true;
  return typeof MAP_ALWAYS_ISLAND_SHAPE === 'boolean' && MAP_ALWAYS_ISLAND_SHAPE;
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
  if (!usesIslandLandShape()) return 1;
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
      const greekRanges = greekRidgeFactor(nx, ny, seed);

      const landBias = typeof MAP_LAND_BASE_BIAS === 'number' ? MAP_LAND_BASE_BIAS : 0.06;
      let h = base * 0.52 + detail * 0.10 + landBias;

      const land = landCoverageFactor(col, row, seed);
      if (usesIslandLandShape()){
        const islandBlend = clamp01(lerp(1 - islandStr, 1, land));
        h = lerp(sea, h, islandBlend);
        h = clamp01(h - valleys * valleyStr * land);
      } else {
        h = clamp01(h - valleys * valleyStr * 0.55);
      }

      const mountMask = dryLandMountainFactor(h, land);
      h = clamp01(h + ridges * 0.30 * mountMask + ranges * 0.14 * mountMask + greekRanges * 0.52 * mountMask);

      const mcx = (GRID_COLS - 1) / 2;
      const mcy = (GRID_ROWS - 1) / 2;
      const mDist = Math.sqrt((col - mcx) ** 2 + (row - mcy) ** 2) / (GRID_COLS * 0.32);
      const mBoost = typeof MAP_MOUNTAIN_CENTER_BOOST === 'number' ? MAP_MOUNTAIN_CENTER_BOOST : 0.08;
      h = clamp01(h + clamp01(1 - mDist) * mBoost * mountMask * 0.65);

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
  carveConnectedLandEdgeHeights(heights, seed);
  flattenPlayableCenter(heights);
  return heights;
}

function flattenPlayableCenter(heights){
  const cx = Math.floor(GRID_COLS / 2);
  const cy = Math.floor(GRID_ROWS / 2);
  const r = MAP_FLATTEN_RADIUS;
  const strength = typeof MAP_FLATTEN_STRENGTH === 'number' ? MAP_FLATTEN_STRENGTH : 0.48;
  const edgeJitter = typeof MAP_FLATTEN_EDGE_JITTER === 'number' ? MAP_FLATTEN_EDGE_JITTER : 0;
  const localVariation = typeof MAP_FLATTEN_LOCAL_VARIATION === 'number' ? MAP_FLATTEN_LOCAL_VARIATION : 0;
  const seed = (typeof mapSeed === 'number' ? mapSeed : 0) + 33000;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const dx = col - cx, dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const edgeNoise = typeof fbm === 'function'
        ? fbm(col * 0.18 + 12, row * 0.18 + 8, seed, 3)
        : mulberry32(hashSeed(col, row) ^ seed)();
      const notchNoise = typeof fbm === 'function'
        ? fbm(col * 0.42 + 2, row * 0.42 + 4, seed + 91, 2)
        : mulberry32(hashSeed(col + 19, row - 11) ^ seed)();
      const localR = Math.max(4, r + (edgeNoise - 0.5) * edgeJitter);
      if (dist >= localR) continue;

      const t = 1 - dist / localR;
      let localStrength = strength * (1 - localVariation * 0.5 + notchNoise * localVariation);
      if (t < 0.32 && notchNoise < 0.32){
        localStrength *= 0.35;
      }
      const target = MAP_PLAYABLE_ELEVATION + (edgeNoise - 0.5) * 0.018 * (1 - t);
      heights[row][col] = lerp(heights[row][col], target, t * t * localStrength);
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
    // Garantit level >= 1 pour tout terrain non-eau (évite le rendu eau par erreur).
    if (cell.terrain !== 'water' && cell.level <= 0) cell.level = 1;
    cell.elevation = elevationFromLevel(cell.level);
  } else {
    cell.elevation = quantizeElevation(rawHeight);
    if (typeof syncCellLevelElevation === 'function') syncCellLevelElevation(cell);
    if (cell.terrain !== 'water' && (cell.level || 0) <= 0) cell.level = 1;
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

function isNearWaterWithin(heights, col, row, maxDist, threshold){
  threshold = threshold || MAP_WATER_THRESHOLD;
  for (let dist = 1; dist <= maxDist; dist++){
    for (let dr = -dist; dr <= dist; dr++){
      for (let dc = -dist; dc <= dist; dc++){
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== dist) continue;
        const nc = col + dc, nr = row + dr;
        if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS){
          if (heights[nr][nc] < threshold) return true;
        }
      }
    }
  }
  return false;
}

function coastStyleNoise(col, row, seedOffset){
  const seed = (typeof mapSeed === 'number' ? mapSeed : 0) + (seedOffset || 0);
  if (typeof fbm === 'function'){
    return fbm(col * 0.085 + 18, row * 0.085 + 31, seed, 3);
  }
  return mulberry32(hashSeed(col, row) ^ seed)();
}

function terrainFromMaps(height, moisture, slope, col, row, heights){
  if (height < MAP_WATER_THRESHOLD) return 'water';

  const nearWater = isNearWater(heights, col, row);
  const beachSlope = typeof MAP_COAST_BEACH_SLOPE === 'number' ? MAP_COAST_BEACH_SLOPE : 0.046;
  const sandExtra = typeof MAP_SAND_BEACH_HEIGHT_EXTRA === 'number' ? MAP_SAND_BEACH_HEIGHT_EXTRA : 0.04;
  const sandRing = typeof MAP_SAND_COAST_RING === 'number' ? MAP_SAND_COAST_RING : 0;

  if (nearWater){
    const coast = coastStyleNoise(col, row, 12000);
    const cliffBias = coast > 0.66 || (coast > 0.54 && slope > beachSlope * 0.85);
    if (slope > beachSlope * 1.25 || height > MAP_SAND_THRESHOLD + sandExtra + 0.025 || cliffBias) return 'rock';
    if (height < MAP_SAND_THRESHOLD + sandExtra) return 'sand';
  }

  if (sandRing > 0
      && isNearWaterWithin(heights, col, row, sandRing)
      && height < MAP_SAND_THRESHOLD + sandExtra * 0.75
      && slope < beachSlope * 1.1
      && coastStyleNoise(col, row, 12000) < 0.72){
    return 'sand';
  }

  if (plainMarbleAt(col, row, height, slope, heights)) return 'marble';

  const canMountain = isLandEnoughForMountain(col, row, height);

  if (canMountain && height > MAP_MARBLE_THRESHOLD - 0.04){
    if (isMarbleVeinCell(col, row, height, slope, heights)) return 'marble';
    return 'rock';
  }

  if (canMountain && slope > MAP_ROCK_SLOPE) return 'rock';

  if (height > MAP_HILL_THRESHOLD){
    if (canMountain && height < MAP_MARBLE_THRESHOLD && slope < MAP_ROCK_SLOPE * 0.55){
      return slope > MAP_ROCK_SLOPE * 0.42 ? 'rock' : 'hill';
    }
    return 'hill';
  }

  const isPlain = height < MAP_HILL_THRESHOLD + 0.06 && slope < 0.048;

  if (isPlain
      && moisture > MAP_FOREST_MOISTURE
      && height >= MAP_FOREST_MIN_HEIGHT
      && height <= MAP_FOREST_MAX_HEIGHT
      && slope < MAP_FOREST_MAX_SLOPE){
    return 'forest';
  }

  if (isPlain
      && moisture > MAP_WHEAT_MOISTURE
      && moisture < 0.54
      && height >= MAP_WHEAT_MIN_HEIGHT
      && height <= MAP_WHEAT_MAX_HEIGHT
      && slope < 0.038){
    const wheatThreshold = typeof MAP_WHEAT_NOISE_THRESHOLD === 'number' ? MAP_WHEAT_NOISE_THRESHOLD : 0.74;
    const patchChance = typeof MAP_WHEAT_PATCH_CHANCE === 'number' ? MAP_WHEAT_PATCH_CHANCE : 0.018;
    const wheatNoise = coastStyleNoise(col, row, 15001);
    if (wheatNoise < wheatThreshold) return 'grass';
    if (mulberry32(hashSeed(col, row) ^ mapSeed ^ 0x57484541)() > patchChance * (0.55 + wheatNoise * 0.9)){
      return 'grass';
    }
    return 'wheat';
  }

  if (moisture < 0.34 && height > 0.38 && height < MAP_HILL_THRESHOLD && slope < 0.040){
    return 'hill';
  }

  return 'grass';
}

function countNeighborTerrain(col, row, terrain){
  let n = 0;
  for (let dr = -1; dr <= 1; dr++){
    for (let dc = -1; dc <= 1; dc++){
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (grid[nr][nc].terrain === terrain) n++;
    }
  }
  return n;
}

/** Bosquets, champs et prairies boisées — rend la carte moins « tapis d'herbe ». */
function enrichNaturalLandscape(heights, moisture){
  if (!Array.isArray(grid) || grid.length === 0) return;

  const forestSpread = typeof MAP_FOREST_SPREAD_CHANCE === 'number' ? MAP_FOREST_SPREAD_CHANCE : 0.32;
  const wheatSpread = typeof MAP_WHEAT_SPREAD_CHANCE === 'number' ? MAP_WHEAT_SPREAD_CHANCE : 0.26;
  const groveThreshold = typeof MAP_GROVE_NOISE_THRESHOLD === 'number' ? MAP_GROVE_NOISE_THRESHOLD : 0.58;
  const grovePatch = typeof MAP_GROVE_PATCH_CHANCE === 'number' ? MAP_GROVE_PATCH_CHANCE : 0.22;
  const scale = MAP_NOISE_SCALE * 2.4;

  function canBecomeForest(col, row){
    const h = heights[row][col];
    const m = moisture[row][col];
    return h >= MAP_FOREST_MIN_HEIGHT
      && h <= MAP_FOREST_MAX_HEIGHT
      && m > MAP_FOREST_MOISTURE - 0.08
      && !isNearWater(heights, col, row);
  }

  function canBecomeWheat(col, row){
    const h = heights[row][col];
    const m = moisture[row][col];
    const wheatThreshold = typeof MAP_WHEAT_NOISE_THRESHOLD === 'number' ? MAP_WHEAT_NOISE_THRESHOLD : 0.74;
    return h >= MAP_WHEAT_MIN_HEIGHT
      && h <= MAP_WHEAT_MAX_HEIGHT
      && m > MAP_WHEAT_MOISTURE + 0.06
      && m < 0.54
      && coastStyleNoise(col, row, 15001) >= wheatThreshold
      && !isNearWater(heights, col, row);
  }

  for (let pass = 0; pass < 2; pass++){
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
        if (!cell || cell.terrain !== 'grass') continue;

        const rng = mulberry32(hashSeed(col, row) ^ mapSeed ^ (pass * 0x9e3779b9));
        const forestN = countNeighborTerrain(col, row, 'forest');
        const wheatN = countNeighborTerrain(col, row, 'wheat');

        if (forestN >= 2 && canBecomeForest(col, row) && rng() < forestSpread){
          next[row][col] = 'forest';
          continue;
        }
        if (forestN === 1 && canBecomeForest(col, row) && rng() < forestSpread * 0.55){
          next[row][col] = 'forest';
          continue;
        }
        if (wheatN >= 5 && canBecomeWheat(col, row) && rng() < wheatSpread){
          next[row][col] = 'wheat';
          continue;
        }

        if (pass === 0 && forestN === 0 && canBecomeForest(col, row)){
          const grove = fbm(col * scale + 11, row * scale + 23, mapSeed + 12001, 3);
          if (grove >= groveThreshold && rng() < grovePatch){
            next[row][col] = 'forest';
          }
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

function countNeighborTerrains(col, row, predicate, radius){
  let count = 0;
  let total = 0;
  for (let dr = -radius; dr <= radius; dr++){
    for (let dc = -radius; dc <= radius; dc++){
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      total++;
      const cell = grid[nr][nc];
      if (cell && predicate(cell.terrain)) count++;
    }
  }
  return { count, total };
}

/** Fusionne collines/herbe en roche quand entourées par un massif — massifs plus homogènes. */
function coalesceMountainMassifs(heights){
  if (!Array.isArray(grid) || grid.length === 0) return;

  const minN = typeof MAP_MOUNTAIN_COALESCE_MIN_NEIGHBORS === 'number' ? MAP_MOUNTAIN_COALESCE_MIN_NEIGHBORS : 5;
  const changes = [];

  for (let row = 1; row < GRID_ROWS - 1; row++){
    for (let col = 1; col < GRID_COLS - 1; col++){
      const cell = grid[row][col];
      if (!cell || cell.terrain === 'water' || cell.terrain === 'sand' || isMountainTerrain(cell.terrain)) continue;

      const h = heights[row][col];
      if (h < MAP_MARBLE_THRESHOLD - 0.10 || !isLandEnoughForMountain(col, row, h)) continue;
      if (isNearWater(heights, col, row)) continue;

      const near = countNeighborTerrains(col, row, isMountainTerrain, 1);
      const broad = countNeighborTerrains(col, row, terrain => isMountainTerrain(terrain) || terrain === 'hill', 2);
      const shouldCoalesce = near.count >= minN || (near.count >= 4 && broad.count >= 14);
      if (!shouldCoalesce) continue;

      const slope = cell.slope || 0;
      changes.push({
        col,
        row,
        terrain: slope > MAP_ROCK_SLOPE * 0.68 || h > MAP_MARBLE_THRESHOLD - 0.02 ? 'rock' : 'marble',
      });
    }
  }

  changes.forEach(change => {
    const cell = grid[change.row][change.col];
    cell.terrain = change.terrain;
    applyCellHeight(cell, heights[change.row][change.col]);
  });
}

/** Comble seulement les petits trous vraiment enfermés dans un massif roche/marbre. */
function closeMountainHoles(heights, passes){
  const defaultPasses = typeof MAP_MOUNTAIN_HOLE_CLOSE_PASSES === 'number' ? MAP_MOUNTAIN_HOLE_CLOSE_PASSES : 1;
  const n = typeof passes === 'number' ? passes : defaultPasses;
  if (!Array.isArray(grid) || grid.length === 0) return;

  const minNeighbors = typeof MAP_MOUNTAIN_HOLE_MIN_NEIGHBORS === 'number' ? MAP_MOUNTAIN_HOLE_MIN_NEIGHBORS : 5;

  for (let pass = 0; pass < n; pass++){
    const changes = [];
    for (let row = 1; row < GRID_ROWS - 1; row++){
      for (let col = 1; col < GRID_COLS - 1; col++){
        const cell = grid[row][col];
        if (!cell || cell.terrain === 'water' || cell.terrain === 'sand' || isMountainTerrain(cell.terrain)) continue;

        const h = heights[row][col];
        const fillMinHeight = MAP_MARBLE_THRESHOLD - 0.08;
        if (h < fillMinHeight || !isLandEnoughForMountain(col, row, h)) continue;

        const near = countNeighborTerrains(col, row, isMountainTerrain, 1);
        const broad = countNeighborTerrains(col, row, terrain => isMountainTerrain(terrain) || terrain === 'hill', 2);
        const enclosedByRock = near.count >= minNeighbors + 2;
        const enclosedByMassif = near.count >= minNeighbors && broad.count >= 14;

        if (enclosedByRock || enclosedByMassif){
          const slope = cell.slope || 0;
          changes.push({
            col,
            row,
            terrain: slope > MAP_ROCK_SLOPE * 0.72 ? 'rock' : 'marble',
          });
        }
      }
    }

    changes.forEach(change => {
      const cell = grid[change.row][change.col];
      cell.terrain = change.terrain;
      applyCellHeight(cell, heights[change.row][change.col]);
    });
  }
}

/** Garantit une bande côtière praticable sur le bord connecté (spawn migrants / PNJ). */
function ensureSpawnCoastStrip(heights){
  if (!Array.isArray(grid) || grid.length === 0) return;

  const edgeDepth = typeof MAP_CONNECTED_EDGE_LAND_WIDTH === 'number' ? MAP_CONNECTED_EDGE_LAND_WIDTH : 2;
  const lift = typeof MAP_CONNECTED_EDGE_LIFT === 'number' ? MAP_CONNECTED_EDGE_LIFT : 0.36;
  const waterMin = MAP_WATER_THRESHOLD + 0.02;

  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const dist = connectedLandEdgeDistance(col, row);
      if (dist >= edgeDepth && !isEntryCorridorCell(col, row)) continue;
      if (!isIsthmusAccessCell(col, row, mapSeed) && !isEntryCorridorCell(col, row)) continue;

      const cell = grid[row][col];
      if (!cell) continue;

      const h = clamp01(Math.max(heights[row][col], lift - dist * 0.012));
      heights[row][col] = h;

      if (dist === 0){
        cell.terrain = 'sand';
      } else if (cell.terrain === 'water' || cell.terrain === 'rock' || cell.terrain === 'marble'){
        cell.terrain = h < waterMin ? 'sand' : (h > MAP_HILL_THRESHOLD ? 'hill' : 'grass');
      } else if (cell.terrain === 'forest' && dist <= 1){
        cell.terrain = 'grass';
      }

      cell.level = Math.max(1, cell.level || 1);
      applyCellHeight(cell, h);
    }
  }
}

/** Regroupe les biomes voisins (évite le bruit « confetti »). */
function smoothTerrainMap(passes){
  const n = typeof passes === 'number' ? passes : 0;
  if (n <= 0 || !Array.isArray(grid) || grid.length === 0) return;

  const preserve = new Set(['water', 'sand']);

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
      const coast = coastStyleNoise(col, row, 12000);
      const cliffCoast = coast > 0.64 || (coast > 0.52 && slope > beachSlope * 0.8);

      if (cliffCoast || slope > beachSlope * 1.18){
        cell.terrain = 'rock';
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
      if (isConnectedLandEdgeCell(col, row)){
        if (cell.terrain === 'water') cell.terrain = 'sand';
        if (cell.level <= 0){
          cell.level = 1;
          cell.elevation = elevationFromLevel(1);
        }
        continue;
      }

      if (dist === 0){
        cell.terrain = 'water';
        cell.level = 0;
        cell.elevation = 0;
        continue;
      }
      if (dist === 1 && cell.terrain !== 'water'){
        const coast = coastStyleNoise(col, row, 14000);
        cell.terrain = coast > 0.68 ? 'rock' : 'sand';
        cell.level = 1;
        cell.elevation = elevationFromLevel(1);
        continue;
      }
      if (dist < borderW){
        if (cell.level > 1){
          cell.level = 1;
          cell.elevation = elevationFromLevel(1);
        }
        const coast = coastStyleNoise(col, row, 14000);
        if (dist <= 2 && coast < 0.66 && (cell.terrain === 'rock' || cell.terrain === 'marble' || cell.terrain === 'hill')){
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
  terrainGenerationInProgress = true;
  if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
  else if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();

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
        roadStairs: false,
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
  enrichNaturalLandscape(heights, moisture);
  syncAllCellHeights(heights);

  reportGenProgress(78, 'Côtes et montagnes…');
  await yieldFrame();
  polishCoastBiomes(heights, slopes);
  polishMountainBiomes(heights);
  coalesceMountainMassifs(heights);
  closeMountainHoles(heights);
  syncAllCellHeights(heights);

  reportGenProgress(88, 'Bords de carte…');
  await yieldFrame();
  if (typeof polishMapEdges === 'function') polishMapEdges();
  ensureSpawnCoastStrip(heights);
  syncAllCellHeights(heights);

  reportGenProgress(94, 'Corridor d\'entrée…');
  await yieldFrame();
  ensureWalkerEntryCorridor(heights);
  syncAllCellHeights(heights);
  mapWalkerEntry = computeMapWalkerEntry();

  reportGenProgress(100, 'Finalisation…');
  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  terrainGenerationInProgress = false;
  if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
  else if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  if (typeof render === 'function') render();
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
  const land = computeLandCentroid();
  const targetCol = land ? Math.round(land.col) : Math.floor(GRID_COLS / 2);
  const targetRow = land ? Math.round(land.row) : Math.floor(GRID_ROWS / 2);
  const center = tileCenter(targetCol, targetRow);
  if (typeof centerCameraOn === 'function'){
    centerCameraOn(center.x, center.y);
  }
}
