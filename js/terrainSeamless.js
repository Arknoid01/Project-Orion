/* ===================== TERRAIN SEAMLESS (1024×1024 → losange iso) ===================== */
// Projection UV isométrique (comme tools/process_terrain_textures.py).
// Une tuile iso est pré-calculée par texture au chargement — pas de bake par case (crash).

const TERRAIN_SEAMLESS_IMAGES = {};
const SEAMLESS_PIXEL_BUFFERS = {};
const SEAMLESS_ISO_BAKED = {}; // path → canvas 128×64

function usesTerrainSeamless(){
  return typeof TERRAIN_USE_SEAMLESS === 'boolean' && TERRAIN_USE_SEAMLESS;
}

function seamlessImageForTerrain(terrain){
  return TERRAIN_SEAMLESS_IMAGES[terrain]
    || TERRAIN_SEAMLESS_IMAGES.grass
    || null;
}

function seamlessPathKey(img){
  return img._seamlessKey || img.src || '';
}

function invalidateSeamlessReady(){
  if (typeof areSeamlessTexturesReady !== 'function') return;
  if (!areSeamlessTexturesReady()) return;
  if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
  if (typeof render === 'function') render();
}

if (typeof TERRAIN_SEAMLESS_TEXTURES === 'object' && TERRAIN_SEAMLESS_TEXTURES){
  const seen = new Set();
  Object.entries(TERRAIN_SEAMLESS_TEXTURES).forEach(([terrain, path]) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    const img = new Image();
    img._seamlessKey = path;
    img.onload = () => {
      Object.entries(TERRAIN_SEAMLESS_TEXTURES).forEach(([t, p]) => {
        if (p === path) TERRAIN_SEAMLESS_IMAGES[t] = img;
      });
      delete SEAMLESS_PIXEL_BUFFERS[path];
      try {
        prebakeSeamlessIsoTile(img);
      } catch (err){
        if (typeof debugWarn === 'function') debugWarn(`Bake seamless echoue : ${path} — ${err.message}`);
      }
      if (typeof debugInfo === 'function') debugInfo(`Texture seamless chargee : ${path}`);
      invalidateSeamlessReady();
    };
    img.onerror = () => {
      if (typeof debugWarn === 'function') debugWarn(`Texture seamless introuvable : ${path}`);
    };
    img.src = path;
  });
}

function areSeamlessTexturesReady(){
  if (!usesTerrainSeamless()) return false;
  const required = ['grass', 'water', 'sand', 'wheat', 'rock', 'marble', 'hill', 'road'];
  return required.every(t => {
    const img = seamlessImageForTerrain(t);
    const key = img ? seamlessPathKey(img) : '';
    return img && img.complete && img.naturalWidth > 0 && SEAMLESS_ISO_BAKED[key];
  });
}

function seamlessPixelBuffer(img){
  const key = seamlessPathKey(img);
  if (SEAMLESS_PIXEL_BUFFERS[key]) return SEAMLESS_PIXEL_BUFFERS[key];
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const tctx = c.getContext('2d');
  tctx.drawImage(img, 0, 0, side, side);
  SEAMLESS_PIXEL_BUFFERS[key] = {
    data: tctx.getImageData(0, 0, side, side).data,
    side,
  };
  return SEAMLESS_PIXEL_BUFFERS[key];
}

function sampleSeamlessBilinear(buf, u, v){
  const { data, side } = buf;
  const sn = side;
  u = Math.max(0, Math.min(1, u)) * (sn - 1);
  v = Math.max(0, Math.min(1, v)) * (sn - 1);
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, sn - 1);
  const y1 = Math.min(y0 + 1, sn - 1);
  const fx = u - x0;
  const fy = v - y0;

  function px(x, y){
    const i = (y * sn + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  const p00 = px(x0, y0);
  const p10 = px(x1, y0);
  const p01 = px(x0, y1);
  const p11 = px(x1, y1);
  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++){
    const top = p00[i] + (p10[i] - p00[i]) * fx;
    const bot = p01[i] + (p11[i] - p01[i]) * fx;
    out[i] = Math.round(top + (bot - top) * fy);
  }
  return out;
}

function buildSeamlessIsoTileCanvas(img){
  const scale = typeof TERRAIN_EXPORT_SCALE === 'number' ? TERRAIN_EXPORT_SCALE : 1;
  const w = TILE_W * scale;
  const h = TILE_H * scale;
  const inset = typeof TERRAIN_DIAMOND_INSET === 'number' ? TERRAIN_DIAMOND_INSET : 1.0;
  const buf = seamlessPixelBuffer(img);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tctx = canvas.getContext('2d');
  const imgData = tctx.createImageData(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const hw = (w / 2) * inset;
  const hh = (h / 2) * inset;

  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const dx = hw ? (x - cx) / hw : 0;
      const dy = hh ? (y - cy) / hh : 0;
      const i = (y * w + x) * 4;
      if (Math.abs(dx) + Math.abs(dy) > 1.0){
        imgData.data[i + 3] = 0;
        continue;
      }
      const u = (dx + dy + 2) / 4;
      const v = (dy - dx + 2) / 4;
      const [r, g, b, a] = sampleSeamlessBilinear(buf, u, v);
      imgData.data[i] = r;
      imgData.data[i + 1] = g;
      imgData.data[i + 2] = b;
      imgData.data[i + 3] = a;
    }
  }
  tctx.putImageData(imgData, 0, 0);
  return canvas;
}

function prebakeSeamlessIsoTile(img){
  if (!img || !img.complete || !img.naturalWidth) return null;
  const key = seamlessPathKey(img);
  if (SEAMLESS_ISO_BAKED[key]) return SEAMLESS_ISO_BAKED[key];
  SEAMLESS_ISO_BAKED[key] = buildSeamlessIsoTileCanvas(img);
  return SEAMLESS_ISO_BAKED[key];
}

function seamlessIsoTileForImage(img){
  const key = seamlessPathKey(img);
  return SEAMLESS_ISO_BAKED[key] || null;
}

function diamondClipPath(c, cx, cy){
  c.beginPath();
  c.moveTo(cx, cy - TILE_H / 2);
  c.lineTo(cx + TILE_W / 2, cy);
  c.lineTo(cx, cy + TILE_H / 2);
  c.lineTo(cx - TILE_W / 2, cy);
  c.closePath();
}

function drawSeamlessDiamondTile(targetCtx, img, col, row, cx, cy){
  if (!img || !img.complete || !img.naturalWidth) return false;
  const baked = seamlessIsoTileForImage(img);
  if (!baked) return false;
  const c = targetCtx || ctx;
  const scale = typeof TERRAIN_EXPORT_SCALE === 'number' ? TERRAIN_EXPORT_SCALE : 1;
  c.save();
  c.imageSmoothingEnabled = scale > 1;
  c.imageSmoothingQuality = 'high';
  const overlap = typeof TERRAIN_TILE_OVERLAP === 'number' ? TERRAIN_TILE_OVERLAP : 0;
  const drawW = TILE_W + overlap;
  c.drawImage(baked, cx - drawW / 2, cy - TILE_H / 2, drawW, TILE_H);
  c.restore();
  return true;
}

function drawForestSeamlessOverlay(targetCtx, cx, cy, col, row){
  const c = targetCtx || ctx;
  const seed = hashSeed(col, row);
  const rng = mulberry32(seed);
  c.save();
  diamondClipPath(c, cx, cy);
  c.clip();
  const trees = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < trees; i++){
    const tx = cx + (rng() - 0.5) * 22;
    const ty = cy + (rng() - 0.5) * 8;
    c.beginPath();
    c.arc(tx, ty - 4, 3 + rng() * 2, 0, Math.PI * 2);
    c.fillStyle = rng() > 0.5 ? '#2d4a22' : '#3a5c2a';
    c.fill();
  }
  c.restore();
}

function drawSeamlessTerrainCell(targetCtx, col, row, cx, cy, cell){
  if (cell.hasRoad){
    const roadImg = seamlessImageForTerrain('road');
    if (!drawSeamlessDiamondTile(targetCtx, roadImg, col, row, cx, cy)
        && typeof ROAD_SPRITE !== 'undefined' && ROAD_SPRITE.complete){
      drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, cx, cy);
    }
    return;
  }

  const terrain = cell.terrain || 'grass';
  const img = seamlessImageForTerrain(terrain);
  if (!drawSeamlessDiamondTile(targetCtx, img, col, row, cx, cy)){
    const c = targetCtx || ctx;
    const shaded = typeof terrainMicroShade === 'function'
      ? terrainMicroShade(TERRAIN_COLORS[terrain] || TERRAIN_COLORS.grass, col, row, cell.elevation)
      : (TERRAIN_COLORS[terrain] || TERRAIN_COLORS.grass);
    c.save();
    diamondClipPath(c, cx, cy);
    c.fillStyle = shaded;
    c.fill();
    c.restore();
  }
  if (terrain === 'forest'){
    drawForestSeamlessOverlay(targetCtx, cx, cy, col, row);
  }
}

function drawSeamlessRoad(targetCtx, col, row, cx, cy){
  const roadImg = seamlessImageForTerrain('road');
  if (drawSeamlessDiamondTile(targetCtx, roadImg, col, row, cx, cy)) return true;
  if (typeof ROAD_SPRITE !== 'undefined' && ROAD_SPRITE.complete && ROAD_SPRITE.naturalWidth){
    drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, cx, cy);
    return true;
  }
  return false;
}

function clearSeamlessIsoTileCache(){
  /* compat render.js — le bake est par texture, pas par case */
}
