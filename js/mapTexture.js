/* ===================== TERRAIN DEPUIS GRANDE IMAGE (losanges découpés) ===================== */
// Mode MAP_TERRAIN_RENDER = 'artwork'
// Charge assets/maps/terrain_baked.png (généré par tools/bake_map_from_image.py)

const MAP_ARTWORK_IMAGE = new Image();
let mapArtworkReady = false;

function usesArtworkMap(){
  return typeof MAP_TERRAIN_RENDER === 'string' && MAP_TERRAIN_RENDER === 'artwork';
}

if (typeof MAP_ARTWORK_PATH === 'string' && MAP_ARTWORK_PATH){
  MAP_ARTWORK_IMAGE.onload = () => {
    mapArtworkReady = MAP_ARTWORK_IMAGE.complete && MAP_ARTWORK_IMAGE.naturalWidth > 0;
    if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
    if (typeof render === 'function') render();
    if (typeof debugInfo === 'function') debugInfo(`Carte artwork chargee : ${MAP_ARTWORK_PATH}`);
  };
  MAP_ARTWORK_IMAGE.onerror = () => {
    mapArtworkReady = false;
    if (typeof debugWarn === 'function') debugWarn(`Carte artwork introuvable : ${MAP_ARTWORK_PATH}`);
  };
  MAP_ARTWORK_IMAGE.src = MAP_ARTWORK_PATH;
}

function isArtworkMapReady(){
  return usesArtworkMap() && mapArtworkReady;
}

/** Découpe losange à l'écran depuis l'image monde (fallback si pas de bake). */
function drawArtworkDiamondTile(targetCtx, cx, cy){
  const img = MAP_ARTWORK_IMAGE;
  if (!img || !img.complete || !img.naturalWidth) return false;
  const c = targetCtx || ctx;
  const sx = cx - TILE_W / 2;
  const sy = cy - TILE_H / 2;
  const scaleX = img.naturalWidth / WORLD_WIDTH;
  const scaleY = img.naturalHeight / WORLD_HEIGHT;

  c.save();
  if (typeof diamondClipPath === 'function'){
    diamondClipPath(c, cx, cy);
  } else {
    c.beginPath();
    c.moveTo(cx, cy - TILE_H / 2);
    c.lineTo(cx + TILE_W / 2, cy);
    c.lineTo(cx, cy + TILE_H / 2);
    c.lineTo(cx - TILE_W / 2, cy);
    c.closePath();
  }
  c.clip();
  c.drawImage(
    img,
    sx * scaleX, sy * scaleY, TILE_W * scaleX, TILE_H * scaleY,
    sx, sy, TILE_W, TILE_H,
  );
  c.restore();
  return true;
}

function buildArtworkTerrainCache(){
  if (!isArtworkMapReady()) return null;
  const img = MAP_ARTWORK_IMAGE;
  if (img.naturalWidth === WORLD_WIDTH && img.naturalHeight === WORLD_HEIGHT){
    const c = document.createElement('canvas');
    c.width = WORLD_WIDTH;
    c.height = WORLD_HEIGHT;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }
  const c = document.createElement('canvas');
  c.width = WORLD_WIDTH;
  c.height = WORLD_HEIGHT;
  const tctx = c.getContext('2d');
  getMapDrawOrder().forEach(({ col, row }) => {
    const { x, y } = tileCenter(col, row);
    drawArtworkDiamondTile(tctx, x, y);
  });
  return c;
}

function drawArtworkTerrainCell(targetCtx, col, row, cx, cy, cell){
  drawArtworkDiamondTile(targetCtx, cx, cy);
}
