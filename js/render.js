/* ===================== CANVAS ===================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = PERF.smoothing; // piloté par le niveau de perf choisi dans Paramètres

/* ===================== METRIQUES PIED SPRITE (bbox alpha) ===================== */
// Les PNG bâtiments/maisons font 144 px mais la base occupe ~2 tuiles export (128 px = 1 tuile).
// On mesure la base réelle pour caler largeur écran = TILE_W et ancrer le pied au centre de la base.
const SPRITE_FOOT_METRICS = new WeakMap();

function measureSpriteFoot(sprite){
  if (!sprite) return null;
  if (SPRITE_FOOT_METRICS.has(sprite)) return SPRITE_FOOT_METRICS.get(sprite);
  const w = sprite.naturalWidth || sprite.width;
  const h = sprite.naturalHeight || sprite.height;
  if (!w || !h) return null;
  // Repli si la lecture de pixels échoue (ex. page ouverte en file:// → canvas "tainted",
  // getImageData lève une SecurityError). Plutôt que de supposer 0% de marge en bas
  // (footNy:1, le pire cas), on utilise une moyenne mesurée sur les PNG réels du projet
  // (~88-93% selon l'asset) : nettement plus proche de la réalité dans le cas aveugle.
  const fallback = { footNx: 0.5, footNy: 0.9, baseW: w, baseH: h };
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d');
    cx.drawImage(sprite, 0, 0);
    const data = cx.getImageData(0, 0, w, h).data;

    const ALPHA_THRESH = 48;
    const MIN_LINE_PIXELS = 2;

    const rowCounts = new Int32Array(h);
    const colCounts = new Int32Array(w);
    for (let y = 0; y < h; y++){
      const rowOff = y * w * 4;
      for (let x = 0; x < w; x++){
        if (data[rowOff + x * 4 + 3] > ALPHA_THRESH){
          rowCounts[y]++;
          colCounts[x]++;
        }
      }
    }

    let minY = h, maxY = -1;
    for (let y = 0; y < h; y++){
      if (rowCounts[y] >= MIN_LINE_PIXELS){
        if (minY === h) minY = y;
        maxY = y;
      }
    }
    let minX = w, maxX = -1;
    for (let x = 0; x < w; x++){
      if (colCounts[x] >= MIN_LINE_PIXELS){
        if (minX === w) minX = x;
        maxX = x;
      }
    }

    if (maxX < minX || maxY < minY){
      SPRITE_FOOT_METRICS.set(sprite, fallback);
      return fallback;
    }
    const m = {
      footNx: (minX + maxX + 1) / 2 / w,
      footNy: (maxY + 1) / h,
      baseW: maxX - minX + 1,
      baseH: maxY - minY + 1,
    };
    // Ligne de sol visible (dalles / sable) — pas le bas du bbox (fondations pierre).
    const rowCountsFull = rowCounts;
    const zoneStart = minY + Math.floor((maxY - minY) * 0.45);
    let maxRowW = 0;
    for (let y = zoneStart; y <= maxY; y++){
      if (rowCountsFull[y] > maxRowW) maxRowW = rowCountsFull[y];
    }
    const gThresh = Math.max(MIN_LINE_PIXELS, Math.floor(maxRowW * 0.72));
    let groundY = maxY;
    for (let y = zoneStart; y <= maxY; y++){
      if (rowCountsFull[y] >= gThresh) groundY = y;
    }
    let gMinX = w, gMaxX = -1;
    const gRowOff = groundY * w * 4;
    for (let x = 0; x < w; x++){
      if (data[gRowOff + x * 4 + 3] > ALPHA_THRESH){
        if (x < gMinX) gMinX = x;
        if (x > gMaxX) gMaxX = x;
      }
    }
    if (gMaxX >= gMinX){
      m.footNx = (gMinX + gMaxX + 1) / 2 / w;
      m.footNy = (groundY + 1) / h;
    }
    SPRITE_FOOT_METRICS.set(sprite, m);
    return m;
  } catch (e){
    SPRITE_FOOT_METRICS.set(sprite, fallback);
    return fallback;
  }
}

/* ===================== CHARGEMENT DES SPRITES REELS ===================== */
// Charge les PNG générés via le pipeline ComfyUI (dossier assets/buildings/).
// Tant qu'une image n'est pas chargée, drawBuilding utilise le rendu procédural de secours.
const BUILDING_SPRITES = {};
Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
  if (!def.sprite) return;
  const img = new Image();
  img.onload = () => {
    measureSpriteFoot(img);
    debugInfo(`Sprite chargé : ${def.sprite}`);
    render();
  };
  img.onerror = () => debugWarn(`Sprite introuvable : ${def.sprite} (vérifie qu'il est dans assets/buildings/)`);
  img.src = def.sprite;
  BUILDING_SPRITES[key] = img;
});

// Sprites de maison par niveau (assets/houses/). Repli procédural si absent.
const HOUSE_SPRITES = {};
HOUSE_LEVELS.forEach(lvl => {
  if (!lvl.sprite) return;
  const img = new Image();
  img.onload = () => {
    measureSpriteFoot(img);
    debugInfo(`Sprite chargé : ${lvl.sprite}`);
    render();
  };
  img.onerror = () => debugWarn(`Sprite de maison introuvable : ${lvl.sprite}`);
  img.src = lvl.sprite;
  HOUSE_SPRITES[lvl.key] = img;
});

// Sprites de sol — en mode blocs : chargés si calque texture plate activé
const TERRAIN_SPRITE_IMAGES = {};
const ROAD_SPRITE = new Image();
const _useFlatCaps = typeof TERRAIN_CAP_USE_FLAT_SPRITES === 'boolean' && TERRAIN_CAP_USE_FLAT_SPRITES;
const _skipTerrainSprites = typeof TERRAIN_USE_BLOCKS === 'boolean' && TERRAIN_USE_BLOCKS && !_useFlatCaps;

function loadFlatTerrainSprites(){
  Object.entries(TERRAIN_SPRITES).forEach(([key, path]) => {
    if (TERRAIN_SPRITE_IMAGES[key]) return;
    const img = new Image();
    img.onload = () => {
      invalidateTerrainLayerCache();
      debugInfo(`Sprite de terrain chargé : ${path}`);
      render();
    };
    img.onerror = () => debugWarn(`Sprite de terrain introuvable : ${path}`);
    img.src = path;
    TERRAIN_SPRITE_IMAGES[key] = img;
  });
}

if (_skipTerrainSprites){
  ROAD_SPRITE.onload = () => {
    invalidateTerrainLayerCache();
    debugInfo(`Sprite de route chargé : ${ROAD_SPRITE_PATH}`);
    render();
  };
  ROAD_SPRITE.onerror = () => debugWarn(`Sprite de route introuvable : ${ROAD_SPRITE_PATH}`);
  ROAD_SPRITE.src = ROAD_SPRITE_PATH;
  if (_useFlatCaps) loadFlatTerrainSprites();
} else {
  loadFlatTerrainSprites();
  ROAD_SPRITE.onload = () => {
    invalidateTerrainLayerCache();
    debugInfo(`Sprite de route chargé : ${ROAD_SPRITE_PATH}`);
    render();
  };
  ROAD_SPRITE.onerror = () => debugWarn(`Sprite de route introuvable : ${ROAD_SPRITE_PATH}`);
  ROAD_SPRITE.src = ROAD_SPRITE_PATH;
}

// Variantes tiles_pretes — actives aussi en mode blocs si caps plates
const TERRAIN_VARIANT_IMAGES = { grass: [], sand: [] };
function loadTerrainVariantList(terrain, paths){
  paths.forEach(path => {
    const img = new Image();
    img.onload = () => {
      invalidateTerrainLayerCache();
      render();
    };
    img.onerror = () => debugWarn(`Variante terrain introuvable : ${path}`);
    img.src = path;
    TERRAIN_VARIANT_IMAGES[terrain].push(img);
  });
}
if ((!_skipTerrainSprites || _useFlatCaps)
    && typeof TERRAIN_TILE_VARIANTS === 'object' && TERRAIN_TILE_VARIANTS){
  for (const [terrain, paths] of Object.entries(TERRAIN_TILE_VARIANTS)){
    if (Array.isArray(paths)) loadTerrainVariantList(terrain, paths);
  }
}

function drawTerrainCell(targetCtx, col, row, cx, cy, cell){
  if (typeof drawIsoTerrainCell === 'function'){
    drawIsoTerrainCell(targetCtx, col, row, cx, cy, cell);
    return;
  }
  if (cell.hasRoad){
    drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, cx, cy);
    return;
  }
  const img = terrainImageForCell(cell, col, row);
  if (img && img.complete && img.naturalWidth > 0){
    drawTerrainWithRelief(targetCtx, img, cx, cy, cell.elevation, cell.terrain);
    drawReliefShadow(cx, cy, cell.elevation, cell.terrain, cell.slope, targetCtx);
  }
}

function terrainVariantImage(terrain, col, row){
  const list = TERRAIN_VARIANT_IMAGES[terrain] || [];
  const ready = list.filter(img => img.complete && img.naturalWidth > 0);
  if (!ready.length) return null;
  const idx = Math.abs(hashSeed(col, row)) % ready.length;
  return ready[idx];
}

function terrainImageForCell(cell, col, row){
  if (cell.hasRoad) return ROAD_SPRITE;
  const variant = terrainVariantImage(cell.terrain, col, row);
  if (variant) return variant;
  return TERRAIN_SPRITE_IMAGES[cell.terrain];
}

/* ===================== PRIMITIVES DE DESSIN ===================== */
// Dessine la case de terrain : sprite si disponible, sinon texture procédurale détaillée.
function terrainMicroShade(hex, col, row, elevation){
  const n = mulberry32(hashSeed(col, row))();
  const elevAdj = Math.round((elevation - 0.4) * 30);
  const micro = Math.round((n - 0.5) * 18);
  return shade(hex, elevAdj + micro);
}

function drawTerrainProceduralDetail(targetCtx, cx, cy, terrain, col, row){
  const c = targetCtx || ctx;
  const seed = hashSeed(col, row);
  const rng = mulberry32(seed);

  if (terrain === 'forest'){
    if (typeof FOREST_TREES_ENABLED === 'boolean' && FOREST_TREES_ENABLED) return;
    const trees = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < trees; i++){
      const tx = cx + (rng() - 0.5) * 22;
      const ty = cy + (rng() - 0.5) * 8;
      c.beginPath();
      c.arc(tx, ty - 4, 3 + rng() * 2, 0, Math.PI * 2);
      c.fillStyle = rng() > 0.5 ? '#3d5c2e' : '#527a3c';
      c.fill();
    }
  } else if (terrain === 'sand'){
    for (let i = 0; i < 5; i++){
      c.fillStyle = `rgba(255,255,240,${0.08 + rng() * 0.12})`;
      c.fillRect(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 10, 2, 1);
    }
  } else if (terrain === 'rock'){
    c.strokeStyle = 'rgba(60,58,55,0.45)';
    c.lineWidth = 1;
    for (let i = 0; i < 3; i++){
      c.beginPath();
      c.moveTo(cx + (rng() - 0.5) * 18, cy + (rng() - 0.5) * 8);
      c.lineTo(cx + (rng() - 0.5) * 18, cy + (rng() - 0.5) * 8);
      c.stroke();
    }
  } else if (terrain === 'water'){
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    const wave = Math.sin(col * 0.7 + row * 0.5) * 3;
    c.beginPath();
    c.moveTo(cx - 14, cy + wave);
    c.quadraticCurveTo(cx, cy + wave - 2, cx + 14, cy + wave);
    c.stroke();
  } else if (terrain === 'wheat'){
    c.strokeStyle = 'rgba(160,120,40,0.35)';
    for (let i = 0; i < 4; i++){
      const sx = cx + (rng() - 0.5) * 18;
      c.beginPath();
      c.moveTo(sx, cy + 4);
      c.lineTo(sx, cy - 6 - rng() * 4);
      c.stroke();
    }
  } else if (terrain === 'hill' || (terrain === 'grass' && col + row)){
    if (rng() > 0.65){
      c.fillStyle = 'rgba(90,120,60,0.25)';
      c.beginPath();
      c.ellipse(cx + (rng() - 0.5) * 12, cy + 2, 4 + rng() * 3, 2, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function drawReliefShadow(cx, cy, elevation, terrain, slope, targetCtx){
  const c = targetCtx || ctx;
  if (terrain === 'water') return;
  const hillLike = terrain === 'hill' || terrain === 'grass' || terrain === 'forest';
  if (elevation > MAP_HILL_THRESHOLD && hillLike){
    c.beginPath();
    c.moveTo(cx, cy + TILE_H * 0.08);
    c.lineTo(cx + TILE_W * 0.34, cy + TILE_H * 0.28);
    c.lineTo(cx, cy + TILE_H * 0.36);
    c.lineTo(cx - TILE_W * 0.34, cy + TILE_H * 0.28);
    c.closePath();
    c.fillStyle = `rgba(0,0,0,${0.03 + (elevation - MAP_HILL_THRESHOLD) * 0.18})`;
    c.fill();
  }
  if (slope > 0.06 && terrain === 'rock'){
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.beginPath();
    c.moveTo(cx - 8, cy - 4);
    c.lineTo(cx + 8, cy - 8);
    c.lineTo(cx + 4, cy);
    c.closePath();
    c.fill();
  }
}

/** Facteur 0–1+ : eau plate, collines/roche plus massives. */
function terrainReliefFactor(terrain, elevation){
  if (terrain === 'water') return 0;
  elevation = elevation || 0;
  const base = typeof TERRAIN_ELEV_BASELINE === 'number' ? TERRAIN_ELEV_BASELINE : 0.28;
  const e = Math.max(0, elevation - base);
  if (e < 0.01) return terrain === 'sand' ? 0.15 : 0;
  let factor = e / 0.42;
  if (terrain === 'hill' || terrain === 'rock' || terrain === 'marble') factor *= 1.15;
  if (terrain === 'sand') factor *= 0.45;
  return Math.min(1.35, factor);
}

/** Socle iso (faces sud) sous une tuile surélevée — dessiné avant le sprite. */
function drawTerrainBaseBlock(targetCtx, cx, cy, elevation, terrain){
  if (terrain === 'water') return;
  const factor = terrainReliefFactor(terrain, elevation);
  if (factor < 0.05) return;
  const perElev = typeof TERRAIN_BLOCK_HEIGHT_PER_ELEV === 'number' ? TERRAIN_BLOCK_HEIGHT_PER_ELEV : 24;
  const depth = factor * perElev;
  const baseHex = TERRAIN_COLORS[terrain] || TERRAIN_COLORS.grass;
  const left = shade(baseHex, -42);
  const right = shade(baseHex, -28);
  const c = targetCtx || ctx;

  c.fillStyle = left;
  c.beginPath();
  c.moveTo(cx - TILE_W / 2, cy);
  c.lineTo(cx - TILE_W / 2, cy + depth);
  c.lineTo(cx, cy + TILE_H / 2 + depth);
  c.lineTo(cx, cy + TILE_H / 2);
  c.closePath();
  c.fill();

  c.fillStyle = right;
  c.beginPath();
  c.moveTo(cx + TILE_W / 2, cy);
  c.lineTo(cx + TILE_W / 2, cy + depth);
  c.lineTo(cx, cy + TILE_H / 2 + depth);
  c.lineTo(cx, cy + TILE_H / 2);
  c.closePath();
  c.fill();
}

/**
 * Tuile plate 64×32 (losange = toute l'image) vs bloc 3D atlas 128×88.
 */
function isFlatTerrainTile(img){
  if (!img || !img.naturalWidth) return false;
  return img.naturalWidth <= TILE_W + 4 && img.naturalHeight <= TILE_H + 4;
}

/** Hauteur d'affichage (ratio conservé depuis le PNG export). */
function terrainUniformDrawHeight(drawW, img){
  if (isFlatTerrainTile(img)) return TILE_H;
  if (img && img.naturalWidth > 0){
    return drawW * (img.naturalHeight / img.naturalWidth);
  }
  const canvasH = typeof TERRAIN_CANVAS_H === 'number' ? TERRAIN_CANVAS_H : 88;
  const scale = typeof TERRAIN_EXPORT_SCALE === 'number' ? TERRAIN_EXPORT_SCALE : 2;
  return drawW * (canvasH / (TILE_W * scale));
}

/**
 * Pose un sprite terrain : tuiles plates centrées sur le losange ; atlas 3D inchangé.
 */
function drawTerrainSpriteImage(targetCtx, img, cx, cy){
  const pad = typeof TERRAIN_TILE_OVERLAP === 'number' ? TERRAIN_TILE_OVERLAP : 0;
  const drawW = TILE_W + pad;
  const c = targetCtx || ctx;
  if (isFlatTerrainTile(img)){
    const drawH = TILE_H + pad;
    c.drawImage(img, cx - drawW / 2, cy, drawW, drawH);
    return;
  }
  const drawH = terrainUniformDrawHeight(drawW, img);
  const faceFrac = typeof TERRAIN_FACE_ROW_FRAC === 'number' ? TERRAIN_FACE_ROW_FRAC : (38 / 88);
  c.drawImage(img, cx - drawW / 2, cy + TILE_H / 2 - faceFrac * drawH, drawW, drawH);
}

function drawTerrainWithRelief(targetCtx, img, cx, cy, elevation, terrain){
  const useBase = typeof TERRAIN_USE_BASE_BLOCK === 'boolean' ? TERRAIN_USE_BASE_BLOCK : false;
  if (useBase) drawTerrainBaseBlock(targetCtx, cx, cy, elevation, terrain);
  drawTerrainSpriteImage(targetCtx, img, cx, cy);
}

/* ===================== CACHE COUCHE TERRAIN (statique après génération carte) ===================== */
let terrainLayerCache = null;
let terrainLayerCacheVersion = -1;
let terrainLayerCacheScale = 1;

function invalidateTerrainLayerCache(){
  terrainLayerCache = null;
  terrainLayerCacheVersion = -1;
}

function terrainCacheScaleFactor(){
  if (typeof TERRAIN_CACHE_SCALE === 'number' && TERRAIN_CACHE_SCALE > 0){
    return Math.max(0.4, Math.min(3, TERRAIN_CACHE_SCALE));
  }
  return 1;
}

function ensureTerrainLayerCache(){
  const dataVer = typeof terrainDataVersion === 'number' ? terrainDataVersion : 0;
  const scale = terrainCacheScaleFactor();
  if (terrainLayerCache
      && terrainLayerCacheVersion === dataVer
      && terrainLayerCacheScale === scale){
    return terrainLayerCache;
  }
  if (!Array.isArray(grid) || grid.length === 0) return null;

  const spritesReady = typeof areIsoTerrainReady === 'function'
    ? areIsoTerrainReady()
    : (typeof areBlockSpritesReady === 'function' && areBlockSpritesReady());
  if (!spritesReady) return null;

  try {
    const c = document.createElement('canvas');
    c.width = Math.round(WORLD_WIDTH * scale);
    c.height = Math.round(WORLD_HEIGHT * scale);
    const tctx = c.getContext('2d');
    if (!tctx) return null;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = PERF.smoothing;
    tctx.setTransform(scale, 0, 0, scale, 0, 0);

    const drawOrder = getMapDrawOrder();
    const layered = typeof usesLayeredTerrain === 'function' && usesLayeredTerrain();

    if (layered
        && typeof drawLayeredTerrainGeometry === 'function'
        && typeof drawLayeredTerrainCliffs === 'function'
        && typeof drawLayeredTerrainTextures === 'function'){
      const cubeMode = typeof usesTexturedCubes === 'function' && usesTexturedCubes();
      // Pass 1 : eau + piles de cubes PNG (ou géométrie procédurale).
      drawOrder.forEach(({ col, row }) => {
        drawLayeredTerrainGeometry(tctx, col, row, grid[row][col]);
      });
      if (!cubeMode){
        // Pass 2 : caps procéduraux / PNG (legacy).
        drawOrder.forEach(({ col, row }) => {
          drawLayeredTerrainTextures(tctx, col, row, grid[row][col]);
        });
      }
      // Pass falaises : PNG auto en mode cubes, procédural sinon.
      if (!(typeof usesPolisInlineCliffs === 'function' && usesPolisInlineCliffs())){
        drawOrder.forEach(({ col, row }) => {
          drawLayeredTerrainCliffs(tctx, col, row, grid[row][col]);
        });
      }
    } else {
      drawOrder.forEach(({ col, row }) => {
        const cell = grid[row][col];
        const { x, y } = tileCenter(col, row);
        drawTerrainCell(tctx, col, row, x, y, cell);
      });
    }

    terrainLayerCache = c;
    terrainLayerCacheVersion = dataVer;
    terrainLayerCacheScale = scale;
    return terrainLayerCache;
  } catch (err){
    if (typeof debugWarn === 'function') debugWarn(`Cache terrain impossible : ${err.message}`);
    terrainLayerCache = null;
    terrainLayerCacheVersion = -1;
    return null;
  }
}

function drawTerrainTile(cx, cy, terrain, elevation, col, row, slope){
  elevation = elevation || 0;
  slope = slope || 0;
  const cell = inBounds(col, row) ? grid[row][col] : { terrain, elevation, slope, hasRoad: false };
  drawTerrainCell(ctx, col, row, cx, cy, cell);
}

function drawSquareOn(c, cx, cy, size, fillColor, strokeColor){
  const half = size / 2;
  c.fillStyle = fillColor;
  c.fillRect(cx - half, cy - half, size, size);
  if (strokeColor){
    c.strokeStyle = strokeColor;
    c.lineWidth = 1;
    c.strokeRect(cx - half + 0.5, cy - half + 0.5, size - 1, size - 1);
  }
}

function drawTileShape(cx, cy, fillColor, strokeColor){
  drawDiamondOn(ctx, cx, cy, fillColor, strokeColor);
}

function drawDiamondOn(c, cx, cy, fillColor, strokeColor){
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + TILE_W / 2, cy + TILE_H / 2);
  c.lineTo(cx, cy + TILE_H);
  c.lineTo(cx - TILE_W / 2, cy + TILE_H / 2);
  c.closePath();
  c.fillStyle = fillColor;
  c.fill();
  c.strokeStyle = strokeColor || 'rgba(0,0,0,0.15)';
  c.lineWidth = 1;
  c.stroke();
}

function drawDiamond(cx, cy, fillColor, strokeColor){
  drawDiamondOn(ctx, cx, cy, fillColor, strokeColor);
}

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function shade(hex, percent){
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return '#' + (r.toString(16).padStart(2,'0')) + (g.toString(16).padStart(2,'0')) + (b.toString(16).padStart(2,'0'));
}

/* ===================== RENDU BATIMENTS ===================== */
// Largeur à l'écran : la base (bbox alpha) doit couvrir exactement tileSpan tuile(s).
// Les PNG Comfy font ~144 px avec une base ~2×128 px → sans ça, la base déborde sur 4 cases.
function spriteDrawWidthForTile(sprite, tileSpan, targetBaseW){
  tileSpan = tileSpan || 1;
  const tw = targetBaseW != null ? targetBaseW : BUILDING_SPRITE_W;
  const srcW = sprite && (sprite.naturalWidth || sprite.width);
  if (!srcW) return tw * tileSpan;
  const m = measureSpriteFoot(sprite);
  if (m && m.baseW > 0){
    return tw * tileSpan * (srcW / m.baseW);
  }
  const exportPx = tw * (typeof TERRAIN_EXPORT_SCALE === 'number' ? TERRAIN_EXPORT_SCALE : 2);
  return tw * tileSpan * (srcW / exportPx);
}

// cx,cy = sommet nord (tileCenter). footAt: 'south' (bâtiments) ou 'center' (arbres).
function drawSpriteOnTile(cx, cy, sprite, targetW, opts){
  opts = opts || {};
  const srcW = sprite.naturalWidth || sprite.width;
  const srcH = sprite.naturalHeight || sprite.height;
  if (!srcW || !srcH) return;
  targetW = targetW || BUILDING_SPRITE_W;
  const m = measureSpriteFoot(sprite);
  const footNx = m ? m.footNx : 0.5;
  const footNy = m ? m.footNy : 1;
  const scale = targetW / srcW;
  const targetH = srcH * scale;
  const lift = opts.lift != null ? opts.lift : 0;
  let footY;
  if (opts.cyIsFoot) footY = cy;
  else if (opts.anchorCenter) footY = cy + TILE_H / 2;
  else footY = cy + TILE_H;
  ctx.drawImage(
    sprite,
    cx - targetW * footNx,
    footY - targetH * footNy + lift,
    targetW,
    targetH
  );
}

function buildingDrawWidth(def, sprite){
  if (def.spriteScale) return def.spriteScale;
  const fp = def.isMonument ? (def.footprint || 2) : 1;
  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    const w = spriteDrawWidthForTile(sprite, fp);
    return Math.round(def.isMonument ? w * 0.95 : w);
  }
  if (def.isMonument) return Math.round(BUILDING_SPRITE_W * fp * 0.95);
  return BUILDING_SPRITE_W;
}

const SPRITE_TILE_OPTS = { lift: 0 };
const SPRITE_TREE_OPTS = { lift: 0, anchorCenter: true };
const SPRITE_DECOR_OPTS = { lift: typeof NATURE_DECOR_LIFT === 'number' ? NATURE_DECOR_LIFT : -5 };
const SPRITE_FOOT_OPTS = { cyIsFoot: true, lift: 0 };

// Sprite de maison à utiliser pour un niveau : le sien, sinon le plus haut niveau
// inférieur qui a un sprite (ex. domaine/résidence/palais retombent sur villa).
function houseSpriteForLevel(level){
  for (let i = level; i >= 0; i--){
    const img = HOUSE_SPRITES[HOUSE_LEVELS[i].key];
    if (img && img.complete && img.naturalWidth > 0) return img;
  }
  return null;
}

function drawBuilding(cx, cy, type, col, row){
  const def = BUILDING_DEFS[type];
  const north = { x: cx, y: cy };

  if (def.isMonument){
    drawMonument(type, col, row);
    return;
  }

  if (def.isHouse){
    const cell = grid[row][col];
    const sprite = houseSpriteForLevel(cell.houseLevel);
    if (sprite){
      drawSpriteOnTile(north.x, north.y, sprite, buildingDrawWidth(def, sprite), SPRITE_TILE_OPTS);
      return;
    }
    const variant = composeHouseVariant(hashSeed(col, row));
    variant.widthScale *= 1 + cell.houseLevel * 0.18;
    drawHouse(north.x, north.y, variant);
    return;
  }

  const sprite = BUILDING_SPRITES[type];
  const drawW = buildingDrawWidth(def, sprite);
  if (def.isDecoration){
    if (sprite && sprite.complete && sprite.naturalWidth > 0){
      drawSpriteOnTile(north.x, north.y, sprite, drawW, SPRITE_TILE_OPTS);
      return;
    }
    drawDecoration(north.x, north.y, type);
    return;
  }

  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    drawSpriteOnTile(north.x, north.y, sprite, drawW, SPRITE_TILE_OPTS);
    return;
  }

  // ---- repli procédural (sprite pas encore chargé ou absent) ----
  ctx.beginPath();
  ctx.moveTo(north.x - 20, north.y - 24);
  ctx.lineTo(north.x + 20, north.y - 24);
  ctx.lineTo(north.x, north.y - 40);
  ctx.closePath();
  ctx.fillStyle = shade(def.color, -25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  roundRect(north.x - 18, north.y - 24, 36, 26, 4);
  ctx.fillStyle = def.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.icon, north.x, north.y - 6);
}

// Temple monumental 2×2 : dessiné une seule fois depuis l'ancre, centré sur le footprint.
function drawMonument(type, anchorCol, anchorRow){
  const def = BUILDING_DEFS[type];
  const size = def.footprint || 2;
  const { x, y } = (typeof monumentScreenCenter === 'function')
    ? monumentScreenCenter(anchorCol, anchorRow, size)
    : tileCenter(anchorCol, anchorRow);
  const sprite = BUILDING_SPRITES[type];
  const targetW = buildingDrawWidth(def, sprite);
  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    drawSpriteOnTile(x, y, sprite, targetW, SPRITE_FOOT_OPTS);
    return;
  }
  // repli procédural : grand temple stylisé
  ctx.font = '48px serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.icon, x, y - 20);
  roundRect(x - 36, y - 50, 72, 52, 6);
  ctx.fillStyle = def.color || '#d4af37';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
}

/* ---- Rendu procédural des maisons (modules : corps, toit, bande, annexe) ---- */
function drawBoxFaces(cx, baseY, topY, w, footH, leftColor, rightColor){
  ctx.beginPath();
  ctx.moveTo(cx - w, baseY);
  ctx.lineTo(cx, baseY + footH);
  ctx.lineTo(cx, topY + footH);
  ctx.lineTo(cx - w, topY);
  ctx.closePath();
  ctx.fillStyle = leftColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, baseY + footH);
  ctx.lineTo(cx + w, baseY);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + footH);
  ctx.closePath();
  ctx.fillStyle = rightColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

function drawFlatRoof(cx, topY, w, footH, color){
  ctx.beginPath();
  ctx.moveTo(cx, topY - footH);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + footH);
  ctx.lineTo(cx - w, topY);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

function drawTrimBand(cx, topY, w, footH, color){
  const bandH = 4;
  ctx.beginPath();
  ctx.moveTo(cx - w, topY);
  ctx.lineTo(cx - w, topY + bandH);
  ctx.lineTo(cx, topY + footH + bandH);
  ctx.lineTo(cx, topY + footH);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, topY + footH);
  ctx.lineTo(cx, topY + footH + bandH);
  ctx.lineTo(cx + w, topY + bandH);
  ctx.lineTo(cx + w, topY);
  ctx.closePath();
  ctx.fillStyle = shade(color, -10); ctx.fill();
}

function drawHouse(cx, cy, v){
  const w = 30 * v.widthScale;
  const footH = w / 2;
  const wallH = 24;
  const baseY = cy + (TILE_H / 2 - footH);
  const topY = baseY - wallH;

  if (v.hasAnnex){
    const aw = w * 0.55;
    const afh = aw / 2;
    const ax = cx - w - aw * 0.3;
    const aWallH = wallH * 0.65;
    const abaseY = baseY + 2;
    const atopY = abaseY - aWallH;
    drawBoxFaces(ax, abaseY, atopY, aw, afh, shade(v.wallColor, -25), shade(v.wallColor, -10));
    drawFlatRoof(ax, atopY, aw, afh, shade(v.roofColor, -15));
  }

  drawBoxFaces(cx, baseY, topY, w, footH, shade(v.wallColor, -20), v.wallColor);

  if (v.hasTrim){
    drawTrimBand(cx, topY, w, footH, v.trimColor);
  }

  if (v.roofShape === 'pyramid'){
    const apex = { x: cx, y: topY - footH - w * 0.9 };
    ctx.beginPath();
    ctx.moveTo(cx - w, topY); ctx.lineTo(cx, topY + footH); ctx.lineTo(apex.x, apex.y); ctx.closePath();
    ctx.fillStyle = shade(v.roofColor, -15); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, topY + footH); ctx.lineTo(cx + w, topY); ctx.lineTo(apex.x, apex.y); ctx.closePath();
    ctx.fillStyle = v.roofColor; ctx.fill(); ctx.stroke();
  } else if (v.roofShape === 'dome'){
    const domeH = w * 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, topY - domeH * 0.35, w * 0.75, domeH * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = v.roofColor; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  } else {
    drawFlatRoof(cx, topY, w, footH, v.roofColor);
  }
}

/* ===================== RENDU DECORATIONS ===================== */
// Repli procédural si le sprite PNG (assets/buildings/) n'est pas encore chargé.
function drawDecoration(cx, cy, type){
  const baseY = cy + TILE_H / 2;
  const stroke = 'rgba(0,0,0,0.35)';

  if (type === 'statue'){
    ctx.fillStyle = '#b9b2a3';                 // socle
    ctx.fillRect(cx - 8, baseY - 10, 16, 10);
    ctx.strokeStyle = stroke; ctx.strokeRect(cx - 8, baseY - 10, 16, 10);
    ctx.fillStyle = '#ece6d8';                 // corps
    roundRect(cx - 5, baseY - 30, 10, 22, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath();                           // tête
    ctx.arc(cx, baseY - 33, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ece6d8'; ctx.fill(); ctx.stroke();
  } else if (type === 'garden'){
    const blobs = [[-8, -2, 7], [6, 0, 8], [0, -8, 7], [-2, 4, 6]];
    blobs.forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 10 + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#5f8f3e'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
    });
    ctx.fillStyle = '#e8c468';                 // quelques fleurs
    [[-6, -6], [5, -4], [-1, -10]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 10 + dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (type === 'colonnade'){
    [-10, 0, 10].forEach(dx => {
      ctx.fillStyle = '#efe9da';               // fût
      ctx.fillRect(cx + dx - 3, baseY - 26, 6, 24);
      ctx.strokeStyle = stroke; ctx.strokeRect(cx + dx - 3, baseY - 26, 6, 24);
      ctx.fillStyle = '#d9d2c0';               // chapiteau
      ctx.fillRect(cx + dx - 5, baseY - 29, 10, 4);
    });
    ctx.fillStyle = '#d9d2c0';                 // entablement
    ctx.fillRect(cx - 14, baseY - 33, 28, 5);
    ctx.strokeStyle = stroke; ctx.strokeRect(cx - 14, baseY - 33, 28, 5);
  }
}

/* ===================== RENDU ROUTE ===================== */
function drawRoad(cx, cy, elevation, col, row){
  if (typeof col === 'number' && typeof row === 'number'){
    const cell = inBounds(col, row) ? grid[row][col] : { hasRoad: true, terrain: 'grass', elevation };
    drawTerrainCell(ctx, col, row, cx, cy, cell);
    return;
  }
  if (ROAD_SPRITE.complete && ROAD_SPRITE.naturalWidth > 0){
    drawTerrainSpriteImage(ctx, ROAD_SPRITE, cx, cy);
    return;
  }
  // tuile de route légèrement plus petite que la tuile de terrain, pour qu'on voie
  // encore la couleur du terrain en bordure (effet "chemin tracé sur le sol")
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H * 0.4);
  ctx.lineTo(cx + TILE_W * 0.4, cy);
  ctx.lineTo(cx, cy + TILE_H * 0.4);
  ctx.lineTo(cx - TILE_W * 0.4, cy);
  ctx.closePath();
  ctx.fillStyle = '#9c8868';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
}

function drawPatrolBlock(cx, cy){
  // petite borne (façon horos grec) signalant un demi-tour forcé du walker
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(cx - 3, cy - 12, 6, 12);
  ctx.beginPath();
  ctx.arc(cx, cy - 13, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#cfcac0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
}

/* ===================== RENDU WALKERS ===================== */
// Couleur par métier, pour distinguer d'un coup d'œil qui parcourt la ville
// (signature "ville vivante" des jeux Impressions).
const SERVICE_COLORS = {
  water:    '#5a8fae',
  market:   '#c97b3d',
  religion: '#c4b27a',
  health:   '#9ec2c4',
  tax:      '#b8943a',
  fire:     '#a05a3a',
};

function drawWalkers(now){
  walkers.forEach(w => {
    if (w.path.length <= 1) return;
    const { x, y } = getWalkerScreenPos(w, now);
    const roleColor = SERVICE_COLORS[w.serviceType] || '#e8c468';
    const spriteId = 'walker_' + w.serviceType;
    const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(w) : null;
    const facing = iso ? iso.facing : (w.facing || 'down');
    const mirrorX = iso ? iso.mirrorX : w.mirrorX;
    const drew = (typeof drawCharacterSprite === 'function')
      && drawCharacterSprite(spriteId, x, y, facing, now, undefined, mirrorX);

    if (!drew){
      ctx.beginPath();
      ctx.arc(x, y - 6, 7, 0, Math.PI * 2);
      ctx.fillStyle = roleColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

/* ===================== RENDU MONSTRE & HEROS ===================== */
function drawAgentToken(x, y, icon, ringColor){
  ctx.beginPath();
  ctx.arc(x, y - 8, 13, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y - 7);
}

function drawCreatures(now){
  if (typeof monster !== 'undefined' && monster){
    const { x, y } = getCreatureScreenPos(monster, now);
    const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(monster) : null;
    const moving = typeof isCreatureMoving === 'function' && isCreatureMoving(monster, now);
    const drew = (typeof drawCharacterSprite === 'function')
      && drawCharacterSprite('monster_' + monster.typeKey, x, y,
        iso ? iso.facing : (monster.facing || 'down'), now, undefined, iso ? iso.mirrorX : monster.mirrorX, moving);
    if (!drew) drawAgentToken(x, y, monster.icon, 'rgba(150,30,30,0.92)');
  }
  if (typeof hero !== 'undefined' && hero){
    const { x, y } = getCreatureScreenPos(hero, now);
    const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(hero) : null;
    const drew = hero.typeKey && (typeof drawCharacterSprite === 'function')
      && drawCharacterSprite('hero_' + hero.typeKey, x, y,
        iso ? iso.facing : (hero.facing || 'down'), now, undefined, iso ? iso.mirrorX : hero.mirrorX);
    if (!drew) drawAgentToken(x, y, hero.icon || '🦸', 'rgba(60,110,200,0.92)');
  }
  if (typeof godAgents !== 'undefined'){
    godAgents.forEach(agent => {
      const { x, y } = getCreatureScreenPos(agent, now);
      const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(agent) : null;
      const drew = (typeof drawCharacterSprite === 'function')
        && drawCharacterSprite('god_' + agent.godKey, x, y,
          iso ? iso.facing : (agent.facing || 'down'), now, undefined, iso ? iso.mirrorX : agent.mirrorX);
      if (!drew) drawAgentToken(x, y, agent.icon, 'rgba(214,175,70,0.95)');
    });
  }
  if (typeof migrants !== 'undefined'){
    migrants.forEach(m => {
      const { x, y } = getMigrantsScreenPos(m, now);
      const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(m) : null;
      const moving = typeof isCreatureMoving === 'function' && isCreatureMoving(m, now);
      const drew = (typeof drawCharacterSprite === 'function')
        && drawCharacterSprite('migrant', x, y,
          iso ? iso.facing : (m.facing || 'down'), now, undefined, iso ? iso.mirrorX : m.mirrorX, moving);
      if (!drew){
        const color = m.type === 'in' ? 'rgba(80,160,90,0.92)' : 'rgba(180,120,60,0.92)';
        drawAgentToken(x, y, m.type === 'in' ? '🧳' : '🚶', color);
      }
    });
  }
  if (typeof getMilitarySoldiers === 'function'){
    getMilitarySoldiers().forEach(s => {
      const { x, y } = getMilitarySoldierScreenPos(s, now);
      const friendly = s.side === 'friendly';
      drawAgentToken(x, y, friendly ? '🛡️' : '⚔️', friendly ? 'rgba(60,110,200,0.92)' : 'rgba(150,30,30,0.92)');
    });
  }
}

/* ===================== ICONES DE STATUT DES MAISONS ===================== */
function drawHouseStatusIcons(cx, cy, col, row, cell){
  const icons = getHouseStatusIcons(col, row, cell);
  if (icons.length === 0) return;

  const foot = (typeof tileEntityFoot === 'function')
    ? tileEntityFoot(col, row)
    : { x: cx, y: cy + TILE_H / 2 };

  const iconSize = 11;
  const spacing = iconSize + 1;
  const startX = foot.x - ((icons.length - 1) * spacing) / 2;
  const y = foot.y - 38;

  ctx.font = `${iconSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  icons.forEach((icon, i) => {
    const x = startX + i * spacing;
    ctx.beginPath();
    ctx.arc(x, y, iconSize / 2 + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillText(icon, x, y + 1);
  });
}

/* ===================== RENDU PRINCIPAL ===================== */
function render(now){
  now = now || performance.now();
  if (!canvas || !ctx || !Array.isArray(grid) || grid.length === 0) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const dpr = getRenderDpr();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.save();
  if (typeof applyMapViewTransform === 'function') applyMapViewTransform(ctx);

  const drawOrder = getMapDrawOrder();
  const viewBounds = (typeof isMapViewTransformed === 'function' && isMapViewTransformed())
    ? null
    : getVisibleWorldBounds();
  const terrainCache = ensureTerrainLayerCache();
  if (terrainCache){
    const cs = terrainLayerCacheScale || 1;
    if (viewBounds){
      const sx = Math.max(0, Math.floor(viewBounds.left));
      const sy = Math.max(0, Math.floor(viewBounds.top));
      const sw = Math.min(WORLD_WIDTH - sx, Math.ceil(viewBounds.right - viewBounds.left));
      const sh = Math.min(WORLD_HEIGHT - sy, Math.ceil(viewBounds.bottom - viewBounds.top));
      ctx.drawImage(terrainCache, sx * cs, sy * cs, sw * cs, sh * cs, sx, sy, sw, sh);
    } else {
      ctx.drawImage(terrainCache, 0, 0, terrainCache.width, terrainCache.height, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }
  }

  drawOrder.forEach(({ col, row }) => {
      if (!isTileInView(col, row, viewBounds)) return;
      const cell = grid[row][col];
      const { x, y } = tileCenter(col, row);
      if (!terrainCache){
        if (cell.hasRoad){
          drawRoad(x, y, cell.elevation, col, row);
        } else {
          drawTerrainTile(x, y, cell.terrain, cell.elevation, col, row, cell.slope);
        }
      }
      if (cell.beauty){
        const alpha = Math.min(0.4, (cell.beauty / BEAUTY_THRESHOLD) * 0.4);
        drawTileShape(x, y, `rgba(214,175,70,${alpha})`, 'rgba(0,0,0,0)');
      }
      if (cell.hasRoad && cell.patrolBlock) drawPatrolBlock(x, y);
      if (typeof cellShowsWheatCrop === 'function' && cellShowsWheatCrop(cell, col, row)){
        if (typeof drawWheatCropOnCell === 'function') drawWheatCropOnCell(x, y, col, row, cell);
      }
      if (typeof cellShowsGrassDecor === 'function' && cellShowsGrassDecor(cell, col, row)){
        if (typeof drawGrassDecorOnCell === 'function') drawGrassDecorOnCell(x, y, col, row, cell);
      }
      if (typeof cellShowsForestTree === 'function' && cellShowsForestTree(cell, col, row)){
        if (typeof drawForestTreeOnCell === 'function') drawForestTreeOnCell(x, y, col, row, cell);
      }
      if (cell.building){
        if (cell.monumentPart) return; // seule l'ancre dessine le monument
        drawBuilding(x, y, cell.building, col, row);
      }
  });

  // Icônes de statut après tous les bâtiments (profondeur iso), cases visibles seulement.
  drawOrder.forEach(({ col, row }) => {
    if (!isTileInView(col, row, viewBounds)) return;
    const cell = grid[row][col];
    if (cell.building !== 'maison') return;
    const { x, y } = tileCenter(col, row);
    drawHouseStatusIcons(x, y, col, row, cell);
  });

  drawWalkers(now);
  drawCreatures(now);

  // surbrillance de la/les case(s) survolée(s) — zone 2 clics, monument 2×2, ou case unique
  if (hoverTile && inBounds(hoverTile.col, hoverTile.row)){
    if (supportsZonePlacement() && zonePlacementStart){
      const rectTiles = tilesInRect(
        zonePlacementStart.col, zonePlacementStart.row,
        hoverTile.col, hoverTile.row
      );
      rectTiles.forEach(tile => {
        if (!inBounds(tile.col, tile.row)) return;
        const { x, y } = tileCenter(tile.col, tile.row);
        const ok = roadMode
          ? canPlaceRoadTerrain(tile.col, tile.row)
          : canPlaceTerrain(tile.col, tile.row);
        const color = ok ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.25)';
        drawTileShape(x, y, color, 'rgba(0,0,0,0.35)');
      });
      const { x, y } = tileCenter(zonePlacementStart.col, zonePlacementStart.row);
      drawTileShape(x, y, 'rgba(210,162,74,0.55)', 'rgba(210,162,74,0.9)');
    } else if (supportsZonePlacement() && !zonePlacementStart){
      const { x, y } = tileCenter(hoverTile.col, hoverTile.row);
      const ok = roadMode ? canPlaceRoad(hoverTile.col, hoverTile.row) : canPlace(hoverTile.col, hoverTile.row);
      drawTileShape(x, y, ok ? 'rgba(210,162,74,0.35)' : 'rgba(255,60,60,0.35)', 'rgba(0,0,0,0.4)');
    } else {
    const def = selectedBuilding ? BUILDING_DEFS[selectedBuilding] : null;
    const fp = (def && def.footprint) || 1;
    const tiles = (fp > 1 && typeof monumentFootprintTiles === 'function')
      ? monumentFootprintTiles(hoverTile.col, hoverTile.row, fp)
      : [{ col: hoverTile.col, row: hoverTile.row }];
    let color = 'rgba(255,255,255,0.35)';
    if (selectedBuilding){
      color = canPlace(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (roadMode){
      color = canPlaceRoad(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (blockMode){
      color = canToggleBlock(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (demolishMode){
      const c = grid[hoverTile.row][hoverTile.col];
      const anchor = (typeof monumentAnchorAt === 'function') ? monumentAnchorAt(hoverTile.col, hoverTile.row) : null;
      color = (c.building || c.hasRoad || anchor) ? 'rgba(255,60,60,0.45)' : 'rgba(255,255,255,0.2)';
    }
    tiles.forEach(t => {
      if (!inBounds(t.col, t.row)) return;
      const { x, y } = tileCenter(t.col, t.row);
      drawTileShape(x, y, color, 'rgba(0,0,0,0.4)');
    });
    }
  }

  ctx.restore();
}
