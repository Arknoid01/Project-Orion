/* ===================== FLAT TERRAIN RENDERER =====================
 * Rendu terrain style Zeus/Pharaoh : losanges plats avec décalage Y
 * pour simuler l'élévation. Pas de cubes 3D, pas de parois latérales.
 * Le pipeline lourd (voxelBake, terrainLayers, cliffs) n'est plus utilisé.
 *
 * Architecture :
 *   buildFlatMapCanvas()  → pré-rend toute la carte une fois
 *   render()              → drawImage du canvas + walkers/bâtiments par-dessus
 *
 * Coût : ~1 drawImage par frame pour tout le terrain (au lieu de 14 400).
 * ================================================================= */

/* --- Couleurs de fallback (utilisées si pas de texture chargée) --- */
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

/* Nombre de pixels de décalage vertical par niveau d'élévation */
const FLAT_ELEV_STEP_PX = 6;

/* Canvas offscreen contenant la carte entière pré-rendue */
let _flatMapCanvas   = null;
let _flatMapVersion  = -1; // synchronisé avec terrainDataVersion

/* ------------------------------------------------------------------ */
/* Coordonnée ISO d'une tuile (même système que tileCenter)            */
/* ------------------------------------------------------------------ */
function flatTilePos(col, row, elevOffset){
  return {
    x: OFFSET_X + (col - row) * (TILE_W / 2),
    y: OFFSET_Y + (col + row) * (TILE_H / 2) - (elevOffset || 0),
  };
}

/* ------------------------------------------------------------------ */
/* Dessine UN losange plat dans ctx                                    */
/* ------------------------------------------------------------------ */
function drawFlatDiamond(ctx, cx, cy, fillColor){
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  ctx.beginPath();
  ctx.moveTo(cx,      cy);
  ctx.lineTo(cx + hw, cy + hh);
  ctx.lineTo(cx,      cy + TILE_H);
  ctx.lineTo(cx - hw, cy + hh);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Dessine le bord de falaise sous une tuile surélevée                */
/* (trapèze sombre entre le bas du losange et le sol visuel)          */
/* ------------------------------------------------------------------ */
function drawFlatCliffEdge(ctx, cx, cy, elevOffset){
  if (elevOffset <= 0) return;
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  // Bas du losange actuel
  const bx = cx, by = cy + TILE_H;
  // Même position sans décalage (= où serait le sol)
  const by0 = by + elevOffset;
  ctx.beginPath();
  ctx.moveTo(bx - hw, by  + hh);
  ctx.lineTo(bx,      by);
  ctx.lineTo(bx + hw, by  + hh);
  ctx.lineTo(bx + hw, by0 + hh);
  ctx.lineTo(bx,      by0 + TILE_H);
  ctx.lineTo(bx - hw, by0 + hh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Dessine une tuile de terrain (texture ou couleur plate)            */
/* ------------------------------------------------------------------ */
function drawFlatTerrainTile(ctx, cx, cy, cell){
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;

  const color = FLAT_TERRAIN_COLORS[cell.terrain] || '#888';

  // Si une texture est disponible, on la colle via clip
  const tex = typeof FLAT_TERRAIN_TEXTURES !== 'undefined'
    ? FLAT_TERRAIN_TEXTURES[cell.terrain]
    : null;

  if (tex && tex.complete && tex.naturalWidth > 0){
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,      cy);
    ctx.lineTo(cx + hw, cy + hh);
    ctx.lineTo(cx,      cy + TILE_H);
    ctx.lineTo(cx - hw, cy + hh);
    ctx.closePath();
    ctx.clip();

    // Alignement seamless : la texture est répétée en coords-monde
    const tw = tex.naturalWidth;
    const th = tex.naturalHeight;
    const ox = ((cx - hw) % tw + tw) % tw;
    const oy = (cy        % th + th) % th;
    for (let dx = -ox; dx < TILE_W + tw; dx += tw){
      for (let dy = -oy; dy < TILE_H + th; dy += th){
        ctx.drawImage(tex, cx - hw + dx, cy + dy, tw, th);
      }
    }
    ctx.restore();
  } else {
    drawFlatDiamond(ctx, cx, cy, color);
  }
}

/* ------------------------------------------------------------------ */
/* PRÉ-RENDER : construit tout le canvas de la carte une seule fois   */
/* ------------------------------------------------------------------ */
function buildFlatMapCanvas(){
  if (!Array.isArray(grid) || grid.length === 0) return null;

  const dataVer = typeof terrainDataVersion === 'number' ? terrainDataVersion : 0;
  if (_flatMapCanvas && _flatMapVersion === dataVer) return _flatMapCanvas;

  const c = document.createElement('canvas');
  c.width  = WORLD_WIDTH;
  c.height = WORLD_HEIGHT;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];

  drawOrder.forEach(({ col, row }) => {
    const cell = grid[row][col];
    if (!cell) return;

    const level      = typeof cell.level === 'number' ? cell.level : 1;
    const elevOffset = cell.terrain === 'water' ? 0 : Math.max(0, level - 1) * FLAT_ELEV_STEP_PX;
    const { x: cx, y: cy } = flatTilePos(col, row, elevOffset);

    // Falaise (bord sombre sous la tuile surélevée)
    if (elevOffset > 0) drawFlatCliffEdge(ctx, cx, cy, elevOffset);

    // Surface du losange
    drawFlatTerrainTile(ctx, cx, cy, cell);
  });

  _flatMapCanvas  = c;
  _flatMapVersion = dataVer;

  if (typeof debugInfo === 'function'){
    debugInfo(`[flatRenderer] Map pré-rendue (${c.width}×${c.height})`);
  }
  return _flatMapCanvas;
}

/** Invalide le cache flat (appelé quand la carte change). */
function invalidateFlatMapCanvas(){
  _flatMapCanvas  = null;
  _flatMapVersion = -1;
}
