/* ===================== BLÉ VISUEL (overlay sur terrain wheat) ===================== */
// Épis de blé sur chaque case « wheat » libre (100 % par défaut).

const WHEAT_CROP_IMG = new Image();
let wheatCropSpriteReady = false;

if (typeof WHEAT_CROPS_ENABLED === 'boolean' && WHEAT_CROPS_ENABLED && WHEAT_CROP_SPRITE){
  WHEAT_CROP_IMG.onload = () => {
    wheatCropSpriteReady = true;
    if (typeof measureSpriteFoot === 'function') measureSpriteFoot(WHEAT_CROP_IMG);
    if (typeof debugInfo === 'function') debugInfo(`Sprite chargé : ${WHEAT_CROP_SPRITE}`);
    if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
    else if (typeof render === 'function') render();
  };
  WHEAT_CROP_IMG.onerror = () => {
    if (typeof debugWarn === 'function'){
      debugWarn(`Sprite blé introuvable : ${WHEAT_CROP_SPRITE}`);
    }
  };
  WHEAT_CROP_IMG.src = WHEAT_CROP_SPRITE;
}

function wheatCropAtCell(col, row){
  const density = typeof WHEAT_CROP_DENSITY === 'number' ? WHEAT_CROP_DENSITY : 1;
  if (density >= 1) return { scale: 1 };
  const rng = mulberry32(hashSeed(col, row) ^ 0x8c3e1a5b);
  if (rng() > density) return null;
  return { scale: 0.95 + rng() * 0.1 };
}

function cellShowsWheatCrop(cell, col, row){
  if (!(typeof WHEAT_CROPS_ENABLED === 'boolean' && WHEAT_CROPS_ENABLED)) return false;
  if (!cell || cell.terrain !== 'wheat') return false;
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (lv <= 0) return false;
  return wheatCropAtCell(col, row) !== null;
}

function drawWheatCropOnCell(cx, cy, col, row, cell){
  if (!wheatCropSpriteReady) return;
  const crop = wheatCropAtCell(col, row);
  if (!crop) return;

  const sizeMul = typeof WHEAT_CROP_SIZE === 'number'
    ? WHEAT_CROP_SIZE
    : (typeof GRASS_DECOR_SIZE === 'number' ? GRASS_DECOR_SIZE : 0.6);
  const targetW = typeof natureDecorDrawWidth === 'function'
    ? natureDecorDrawWidth(crop.scale, sizeMul)
    : Math.round(BUILDING_SPRITE_W * crop.scale * sizeMul);

  const opts = typeof wheatCropDrawOpts === 'function'
    ? wheatCropDrawOpts()
    : { lift: 0, anchorCenter: true };

  if (typeof drawSpriteOnTile === 'function'){
    drawSpriteOnTile(cx, cy, WHEAT_CROP_IMG, targetW, opts);
    return;
  }

  const scale = targetW / WHEAT_CROP_IMG.naturalWidth;
  const targetH = WHEAT_CROP_IMG.naturalHeight * scale;
  const anchorCenter = !!opts.anchorCenter;
  const footY = anchorCenter ? cy + TILE_H / 2 : cy + TILE_H;
  const m = typeof measureSpriteFoot === 'function' ? measureSpriteFoot(WHEAT_CROP_IMG) : null;
  const footNx = m ? m.footNx : 0.5;
  const footNy = m ? m.footNy : 1;
  ctx.drawImage(
    WHEAT_CROP_IMG,
    cx - targetW * footNx, footY - targetH * footNy + (opts.lift || 0),
    targetW, targetH
  );
}
