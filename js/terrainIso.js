/* ===================== TERRAIN ISO (BLOCS + FALAISES + BAKE MYKONOS) ===================== */
// Empilement blocs nature + parois procédurales (Mykonos) + falaises hauteur.

const TERRAIN_BLOCK_IMAGES = {};
const TERRAIN_BLOCK_TINTED_IMAGES = {};
const TERRAIN_BLOCK_BAKED = {};   // id → HTMLCanvasElement (losange + parois)
const TERRAIN_BLOCK_NATURE_BAKED = {}; // gabarit PNG nature (alignement hybride Comfy)
const TERRAIN_BLOCK_NATURE_CAP = {};   // cap nature (clone)
const TERRAIN_BLOCK_CAP = {};     // id → HTMLCanvasElement (losange seul, empilement)
const CLIFF_IMAGES = {};

function terrainBlockIsoSize(){
  return {
    w: typeof TERRAIN_BLOCK_DRAW_W === 'number' ? TERRAIN_BLOCK_DRAW_W : TILE_W,
    h: TILE_H,
  };
}

function usesCleanBlockWalls(){
  return typeof TERRAIN_BLOCK_CLEAN_WALLS === 'boolean' && TERRAIN_BLOCK_CLEAN_WALLS;
}

function bakeBlockAsset(id, source){
  if (!usesCleanBlockWalls()
      || typeof bakeTerrainBlockFromImage !== 'function'
      || typeof bakeTerrainBlockFromCanvas !== 'function'){
    delete TERRAIN_BLOCK_BAKED[id];
    return;
  }
  const { w, h } = terrainBlockIsoSize();
  let baked;
  if (source instanceof HTMLCanvasElement){
    baked = bakeTerrainBlockFromCanvas(source, w, h, id);
  } else if (source && source.complete && source.naturalWidth){
    baked = bakeTerrainBlockFromImage(source, w, h, id);
  }
  if (baked && baked.canvas){
    const capH = baked.diamondH || h;
    baked.canvas._capH = capH;
    baked.canvas._sideH = baked.sideH;
    baked.canvas._totalH = capH + baked.sideH;
    baked.canvas._capBackOffsetPx = 0;
    baked.canvas._stackStepPx = typeof LEGO_BRICK_STEP === 'number' ? LEGO_BRICK_STEP : capH;
    baked.canvas._drawW = w;
    baked.canvas._drawH = capH + baked.sideH;
    if (baked.capCanvas){
      baked.capCanvas._capH = capH;
      baked.capCanvas._stackStepPx = typeof LEGO_BRICK_STEP === 'number' ? LEGO_BRICK_STEP : capH;
    }
    TERRAIN_BLOCK_BAKED[id] = baked.canvas;
    if (typeof cloneBlockCanvas === 'function'){
      TERRAIN_BLOCK_NATURE_BAKED[id] = cloneBlockCanvas(baked.canvas);
      if (baked.capCanvas) TERRAIN_BLOCK_NATURE_CAP[id] = cloneBlockCanvas(baked.capCanvas);
    } else {
      TERRAIN_BLOCK_NATURE_BAKED[id] = baked.canvas;
    }
    if (baked.capCanvas) TERRAIN_BLOCK_CAP[id] = baked.capCanvas;
    if (typeof debugInfo === 'function'){
      debugInfo(`Bloc bake ${id} (${baked.canvas.width}x${baked.canvas.height}${baked.procedural ? ', proc' : ''})`);
    }
  } else {
    delete TERRAIN_BLOCK_BAKED[id];
    delete TERRAIN_BLOCK_CAP[id];
  }
}

function blockDrawSource(id, fallbackImg, walls){
  if (usesCleanBlockWalls()){
    if (!walls && TERRAIN_BLOCK_CAP[id]) return TERRAIN_BLOCK_CAP[id];
    if (TERRAIN_BLOCK_BAKED[id]) return TERRAIN_BLOCK_BAKED[id];
  }
  return fallbackImg;
}

function initTerrainIsoBlockSprites(){
  if (typeof TERRAIN_BLOCK_SPRITES !== 'object' || !TERRAIN_BLOCK_SPRITES) return;
  Object.entries(TERRAIN_BLOCK_SPRITES).forEach(([id, path]) => {
    if (TERRAIN_BLOCK_IMAGES[id]) return;
    const img = new Image();
    const onReady = () => {
      // img.decode() garantit que l'image est ENTIEREMENT décodée/rasterisée avant
      // qu'on lise ses pixels (getImageData dans bakeBlockAsset). Sur certains GPU
      // mobiles (Adreno notamment), 'onload' seul peut se déclencher avant la fin
      // du décodage GPU, ce qui fait lire un buffer partiel et casse la détection
      // de la forme du losange (symptôme : tuiles en triangle au lieu de losange).
      const proceed = () => {
        bakeBlockAsset(id, img);
        if (typeof buildTintedBlockSprites === 'function') buildTintedBlockSprites();
        bumpTerrainVersion();
        if (typeof debugInfo === 'function') debugInfo(`Sprite bloc terrain charge : ${path}`);
        if (typeof render === 'function') render();
      };
      if (typeof img.decode === 'function'){
        img.decode().then(proceed).catch(proceed);
      } else {
        proceed();
      }
    };
    img.onload = onReady;
    img.onerror = () => {
      if (typeof debugWarn === 'function') debugWarn(`Sprite bloc introuvable : ${path}`);
    };
    img.src = path;
    TERRAIN_BLOCK_IMAGES[id] = img;
  });
}

function initTerrainIsoAssets(){
  if (typeof usesFlatBlockFaces === 'function' && usesFlatBlockFaces()
      && typeof initFlatFaceTextures === 'function'){
    initFlatFaceTextures();
  } else {
    initTerrainIsoBlockSprites();
    if (typeof initHybridFlatBlockTextures === 'function'){
      initHybridFlatBlockTextures();
    }
  }
  if (typeof CLIFF_SPRITES === 'object' && CLIFF_SPRITES){
    Object.entries(CLIFF_SPRITES).forEach(([id, path]) => {
      const img = new Image();
      img.onload = () => {
        bumpTerrainVersion();
        if (typeof render === 'function') render();
      };
      img.onerror = () => {
        if (typeof debugWarn === 'function') debugWarn(`Sprite falaise introuvable : ${path}`);
      };
      img.src = path;
      CLIFF_IMAGES[id] = img;
    });
  }
}

function buildTintedBlockSprites(){
  if (typeof usesFlatBlockFaces === 'function' && usesFlatBlockFaces()){
    if (typeof rebakeAllBlocksFromFlatFaces === 'function') rebakeAllBlocksFromFlatFaces();
    return;
  }
  if (typeof usesHybridFlatBlocks === 'function' && usesHybridFlatBlocks()){
    const flatKeys = typeof hybridFlatBlockKeys === 'function' ? hybridFlatBlockKeys() : [];
    if (typeof TERRAIN_BLOCK_TINTS === 'object'){
      Object.entries(TERRAIN_BLOCK_TINTS).forEach(([id, spec]) => {
        if (!spec || !spec.base || !spec.color) return;
        if (flatKeys.includes(spec.base)
            && typeof rebakeTintBlockFromFlatFaces === 'function'
            && TERRAIN_BLOCK_BAKED[spec.base]){
          rebakeTintBlockFromFlatFaces(id);
          return;
        }
        const base = TERRAIN_BLOCK_IMAGES[spec.base];
        if (!base || !base.complete || !base.naturalWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = base.naturalWidth;
        canvas.height = base.naturalHeight;
        const tctx = canvas.getContext('2d');
        tctx.drawImage(base, 0, 0);
        tctx.globalCompositeOperation = 'source-atop';
        tctx.fillStyle = spec.color;
        tctx.fillRect(0, 0, canvas.width, canvas.height);
        bakeBlockAsset(id, canvas);
        TERRAIN_BLOCK_TINTED_IMAGES[id] = canvas;
      });
    }
    bumpTerrainVersion();
    return;
  }
  if (typeof TERRAIN_BLOCK_TINTS !== 'object' || !TERRAIN_BLOCK_TINTS) return;
  Object.entries(TERRAIN_BLOCK_TINTS).forEach(([id, spec]) => {
    if (!spec || !spec.base || !spec.color) return;
    const base = TERRAIN_BLOCK_IMAGES[spec.base];
    if (!base || !base.complete || !base.naturalWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    const tctx = canvas.getContext('2d');
    tctx.drawImage(base, 0, 0);
    tctx.globalCompositeOperation = 'source-atop';
    tctx.fillStyle = spec.color;
    tctx.fillRect(0, 0, canvas.width, canvas.height);

    bakeBlockAsset(id, canvas);
    TERRAIN_BLOCK_TINTED_IMAGES[id] = canvas;
    bumpTerrainVersion();
  });
}

function requiredBlockSpriteKeys(){
  const keys = new Set(['grass', 'dirt', 'stone']);
  if (typeof usesFlatBlockFaces === 'function' && usesFlatBlockFaces()
      && typeof TERRAIN_BLOCK_FACES === 'object'){
    Object.keys(TERRAIN_BLOCK_FACES).forEach(k => keys.add(k));
  }
  if (typeof TERRAIN_BLOCK_SPRITES === 'object'){
    Object.keys(TERRAIN_BLOCK_SPRITES).forEach(k => keys.add(k));
  }
  if (typeof TERRAIN_BLOCK_TINTS === 'object' && TERRAIN_BLOCK_TINTS){
    // IMPORTANT : sans ça, le cache de terrain peut se construire AVANT que la
    // teinte (blé, marbre) soit prête, et retombe alors sur la couleur brute de
    // sa base (blé -> herbe non teintée) de façon permanente (cf. bug confirmé).
    Object.keys(TERRAIN_BLOCK_TINTS).forEach(k => keys.add(k));
  }
  if (typeof TERRAIN_BLOCK_FILL_MAP === 'object'){
    Object.values(TERRAIN_BLOCK_FILL_MAP).forEach(k => keys.add(k));
  }
  if (typeof TERRAIN_BLOCK_LEVEL_FILL === 'object'){
    Object.values(TERRAIN_BLOCK_LEVEL_FILL).forEach(k => keys.add(k));
  }
  if (typeof TERRAIN_BLOCK_FILL === 'string') keys.add(TERRAIN_BLOCK_FILL);
  if (typeof TERRAIN_BLOCK_TINTS === 'object'){
    Object.values(TERRAIN_BLOCK_TINTS).forEach(spec => {
      if (spec && spec.base) keys.add(spec.base);
    });
    Object.keys(TERRAIN_BLOCK_TINTS).forEach(k => keys.add(k));
  }
  return [...keys];
}

function isBlockKeyReady(key){
  if (usesCleanBlockWalls()){
    if (typeof usesFullFaceCubes === 'function' && usesFullFaceCubes()){
      // IMPORTANT : ne PAS appeler rebakeTintBlockFromFlatFaces ici. Cette fonction
      // est prévue pour le mode "textures plates" (usesFlatBlockFaces), pas pour le
      // mode cube plein actif ici. Si elle se déclenche quand même (ex: appelée avant
      // que buildTintedBlockSprites ait fini son propre bake), elle peut écraser un
      // bake correct (blé/marbre teintés via détection de losange) par un résultat
      // différent et incorrect -> sol "blé" qui s'affiche comme de l'herbe non teintée.
      // On attend simplement que buildTintedBlockSprites (appelé après chaque sprite
      // de base chargé) ait fait son travail, sans court-circuit concurrent.
      return !!TERRAIN_BLOCK_BAKED[key];
    }
    // IMPORTANT : ne JAMAIS retomber sur img.complete ici. Le bake (TERRAIN_BLOCK_BAKED)
    // est requis dès lors que usesCleanBlockWalls() est actif ; comme le bake se fait
    // maintenant après img.decode() (asynchrone), img.complete peut devenir vrai AVANT
    // que le bake soit terminé. Accepter img.complete seul faisait construire le cache
    // de terrain avec un sprite non-baké -> rendu en triangle au lieu du losange complet.
    return !!TERRAIN_BLOCK_BAKED[key];
  }
  const img = TERRAIN_BLOCK_IMAGES[key];
  return img && img.complete && img.naturalWidth > 0;
}

function areCoreBlockSpritesReady(){
  return ['grass', 'dirt', 'stone'].every(k => isBlockKeyReady(k));
}

function areBlockSpritesReady(){
  if (!areCoreBlockSpritesReady()) return false;
  return requiredBlockSpriteKeys().every(isBlockKeyReady);
}

function areCliffSpritesReady(){
  if (typeof CLIFF_SPRITE_IDS !== 'object' || !CLIFF_SPRITE_IDS.length) return false;
  return CLIFF_SPRITE_IDS.every(id => {
    const img = CLIFF_IMAGES[id];
    return img && img.complete && img.naturalWidth > 0;
  });
}

function areIsoTerrainReady(){
  if (typeof usesLayeredTerrain === 'function' && usesLayeredTerrain()){
    return typeof areLayeredTerrainReady === 'function' && areLayeredTerrainReady();
  }
  if (typeof usesProceduralTerrain3D === 'function' && usesProceduralTerrain3D()){
    return typeof areProceduralTerrainReady === 'function' && areProceduralTerrainReady();
  }
  return areBlockSpritesReady()
    && areCliffSpritesReady()
    && typeof ROAD_SPRITE !== 'undefined'
    && ROAD_SPRITE.complete
    && ROAD_SPRITE.naturalWidth > 0;
}

function blockTopKeyForDraw(cell){
  return typeof blockTopKeyForCell === 'function' ? blockTopKeyForCell(cell) : 'grass';
}

function blockFillKeyForDraw(cell, tierLevel){
  return typeof blockFillKeyForCell === 'function'
    ? blockFillKeyForCell(cell, tierLevel)
    : (typeof TERRAIN_BLOCK_FILL === 'string' ? TERRAIN_BLOCK_FILL : 'dirt');
}

function blockTopSpriteForCell(cell, walls){
  const key = blockTopKeyForDraw(cell);
  if (usesCleanBlockWalls()){
    if (!walls && TERRAIN_BLOCK_CAP[key]) return TERRAIN_BLOCK_CAP[key];
    if (TERRAIN_BLOCK_BAKED[key]) return TERRAIN_BLOCK_BAKED[key];
  }
  const tinted = TERRAIN_BLOCK_TINTED_IMAGES[key];
  if (tinted && tinted.width > 0) return tinted;
  const spec = typeof TERRAIN_BLOCK_TINTS === 'object' && TERRAIN_BLOCK_TINTS
    ? TERRAIN_BLOCK_TINTS[key]
    : null;
  if (spec && spec.base) return blockDrawSource(spec.base, TERRAIN_BLOCK_IMAGES[spec.base], walls) || TERRAIN_BLOCK_IMAGES.grass;
  return blockDrawSource(key, TERRAIN_BLOCK_IMAGES[key], walls) || TERRAIN_BLOCK_IMAGES.grass;
}

function blockFillSpriteForCell(cell, tierLevel, walls){
  const key = blockFillKeyForDraw(cell, tierLevel);
  return blockDrawSource(key, TERRAIN_BLOCK_IMAGES[key], walls) || TERRAIN_BLOCK_IMAGES.dirt;
}

/** Calque 2 : texture sur sommet — même pose que le sol legacy, sans clip. */
function drawIsoCapTexture(targetCtx, src, cx, cy){
  if (!src) return false;
  const srcW = src.width || src.naturalWidth;
  const srcH = src.height || src.naturalHeight;
  if (!srcW || !srcH) return false;

  if (typeof drawTerrainSpriteImage === 'function'){
    drawTerrainSpriteImage(targetCtx, src, cx, cy);
    return true;
  }

  const c = targetCtx || ctx;
  const pad = typeof TERRAIN_TILE_OVERLAP === 'number' ? TERRAIN_TILE_OVERLAP : 0;
  const drawW = TILE_W + pad;
  if (srcW <= TILE_W + 4 && srcH <= TILE_H + 4){
    c.drawImage(src, cx - drawW / 2, cy, drawW, TILE_H + pad);
  } else {
    const drawH = drawW * (srcH / srcW);
    const faceFrac = typeof TERRAIN_FACE_ROW_FRAC === 'number' ? TERRAIN_FACE_ROW_FRAC : (38 / 88);
    c.drawImage(src, cx - drawW / 2, cy + TILE_H / 2 - faceFrac * drawH, drawW, drawH);
  }
  return true;
}

/** Calque 2 uniquement : losange texture clipé sur le sommet (cx,cy). */
function drawLegoCapTexture(targetCtx, src, cx, cy){
  return drawIsoCapTexture(targetCtx, src, cx, cy);
}

/**
 * Ancrage legacy — préférer drawLegoCapTexture pour le calque 2.
 */
function terrainBlockMetrics(src){
  const drawW = typeof TERRAIN_BLOCK_DRAW_W === 'number' ? TERRAIN_BLOCK_DRAW_W : TILE_W;
  const ref = (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.dirt)
    || (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.grass)
    || (typeof TERRAIN_BLOCK_BAKED === 'object' && TERRAIN_BLOCK_BAKED.dirt);
  if (ref && ref._drawW && ref._drawH){
    return {
      drawW: ref._drawW,
      drawH: ref._drawH,
      capH: ref._capH || TILE_H,
      sideH: ref._sideH || (typeof TERRAIN_BLOCK_SIDE_H === 'number' ? TERRAIN_BLOCK_SIDE_H : 16),
      capBackOffset: ref._capBackOffsetPx || 0,
      stackStep: typeof LEGO_BRICK_STEP === 'number'
        ? LEGO_BRICK_STEP
        : (ref._stackStepPx || ref._capH || TILE_H),
    };
  }
  if (src && src._drawW && src._drawH){
    return {
      drawW: src._drawW,
      drawH: src._drawH,
      capH: src._capH || TILE_H,
      sideH: src._sideH || (typeof TERRAIN_BLOCK_SIDE_H === 'number' ? TERRAIN_BLOCK_SIDE_H : 16),
      capBackOffset: src._capBackOffsetPx || 0,
      stackStep: typeof LEGO_BRICK_STEP === 'number'
        ? LEGO_BRICK_STEP
        : (src._stackStepPx || src._capH || TILE_H),
    };
  }
  const capH = TILE_H;
  const sideH = (src && src._sideH)
    || (typeof TERRAIN_BLOCK_SIDE_H === 'number' ? TERRAIN_BLOCK_SIDE_H : null)
    || (typeof TERRAIN_BLOCK_SIDE_WALL_MAX === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MAX : 16);
  return {
    drawW,
    drawH: capH + sideH,
    capH,
    sideH,
    capBackOffset: 0,
    stackStep: capH,
  };
}

function cubeStackStepForCell(cell){
  if (typeof blockTopSpriteForCell === 'function'){
    const src = blockTopSpriteForCell(cell, true);
    if (src){
      const m = terrainBlockMetrics(src);
      if (m.stackStep > 0) return m.stackStep;
    }
  }
  return typeof legoBrickStep === 'function' ? legoBrickStep() : TILE_H;
}

function drawLegoBrick(targetCtx, src, cx, cy, opts){
  if (!src) return false;
  opts = opts || {};
  const c = targetCtx || ctx;
  const srcW = src.width || src.naturalWidth;
  const srcH = src.height || src.naturalHeight;
  if (!srcW || !srcH) return false;

  const fullFaces = typeof usesFullFaceCubes === 'function' && usesFullFaceCubes();
  const m = terrainBlockMetrics(src);

  if (opts.walls && fullFaces){
    const drawY = cy - m.capBackOffset;
    c.drawImage(src, 0, 0, srcW, srcH, cx - m.drawW / 2, drawY, m.drawW, m.drawH);
    return true;
  }

  const drawW = m.drawW;
  const isoH = TILE_H;
  let sy = 0;
  let sh = srcH;
  if (!opts.walls && srcH > isoH * 1.15){
    sh = Math.round(isoH * (srcW / drawW));
    if (sh > srcH) sh = srcH;
  }

  const drawH = sh * (drawW / srcW);
  const drawY = cy - (fullFaces ? m.capBackOffset : 0);
  c.drawImage(src, 0, sy, srcW, sh, cx - drawW / 2, drawY, drawW, drawH);
  return true;
}

/** Fallback plat quand les sprites ne sont pas encore chargés — couleur selon biome, pas eau. */
function drawFlatFallback(targetCtx, cx, cy, cell){
  const c = targetCtx || ctx;
  const terrain = (cell && cell.terrain) || 'grass';
  const colorMap = typeof TERRAIN_COLORS === 'object' ? TERRAIN_COLORS : {};
  const color = colorMap[terrain] || colorMap['grass'] || '#6a8c4a';
  if (typeof drawFlatDiamond === 'function'){
    drawFlatDiamond(c, cx, cy, color);
  } else {
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + TILE_W / 2, cy + TILE_H / 2);
    c.lineTo(cx, cy + TILE_H);
    c.lineTo(cx - TILE_W / 2, cy + TILE_H / 2);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }
}

function drawWaterFlat(targetCtx, cx, cy, col, row){
  const c = targetCtx || ctx;
  const shaded = typeof terrainMicroShade === 'function'
    ? terrainMicroShade(TERRAIN_COLORS.water, col, row, 0)
    : TERRAIN_COLORS.water;
  if (typeof drawFlatDiamond === 'function'){
    drawFlatDiamond(c, cx, cy, shaded);
  } else {
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + TILE_W / 2, cy + TILE_H / 2);
    c.lineTo(cx, cy + TILE_H);
    c.lineTo(cx - TILE_W / 2, cy + TILE_H / 2);
    c.closePath();
    c.fillStyle = shaded;
    c.fill();
  }
  if (typeof drawTerrainProceduralDetail === 'function'){
    drawTerrainProceduralDetail(c, cx, cy, 'water', col, row);
  }
}

/** Pile de briques : PNG texturés (simple) ou cubes procéduraux (legacy). */
function drawLegoStack(targetCtx, col, row, cx, cy, cell, topMode){
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()
      && typeof drawTexturedCubeStack === 'function'){
    return drawTexturedCubeStack(targetCtx, col, row, cell, topMode);
  }
  if (typeof usesProceduralTerrain3D === 'function' && usesProceduralTerrain3D()
      && typeof drawProceduralStack === 'function'){
    return drawProceduralStack(targetCtx, col, row, cx, cy, cell, topMode);
  }
  if (!areBlockSpritesReady()) return false;
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (level <= 0) return false;

  const step = typeof legoBrickStep === 'function' ? legoBrickStep() : TILE_H;

  for (let i = 0; i < level; i++){
    const brickCy = cy + (level - 1 - i) * step;
    const isTop = i === level - 1;
    const isBottom = i === 0;
    const walls = isBottom;
    if (isTop && topMode === 'road'){
      drawLegoBrick(targetCtx, blockFillSpriteForCell(cell, level, walls), cx, brickCy, { walls });
      if (cell.roadStairs && typeof drawStairSprite === 'function'){
        drawStairSprite(targetCtx, cx, cy, col, row);
      } else if (typeof drawTerrainSpriteImage === 'function'){
        drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, cx, cy);
      }
    } else if (isTop){
      drawLegoBrick(targetCtx, blockTopSpriteForCell(cell, walls), cx, brickCy, { walls });
    } else {
      drawLegoBrick(targetCtx, blockFillSpriteForCell(cell, level, walls), cx, brickCy, { walls });
    }
  }
  return true;
}

function neighborTerrainLevel(nc, nr){
  // Eau / hors carte = niveau 0. Important : sinon les falaises/berges ne sont
  // jamais dessinées contre la mer et le sol semble flotter.
  if (!inBounds(nc, nr)) return 0;
  const c = grid[nr][nc];
  if (!c || c.terrain === 'water') return 0;
  return typeof cellLevel === 'function' ? cellLevel(nc, nr) : (c.level || 1);
}

/** Deltas de dénivelé sur la case courante (plus haute) vers voisins plus bas. */
function cliffEdgeState(col, row){
  if (!inBounds(col, row)) return null;
  const cell = grid[row][col];
  if (cell.terrain === 'water' || cell.hasRoad) return null;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (lv <= 0) return null;

  function dropToward(nc, nr){
    const nl = neighborTerrainLevel(nc, nr);
    return Math.max(0, lv - nl);
  }

  const n = dropToward(col, row - 1);
  const e = dropToward(col + 1, row);
  const s = dropToward(col, row + 1);
  const w = dropToward(col - 1, row);
  if (!n && !e && !s && !w) return null;
  return { n, e, s, w };
}

function cliffCornerFromEdges(edges){
  const { n, e, s, w } = edges;
  const count = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
  if (count === 2){
    if (n && e) return 'ne';
    if (e && s) return 'se';
    if (s && w) return 'sw';
    if (w && n) return 'nw';
  }
  return null;
}

function drawCliffSprite(targetCtx, id, cx, cy){
  const img = CLIFF_IMAGES[id];
  if (!img || !img.complete || !img.naturalWidth) return;
  const c = targetCtx || ctx;
  const pad = typeof CLIFF_DRAW_PAD === 'number' ? CLIFF_DRAW_PAD : 0;
  const drawW = TILE_W + pad * 2;
  const drawH = (typeof CLIFF_SPRITE_H === 'number' ? CLIFF_SPRITE_H : 48) + pad;
  c.drawImage(img, cx - drawW / 2, cy, drawW, drawH);
}

function drawCellCliff(targetCtx, col, row, cx, cy){
  if (!areCliffSpritesReady()) return;
  const edges = cliffEdgeState(col, row);
  if (!edges) return;

  const corner = cliffCornerFromEdges(edges);
  if (corner){
    drawCliffSprite(targetCtx, corner, cx, cy);
    return;
  }
  if (edges.n) drawCliffSprite(targetCtx, 'n', cx, cy);
  if (edges.e) drawCliffSprite(targetCtx, 'e', cx, cy);
  if (edges.s) drawCliffSprite(targetCtx, 's', cx, cy);
  if (edges.w) drawCliffSprite(targetCtx, 'w', cx, cy);
}

/** Rendu terrain : calques (géométrie + texture) ou legacy. */
function drawIsoTerrainCell(targetCtx, col, row, cx, cy, cell){
  if (typeof usesLayeredTerrain === 'function' && usesLayeredTerrain()
      && typeof drawLayeredTerrainCell === 'function'){
    drawLayeredTerrainCell(targetCtx, col, row, cell);
    return;
  }

  if (cell.hasRoad){
    if (!drawLegoStack(targetCtx, col, row, cx, cy, cell, 'road')){
      if (typeof drawTerrainSpriteImage === 'function'){
        drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, cx, cy);
      }
    }
    return;
  }

  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (cell.terrain === 'water' || level <= 0){
    drawWaterFlat(targetCtx, cx, cy, col, row);
    return;
  }

  if (!drawLegoStack(targetCtx, col, row, cx, cy, cell)){
    drawFlatFallback(targetCtx, cx, cy, cell);
  }
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()){
    if (!(typeof usesFullFaceCubes === 'function' && usesFullFaceCubes())){
      drawCellCliff(targetCtx, col, row, cx, cy);
    }
  } else if (typeof usesProceduralTerrain3D === 'function' && usesProceduralTerrain3D()
      && typeof drawProceduralCliffFaces === 'function'){
    drawProceduralCliffFaces(targetCtx, col, row, cx, cy, cell);
  } else {
    drawCellCliff(targetCtx, col, row, cx, cy);
  }
}

initTerrainIsoAssets();
