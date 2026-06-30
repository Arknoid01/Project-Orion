/* ===================== DÉCOR SUR HERBE (sprites iso) ===================== */
// Petits props sur terrain « grass » : 1 chance / 6, variante aléatoire parmi GRASS_DECOR_SPRITES.

const GRASS_DECOR_IMAGES = [];
let grassDecorSpritesExpected = 0;
let grassDecorSpritesLoaded = 0;

function grassDecorSpritePaths(){
  if (typeof GRASS_DECOR_SPRITES === 'object' && Array.isArray(GRASS_DECOR_SPRITES) && GRASS_DECOR_SPRITES.length){
    return GRASS_DECOR_SPRITES;
  }
  return [];
}

function areGrassDecorSpritesReady(){
  return grassDecorSpritesExpected > 0 && grassDecorSpritesLoaded >= grassDecorSpritesExpected;
}

if (typeof GRASS_DECOR_ENABLED === 'boolean' && GRASS_DECOR_ENABLED){
  const paths = grassDecorSpritePaths();
  grassDecorSpritesExpected = paths.length;
  paths.forEach(path => {
    const img = new Image();
    img.onload = () => {
      grassDecorSpritesLoaded++;
      if (typeof measureSpriteFoot === 'function') measureSpriteFoot(img);
      if (typeof debugInfo === 'function') debugInfo(`Sprite chargé : ${path}`);
      if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
      else if (typeof render === 'function') render();
    };
    img.onerror = () => {
      grassDecorSpritesLoaded++;
      if (typeof debugWarn === 'function'){
        debugWarn(`Sprite décor herbe introuvable : ${path}`);
      }
    };
    img.src = path;
    GRASS_DECOR_IMAGES.push(img);
  });
}

function grassDecorPathIsGrass(path){
  if (!path) return false;
  if (path.endsWith('grass00.png') || path.indexOf('/grass00.png') >= 0) return true;
  return /\/nature\/(grass_|sprout_|leaf_|moss_patch_)/.test(path);
}

function grassDecorPathIsRuin(path){
  return !!path && path.indexOf('/ruins/') >= 0;
}

function grassDecorAtCell(col, row){
  const chance = typeof GRASS_DECOR_CHANCE === 'number' ? GRASS_DECOR_CHANCE : 1 / 6;
  const rng = mulberry32(hashSeed(col, row) ^ 0x5e4a3b2c);
  if (rng() >= chance) return null;
  const count = GRASS_DECOR_IMAGES.length;
  if (count <= 0) return null;
  const paths = grassDecorSpritePaths();
  const variant = Math.floor(rng() * count);
  const path = paths[variant] || '';
  const grassKeep = typeof GRASS_DECOR_GRASS_KEEP === 'number' ? GRASS_DECOR_GRASS_KEEP : 1;
  const ruinsKeep = typeof GRASS_DECOR_RUINS_KEEP === 'number' ? GRASS_DECOR_RUINS_KEEP : 1;
  if (grassDecorPathIsGrass(path) && rng() >= grassKeep) return null;
  if (grassDecorPathIsRuin(path) && rng() >= ruinsKeep) return null;
  return {
    scale: 0.85 + rng() * 0.15,
    variant,
  };
}

function grassDecorImageForCell(col, row){
  const decor = grassDecorAtCell(col, row);
  if (!decor) return null;
  const img = GRASS_DECOR_IMAGES[decor.variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < GRASS_DECOR_IMAGES.length; i++){
    const fallback = GRASS_DECOR_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function cellShowsGrassDecor(cell, col, row){
  if (!(typeof GRASS_DECOR_ENABLED === 'boolean' && GRASS_DECOR_ENABLED)) return false;
  if (!cell || (cell.terrain !== 'grass' && cell.terrain !== 'hill')) return false;
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (lv <= 0) return false;
  return grassDecorAtCell(col, row) !== null;
}

function grassDecorDrawOpts(){
  return typeof natureDecorDrawOpts === 'function'
    ? natureDecorDrawOpts()
    : { lift: -5, pixelated: false, natureDecor: true, smooth: true };
}

function grassDecorSizeForVariant(variant){
  const paths = grassDecorSpritePaths();
  const path = paths[variant] || '';
  if (path.indexOf('/ruins/') >= 0){
    return typeof GRASS_DECOR_RUINS_SIZE === 'number' ? GRASS_DECOR_RUINS_SIZE : 0.66;
  }
  const base = typeof GRASS_DECOR_SIZE === 'number' ? GRASS_DECOR_SIZE : 0.6;
  if (/\/nature\/bush_/.test(path)) return base * 1.22;
  if (/\/nature\/plant_/.test(path)) return base * 1.12;
  if (/\/nature\/(flower_|lavender|mushrooms)/.test(path)) return base * 1.05;
  if (/\/nature\/(log_|stump_|branch_|sticks_)/.test(path)) return base * 0.92;
  if (/\/nature\/(moss_patch_|flower_patch|sand_pile|dirt_pile|grass_mound)/.test(path)) return base * 0.78;
  if (/\/nature\/(grass_|sprout_|leaf_)/.test(path)) return base * 0.88;
  return base;
}

function drawGrassDecorOnCell(cx, cy, col, row, cell){
  if (!areGrassDecorSpritesReady()) return;
  const decor = grassDecorAtCell(col, row);
  if (!decor) return;
  const sprite = grassDecorImageForCell(col, row);
  if (!sprite) return;

  const sizeMul = grassDecorSizeForVariant(decor.variant);
  const targetW = typeof natureDecorDrawWidth === 'function'
    ? natureDecorDrawWidth(decor.scale, sizeMul)
    : Math.round(BUILDING_SPRITE_W * decor.scale * sizeMul);

  const drawOpts = grassDecorDrawOpts();
  const anchorCenter = !!drawOpts.anchorCenter;

  if (typeof drawSpriteOnTile === 'function'){
    drawSpriteOnTile(cx, cy, sprite, targetW, drawOpts);
    return;
  }

  const scale = targetW / sprite.naturalWidth;
  const targetH = sprite.naturalHeight * scale;
  const footY = anchorCenter ? cy + TILE_H / 2 : cy + TILE_H;
  const m = typeof measureSpriteFoot === 'function' ? measureSpriteFoot(sprite) : null;
  const footNx = m ? m.footNx : 0.5;
  const footNy = m ? m.footNy : 1;
  const prevSmooth = ctx.imageSmoothingEnabled;
  const prevQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = (typeof PERF !== 'undefined' && PERF.smoothing) ? PERF.smoothing : 'high';
  ctx.drawImage(
    sprite,
    cx - targetW * footNx, footY - targetH * footNy + (drawOpts.lift || 0),
    targetW, targetH
  );
  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.imageSmoothingQuality = prevQuality;
}
