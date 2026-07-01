/* ===================== DÉCOR ROCHE / MARBRE ===================== */
// Amas rocheux purement visuels sur les cases rock/marble libres.

const ROCK_DECOR_IMAGES = [];
let rockDecorSpritesExpected = 0;
let rockDecorSpritesLoaded = 0;

function rockDecorSpritePaths(){
  if (typeof ROCK_DECOR_SPRITES === 'object' && Array.isArray(ROCK_DECOR_SPRITES) && ROCK_DECOR_SPRITES.length){
    return ROCK_DECOR_SPRITES;
  }
  return [];
}

function areRockDecorSpritesReady(){
  return rockDecorSpritesExpected > 0 && rockDecorSpritesLoaded >= rockDecorSpritesExpected;
}

if (typeof ROCK_DECOR_ENABLED === 'boolean' && ROCK_DECOR_ENABLED){
  const paths = rockDecorSpritePaths();
  rockDecorSpritesExpected = paths.length;
  paths.forEach(path => {
    const img = new Image();
    img.onload = () => {
      rockDecorSpritesLoaded++;
      if (typeof measureSpriteFoot === 'function') measureSpriteFoot(img);
      if (typeof debugInfo === 'function') debugInfo(`Sprite décor roche chargé : ${path}`);
      if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
      else if (typeof render === 'function') render();
    };
    img.onerror = () => {
      rockDecorSpritesLoaded++;
      if (typeof debugWarn === 'function') debugWarn(`Sprite décor roche introuvable : ${path}`);
    };
    img.src = path;
    ROCK_DECOR_IMAGES.push(img);
  });
}

function rockDecorTerrainAllowed(terrain){
  return terrain === 'rock' || terrain === 'marble';
}

function rockDecorAtCell(col, row){
  const chance = typeof ROCK_DECOR_CHANCE === 'number' ? ROCK_DECOR_CHANCE : 1 / 4;
  const rng = mulberry32(hashSeed(col, row) ^ 0x7a31c4d9);
  if (rng() >= chance) return null;
  const count = ROCK_DECOR_IMAGES.length;
  if (count <= 0) return null;
  return {
    scale: 0.82 + rng() * 0.20,
    variant: Math.floor(rng() * count),
  };
}

function rockDecorImageForCell(col, row){
  const decor = rockDecorAtCell(col, row);
  if (!decor) return null;
  const img = ROCK_DECOR_IMAGES[decor.variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < ROCK_DECOR_IMAGES.length; i++){
    const fallback = ROCK_DECOR_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function cellShowsRockDecor(cell, col, row){
  if (!(typeof ROCK_DECOR_ENABLED === 'boolean' && ROCK_DECOR_ENABLED)) return false;
  if (!cell || !rockDecorTerrainAllowed(cell.terrain)) return false;
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (lv <= 0) return false;
  return rockDecorAtCell(col, row) !== null;
}

function rockDecorDrawOpts(){
  const anchor = typeof ROCK_DECOR_ANCHOR_CENTER === 'boolean' ? ROCK_DECOR_ANCHOR_CENTER : true;
  const lift = typeof ROCK_DECOR_LIFT === 'number' ? ROCK_DECOR_LIFT : 0;
  const base = {
    pixelated: NATURE_SPRITE_PIXELATED,
    natureDecor: true,
    smooth: !NATURE_SPRITE_PIXELATED,
  };
  return anchor ? { ...base, lift, anchorCenter: true } : { ...base, lift: typeof NATURE_DECOR_LIFT === 'number' ? NATURE_DECOR_LIFT : -5 };
}

function rockDecorSizeForCell(cell){
  const base = typeof ROCK_DECOR_SIZE === 'number' ? ROCK_DECOR_SIZE : 0.72;
  return cell && cell.terrain === 'marble' ? base * 0.92 : base;
}

function drawRockDecorOnCell(cx, cy, col, row, cell){
  if (!areRockDecorSpritesReady()) return;
  const decor = rockDecorAtCell(col, row);
  if (!decor) return;
  const sprite = rockDecorImageForCell(col, row);
  if (!sprite) return;

  const sizeMul = rockDecorSizeForCell(cell);
  const targetW = typeof natureDecorDrawWidth === 'function'
    ? natureDecorDrawWidth(decor.scale, sizeMul)
    : Math.round(BUILDING_SPRITE_W * decor.scale * sizeMul);

  const drawOpts = rockDecorDrawOpts();
  if (typeof drawSpriteOnTile === 'function'){
    drawSpriteOnTile(cx, cy, sprite, targetW, drawOpts);
  }
}
