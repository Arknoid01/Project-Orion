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
      if (typeof invalidateTerrainLayerCache === 'function') invalidateTerrainLayerCache();
      else if (typeof render === 'function') render();
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

function scatterTreeTerrains(){
  if (typeof SCATTER_TREE_TERRAINS === 'object' && Array.isArray(SCATTER_TREE_TERRAINS)){
    return SCATTER_TREE_TERRAINS;
  }
  return ['grass', 'hill'];
}

function scatterTreeAtCell(col, row){
  if (!(typeof SCATTER_TREES_ENABLED === 'boolean' && SCATTER_TREES_ENABLED)) return null;
  const density = typeof SCATTER_TREE_DENSITY === 'number' ? SCATTER_TREE_DENSITY : 0.15;
  const rng = mulberry32(hashSeed(col, row) ^ 0x3c7a91e5);
  if (rng() > density) return null;
  const count = FOREST_TREE_IMAGES.length;
  if (count <= 0) return null;
  const variant = count > 1 ? Math.floor(rng() * count) : 0;
  return {
    scale: 0.78 + rng() * 0.18,
    variant: Math.max(0, Math.min(variant, count - 1)),
  };
}

function cellShowsScatterTree(cell, col, row){
  if (!(typeof SCATTER_TREES_ENABLED === 'boolean' && SCATTER_TREES_ENABLED)) return false;
  if (!cell || !scatterTreeTerrains().includes(cell.terrain)) return false;
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (lv <= 0) return false;
  return scatterTreeAtCell(col, row) !== null;
}

function drawScatterTreeOnCell(cx, cy, col, row, cell){
  if (!areForestTreeSpritesReady()) return;
  const tree = scatterTreeAtCell(col, row);
  if (!tree) return;
  const sprite = treeSpriteByVariant(tree.variant);
  if (!sprite) return;

  const sizeMul = typeof SCATTER_TREE_SIZE === 'number' ? SCATTER_TREE_SIZE : 0.5;
  const targetW = typeof natureDecorDrawWidth === 'function'
    ? natureDecorDrawWidth(tree.scale, sizeMul)
    : Math.round(BUILDING_SPRITE_W * tree.scale * sizeMul);

  const treeOpts = typeof forestTreeDrawOpts === 'function'
    ? forestTreeDrawOpts()
    : { lift: 0, anchorCenter: true };

  if (typeof drawSpriteOnTile === 'function'){
    drawSpriteOnTile(cx, cy, sprite, targetW, treeOpts);
  }
}

function forestTreeAtCell(col, row){
  const rng = mulberry32(hashSeed(col, row) ^ 0x7a3f2c1d);
  if (rng() > FOREST_TREE_DENSITY) return null;
  const count = FOREST_TREE_IMAGES.length;
  // Choisir uniformément parmi tous les variants disponibles.
  const variant = count > 1 ? Math.floor(rng() * count) : 0;
  return {
    scale: 0.9 + rng() * 0.2,
    variant: Math.max(0, Math.min(variant, count - 1)),
  };
}

function treeSpriteByVariant(variant){
  const img = FOREST_TREE_IMAGES[variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < FOREST_TREE_IMAGES.length; i++){
    const fallback = FOREST_TREE_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function forestTreeImageForCell(col, row){
  const tree = forestTreeAtCell(col, row);
  if (!tree) return null;
  return treeSpriteByVariant(tree.variant);
}

function cellShowsForestTree(cell, col, row){
  if (!(typeof FOREST_TREES_ENABLED === 'boolean' && FOREST_TREES_ENABLED)) return false;
  if (!cell || cell.terrain !== 'forest') return false;
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (lv <= 0) return false;
  return forestTreeAtCell(col, row) !== null;
}

function drawForestTreeOnCell(cx, cy, col, row, cell){
  if (!areForestTreeSpritesReady()) return;
  const tree = forestTreeAtCell(col, row);
  if (!tree) return;
  const sprite = forestTreeImageForCell(col, row);
  if (!sprite) return;

  const sizeMul = typeof FOREST_TREE_SIZE === 'number' ? FOREST_TREE_SIZE : 1;
  const targetW = typeof natureDecorDrawWidth === 'function'
    ? natureDecorDrawWidth(tree.scale, sizeMul)
    : Math.round(BUILDING_SPRITE_W * tree.scale * sizeMul);

  const treeOpts = typeof forestTreeDrawOpts === 'function'
    ? forestTreeDrawOpts()
    : { lift: 0, anchorCenter: true };

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
