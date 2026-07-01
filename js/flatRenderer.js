/* ===================== FLAT TERRAIN RENDERER ===================== */

const FLAT_TERRAIN_TEXTURES = {};
const FLAT_TERRAIN_PATTERNS = {};

const FLAT_TEXTURE_SOURCES = {
  grass:  'assets/textures/flat/game/grass_top.png',
  wheat:  'assets/textures/flat/game/sand_top.png',
  forest: 'assets/textures/flat/game/forest_top.png',
  hill:   'assets/textures/flat/game/grass_top.png',
  sand:   'assets/textures/flat/game/sand.png',
  water:  null,
  rock:   'assets/textures/flat/game/stone.png',
  marble: 'assets/textures/flat/game/stone.png',
  dirt:   'assets/textures/flat/game/dirt.png',
};

function initFlatTextures(){
  Object.entries(FLAT_TEXTURE_SOURCES).forEach(([terrain, src]) => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      FLAT_TERRAIN_TEXTURES[terrain] = img;
      FLAT_TERRAIN_PATTERNS[terrain] = null;
      invalidateFlatMapCanvas();
      if (typeof markRenderDirty === 'function') markRenderDirty();
    };
    img.src = src;
  });
}

function _getPattern(ctx, terrain){
  const img = FLAT_TERRAIN_TEXTURES[terrain];
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!FLAT_TERRAIN_PATTERNS[terrain]){
    FLAT_TERRAIN_PATTERNS[terrain] = ctx.createPattern(img, 'repeat');
  }
  return FLAT_TERRAIN_PATTERNS[terrain];
}

const FLAT_TERRAIN_COLORS = {
  grass: '#7db648', wheat: '#c9a83c', forest: '#4a8a3a',
  hill: '#9ab870', sand: '#d4b870', water: '#3a86c8',
  rock: '#8a8070', marble: '#ddd8c8',
};

const FLAT_ELEV_STEP_PX = typeof TILE_H !== 'undefined' ? Math.round(TILE_H * 0.19) : 12;

let _flatCanvas  = null;
let _flatVersion = -1;
let _flatCamX    = -1e9;
let _flatCamY    = -1e9;
let _flatZoom    = -1;

function flatElevOffset(cell){
  if (!cell || cell.terrain === 'water') return 0;
  const level = typeof cell.level === 'number' ? cell.level : 1;
  return Math.max(0, level - 1) * FLAT_ELEV_STEP_PX;
}

/* ---------------------------------------------------------------
 * Dessin du losange SANS ctx.clip() — on utilise path.fill() avec
 * un pattern comme fillStyle. Canvas2D clip le chemin lui-meme lors
 * du fill, sans stencil buffer separe => 3-5x plus rapide sur mobile.
 * Le pattern tile depuis l'origine du monde (transform du bake),
 * donc les tuiles adjacentes sont parfaitement seamless.
 * --------------------------------------------------------------- */
function _drawFlatTileNoClip(ctx, cx, cy, elev, terrain){
  const hw = TILE_W / 2 + 1;
  const hh = TILE_H / 2 + 0.5;
  const ty = cy - elev;

  ctx.beginPath();
  ctx.moveTo(cx,      ty);
  ctx.lineTo(cx + hw, ty + hh);
  ctx.lineTo(cx,      ty + TILE_H + 1);
  ctx.lineTo(cx - hw, ty + hh);
  ctx.closePath();

  const pattern = _getPattern(ctx, terrain);
  ctx.fillStyle = pattern || FLAT_TERRAIN_COLORS[terrain] || '#888';
  ctx.fill();
}

function _drawCliffEdge(ctx, cx, cy, elev){
  if (elev <= 0) return;
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const ty = cy - elev, ty0 = cy;
  ctx.beginPath();
  ctx.moveTo(cx - hw, ty  + hh);
  ctx.lineTo(cx,      ty  + TILE_H);
  ctx.lineTo(cx + hw, ty  + hh);
  ctx.lineTo(cx + hw, ty0 + hh);
  ctx.lineTo(cx,      ty0 + TILE_H);
  ctx.lineTo(cx - hw, ty0 + hh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
}

function buildFlatMapCanvas(){
  if (!Array.isArray(grid) || grid.length === 0) return null;
  if (typeof isTerrainGenerationInProgress === 'function' && isTerrainGenerationInProgress()) return null;

  const dataVer = typeof terrainDataVersion === 'number' ? terrainDataVersion : 0;
  const dpr     = typeof getRenderDpr === 'function' ? getRenderDpr() : (window.devicePixelRatio || 1);
  const zoom    = typeof zoomLevel === 'number' ? zoomLevel : 1;
  const camX    = (typeof camera !== 'undefined') ? camera.x : 0;
  const camY    = (typeof camera !== 'undefined') ? camera.y : 0;

  const PAD = TILE_W * 4;
  const vwW = canvas.width  / dpr / zoom;
  const vhW = canvas.height / dpr / zoom;

  const inZone = _flatCanvas
    && _flatVersion === dataVer
    && _flatZoom    === zoom
    && camX >= _flatCamX - PAD / 2
    && camY >= _flatCamY - PAD / 2
    && camX + vwW <= _flatCamX + (_flatCanvas.width  / dpr / zoom) + PAD / 2
    && camY + vhW <= _flatCamY + (_flatCanvas.height / dpr / zoom) + PAD / 2;

  if (inZone) return _flatCanvas;

  const bakeL = Math.max(0, camX - PAD);
  const bakeT = Math.max(0, camY - PAD);
  const bakeR = Math.min(WORLD_WIDTH,  camX + vwW + PAD);
  const bakeB = Math.min(WORLD_HEIGHT, camY + vhW + PAD);

  const c = document.createElement('canvas');
  c.width  = Math.round((bakeR - bakeL) * dpr * zoom);
  c.height = Math.round((bakeB - bakeT) * dpr * zoom);
  const bctx = c.getContext('2d');
  if (!bctx) return null;

  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = (typeof PERF !== 'undefined') ? PERF.smoothing : 'high';
  const scale = dpr * zoom;
  bctx.setTransform(scale, 0, 0, scale, -bakeL * scale, -bakeT * scale);

  const bounds = {
    left:   bakeL - TILE_W,
    top:    bakeT - TILE_H * 3,
    right:  bakeR + TILE_W,
    bottom: bakeB + TILE_H,
  };

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
  const visible   = typeof getVisibleDrawOrder === 'function'
    ? getVisibleDrawOrder(drawOrder, bounds)
    : drawOrder;

  // Pass 1 : terrain plat (pas de clip, pattern seamless)
  visible.forEach(({ col, row }) => {
    const cell = grid[row][col];
    if (!cell) return;
    const cx = OFFSET_X + (col - row) * (TILE_W / 2);
    const cy = OFFSET_Y + (col + row) * (TILE_H / 2);
    const elev = flatElevOffset(cell);
    if (elev > 0) _drawCliffEdge(bctx, cx, cy, elev);
    _drawFlatTileNoClip(bctx, cx, cy, elev, cell.terrain);
  });

  // Pass 2 : decors statiques BAKES dans le cache (arbres, buissons, ble...)
  // => zero cout par frame, dessinés une seule fois ici.
  if (typeof drawStaticDecorLayer === 'function'){
    const prevOverride = typeof _spriteDrawContextOverride !== 'undefined'
      ? _spriteDrawContextOverride : null;
    if (typeof _spriteDrawContextOverride !== 'undefined') _spriteDrawContextOverride = bctx;
    drawStaticDecorLayer(bctx, visible);
    if (typeof _spriteDrawContextOverride !== 'undefined') _spriteDrawContextOverride = prevOverride;
  }

  _flatCanvas  = c;
  _flatVersion = dataVer;
  _flatCamX    = bakeL;
  _flatCamY    = bakeT;
  _flatZoom    = zoom;

  return _flatCanvas;
}

function invalidateFlatMapCanvas(){
  _flatCanvas  = null;
  _flatVersion = -1;
}
