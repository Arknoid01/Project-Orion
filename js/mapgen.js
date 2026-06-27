/* ===================== GENERATION PROCEDURALE DE CARTE 60×60 ===================== */
// Relief riche : bruit multi-octaves + arêtes montagneuses + cartes d'humidité /
// de pente → 8 biomes (eau, sable, herbe, blé, colline, forêt, roche, marbre).

let mapSeed = 0;

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

function generateHeightMap(seed){
  const scale = MAP_NOISE_SCALE;
  const heights = [];
  for (let row = 0; row < GRID_ROWS; row++){
    heights[row] = [];
    for (let col = 0; col < GRID_COLS; col++){
      const nx = col * scale;
      const ny = row * scale;
      const base = fbm(nx, ny, seed, MAP_HEIGHT_OCTAVES);
      const ridges = ridgedNoise(nx * 1.4 + 20, ny * 1.4 + 20, seed + 500) * MAP_RIDGE_STRENGTH;
      const detail = fbm(nx * 4.5, ny * 4.5, seed + 2000, 2) * MAP_DETAIL_STRENGTH;

      let h = base * 0.62 + ridges * 0.28 + detail * 0.1;

      const edgeX = Math.min(col, GRID_COLS - 1 - col) / (GRID_COLS * 0.1);
      const edgeY = Math.min(row, GRID_ROWS - 1 - row) / (GRID_ROWS * 0.1);
      const edgeFactor = clamp01(Math.min(edgeX, edgeY));
      h = h * (0.68 + 0.32 * edgeFactor);

      heights[row][col] = clamp01(h);
    }
  }
  flattenPlayableCenter(heights);
  return heights;
}

function flattenPlayableCenter(heights){
  const cx = Math.floor(GRID_COLS / 2);
  const cy = Math.floor(GRID_ROWS / 2);
  const r = MAP_FLATTEN_RADIUS;
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const dx = col - cx, dy = row - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= r) continue;
      const t = 1 - dist / r;
      heights[row][col] = lerp(heights[row][col], MAP_PLAYABLE_ELEVATION, t * t * 0.85);
    }
  }
}

function computeSlopeMap(heights){
  const slopes = [];
  for (let row = 0; row < GRID_ROWS; row++){
    slopes[row] = [];
    for (let col = 0; col < GRID_COLS; col++){
      let maxDiff = 0;
      const h = heights[row][col];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dc, dr]) => {
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
  for (let row = 0; row < GRID_ROWS; row++){
    moisture[row] = [];
    for (let col = 0; col < GRID_COLS; col++){
      const m = fbm(col * scale * 1.25 + 50, row * scale * 1.25 + 50, seed + 999, 4);
      const river = fbm(col * scale * 2.8, row * scale * 2.8, seed + 3333, 2);
      moisture[row][col] = clamp01(m * 0.55 + (1 - heights[row][col]) * 0.25 + river * 0.2);
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
  if (height < MAP_SAND_THRESHOLD && isNearWater(heights, col, row)) return 'sand';
  if (slope > MAP_ROCK_SLOPE || (height > MAP_MARBLE_THRESHOLD - 0.06 && slope > MAP_ROCK_SLOPE * 0.55)) return 'rock';
  if (height > MAP_MARBLE_THRESHOLD) return 'marble';
  if (height > MAP_HILL_THRESHOLD && slope < MAP_FOREST_MAX_SLOPE) return 'hill';
  if (moisture > MAP_FOREST_MOISTURE && height > MAP_FOREST_MIN_HEIGHT && height < MAP_FOREST_MAX_HEIGHT && slope < MAP_FOREST_MAX_SLOPE){
    return 'forest';
  }
  if (moisture > MAP_WHEAT_MOISTURE && height >= MAP_WHEAT_MIN_HEIGHT && height < MAP_WHEAT_MAX_HEIGHT && slope < 0.06) return 'wheat';
  return 'grass';
}

function generateProceduralMap(seed){
  mapSeed = (typeof seed === 'number') ? seed : Math.floor(Math.random() * 1e9);
  const heights = generateHeightMap(mapSeed);
  const moisture = generateMoistureMap(mapSeed, heights);
  const slopes = computeSlopeMap(heights);

  grid = [];
  for (let row = 0; row < GRID_ROWS; row++){
    const line = [];
    for (let col = 0; col < GRID_COLS; col++){
      const elevation = heights[row][col];
      line.push({
        terrain: terrainFromMaps(elevation, moisture[row][col], slopes[row][col], col, row, heights),
        building: null,
        hasRoad: false,
        houseLevel: 0,
        population: 0,
        patrolBlock: false,
        beauty: 0,
        elevation,
        slope: slopes[row][col],
      });
    }
    grid.push(line);
  }

  if (typeof invalidateMapDrawOrder === 'function') invalidateMapDrawOrder();
  debugInfo('Carte procédurale générée', { seed: mapSeed, size: `${GRID_COLS}×${GRID_ROWS}` });
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

function centerMapView(){
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return;
  const center = tileCenter(Math.floor(GRID_COLS / 2), Math.floor(GRID_ROWS / 2));
  wrap.scrollLeft = Math.max(0, center.x * zoomLevel - wrap.clientWidth / 2);
  wrap.scrollTop = Math.max(0, center.y * zoomLevel - wrap.clientHeight / 2);
}
