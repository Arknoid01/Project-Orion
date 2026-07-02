/* ===================== CALCUL NUMÉRIQUE CARTE (main + worker) ===================== */
// Hauteurs, humidité et pentes — sans accès au DOM ni à la grille de jeu.
(function(root){
  'use strict';

  function hashSeed(col, row){
    let h = (col * 374761393 + row * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(seed){
    return function(){
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function lerp(a, b, t){ return a + (b - a) * t; }
  function smoothstep(t){ return t * t * (3 - 2 * t); }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function clampInt(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function valueNoise(x, y, seed){
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const rng = (ix, iy) => mulberry32(hashSeed(ix + seed * 17, iy + seed * 31))();
    const v00 = rng(xi, yi), v10 = rng(xi + 1, yi), v01 = rng(xi, yi + 1), v11 = rng(xi + 1, yi + 1);
    const u = smoothstep(xf), v = smoothstep(yf);
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

  function domainWarpCoords(x, y, seed, cfg){
    const strength = cfg.MAP_DOMAIN_WARP;
    const dx = fbm(x + 11.7, y + 3.9, seed + 8001, 3) - 0.5;
    const dy = fbm(x + 5.3, y + 14.2, seed + 8002, 3) - 0.5;
    return { x: x + dx * strength, y: y + dy * strength };
  }

  function islandLandFactor(col, row, seed, cfg){
    const cx = (cfg.cols - 1) / 2;
    const cy = (cfg.rows - 1) / 2;
    const dx = (col - cx) / (cfg.cols * cfg.MAP_ISLAND_RADIUS);
    const dy = (row - cy) / (cfg.rows * cfg.MAP_ISLAND_RADIUS);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const shape = fbm(col * 0.052 + 30, row * 0.052 + 30, seed + 6100, 4);
    const edge = 0.80 + (shape - 0.5) * 0.30;
    return smoothstep(clamp01((edge - dist) / 0.13));
  }

  function landCoverageFactor(col, row, seed, landStyle, cfg){
    if (landStyle === 'continent') return 1;
    return islandLandFactor(col, row, seed, cfg);
  }

  function effectiveEdgeBorderWidth(landStyle, cfg){
    if (landStyle === 'island') return cfg.MAP_ISLAND_EDGE_BORDER;
    return cfg.MAP_CONTINENT_EDGE_BORDER;
  }

  function mountainRangeFactor(nx, ny, seed, cfg){
    const mul = cfg.MAP_RANGE_SCALE_MUL;
    const strength = cfg.MAP_RANGE_STRENGTH;
    const ridges = ridgedNoise(nx * mul + 7, ny * mul + 7, seed + 7100);
    return ridges * ridges * strength;
  }

  function dryLandMountainFactor(h, land, landStyle, cfg){
    const fromHeight = smoothstep(clamp01((h - cfg.MAP_MOUNTAIN_MIN_HEIGHT) / 0.14));
    if (landStyle === 'continent') return fromHeight;
    const fromMask = smoothstep(clamp01((land - cfg.MAP_MOUNTAIN_MIN_LAND) / 0.42));
    return fromHeight * fromMask;
  }

  function softenHeightMap(heights, passes, cfg){
    const n = typeof passes === 'number' ? passes : 0;
    if (n <= 0) return heights;
    for (let p = 0; p < n; p++){
      const next = heights.map(row => row.slice());
      for (let row = 1; row < cfg.rows - 1; row++){
        for (let col = 1; col < cfg.cols - 1; col++){
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
      for (let row = 0; row < cfg.rows; row++){
        for (let col = 0; col < cfg.cols; col++) heights[row][col] = next[row][col];
      }
    }
    return heights;
  }

  function buildLandBridgePath(seed, heights, landStyle, cfg){
    const rng = mulberry32(seed + 88001);
    const colStart = cfg.migrantEntryCol;
    const wind = cfg.MAP_LAND_BRIDGE_WIND;
    const endRow = landStyle === 'island'
      ? Math.max(Math.floor(cfg.rows * 0.42), cfg.MAP_FLATTEN_RADIUS + 10)
      : cfg.rows - 2;
    let col = colStart;
    const path = [{ col, row: cfg.rows - 1 }];
    for (let row = cfg.rows - 2; row >= endRow; row--){
      let bestCol = col, bestScore = -Infinity;
      for (let dc = -2; dc <= 2; dc++){
        const c = clampInt(col + dc, 2, cfg.cols - 3);
        let score = 0;
        if (heights && heights[row] && heights[row][c] != null) score += heights[row][c] * 1.4;
        score += fbm(c * 0.13, row * 0.11, seed + 88002, 3) * wind;
        score += fbm(c * 0.05 + 40, row * 0.04 + 20, seed + 88004, 2) * (wind * 0.55);
        score -= Math.abs(c - colStart) * 0.006;
        score += (rng() - 0.5) * 0.04;
        if (score > bestScore){ bestScore = score; bestCol = c; }
      }
      col = bestCol;
      path.push({ col, row });
    }
    return path;
  }

  function buildEntryCorridorCellSet(path, seed, cfg){
    const set = new Set();
    if (!path || !path.length) return set;
    const baseHalf = Math.max(1, Math.floor(cfg.MAP_ENTRY_CORRIDOR_WIDTH / 2));
    path.forEach((pt, i) => {
      const t = i / Math.max(1, path.length - 1);
      const widthNoise = fbm(pt.col * 0.17 + 3, pt.row * 0.14 + 7, seed + 88003, 2);
      const halfW = Math.max(1, Math.round(baseHalf * (0.65 + widthNoise * 0.75)));
      const vPad = t < 0.15 || t > 0.88 ? 1 : 0;
      for (let dc = -halfW; dc <= halfW; dc++){
        for (let dr = -vPad; dr <= vPad; dr++){
          const c = pt.col + dc, r = pt.row + dr;
          if (c >= 0 && c < cfg.cols && r >= 0 && r < cfg.rows) set.add(`${c},${r}`);
        }
      }
    });
    return set;
  }

  function carveLandBridgeHeights(heights, landStyle, corridorCells, cfg){
    if (landStyle !== 'island' || !corridorCells || !corridorCells.size) return;
    const lift = cfg.MAP_LAND_BRIDGE_LIFT;
    for (let row = 0; row < cfg.rows; row++){
      for (let col = 0; col < cfg.cols; col++){
        if (!corridorCells.has(`${col},${row}`)) continue;
        const t = row / Math.max(1, cfg.rows - 1);
        const target = lerp(lift + 0.03, cfg.MAP_PLAYABLE_ELEVATION, t * 0.62);
        heights[row][col] = clamp01(Math.max(heights[row][col], target));
      }
    }
  }

  function flattenPlayableCenter(heights, seed, cfg){
    const cx = Math.floor(cfg.cols / 2);
    const cy = Math.floor(cfg.rows / 2);
    const r = cfg.MAP_FLATTEN_RADIUS;
    const strength = cfg.MAP_FLATTEN_STRENGTH;
    const edgeJitter = cfg.MAP_FLATTEN_EDGE_JITTER;
    const localVariation = cfg.MAP_FLATTEN_LOCAL_VARIATION;
    const flatSeed = seed + 33000;
    for (let row = 0; row < cfg.rows; row++){
      for (let col = 0; col < cfg.cols; col++){
        const dx = col - cx, dy = row - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const edgeNoise = fbm(col * 0.18 + 12, row * 0.18 + 8, flatSeed, 3);
        const notchNoise = fbm(col * 0.42 + 2, row * 0.42 + 4, flatSeed + 91, 2);
        const localR = Math.max(4, r + (edgeNoise - 0.5) * edgeJitter);
        if (dist >= localR) continue;
        const t = 1 - dist / localR;
        let localStrength = strength * (1 - localVariation * 0.5 + notchNoise * localVariation);
        if (t < 0.32 && notchNoise < 0.32) localStrength *= 0.35;
        const target = cfg.MAP_PLAYABLE_ELEVATION + (edgeNoise - 0.5) * 0.018 * (1 - t);
        heights[row][col] = lerp(heights[row][col], target, t * t * localStrength);
      }
    }
  }

  function isNearWater(heights, col, row, cfg){
    for (let dr = -1; dr <= 1; dr++){
      for (let dc = -1; dc <= 1; dc++){
        const nc = col + dc, nr = row + dr;
        if (nc >= 0 && nc < cfg.cols && nr >= 0 && nr < cfg.rows){
          if (heights[nr][nc] < cfg.MAP_WATER_THRESHOLD) return true;
        }
      }
    }
    return false;
  }

  function rainShadowFactor(col, row, heights, cfg){
    const wx = cfg.MAP_WIND_X, wy = cfg.MAP_WIND_Y;
    const len = Math.sqrt(wx * wx + wy * wy) || 1;
    const dx = wx / len, dy = wy / len;
    const h0 = heights[row][col];
    let barrier = 0;
    for (let i = 1; i <= cfg.MAP_RAIN_SHADOW_STEPS; i++){
      const nc = Math.round(col - dx * i);
      const nr = Math.round(row - dy * i);
      if (nc < 0 || nc >= cfg.cols || nr < 0 || nr >= cfg.rows) break;
      barrier = Math.max(barrier, heights[nr][nc] - h0);
    }
    return clamp01(Math.max(0, barrier - 0.06));
  }

  function pickMapLandStyle(seed, cfg){
    const mode = cfg.MAP_LAND_STYLE;
    if (mode === 'continent' || mode === 'island') return mode;
    return mulberry32(seed + 44000)() < cfg.MAP_ISLAND_CHANCE ? 'island' : 'continent';
  }

  function generateHeightMap(seed, landStyle, cfg){
    const scale = cfg.MAP_NOISE_SCALE;
    const sea = cfg.MAP_EDGE_WATER_LEVEL;
    const heights = [];
    const borderW = effectiveEdgeBorderWidth(landStyle, cfg);

    for (let row = 0; row < cfg.rows; row++){
      heights[row] = [];
      for (let col = 0; col < cfg.cols; col++){
        const warped = domainWarpCoords(col * scale, row * scale, seed, cfg);
        const nx = warped.x, ny = warped.y;
        const base = fbm(nx, ny, seed, cfg.MAP_HEIGHT_OCTAVES);
        const ridges = ridgedNoise(nx * 1.35 + 20, ny * 1.35 + 20, seed + 500) * cfg.MAP_RIDGE_STRENGTH;
        const detail = fbm(nx * 4.2, ny * 4.2, seed + 2000, 2) * cfg.MAP_DETAIL_STRENGTH;
        const valleys = ridgedNoise(nx * 0.75 + 90, ny * 0.75 + 90, seed + 9000);
        const ranges = mountainRangeFactor(nx, ny, seed, cfg);
        let h = base * 0.52 + detail * 0.10 + cfg.MAP_LAND_BASE_BIAS;
        const land = landCoverageFactor(col, row, seed, landStyle, cfg);
        if (landStyle === 'island'){
          const islandBlend = clamp01(lerp(1 - cfg.MAP_ISLAND_STRENGTH, 1, land));
          h = lerp(sea, h, islandBlend);
          h = clamp01(h - valleys * cfg.MAP_VALLEY_STRENGTH * land);
        } else {
          h = clamp01(h - valleys * cfg.MAP_VALLEY_STRENGTH * 0.55);
        }
        const mountMask = dryLandMountainFactor(h, land, landStyle, cfg);
        h = clamp01(h + ridges * 0.34 * mountMask + ranges * 0.12 * mountMask);
        const mcx = (cfg.cols - 1) / 2, mcy = (cfg.rows - 1) / 2;
        const mDist = Math.sqrt((col - mcx) ** 2 + (row - mcy) ** 2) / (cfg.cols * 0.28);
        h = clamp01(h + clamp01(1 - mDist) * cfg.MAP_MOUNTAIN_CENTER_BOOST * mountMask);
        if (landStyle === 'island'){
          const edgeX = Math.min(col, cfg.cols - 1 - col) / (cfg.cols * 0.1);
          const edgeY = Math.min(row, cfg.rows - 1 - row) / (cfg.rows * 0.1);
          h = h * (0.72 + 0.28 * clamp01(Math.min(edgeX, edgeY)));
        }
        if (borderW > 0){
          const distEdge = Math.min(col, row, cfg.cols - 1 - col, cfg.rows - 1 - row);
          if (distEdge < borderW){
            const t = distEdge / borderW;
            h = lerp(sea, h, t * t);
          }
        }
        heights[row][col] = clamp01(h);
      }
    }

    softenHeightMap(heights, cfg.MAP_HEIGHT_SMOOTH_PASSES, cfg);
    const bridgePath = buildLandBridgePath(seed, heights, landStyle, cfg);
    const corridorCells = buildEntryCorridorCellSet(bridgePath, seed, cfg);
    carveLandBridgeHeights(heights, landStyle, corridorCells, cfg);
    flattenPlayableCenter(heights, seed, cfg);
    return { heights, bridgePath, corridorCells: Array.from(corridorCells) };
  }

  function generateMoistureMap(seed, landStyle, cfg, heights){
    const moisture = [];
    const scale = cfg.MAP_NOISE_SCALE;
    for (let row = 0; row < cfg.rows; row++){
      moisture[row] = [];
      for (let col = 0; col < cfg.cols; col++){
        const h = heights[row][col];
        const m = fbm(col * scale * 1.2 + 50, row * scale * 1.2 + 50, seed + 999, 4);
        const river = ridgedNoise(col * scale * 2.4 + 80, row * scale * 2.4 + 80, seed + 3333);
        const riverBand = (1 - river) * (1 - river);
        let wet = m * 0.50 + (1 - h) * 0.22 + riverBand * 0.18;
        if (isNearWater(heights, col, row, cfg)) wet += 0.14;
        wet -= rainShadowFactor(col, row, heights, cfg) * cfg.MAP_RAIN_SHADOW;
        const land = landCoverageFactor(col, row, seed, landStyle, cfg);
        wet *= 0.85 + land * 0.15;
        moisture[row][col] = clamp01(wet);
      }
    }
    return moisture;
  }

  function computeSlopeMap(cfg, heights){
    const slopes = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (let row = 0; row < cfg.rows; row++){
      slopes[row] = [];
      for (let col = 0; col < cfg.cols; col++){
        let maxDiff = 0;
        const h = heights[row][col];
        dirs.forEach(([dc, dr]) => {
          const nc = col + dc, nr = row + dr;
          if (nc >= 0 && nc < cfg.cols && nr >= 0 && nr < cfg.rows){
            maxDiff = Math.max(maxDiff, Math.abs(h - heights[nr][nc]));
          }
        });
        slopes[row][col] = maxDiff;
      }
    }
    return slopes;
  }

  function flatten2d(grid2d, cfg){
    const flat = new Float32Array(cfg.cols * cfg.rows);
    for (let r = 0; r < cfg.rows; r++){
      for (let c = 0; c < cfg.cols; c++) flat[r * cfg.cols + c] = grid2d[r][c];
    }
    return flat;
  }

  function unpack2d(flat, cfg){
    const out = [];
    for (let r = 0; r < cfg.rows; r++){
      out[r] = [];
      for (let c = 0; c < cfg.cols; c++) out[r][c] = flat[r * cfg.cols + c];
    }
    return out;
  }

  function computeFields(seed, landStyle, cfg){
    const heightBundle = generateHeightMap(seed, landStyle, cfg);
    const moisture = generateMoistureMap(seed, landStyle, cfg, heightBundle.heights);
    const slopes = computeSlopeMap(cfg, heightBundle.heights);
    return {
      heights: heightBundle.heights,
      moisture,
      slopes,
      bridgePath: heightBundle.bridgePath,
      corridorCells: heightBundle.corridorCells,
    };
  }

  root.MapgenNumeric = {
    pickMapLandStyle,
    generateHeightMap,
    generateMoistureMap,
    computeSlopeMap,
    computeFields,
    flatten2d,
    unpack2d,
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
