/* ===================== TERRAIN 3D PROCÉDURAL (Aster Bay / Calm Safe City) ===================== */
// Cubes iso dessinés en vectoriel — zéro PNG, ancrage géométrique exact.

function usesProceduralTerrain3D(){
  return typeof TERRAIN_PROCEDURAL_3D === 'boolean' && TERRAIN_PROCEDURAL_3D;
}

function procShade(hex, amount){
  if (typeof shade === 'function') return shade(hex, Math.round(amount * 100));
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const a = amount >= 0 ? 1 + amount : 1 + amount;
  if (amount >= 0){
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * a);
    g = Math.round(g * a);
    b = Math.round(b * a);
  }
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

const _BIOME_CUBE = {
  grass: '#83bd72', wheat: '#c9b84a', forest: '#5a9a48', hill: '#7aad62',
  sand: '#e8d4a8', rock: '#9aa5ab', marble: '#d8d4cc', water: '#5fb6d9',
  dirt: '#9a7a52', stone: '#8d8878',
};

function cubeColorForKey(key, terrain){
  if (typeof TERRAIN_COLORS === 'object' && TERRAIN_COLORS[terrain]) return TERRAIN_COLORS[terrain];
  if (typeof TERRAIN_COLORS === 'object' && TERRAIN_COLORS[key]) return TERRAIN_COLORS[key];
  return _BIOME_CUBE[key] || _BIOME_CUBE.grass;
}

function cubeColorsForCell(cell, isTop, tierLevel, brickIndex, stackHeight){
  const fillKey = typeof blockFillKeyForCell === 'function'
    ? blockFillKeyForCell(cell, tierLevel)
    : 'dirt';
  const h = Math.max(1, stackHeight || tierLevel || 1);
  const i = typeof brickIndex === 'number' ? brickIndex : (isTop ? h - 1 : 0);
  const depth = h > 1 ? i / (h - 1) : 0;

  if (isTop){
    const base = cubeColorForKey(fillKey, cell.terrain);
    return {
      top: procShade(base, 0.04),
      right: procShade(base, -0.10 - depth * 0.04),
      left: procShade(base, -0.22 - depth * 0.06),
    };
  }

  const base = cubeColorForKey(fillKey, cell.terrain);
  return {
    top: procShade(base, -0.04 - depth * 0.08),
    right: procShade(base, -0.16 - depth * 0.10),
    left: procShade(base, -0.30 - depth * 0.12),
  };
}

function fillQuad(c, p1, p2, p3, p4, fill){
  c.beginPath();
  c.moveTo(p1.x, p1.y);
  c.lineTo(p2.x, p2.y);
  c.lineTo(p3.x, p3.y);
  c.lineTo(p4.x, p4.y);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

/** Losange plat à z=0 (eau, preview). (cx,cy) = sommet arrière. */
function drawFlatDiamond(targetCtx, cx, cy, fillColor){
  const c = targetCtx || ctx;
  const tw = TILE_W;
  const th = TILE_H;
  fillQuad(c,
    { x: cx, y: cy },
    { x: cx + tw / 2, y: cy + th / 2 },
    { x: cx, y: cy + th },
    { x: cx - tw / 2, y: cy + th / 2 },
    fillColor,
  );
}

/**
 * Un cube iso en coords écran. cy = sommet arrière de la face du dessus.
 * Parois visibles : est + ouest (style Aster Bay visFaces simplifié).
 */
function drawIsoCube(targetCtx, cx, cy, colors){
  drawIsoCubeGeometry(targetCtx, cx, cy, colors, { top: true, walls: true });
}

/** Cube géométrie seule — calque 1 (top:false = prêt pour calque texture). */
function drawIsoCubeGeometry(targetCtx, cx, cy, colors, opts){
  opts = opts || {};
  const c = targetCtx || ctx;
  const tw = TILE_W;
  const th = TILE_H;
  const wallH = typeof TERRAIN_CUBE_WALL_H === 'number' ? TERRAIN_CUBE_WALL_H : Math.round(th * 0.5);

  const tBack = { x: cx, y: cy };
  const tRight = { x: cx + tw / 2, y: cy + th / 2 };
  const tFront = { x: cx, y: cy + th };
  const tLeft = { x: cx - tw / 2, y: cy + th / 2 };

  const bRight = { x: tRight.x, y: tRight.y + wallH };
  const bFront = { x: tFront.x, y: tFront.y + wallH };
  const bLeft = { x: tLeft.x, y: tLeft.y + wallH };

  if (opts.walls !== false){
    fillQuad(c, tRight, tFront, bFront, bRight, colors.right);
    fillQuad(c, tLeft, tFront, bFront, bLeft, colors.left);
  }
  if (opts.top !== false){
    fillQuad(c, tBack, tRight, tFront, tLeft, colors.top);
  }
}

/** Pile de cubes colorés — legacy si calques désactivés. */
function drawProceduralStack(targetCtx, col, row, cx, cy, cell, topMode){
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (level <= 0) return false;

  if (typeof usesLayeredTerrain === 'function' && usesLayeredTerrain()
      && typeof drawLayeredTerrainCell === 'function'){
    drawLayeredTerrainCell(targetCtx, col, row, cell);
    return true;
  }

  const step = typeof legoBrickStep === 'function' ? legoBrickStep() : TILE_H;
  for (let i = 0; i < level; i++){
    const anchor = typeof stackBrickAnchor === 'function'
      ? stackBrickAnchor(col, row, level, i)
      : { x: cx, y: cy + (level - 1 - i) * step };
    const isTop = i === level - 1;
    const colors = cubeColorsForCell(cell, isTop, level);
    drawIsoCube(targetCtx, anchor.x, anchor.y, colors);
  }

  if (topMode === 'road' && typeof drawTerrainSpriteImage === 'function'){
    const top = typeof tileTopAtLevel === 'function'
      ? tileTopAtLevel(col, row, level)
      : { x: cx, y: cy };
    drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, top.x, top.y);
  }
  return true;
}

/** Parois de dénivelé — faces sombres + ombre interne (pas de blob flottant). */
function drawProceduralCliffFaces(targetCtx, col, row, cx, cy, cell){
  if (typeof cliffEdgeState !== 'function') return;
  const edges = cliffEdgeState(col, row);
  if (!edges) return;

  const c = targetCtx || ctx;
  const tw = TILE_W;
  const th = TILE_H;
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  const step = typeof legoBrickStep === 'function' ? legoBrickStep() : TILE_H;
  const fillKey = typeof blockFillKeyForCell === 'function' ? blockFillKeyForCell(cell, lv) : 'dirt';
  const darken = typeof TERRAIN_CLIFF_DARKEN === 'number' ? TERRAIN_CLIFF_DARKEN : 0.12;
  const ao = typeof TERRAIN_CLIFF_AO === 'number' ? TERRAIN_CLIFF_AO : 0.24;
  const wallCol = procShade(cubeColorForKey(fillKey, cell.terrain), -(0.24 + darken));

  const tBack = { x: cx, y: cy };
  const tRight = { x: cx + tw / 2, y: cy + th / 2 };
  const tFront = { x: cx, y: cy + th };
  const tLeft = { x: cx - tw / 2, y: cy + th / 2 };

  function wallHeight(delta){
    return Math.max(step, delta * step);
  }

  function lerpPt(a, b, t){
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function drawCliffFace(p1, p2, p3, p4, shadeAmt){
    const colFill = procShade(wallCol, shadeAmt);
    fillQuad(c, p1, p2, p3, p4, colFill);
    const m1 = lerpPt(p1, p4, 0.45);
    const m2 = lerpPt(p2, p3, 0.45);
    fillQuad(c, m1, m2, p3, p4, `rgba(0,0,0,${ao})`);
    c.beginPath();
    c.moveTo(p1.x, p1.y);
    c.lineTo(p2.x, p2.y);
    c.strokeStyle = 'rgba(255,255,235,0.14)';
    c.lineWidth = 1;
    c.stroke();
  }

  if (edges.n){
    const h = wallHeight(edges.n);
    drawCliffFace(tBack, tRight, { x: tRight.x, y: tRight.y + h }, { x: tBack.x, y: tBack.y + h }, 0);
    drawCliffFace(tBack, tLeft, { x: tLeft.x, y: tLeft.y + h }, { x: tBack.x, y: tBack.y + h }, -0.06);
  }
  if (edges.e){
    const h = wallHeight(edges.e);
    drawCliffFace(tRight, tFront, { x: tFront.x, y: tFront.y + h }, { x: tRight.x, y: tRight.y + h }, -0.04);
  }
  if (edges.s){
    const h = wallHeight(edges.s);
    drawCliffFace(tFront, tRight, { x: tRight.x, y: tRight.y + h }, { x: tFront.x, y: tFront.y + h }, -0.10);
    drawCliffFace(tFront, tLeft, { x: tLeft.x, y: tLeft.y + h }, { x: tFront.x, y: tFront.y + h }, -0.14);
  }
  if (edges.w){
    const h = wallHeight(edges.w);
    drawCliffFace(tLeft, tFront, { x: tFront.x, y: tFront.y + h }, { x: tLeft.x, y: tLeft.y + h }, -0.08);
  }
}

/** Conservé pour compatibilité — ombres portées désactivées (TERRAIN_CLIFF_SHADOW). */
function drawProceduralCliffShadow(){}

function areProceduralTerrainReady(){
  return typeof ROAD_SPRITE !== 'undefined'
    && ROAD_SPRITE.complete
    && ROAD_SPRITE.naturalWidth > 0;
}
