/* ===================== FLAT TERRAIN RENDERER ===================== */

const FLAT_TERRAIN_TEXTURES = {};
const FLAT_TERRAIN_PATTERNS = {}; // patterns createPattern (seamless sans joints)

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
      // On ne peut creer le pattern qu'une fois qu'on a un ctx disponible
      // On le cree a la demande dans _getPattern()
      FLAT_TERRAIN_PATTERNS[terrain] = null; // reset
      invalidateFlatMapCanvas();
      if (typeof markRenderDirty === 'function') markRenderDirty();
    };
    img.src = src;
  });
}

/** Retourne (ou cree) le CanvasPattern pour un terrain donne. */
function _getPattern(ctx, terrain){
  const img = FLAT_TERRAIN_TEXTURES[terrain];
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!FLAT_TERRAIN_PATTERNS[terrain]){
    FLAT_TERRAIN_PATTERNS[terrain] = ctx.createPattern(img, 'repeat');
  }
  return FLAT_TERRAIN_PATTERNS[terrain];
}

const FLAT_TERRAIN_COLORS = {
  grass:  '#7db648',
  wheat:  '#c9a83c',
  forest: '#4a8a3a',
  hill:   '#9ab870',
  sand:   '#d4b870',
  water:  '#3a86c8',
  rock:   '#8a8070',
  marble: '#ddd8c8',
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

/** Trace le chemin du losange (avec 1px de debordement pour eviter les joints anti-aliasing). */
function _diamondPath(ctx, cx, cy, elev){
  const hw = TILE_W / 2 + 1;
  const hh = TILE_H / 2 + 0.5;
  const ty = cy - elev;
  ctx.beginPath();
  ctx.moveTo(cx,      ty);
  ctx.lineTo(cx + hw, ty + hh);
  ctx.lineTo(cx,      ty + TILE_H + 1);
  ctx.lineTo(cx - hw, ty + hh);
  ctx.closePath();
}

function _drawDiamond(ctx, cx, cy, elev, color){
  _diamondPath(ctx, cx, cy, elev);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Dessine le losange avec une texture seamless.
 * Cle : on applique un offset monde au pattern (setTransform) pour que
 * les tuiles adjacentes partagent exactement le meme echantillonnage de texture
 * -> zero joint visible entre tuiles, meme si la texture est plus petite que la tuile.
 */
function _drawDiamondTextured(ctx, cx, cy, elev, terrain){
  const pattern = _getPattern(ctx, terrain);
  if (!pattern){
    _drawDiamond(ctx, cx, cy, elev, FLAT_TERRAIN_COLORS[terrain] || '#888');
    return;
  }
  const ty = cy - elev;
  _diamondPath(ctx, cx, cy, elev);
  ctx.save();
  ctx.clip();
  // Offset monde : la texture commence a (0,0) du monde, pas de la tuile.
  // Resultat : pas de joint visible entre tuiles adjacentes.
  if (pattern.setTransform){
    const m = new DOMMatrix();
    m.translateSelf(0, 0); // origine monde = (0,0), pas besoin d'offset
    pattern.setTransform(m);
  }
  ctx.fillStyle = pattern;
  // On remplit un rect un peu plus grand que le losange pour couvrir toute la surface
  ctx.fillRect(cx - TILE_W / 2 - 1, ty - 1, TILE_W + 2, TILE_H + 2);
  ctx.restore();
}

function _drawCliffEdge(ctx, cx, cy, elev){
  if (elev <= 0) return;
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const ty  = cy - elev;
  const ty0 = cy;
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

function drawFlatTile(ctx, cx, cy, cell){
  const elev = flatElevOffset(cell);
  if (elev > 0) _drawCliffEdge(ctx, cx, cy, elev);

  const tex = FLAT_TERRAIN_TEXTURES[cell.terrain];
  if (tex && tex.complete && tex.naturalWidth > 0){
    _drawDiamondTextured(ctx, cx, cy, elev, cell.terrain);
  } else {
    _drawDiamond(ctx, cx, cy, elev, FLAT_TERRAIN_COLORS[cell.terrain] || '#888');
  }
}

function buildFlatMapCanvas(){
  if (!Array.isArray(grid) || grid.length === 0) return null;
  if (typeof isTerrainGenerationInProgress === 'function' && isTerrainGenerationInProgress()) return null;

  const dataVer = typeof terrainDataVersion === 'number' ? terrainDataVersion : 0;
  const dpr     = typeof getRenderDpr === 'function' ? getRenderDpr() : (window.devicePixelRatio || 1);
  const zoom    = typeof zoomLevel === 'number' ? zoomLevel : 1;
  const camX    = (typeof camera !== 'undefined') ? camera.x : 0;
  const camY    = (typeof camera !== 'undefined') ? camera.y : 0;

  const PAD = TILE_W * 3;
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
  const bakeW = bakeR - bakeL;
  const bakeH = bakeB - bakeT;

  const c = document.createElement('canvas');
  c.width  = Math.round(bakeW * dpr * zoom);
  c.height = Math.round(bakeH * dpr * zoom);
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

  visible.forEach(({ col, row }) => {
    const cell = grid[row][col];
    if (!cell) return;
    const cx = OFFSET_X + (col - row) * (TILE_W / 2);
    const cy = OFFSET_Y + (col + row) * (TILE_H / 2);
    drawFlatTile(bctx, cx, cy, cell);
  });

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
