/* ===================== CALQUES TERRAIN (niveau 0 + textures) ===================== */
// Calque 1 : géométrie empilée depuis le plan de base (niveau 0).
// Calque 2 : texture (losange) posée sur le sommet calculé — jamais l'inverse.

function usesLayeredTerrain(){
  return typeof TERRAIN_LAYERED_RENDER === 'boolean' && TERRAIN_LAYERED_RENDER;
}

function usesPolisInlineCliffs(){
  return typeof TERRAIN_POLIS_CLIFF_WALLS === 'boolean' && TERRAIN_POLIS_CLIFF_WALLS;
}

function usesTexturedCubes(){
  return typeof TERRAIN_TEXTURED_CUBES === 'boolean' && TERRAIN_TEXTURED_CUBES;
}

/** Chaque brique de la pile dessine le cube PNG complet (face + parois). */
function usesFullFaceCubes(){
  return usesTexturedCubes()
    && typeof TERRAIN_CUBE_FULL_FACES === 'boolean'
    && TERRAIN_CUBE_FULL_FACES;
}

function terrainLevelStep(){
  if (typeof legoBrickStep === 'function') return legoBrickStep();
  return TILE_H;
}

/** Plan de référence niveau 0 — même Y pour toutes les cases (eau incluse). */
function tileAnchorBase(col, row){
  return {
    x: OFFSET_X + (col - row) * (TILE_W / 2),
    y: OFFSET_Y + (col + row) * (TILE_H / 2),
  };
}

/** Sommet arrière du losange au niveau `level` (0 = sol, 1+ = pile). */
function tileTopAtLevel(col, row, level){
  const base = tileAnchorBase(col, row);
  const lv = Math.max(0, typeof level === 'number' ? level : 0);
  if (lv <= 0) return base;
  return { x: base.x, y: base.y - (lv - 1) * terrainLevelStep() };
}

function stackBrickAnchor(col, row, stackHeight, brickIndex){
  const base = tileAnchorBase(col, row);
  const h = Math.max(1, stackHeight);
  const i = Math.max(0, Math.min(h - 1, brickIndex));
  const step = typeof legoBrickStep === 'function' ? legoBrickStep() : terrainLevelStep();
  return { x: base.x, y: base.y - i * step };
}

/** Point d'ancrage entités / clics = sommet de la pile de la case. */
function tileSurfaceAnchor(col, row){
  const lv = typeof cellLevel === 'function' ? cellLevel(col, row) : 1;
  return tileTopAtLevel(col, row, lv);
}

function clipIsoDiamond(targetCtx, cx, cy, pad){
  const c = targetCtx || ctx;
  const overlap = pad != null ? pad : (typeof TERRAIN_CAP_CLIP_PAD === 'number' ? TERRAIN_CAP_CLIP_PAD : 1);
  const hw = TILE_W / 2 + overlap;
  const h = TILE_H + overlap;
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + hw, cy + h / 2);
  c.lineTo(cx, cy + h);
  c.lineTo(cx - hw, cy + h / 2);
  c.closePath();
  c.clip();
}


/* ===================== CAPS PROCÉDURALES SANS COUTURES ===================== */
function capRng(col, row, salt){
  return mulberry32(hashSeed(col * 92821 + (salt || 0), row * 68917 - (salt || 0)));
}

function colorMix(hexA, hexB, t){
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r,g,bl].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2,'0')).join('')}`;
}

function capBaseColor(cell, col, row){
  const key = (cell && cell.terrain) || 'grass';
  const base = TERRAIN_COLORS[key] || TERRAIN_COLORS.grass || '#7ea24c';
  const rng = capRng(col, row, 101);
  const v = Math.round((rng() - 0.5) * 18);
  return shade(base, v);
}

function diamondContainsLocal(dx, dy){
  // dx/dy par rapport au centre visuel du losange (cx, cy + TILE_H/2).
  return Math.abs(dx) / (TILE_W / 2) + Math.abs(dy) / (TILE_H / 2) <= 1;
}

function capTileVary(col, row){
  return capRng(col, row, 7)();
}

/** Niveau aux 4 coins du losange (approximation grille). */
function capCornerLevels(col, row){
  function lv(c, r){
    if (typeof inBounds === 'function' && !inBounds(c, r)) return 0;
    const cell = grid[r][c];
    if (cell.terrain === 'water') return 0;
    return typeof cellLevel === 'function' ? cellLevel(c, r) : (cell.level || 1);
  }
  return [lv(col, row), lv(col + 1, row), lv(col + 1, row + 1), lv(col, row + 1)];
}

/** Ombrage de pente — inspiré POLIS elevShade (soleil arrière-gauche). */
function capElevShade(col, row){
  const corners = capCornerLevels(col, row);
  const a = corners[0], b = corners[1], c = corners[2], d = corners[3];
  const slope = ((b + c) - (a + d)) + ((d + c) - (a + b));
  const t = slope / 4;
  const lit = t / Math.sqrt(1 + t * t);
  const h = (a + b + c + d) * 0.02;
  return Math.max(-0.30, Math.min(0.22, h - lit * 0.26));
}

/** Teinte roche sur pentes abruptes — inspiré POLIS cliffMix. */
function capCliffMix(col, row){
  const corners = capCornerLevels(col, row);
  const spread = Math.max(...corners) - Math.min(...corners);
  if (spread <= 0) return 0;
  return Math.max(0, Math.min(1, spread / 2));
}

function polisShadeMult(hex, factor){
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!n && n !== 0) return hex;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * factor)));
  g = Math.max(0, Math.min(255, Math.round(g * factor)));
  b = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `rgb(${r},${g},${b})`;
}

function traceCapDiamond(c, cx, cy){
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + TILE_W / 2, cy + TILE_H / 2);
  c.lineTo(cx, cy + TILE_H);
  c.lineTo(cx - TILE_W / 2, cy + TILE_H / 2);
  c.closePath();
}

function diamondCornerBasePt(col, row, cornerIdx){
  const base = tileAnchorBase(col, row);
  const tw = TILE_W;
  const th = TILE_H;
  const o = [
    { x: 0, y: 0 },
    { x: tw / 2, y: th / 2 },
    { x: 0, y: th },
    { x: -tw / 2, y: th / 2 },
  ][cornerIdx];
  return { x: base.x + o.x, y: base.y + o.y };
}

function diamondCornerPt(col, row, cornerIdx){
  const levels = capCornerLevels(col, row);
  const lv = levels[cornerIdx];
  const lift = Math.max(0, lv - 1) * terrainLevelStep();
  const pt = diamondCornerBasePt(col, row, cornerIdx);
  return { x: pt.x, y: pt.y - lift };
}

/**
 * Parois style POLIS — dessinées AVANT le cap : la texture recouvre l'intérieur,
 * seule la jupe rocheuse dépasse (drawCliffWalls → groundPath dans POLIS).
 */
function drawPolisCliffWalls(targetCtx, col, row, cell, cx, cy){
  if (typeof TERRAIN_POLIS_CLIFF_WALLS === 'boolean' && !TERRAIN_POLIS_CLIFF_WALLS) return;
  if (typeof cliffEdgeState !== 'function') return;
  const edges = cliffEdgeState(col, row);
  if (!edges) return;

  const c = targetCtx || ctx;
  const step = terrainLevelStep();
  const minDrop = typeof TERRAIN_POLIS_CLIFF_MIN === 'number' ? TERRAIN_POLIS_CLIFF_MIN : 0.5;
  const ao = typeof TERRAIN_CLIFF_AO === 'number' ? TERRAIN_CLIFF_AO : 0.22;
  const levels = capCornerLevels(col, row);

  const POLIS_EDGES = [
    { key: 'n', c0: 0, c1: 1, light: '#6c625a', dark: '#615850' },
    { key: 'e', c0: 1, c1: 2, light: '#6c625a', dark: '#615850' },
    { key: 's', c0: 2, c1: 3, light: '#615850', dark: '#5a524a' },
    { key: 'w', c0: 3, c1: 0, light: '#615850', dark: '#5a524a' },
  ];

  function lerpPt(a, b, t){
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function drawWallQuad(t1, t2, b2, b1, fill){
    if (typeof fillQuad === 'function'){
      fillQuad(c, t1, t2, b2, b1, fill);
    } else {
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(t1.x, t1.y);
      c.lineTo(t2.x, t2.y);
      c.lineTo(b2.x, b2.y);
      c.lineTo(b1.x, b1.y);
      c.closePath();
      c.fill();
    }
    const m1 = lerpPt(t1, b1, 0.45);
    const m2 = lerpPt(t2, b2, 0.45);
    if (typeof fillQuad === 'function'){
      fillQuad(c, m1, m2, b2, b1, `rgba(0,0,0,${ao})`);
    }
  }

  for (const e of POLIS_EDGES){
    if (!edges[e.key]) continue;
    const h0 = levels[e.c0] * step;
    const h1 = levels[e.c1] * step;
    if (h0 < minDrop && h1 < minDrop) continue;

    const t1 = diamondCornerPt(col, row, e.c0);
    const t2 = diamondCornerPt(col, row, e.c1);
    const b2 = diamondCornerBasePt(col, row, e.c1);
    const b1 = diamondCornerBasePt(col, row, e.c0);
    drawWallQuad(t1, t2, b2, b1, e.light);
  }
}

/** Remplissage principal style POLIS : shade(base, 0.95 + vary*0.1 + elevShade). */
function drawPolisCapFill(c, cx, cy, base, col, row, cell, level){
  const v = capTileVary(col, row);
  const elevS = capElevShade(col, row);
  let color = base;
  if (cell.terrain === 'marble'){
    color = colorMix(base, '#ffffff', 0.18);
  } else if (level >= 3 && typeof TERRAIN_COLORS === 'object'){
    color = colorMix(base, TERRAIN_COLORS.rock || '#8a8580', 0.32);
  } else if (level >= 2 && typeof TERRAIN_COLORS === 'object'){
    color = colorMix(base, TERRAIN_COLORS.hill || '#6d9348', 0.22);
  }

  c.fillStyle = polisShadeMult(color, 0.95 + v * 0.1 + elevS);
  traceCapDiamond(c, cx, cy);
  c.fill();

  const ck = capCliffMix(col, row);
  if (ck > 0){
    c.fillStyle = `rgba(122,112,98,${(ck * 0.4).toFixed(3)})`;
    traceCapDiamond(c, cx, cy);
    c.fill();
  }

  if (cell.terrain === 'grass' || cell.terrain === 'hill'){
    if (v > 0.93){
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(cx + (v - 0.93) * 200 - 6, cy + TILE_H * 0.45, 2, 2);
    } else if (v > 0.55){
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.beginPath();
      c.ellipse(cx + (v - 0.55) * 40 - 8, cy + TILE_H * 0.5, 4.5, 2, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function drawCapNoise(c, cx, cy, cell, col, row, base){
  const terrain = cell.terrain;
  const density = typeof TERRAIN_CAP_DETAIL_DENSITY === 'number' ? TERRAIN_CAP_DETAIL_DENSITY : 1;
  const rng = capRng(col, row, 211);
  const count = Math.round((terrain === 'grass' || terrain === 'forest' || terrain === 'hill' ? 18 : 10) * density);

  // Taches larges sans clip — les points hors losange sont filtrés (technique POLIS).
  for (let i = 0; i < 5; i++){
    const px = cx + (rng() - 0.5) * TILE_W * 0.75;
    const py = cy + TILE_H / 2 + (rng() - 0.5) * TILE_H * 0.55;
    const rx = 8 + rng() * 18;
    const ry = 3 + rng() * 8;
    const colr = rng() > 0.5 ? shade(base, 10 + rng() * 8) : shade(base, -10 - rng() * 8);
    c.globalAlpha = 0.10 + rng() * 0.12;
    c.beginPath();
    c.ellipse(px, py, rx, ry, (rng() - 0.5) * 0.8, 0, Math.PI * 2);
    c.fillStyle = colr;
    c.fill();
  }
  c.globalAlpha = 1;

  if (terrain === 'wheat'){
    c.strokeStyle = 'rgba(140,105,28,0.34)';
    c.lineWidth = 1;
    for (let i = 0; i < 14; i++){
      const px = cx + (rng() - 0.5) * TILE_W * 0.74;
      const py = cy + TILE_H / 2 + (rng() - 0.5) * TILE_H * 0.54;
      if (!diamondContainsLocal(px - cx, py - (cy + TILE_H / 2))) continue;
      c.beginPath();
      c.moveTo(px - 3, py + 1);
      c.lineTo(px + 3, py - 2);
      c.stroke();
    }
  } else if (terrain === 'marble' || terrain === 'rock'){
    c.strokeStyle = terrain === 'marble' ? 'rgba(112,104,96,0.22)' : 'rgba(40,38,36,0.24)';
    c.lineWidth = 1;
    const veinCount = terrain === 'marble' ? 10 : 8;
    for (let i = 0; i < veinCount; i++){
      const px = cx + (rng() - 0.5) * TILE_W * 0.78;
      const py = cy + TILE_H / 2 + (rng() - 0.5) * TILE_H * 0.58;
      if (!diamondContainsLocal(px - cx, py - (cy + TILE_H / 2))) continue;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px + (rng() - 0.5) * 14, py + (rng() - 0.5) * 6);
      c.stroke();
    }
  } else if (terrain === 'sand'){
    for (let i = 0; i < 8; i++){
      const px = cx + (rng() - 0.5) * TILE_W * 0.76;
      const py = cy + TILE_H / 2 + (rng() - 0.5) * TILE_H * 0.56;
      if (!diamondContainsLocal(px - cx, py - (cy + TILE_H / 2))) continue;
      c.fillStyle = rng() > 0.5 ? 'rgba(255,242,190,0.18)' : 'rgba(120,90,48,0.13)';
      c.fillRect(px, py, 2, 1);
    }
  } else {
    for (let i = 0; i < count; i++){
      const px = cx + (rng() - 0.5) * TILE_W * 0.78;
      const py = cy + TILE_H / 2 + (rng() - 0.5) * TILE_H * 0.58;
      if (!diamondContainsLocal(px - cx, py - (cy + TILE_H / 2))) continue;
      const r = 0.8 + rng() * 1.6;
      const flower = rng() > 0.92 && terrain !== 'forest';
      c.fillStyle = flower ? (rng() > 0.5 ? 'rgba(255,232,80,0.65)' : 'rgba(238,238,220,0.55)') : 'rgba(34,82,24,0.20)';
      c.beginPath();
      c.ellipse(px, py, r * 1.4, r * 0.65, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Légère lumière bas-gauche → ombre bas-droite (sans clip dur).
  if (typeof TERRAIN_CAP_EDGE_FEATHER === 'boolean' ? TERRAIN_CAP_EDGE_FEATHER : true){
    const shadeGrad = c.createLinearGradient(cx - TILE_W / 2, cy, cx + TILE_W / 2, cy + TILE_H);
    shadeGrad.addColorStop(0, 'rgba(255,255,235,0.05)');
    shadeGrad.addColorStop(0.55, 'rgba(0,0,0,0.00)');
    shadeGrad.addColorStop(1, 'rgba(0,0,0,0.10)');
    c.fillStyle = shadeGrad;
    traceCapDiamond(c, cx, cy);
    c.fill();
  }
}

function drawProceduralCap(targetCtx, col, row, cell){
  const c = targetCtx || ctx;
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  const { x, y } = tileTopAtLevel(col, row, level);
  const base = capBaseColor(cell, col, row);
  drawPolisCliffWalls(c, col, row, cell, x, y);
  drawPolisCapFill(c, x, y, base, col, row, cell, level);
  drawCapNoise(c, x, y, cell, col, row, base);
  drawCapLevelSeam(c, x, y, col, row, level);
  if (typeof drawTerrainProceduralDetail === 'function'){
    drawTerrainProceduralDetail(c, x, y, cell.terrain, col, row);
  }
  return true;
}

function drawCapLevelSeam(c, cx, cy, col, row, level){
  if (!(typeof TERRAIN_CONTACT_SHADOW === 'boolean' ? TERRAIN_CONTACT_SHADOW : true)) return;
  if (level <= 0) return;
  const edges = typeof cliffEdgeState === 'function' ? cliffEdgeState(col, row) : null;
  if (!edges) return;
  const a = 0.10;
  c.save();
  clipIsoDiamond(c, cx, cy, 0.5);
  c.strokeStyle = `rgba(0,0,0,${a})`;
  c.lineWidth = 1.5;
  c.beginPath();
  if (edges.s){ c.moveTo(cx - TILE_W / 2 + 2, cy + TILE_H / 2); c.lineTo(cx, cy + TILE_H - 1); c.lineTo(cx + TILE_W / 2 - 2, cy + TILE_H / 2); }
  if (edges.e){ c.moveTo(cx + TILE_W / 2 - 1, cy + TILE_H / 2); c.lineTo(cx, cy + TILE_H - 1); }
  if (edges.w){ c.moveTo(cx - TILE_W / 2 + 1, cy + TILE_H / 2); c.lineTo(cx, cy + TILE_H - 1); }
  c.stroke();
  c.restore();
}


/** Calque 2 : losange texturé (tuile plate ou cap bloc) sur le sommet. */
function drawTextureCap(targetCtx, col, row, cell){
  const c = targetCtx || ctx;
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (level <= 0 || cell.terrain === 'water') return;

  // Nouvelle approche : le sommet est dessiné comme une surface procédurale contrôlée,
  // pas comme un PNG losange indépendant. Ça supprime l'effet patchwork / flottant.
  if (typeof TERRAIN_PROCEDURAL_CAPS === 'boolean' && TERRAIN_PROCEDURAL_CAPS
      && typeof drawProceduralCap === 'function'){
    drawProceduralCap(c, col, row, cell);
    return;
  }

  const { x, y } = tileTopAtLevel(col, row, level);
  if (typeof TERRAIN_POLIS_CLIFF_WALLS === 'boolean' ? TERRAIN_POLIS_CLIFF_WALLS : true){
    drawPolisCliffWalls(c, col, row, cell, x, y);
  }
  const src = terrainCapImageForCell(cell, col, row, level);
  let drawn = false;

  if (src && typeof drawIsoCapTexture === 'function'){
    drawn = drawIsoCapTexture(c, src, x, y);
  } else if (src && typeof drawLegoCapTexture === 'function'){
    drawn = drawLegoCapTexture(c, src, x, y);
  }

  if (!drawn){
    const key = typeof capSpriteKeyForCell === 'function'
      ? capSpriteKeyForCell(cell, level)
      : 'grass';
    if (typeof drawFlatDiamond === 'function' && typeof cubeColorForKey === 'function'){
      drawFlatDiamond(c, x, y, cubeColorForKey(key, cell.terrain));
      drawn = true;
    }
  }

  if (drawn){
    drawCapDepthRim(c, x, y, level);
    if (typeof drawTerrainProceduralDetail === 'function'){
      drawTerrainProceduralDetail(c, x, y, cell.terrain, col, row);
    }
  }
}

function drawRoadTextureCap(targetCtx, col, row, cell){
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  const { x, y } = tileTopAtLevel(col, row, Math.max(1, level));
  if (cell.roadStairs && typeof drawStairSprite === 'function' && drawStairSprite(targetCtx, x, y, col, row)){
    drawCapDepthRim(targetCtx, x, y, level);
    return;
  }
  if (typeof drawIsoCapTexture === 'function'){
    drawIsoCapTexture(targetCtx, ROAD_SPRITE, x, y);
  } else if (typeof drawTerrainSpriteImage === 'function'){
    drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, x, y);
  }
  drawCapDepthRim(targetCtx, x, y, level);
}

function drawCliffLayerForCell(targetCtx, col, row, cell){
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  const { x, y } = tileTopAtLevel(col, row, Math.max(1, level));
  if (typeof drawProceduralCliffFaces === 'function'){
    drawProceduralCliffFaces(targetCtx, col, row, x, y, cell);
  } else if (typeof drawCellCliff === 'function'){
    drawCellCliff(targetCtx, col, row, x, y);
  }
}


/** Liseré ombre/lumière iso — aide à lire la profondeur entre caps voisins. */
function drawCapDepthRim(targetCtx, cx, cy, level){
  if (typeof TERRAIN_CAP_DEPTH_RIM === 'boolean' && !TERRAIN_CAP_DEPTH_RIM) return;
  const c = targetCtx || ctx;
  const th = TILE_H;
  const tw = TILE_W;
  const depth = Math.max(0, (level || 1) - 1);
  const sFront = 0.11 + depth * 0.045;
  const sRight = 0.08 + depth * 0.035;
  const sTop = 0.06 + depth * 0.02;

  c.save();
  clipIsoDiamond(c, cx, cy);
  c.fillStyle = `rgba(18,28,12,${sFront})`;
  c.beginPath();
  c.moveTo(cx, cy + th * 0.42);
  c.lineTo(cx + tw / 2, cy + th * 0.72);
  c.lineTo(cx, cy + th);
  c.lineTo(cx - tw / 2, cy + th * 0.72);
  c.closePath();
  c.fill();

  c.fillStyle = `rgba(12,22,8,${sRight})`;
  c.beginPath();
  c.moveTo(cx + tw * 0.06, cy + th * 0.46);
  c.lineTo(cx + tw / 2, cy + th / 2);
  c.lineTo(cx + tw / 2, cy + th * 0.74);
  c.lineTo(cx, cy + th * 0.58);
  c.closePath();
  c.fill();

  c.fillStyle = `rgba(255,255,248,${sTop})`;
  c.beginPath();
  c.moveTo(cx, cy);
  c.lineTo(cx + tw / 2, cy + th / 2);
  c.lineTo(cx, cy + th * 0.36);
  c.lineTo(cx - tw / 2, cy + th / 2);
  c.closePath();
  c.fill();
  c.restore();
}

function terrainCapImageForCell(cell, col, row, level){
  const useFlat = typeof TERRAIN_CAP_USE_FLAT_SPRITES === 'boolean' && TERRAIN_CAP_USE_FLAT_SPRITES;
  const capKey = typeof capSpriteKeyForCell === 'function'
    ? capSpriteKeyForCell(cell, level)
    : (typeof blockTopKeyForCell === 'function' ? blockTopKeyForCell(cell) : 'grass');
  const biomeKey = typeof blockTopKeyForCell === 'function' ? blockTopKeyForCell(cell) : 'grass';
  const levelOverridesCap = capKey !== biomeKey;

  if (useFlat && !levelOverridesCap && typeof terrainVariantImage === 'function'){
    const variantTerrain = cell.terrain === 'sand' || cell.terrain === 'grass' ? cell.terrain : null;
    if (variantTerrain){
      const variant = terrainVariantImage(variantTerrain, col, row);
      if (variant && variant.complete && variant.naturalWidth) return variant;
    }
  }

  if (useFlat && typeof TERRAIN_SPRITE_IMAGES === 'object'){
    const flat = TERRAIN_SPRITE_IMAGES[capKey] || TERRAIN_SPRITE_IMAGES[cell.terrain];
    if (flat && flat.complete && flat.naturalWidth) return flat;
  }

  if (typeof TERRAIN_BLOCK_CAP === 'object' && TERRAIN_BLOCK_CAP[capKey]){
    return TERRAIN_BLOCK_CAP[capKey];
  }
  if (typeof blockTopSpriteForCell === 'function'){
    return blockTopSpriteForCell(cell, false);
  }
  return null;
}

/** Pile de cubes PNG texturés — un bloc par niveau, ancrage depuis le plan 0. */
function drawTexturedCubeStack(targetCtx, col, row, cell, topMode){
  if (typeof areCoreBlockSpritesReady === 'function' && !areCoreBlockSpritesReady()) return false;
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (level <= 0) return false;

  const fullFaces = typeof usesFullFaceCubes === 'function' && usesFullFaceCubes();

  for (let i = 0; i < level; i++){
    const { x, y } = stackBrickAnchor(col, row, level, i);
    const isTop = i === level - 1;
    const walls = fullFaces || i === 0;

    if (isTop && topMode === 'road'){
      if (typeof drawLegoBrick === 'function'){
        drawLegoBrick(targetCtx, blockFillSpriteForCell(cell, level, walls), x, y, { walls });
      }
      const top = tileTopAtLevel(col, row, level);
      if (typeof drawTerrainSpriteImage === 'function'){
        drawTerrainSpriteImage(targetCtx, ROAD_SPRITE, top.x, top.y);
      }
    } else if (isTop){
      if (typeof drawLegoBrick === 'function'){
        drawLegoBrick(targetCtx, blockTopSpriteForCell(cell, walls), x, y, { walls });
      }
    } else if (typeof drawLegoBrick === 'function'){
      drawLegoBrick(targetCtx, blockFillSpriteForCell(cell, level, walls), x, y, { walls });
    }
  }
  return true;
}

function drawGeometryStack(targetCtx, col, row, cell, stackHeight, topMode){
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()){
    return drawTexturedCubeStack(targetCtx, col, row, cell, topMode);
  }
  if (stackHeight <= 0) return false;
  const c = targetCtx || ctx;

  for (let i = 0; i < stackHeight; i++){
    const { x, y } = stackBrickAnchor(col, row, stackHeight, i);
    const isTop = i === stackHeight - 1;
    const colors = typeof cubeColorsForCell === 'function'
      ? cubeColorsForCell(cell, isTop, stackHeight, i, stackHeight)
      : { top: '#83bd72', right: '#6a9658', left: '#5a8048' };

    if (typeof drawIsoCubeGeometry === 'function'){
      drawIsoCubeGeometry(c, x, y, colors, {
        top: !isTop || topMode === 'road',
        walls: false,
      });
    } else if (typeof drawIsoCube === 'function'){
      drawIsoCube(c, x, y, colors);
    }
  }
  return true;
}

/** Calque 1 : eau + géométrie empilée (sans falaises ni textures). */
function drawLayeredTerrainGeometry(targetCtx, col, row, cell){
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  const base = tileAnchorBase(col, row);

  if (cell.hasRoad){
    if (level <= 0) drawWaterFlat(targetCtx, base.x, base.y, col, row);
    else drawGeometryStack(targetCtx, col, row, cell, level, 'road');
    return;
  }

  if (cell.terrain === 'water' || level <= 0){
    drawWaterFlat(targetCtx, base.x, base.y, col, row);
    return;
  }

  drawGeometryStack(targetCtx, col, row, cell, level, null);
}

/** Calque falaises : PNG auto (mode cubes cap-only) ou procédural (legacy). */
function drawLayeredTerrainCliffs(targetCtx, col, row, cell){
  if (typeof usesFullFaceCubes === 'function' && usesFullFaceCubes()) return;
  if (typeof TERRAIN_POLIS_CLIFF_WALLS === 'boolean' && TERRAIN_POLIS_CLIFF_WALLS) return;
  if (cell.terrain === 'water' || cell.hasRoad) return;
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);
  if (level <= 0) return;
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()
      && typeof drawCellCliff === 'function'){
    const { x, y } = tileTopAtLevel(col, row, level);
    drawCellCliff(targetCtx, col, row, x, y);
    return;
  }
  drawCliffLayerForCell(targetCtx, col, row, cell);
}


/** Calque 2 : textures (losanges PNG) sur le sommet — ignoré en mode cubes. */
function drawLayeredTerrainTextures(targetCtx, col, row, cell){
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()) return;
  const level = typeof cellLevel === 'function' ? cellLevel(col, row) : (cell.level || 1);

  if (cell.hasRoad){
    if (level > 0) drawRoadTextureCap(targetCtx, col, row, cell);
    return;
  }

  if (cell.terrain === 'water' || level <= 0) return;

  const useTexture = typeof TERRAIN_TEXTURE_LAYER === 'boolean' ? TERRAIN_TEXTURE_LAYER : true;
  if (useTexture) drawTextureCap(targetCtx, col, row, cell);
}

/** Rendu terrain en 2 calques (+ falaises) — tout en un pass (preview / legacy). */
function drawLayeredTerrainCell(targetCtx, col, row, cell){
  drawLayeredTerrainGeometry(targetCtx, col, row, cell);
  if (!(typeof usesPolisInlineCliffs === 'function' && usesPolisInlineCliffs())){
    drawLayeredTerrainCliffs(targetCtx, col, row, cell);
  }
  drawLayeredTerrainTextures(targetCtx, col, row, cell);
}

function areFlatCapSpritesReady(){
  if (!(typeof TERRAIN_CAP_USE_FLAT_SPRITES === 'boolean' && TERRAIN_CAP_USE_FLAT_SPRITES)) return true;
  if (typeof TERRAIN_SPRITE_IMAGES !== 'object' || !TERRAIN_SPRITE_IMAGES) return false;
  const required = ['grass', 'sand', 'hill', 'rock'];
  return required.some(k => {
    const img = TERRAIN_SPRITE_IMAGES[k];
    return img && img.complete && img.naturalWidth > 0;
  });
}

function areLayeredTerrainReady(){
  if (typeof usesTexturedCubes === 'function' && usesTexturedCubes()){
    return typeof areBlockSpritesReady === 'function' && areBlockSpritesReady();
  }
  if (typeof TERRAIN_PROCEDURAL_CAPS === 'boolean' && TERRAIN_PROCEDURAL_CAPS){
    return typeof areProceduralTerrainReady === 'function' && areProceduralTerrainReady();
  }
  if (typeof TERRAIN_TEXTURE_LAYER === 'boolean' && !TERRAIN_TEXTURE_LAYER){
    return typeof areProceduralTerrainReady === 'function' && areProceduralTerrainReady();
  }
  if (typeof TERRAIN_CAP_USE_FLAT_SPRITES === 'boolean' && TERRAIN_CAP_USE_FLAT_SPRITES){
    if (areFlatCapSpritesReady()) return true;
  }
  const caps = typeof TERRAIN_BLOCK_CAP === 'object' && TERRAIN_BLOCK_CAP;
  const hasCaps = caps && Object.keys(TERRAIN_BLOCK_CAP).length >= 3;
  if (hasCaps) return true;
  return typeof areBlockSpritesReady === 'function' && areBlockSpritesReady();
}
