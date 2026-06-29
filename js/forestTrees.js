/* ===================== ARBRES DE FORÊT (sprites iso) ===================== */
// Décor visuel sur terrain « forest » : rendu comme un bâtiment, effacé si route ou bâtiment.

const FOREST_TREE_IMAGES = [];
let forestTreeSpritesExpected = 0;
let forestTreeSpritesLoaded = 0;

function forestTreeSpritePaths(){
  if (typeof FOREST_TREE_SPRITES === 'object' && Array.isArray(FOREST_TREE_SPRITES) && FOREST_TREE_SPRITES.length){
    return FOREST_TREE_SPRITES;
  }
  if (typeof FOREST_TREE_SPRITE === 'string' && FOREST_TREE_SPRITE) return [FOREST_TREE_SPRITE];
  return [];
}

function areForestTreeSpritesReady(){
  return forestTreeSpritesExpected > 0 && forestTreeSpritesLoaded >= forestTreeSpritesExpected;
}

if (typeof FOREST_TREES_ENABLED === 'boolean' && FOREST_TREES_ENABLED){
  const paths = forestTreeSpritePaths();
  forestTreeSpritesExpected = paths.length;
  paths.forEach(path => {
    const img = new Image();
    img.onload = () => {
      forestTreeSpritesLoaded++;
      if (typeof measureSpriteFoot === 'function') measureSpriteFoot(img);
      if (typeof debugInfo === 'function') debugInfo(`Sprite chargé : ${path}`);
      if (typeof render === 'function') render();
    };
    img.onerror = () => {
      forestTreeSpritesLoaded++;
      if (typeof debugWarn === 'function'){
        debugWarn(`Sprite arbre introuvable : ${path}`);
      }
    };
    img.src = path;
    FOREST_TREE_IMAGES.push(img);
  });
}

function forestTreeAtCell(col, row){
  const rng = mulberry32(hashSeed(col, row) ^ 0x7a3f2c1d);
  if (rng() > FOREST_TREE_DENSITY) return null;
  const count = FOREST_TREE_IMAGES.length;
  const variant = count > 1 && rng() >= 0.5 ? 1 : 0;
  return {
    scale: 0.9 + rng() * 0.2,
    variant: Math.min(variant, Math.max(0, count - 1)),
  };
}

function forestTreeImageForCell(col, row){
  const tree = forestTreeAtCell(col, row);
  if (!tree) return null;
  const img = FOREST_TREE_IMAGES[tree.variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < FOREST_TREE_IMAGES.length; i++){
    const fallback = FOREST_TREE_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function cellShowsForestTree(cell, col, row){
  if (!(typeof FOREST_TREES_ENABLED === 'boolean' && FOREST_TREES_ENABLED)) return false;
  if (!cell || cell.terrain !== 'forest') return false;
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  return forestTreeAtCell(col, row) !== null;
}

function drawForestTreeOnCell(cx, cy, col, row, cell){
  if (!areForestTreeSpritesReady()) return;
  const tree = forestTreeAtCell(col, row);
  if (!tree) return;
  const sprite = forestTreeImageForCell(col, row);
  if (!sprite) return;

  const sizeMul = typeof FOREST_TREE_SIZE === 'number' ? FOREST_TREE_SIZE : 1;
  let targetW = BUILDING_SPRITE_W * tree.scale * sizeMul;
  if (typeof spriteDrawWidthForTile === 'function'){
    targetW = spriteDrawWidthForTile(sprite, 1) * tree.scale * sizeMul;
  }

  const treeOpts = typeof natureDecorDrawOpts === 'function'
    ? natureDecorDrawOpts()
    : { lift: -5 };

  if (typeof drawSpriteOnTile === 'function'){
    drawSpriteOnTile(cx, cy, sprite, targetW, treeOpts);
    return;
  }

  const scale = targetW / sprite.naturalWidth;
  const targetH = sprite.naturalHeight * scale;
  const footY = treeOpts.anchorCenter ? cy + TILE_H / 2 : cy + TILE_H;
  const m = typeof measureSpriteFoot === 'function' ? measureSpriteFoot(sprite) : null;
  const footNx = m ? m.footNx : 0.5;
  const footNy = m ? m.footNy : 1;
  ctx.drawImage(
    sprite,
    cx - targetW * footNx, footY - targetH * footNy + (treeOpts.lift || 0),
    targetW, targetH
  );
}
