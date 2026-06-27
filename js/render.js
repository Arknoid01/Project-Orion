/* ===================== CANVAS ===================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high'; // meilleur rendu des sprites PNG mis à l'échelle (zoom)

/* ===================== CHARGEMENT DES SPRITES REELS ===================== */
// Charge les PNG générés via le pipeline ComfyUI (dossier assets/buildings/).
// Tant qu'une image n'est pas chargée, drawBuilding utilise le rendu procédural de secours.
const BUILDING_SPRITES = {};
Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
  if (!def.sprite) return;
  const img = new Image();
  img.onload = () => { debugInfo(`Sprite chargé : ${def.sprite}`); render(); };
  img.onerror = () => debugWarn(`Sprite introuvable : ${def.sprite} (vérifie qu'il est dans assets/buildings/)`);
  img.src = def.sprite;
  BUILDING_SPRITES[key] = img;
});

// Sprites de maison par niveau (assets/houses/). Repli procédural si absent.
const HOUSE_SPRITES = {};
HOUSE_LEVELS.forEach(lvl => {
  if (!lvl.sprite) return;
  const img = new Image();
  img.onload = () => { debugInfo(`Sprite chargé : ${lvl.sprite}`); render(); };
  img.onerror = () => debugWarn(`Sprite de maison introuvable : ${lvl.sprite}`);
  img.src = lvl.sprite;
  HOUSE_SPRITES[lvl.key] = img;
});

// Sprites de sol (losanges iso). Tant qu'ils ne sont pas chargés, on dessine
// un losange de couleur unie (TERRAIN_COLORS) en repli.
const TERRAIN_SPRITE_IMAGES = {};
Object.entries(TERRAIN_SPRITES).forEach(([key, path]) => {
  const img = new Image();
  img.onload = () => {
    invalidateTerrainLayerCache();
    debugInfo(`Sprite de terrain chargé : ${path}`);
  };
  img.onerror = () => debugWarn(`Sprite de terrain introuvable : ${path}`);
  img.src = path;
  TERRAIN_SPRITE_IMAGES[key] = img;
});

// Sprite de route (dallage iso). Repli : losange brun procédural.
const ROAD_SPRITE = new Image();
ROAD_SPRITE.onload = () => { debugInfo(`Sprite de route chargé : ${ROAD_SPRITE_PATH}`); render(); };
ROAD_SPRITE.onerror = () => debugWarn(`Sprite de route introuvable : ${ROAD_SPRITE_PATH}`);
ROAD_SPRITE.src = ROAD_SPRITE_PATH;

const WALKER_SPRITE = new Image();
WALKER_SPRITE.onload = () => { debugInfo(`Sprite chargé : ${WALKER_SPRITE_PATH}`); render(); };
WALKER_SPRITE.onerror = () => debugWarn(`Sprite introuvable : ${WALKER_SPRITE_PATH}`);
WALKER_SPRITE.src = WALKER_SPRITE_PATH;

/* ===================== PRIMITIVES DE DESSIN ===================== */
// Dessine la case de terrain : sprite si disponible, sinon texture procédurale détaillée.
function terrainMicroShade(hex, col, row, elevation){
  const n = mulberry32(hashSeed(col, row))();
  const elevAdj = Math.round((elevation - 0.4) * 30);
  const micro = Math.round((n - 0.5) * 18);
  return shade(hex, elevAdj + micro);
}

function drawTerrainProceduralDetail(cx, cy, terrain, col, row){
  const seed = hashSeed(col, row);
  const rng = mulberry32(seed);

  if (terrain === 'forest'){
    const trees = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < trees; i++){
      const tx = cx + (rng() - 0.5) * 22;
      const ty = cy + (rng() - 0.5) * 8;
      ctx.beginPath();
      ctx.arc(tx, ty - 4, 3 + rng() * 2, 0, Math.PI * 2);
      ctx.fillStyle = rng() > 0.5 ? '#3d5c2e' : '#527a3c';
      ctx.fill();
    }
  } else if (terrain === 'sand'){
    for (let i = 0; i < 5; i++){
      ctx.fillStyle = `rgba(255,255,240,${0.08 + rng() * 0.12})`;
      ctx.fillRect(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 10, 2, 1);
    }
  } else if (terrain === 'rock'){
    ctx.strokeStyle = 'rgba(60,58,55,0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++){
      ctx.beginPath();
      ctx.moveTo(cx + (rng() - 0.5) * 18, cy + (rng() - 0.5) * 8);
      ctx.lineTo(cx + (rng() - 0.5) * 18, cy + (rng() - 0.5) * 8);
      ctx.stroke();
    }
  } else if (terrain === 'water'){
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const wave = Math.sin(col * 0.7 + row * 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + wave);
    ctx.quadraticCurveTo(cx, cy + wave - 2, cx + 14, cy + wave);
    ctx.stroke();
  } else if (terrain === 'wheat'){
    ctx.strokeStyle = 'rgba(160,120,40,0.35)';
    for (let i = 0; i < 4; i++){
      const sx = cx + (rng() - 0.5) * 18;
      ctx.beginPath();
      ctx.moveTo(sx, cy + 4);
      ctx.lineTo(sx, cy - 6 - rng() * 4);
      ctx.stroke();
    }
  } else if (terrain === 'hill' || (terrain === 'grass' && col + row)){
    if (rng() > 0.65){
      ctx.fillStyle = 'rgba(90,120,60,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx + (rng() - 0.5) * 12, cy + 2, 4 + rng() * 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawReliefShadow(cx, cy, elevation, terrain, slope, targetCtx){
  const c = targetCtx || ctx;
  if (terrain === 'water') return;
  const hillLike = terrain === 'hill' || terrain === 'grass' || terrain === 'forest';
  if (elevation > MAP_HILL_THRESHOLD && hillLike){
    c.beginPath();
    c.moveTo(cx, cy + TILE_H * 0.08);
    c.lineTo(cx + TILE_W * 0.34, cy + TILE_H * 0.28);
    c.lineTo(cx, cy + TILE_H * 0.36);
    c.lineTo(cx - TILE_W * 0.34, cy + TILE_H * 0.28);
    c.closePath();
    c.fillStyle = `rgba(0,0,0,${0.03 + (elevation - MAP_HILL_THRESHOLD) * 0.18})`;
    c.fill();
  }
  if (slope > 0.06 && terrain === 'rock'){
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.beginPath();
    c.moveTo(cx - 8, cy - 4);
    c.lineTo(cx + 8, cy - 8);
    c.lineTo(cx + 4, cy);
    c.closePath();
    c.fill();
  }
}

/* ===================== CACHE COUCHE TERRAIN (statique après génération carte) ===================== */
let terrainLayerCache = null;

function invalidateTerrainLayerCache(){
  terrainLayerCache = null;
}

function ensureTerrainLayerCache(){
  if (terrainLayerCache) return terrainLayerCache;
  const allSpritesReady = Object.values(TERRAIN_SPRITE_IMAGES).every(
    img => img.complete && img.naturalWidth > 0
  );
  if (!allSpritesReady) return null;

  const c = document.createElement('canvas');
  c.width = WORLD_WIDTH;
  c.height = WORLD_HEIGHT;
  const tctx = c.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';

  getMapDrawOrder().forEach(({ col, row }) => {
    const cell = grid[row][col];
    const { x, y } = tileCenter(col, row);
    const img = TERRAIN_SPRITE_IMAGES[cell.terrain];
    if (img && img.complete && img.naturalWidth > 0){
      tctx.drawImage(img, x - TILE_W / 2, y - TILE_H / 2, TILE_W, TILE_H);
      drawReliefShadow(x, y, cell.elevation, cell.terrain, cell.slope, tctx);
    }
  });

  terrainLayerCache = c;
  return terrainLayerCache;
}

function drawTerrainTile(cx, cy, terrain, elevation, col, row, slope){
  elevation = elevation || 0;
  slope = slope || 0;
  const baseColor = TERRAIN_COLORS[terrain] || TERRAIN_COLORS.grass;
  const img = TERRAIN_SPRITE_IMAGES[terrain];
  if (img && img.complete && img.naturalWidth > 0){
    ctx.drawImage(img, cx - TILE_W / 2, cy - TILE_H / 2, TILE_W, TILE_H);
  } else {
    const shaded = terrainMicroShade(baseColor, col, row, elevation);
    drawDiamond(cx, cy, shaded);
    drawTerrainProceduralDetail(cx, cy, terrain, col, row);
  }
  drawReliefShadow(cx, cy, elevation, terrain, slope);
}

function drawDiamond(cx, cy, fillColor, strokeColor){
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H/2);
  ctx.lineTo(cx + TILE_W/2, cy);
  ctx.lineTo(cx, cy + TILE_H/2);
  ctx.lineTo(cx - TILE_W/2, cy);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor || 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function shade(hex, percent){
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;
  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);
  return '#' + (r.toString(16).padStart(2,'0')) + (g.toString(16).padStart(2,'0')) + (b.toString(16).padStart(2,'0'));
}

/* ===================== RENDU BATIMENTS ===================== */
// Pose un sprite ancré sur la base de la tuile (mêmes proportions pour bâtiments et maisons).
function drawSpriteOnTile(cx, cy, sprite, targetW){
  targetW = targetW || 92;
  const scale = targetW / sprite.naturalWidth;
  const targetH = sprite.naturalHeight * scale;
  ctx.drawImage(sprite, cx - targetW / 2, cy + TILE_H / 2 - targetH + 10, targetW, targetH);
}

// Sprite de maison à utiliser pour un niveau : le sien, sinon le plus haut niveau
// inférieur qui a un sprite (ex. domaine/résidence/palais retombent sur villa).
function houseSpriteForLevel(level){
  for (let i = level; i >= 0; i--){
    const img = HOUSE_SPRITES[HOUSE_LEVELS[i].key];
    if (img && img.complete && img.naturalWidth > 0) return img;
  }
  return null;
}

function drawBuilding(cx, cy, type, col, row){
  const def = BUILDING_DEFS[type];

  if (def.isMonument){
    drawMonument(type, col, row);
    return;
  }

  if (def.isHouse){
    const cell = grid[row][col];
    const sprite = houseSpriteForLevel(cell.houseLevel);
    if (sprite){
      drawSpriteOnTile(cx, cy, sprite);
      return;
    }
    // repli procédural si aucun sprite n'est encore chargé
    const variant = composeHouseVariant(hashSeed(col, row));
    variant.widthScale *= 1 + cell.houseLevel * 0.18; // grandit visuellement avec le niveau
    drawHouse(cx, cy, variant);
    return;
  }

  const sprite = BUILDING_SPRITES[type];
  if (def.isDecoration){
    if (sprite && sprite.complete && sprite.naturalWidth > 0){
      drawSpriteOnTile(cx, cy, sprite);
      return;
    }
    drawDecoration(cx, cy, type);
    return;
  }

  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    drawSpriteOnTile(cx, cy, sprite);
    return;
  }

  // ---- repli procédural (sprite pas encore chargé ou absent) ----
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 24);
  ctx.lineTo(cx + 20, cy - 24);
  ctx.lineTo(cx, cy - 40);
  ctx.closePath();
  ctx.fillStyle = shade(def.color, -25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  roundRect(cx - 18, cy - 24, 36, 26, 4);
  ctx.fillStyle = def.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.icon, cx, cy - 6);
}

// Temple monumental 2×2 : dessiné une seule fois depuis l'ancre, centré sur le footprint,
// avec un sprite plus large (spriteScale, défaut 200 px vs 92 pour un bâtiment normal).
function drawMonument(type, anchorCol, anchorRow){
  const def = BUILDING_DEFS[type];
  const size = def.footprint || 2;
  const { x, y } = (typeof monumentScreenCenter === 'function')
    ? monumentScreenCenter(anchorCol, anchorRow, size)
    : tileCenter(anchorCol, anchorRow);
  const targetW = def.spriteScale || 200;
  const sprite = BUILDING_SPRITES[type];
  if (sprite && sprite.complete && sprite.naturalWidth > 0){
    drawSpriteOnTile(x, y, sprite, targetW);
    return;
  }
  // repli procédural : grand temple stylisé
  ctx.font = '48px serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.icon, x, y - 20);
  roundRect(x - 36, y - 50, 72, 52, 6);
  ctx.fillStyle = def.color || '#d4af37';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
}

/* ---- Rendu procédural des maisons (modules : corps, toit, bande, annexe) ---- */
function drawBoxFaces(cx, baseY, topY, w, footH, leftColor, rightColor){
  ctx.beginPath();
  ctx.moveTo(cx - w, baseY);
  ctx.lineTo(cx, baseY + footH);
  ctx.lineTo(cx, topY + footH);
  ctx.lineTo(cx - w, topY);
  ctx.closePath();
  ctx.fillStyle = leftColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, baseY + footH);
  ctx.lineTo(cx + w, baseY);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + footH);
  ctx.closePath();
  ctx.fillStyle = rightColor; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

function drawFlatRoof(cx, topY, w, footH, color){
  ctx.beginPath();
  ctx.moveTo(cx, topY - footH);
  ctx.lineTo(cx + w, topY);
  ctx.lineTo(cx, topY + footH);
  ctx.lineTo(cx - w, topY);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
}

function drawTrimBand(cx, topY, w, footH, color){
  const bandH = 4;
  ctx.beginPath();
  ctx.moveTo(cx - w, topY);
  ctx.lineTo(cx - w, topY + bandH);
  ctx.lineTo(cx, topY + footH + bandH);
  ctx.lineTo(cx, topY + footH);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, topY + footH);
  ctx.lineTo(cx, topY + footH + bandH);
  ctx.lineTo(cx + w, topY + bandH);
  ctx.lineTo(cx + w, topY);
  ctx.closePath();
  ctx.fillStyle = shade(color, -10); ctx.fill();
}

function drawHouse(cx, cy, v){
  const w = 30 * v.widthScale;
  const footH = w / 2;
  const wallH = 24;
  const baseY = cy + (TILE_H / 2 - footH);
  const topY = baseY - wallH;

  if (v.hasAnnex){
    const aw = w * 0.55;
    const afh = aw / 2;
    const ax = cx - w - aw * 0.3;
    const aWallH = wallH * 0.65;
    const abaseY = baseY + 2;
    const atopY = abaseY - aWallH;
    drawBoxFaces(ax, abaseY, atopY, aw, afh, shade(v.wallColor, -25), shade(v.wallColor, -10));
    drawFlatRoof(ax, atopY, aw, afh, shade(v.roofColor, -15));
  }

  drawBoxFaces(cx, baseY, topY, w, footH, shade(v.wallColor, -20), v.wallColor);

  if (v.hasTrim){
    drawTrimBand(cx, topY, w, footH, v.trimColor);
  }

  if (v.roofShape === 'pyramid'){
    const apex = { x: cx, y: topY - footH - w * 0.9 };
    ctx.beginPath();
    ctx.moveTo(cx - w, topY); ctx.lineTo(cx, topY + footH); ctx.lineTo(apex.x, apex.y); ctx.closePath();
    ctx.fillStyle = shade(v.roofColor, -15); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, topY + footH); ctx.lineTo(cx + w, topY); ctx.lineTo(apex.x, apex.y); ctx.closePath();
    ctx.fillStyle = v.roofColor; ctx.fill(); ctx.stroke();
  } else if (v.roofShape === 'dome'){
    const domeH = w * 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, topY - domeH * 0.35, w * 0.75, domeH * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = v.roofColor; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  } else {
    drawFlatRoof(cx, topY, w, footH, v.roofColor);
  }
}

/* ===================== RENDU DECORATIONS ===================== */
// Repli procédural si le sprite PNG (assets/buildings/) n'est pas encore chargé.
function drawDecoration(cx, cy, type){
  const baseY = cy + TILE_H / 2;
  const stroke = 'rgba(0,0,0,0.35)';

  if (type === 'statue'){
    ctx.fillStyle = '#b9b2a3';                 // socle
    ctx.fillRect(cx - 8, baseY - 10, 16, 10);
    ctx.strokeStyle = stroke; ctx.strokeRect(cx - 8, baseY - 10, 16, 10);
    ctx.fillStyle = '#ece6d8';                 // corps
    roundRect(cx - 5, baseY - 30, 10, 22, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath();                           // tête
    ctx.arc(cx, baseY - 33, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ece6d8'; ctx.fill(); ctx.stroke();
  } else if (type === 'garden'){
    const blobs = [[-8, -2, 7], [6, 0, 8], [0, -8, 7], [-2, 4, 6]];
    blobs.forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 10 + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#5f8f3e'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
    });
    ctx.fillStyle = '#e8c468';                 // quelques fleurs
    [[-6, -6], [5, -4], [-1, -10]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, baseY - 10 + dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (type === 'colonnade'){
    [-10, 0, 10].forEach(dx => {
      ctx.fillStyle = '#efe9da';               // fût
      ctx.fillRect(cx + dx - 3, baseY - 26, 6, 24);
      ctx.strokeStyle = stroke; ctx.strokeRect(cx + dx - 3, baseY - 26, 6, 24);
      ctx.fillStyle = '#d9d2c0';               // chapiteau
      ctx.fillRect(cx + dx - 5, baseY - 29, 10, 4);
    });
    ctx.fillStyle = '#d9d2c0';                 // entablement
    ctx.fillRect(cx - 14, baseY - 33, 28, 5);
    ctx.strokeStyle = stroke; ctx.strokeRect(cx - 14, baseY - 33, 28, 5);
  }
}

/* ===================== RENDU ROUTE ===================== */
function drawRoad(cx, cy){
  // sprite de dallage iso si disponible (couvre toute la tuile, léger débord pour
  // masquer les coutures), sinon repli losange brun procédural.
  if (ROAD_SPRITE.complete && ROAD_SPRITE.naturalWidth > 0){
    ctx.drawImage(ROAD_SPRITE, cx - TILE_W / 2, cy - TILE_H / 2, TILE_W, TILE_H);
    return;
  }
  // tuile de route légèrement plus petite que la tuile de terrain, pour qu'on voie
  // encore la couleur du terrain en bordure (effet "chemin tracé sur le sol")
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H * 0.4);
  ctx.lineTo(cx + TILE_W * 0.4, cy);
  ctx.lineTo(cx, cy + TILE_H * 0.4);
  ctx.lineTo(cx - TILE_W * 0.4, cy);
  ctx.closePath();
  ctx.fillStyle = '#9c8868';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
}

function drawPatrolBlock(cx, cy){
  // petite borne (façon horos grec) signalant un demi-tour forcé du walker
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(cx - 3, cy - 12, 6, 12);
  ctx.beginPath();
  ctx.arc(cx, cy - 13, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#cfcac0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
}

/* ===================== RENDU WALKERS ===================== */
// Couleur par métier, pour distinguer d'un coup d'œil qui parcourt la ville
// (signature "ville vivante" des jeux Impressions).
const SERVICE_COLORS = {
  water:    '#5a8fae',
  market:   '#c97b3d',
  religion: '#c4b27a',
  health:   '#9ec2c4',
};

function drawWalkers(now){
  const spriteReady = WALKER_SPRITE.complete && WALKER_SPRITE.naturalWidth > 0;

  walkers.forEach(w => {
    if (w.path.length <= 1) return;
    const { x, y } = getWalkerScreenPos(w, now);
    const roleColor = SERVICE_COLORS[w.serviceType] || '#e8c468';

    if (spriteReady){
      const frame = Math.floor(now / WALKER_ANIM_FRAME_MS) % WALKER_FRAMES_PER_CYCLE;
      const sx = frame * WALKER_FRAME_SIZE;
      const sy = WALKER_DIRECTION_ROWS[w.facing] * WALKER_FRAME_SIZE;
      const d = WALKER_DISPLAY_SIZE;
      ctx.drawImage(
        WALKER_SPRITE,
        sx, sy, WALKER_FRAME_SIZE, WALKER_FRAME_SIZE,
        x - d / 2, y - d + 8, d, d
      );
      ctx.beginPath();
      ctx.arc(x, y - d + 6, 4, 0, Math.PI * 2);
      ctx.fillStyle = roleColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y - 6, 7, 0, Math.PI * 2);
      ctx.fillStyle = roleColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
}

/* ===================== RENDU MONSTRE & HEROS ===================== */
function drawAgentToken(x, y, icon, ringColor){
  ctx.beginPath();
  ctx.arc(x, y - 8, 13, 0, Math.PI * 2);
  ctx.fillStyle = ringColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, x, y - 7);
}

function drawHpBar(x, y, ratio){
  const w = 26, h = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - w / 2, y - 28, w, h);
  ctx.fillStyle = '#c33';
  ctx.fillRect(x - w / 2, y - 28, w * Math.max(0, Math.min(1, ratio)), h);
}

function drawCreatures(now){
  if (typeof monster !== 'undefined' && monster){
    const { x, y } = getCreatureScreenPos(monster, now);
    drawAgentToken(x, y, monster.icon, 'rgba(150,30,30,0.92)');
    drawHpBar(x, y, monster.hp / MONSTER_HP);
  }
  if (typeof hero !== 'undefined' && hero){
    const { x, y } = getCreatureScreenPos(hero, now);
    drawAgentToken(x, y, '🦸', 'rgba(60,110,200,0.92)');
  }
  if (typeof godAgents !== 'undefined'){
    godAgents.forEach(agent => {
      const { x, y } = getCreatureScreenPos(agent, now);
      drawAgentToken(x, y, agent.icon, 'rgba(214,175,70,0.95)');
    });
  }
  if (typeof migrants !== 'undefined'){
    migrants.forEach(m => {
      const { x, y } = getMigrantsScreenPos(m, now);
      const color = m.type === 'in' ? 'rgba(80,160,90,0.92)' : 'rgba(180,120,60,0.92)';
      drawAgentToken(x, y, m.type === 'in' ? '🧳' : '🚶', color);
    });
  }
  if (typeof invasion !== 'undefined' && invasion){
    const { x, y } = getCreatureScreenPos(invasion, now);
    drawAgentToken(x, y, invasion.icon, 'rgba(120,40,40,0.95)');
    drawHpBar(x, y, invasion.power / 100);
  }
}

/* ===================== ICONES DE STATUT DES MAISONS ===================== */
function drawHouseStatusIcons(cx, cy, col, row, cell){
  const icons = getHouseStatusIcons(col, row, cell);
  if (icons.length === 0) return;

  const iconSize = 11;
  const spacing = iconSize + 1;
  const startX = cx - ((icons.length - 1) * spacing) / 2;
  const y = cy - TILE_H / 2 - 38; // au-dessus du toit -- peut demander un ajustement fin selon le sprite

  ctx.font = `${iconSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  icons.forEach((icon, i) => {
    const x = startX + i * spacing;
    ctx.beginPath();
    ctx.arc(x, y, iconSize / 2 + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillText(icon, x, y + 1);
  });
}

/* ===================== RENDU PRINCIPAL ===================== */
function render(now){
  now = now || performance.now();

  // Réinitialise la transformation avant de nettoyer (sinon clearRect serait lui-même
  // affecté par le zoom et ne viderait pas tout le buffer réel).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Applique le zoom (+ devicePixelRatio pour la netteté sur écran haute densité) :
  // tout ce qui suit se dessine dans les coordonnées "monde" habituelles (TILE_W,
  // OFFSET_X...), redimensionnées par cette transformation -- jamais d'étirement
  // d'une image déjà dessinée.
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(zoomLevel * dpr, 0, 0, zoomLevel * dpr, 0, 0);

  // tuiles (cache statique) + routes + bâtiments, triées par profondeur iso
  const drawOrder = getMapDrawOrder();
  const terrainCache = ensureTerrainLayerCache();
  if (terrainCache){
    ctx.drawImage(terrainCache, 0, 0);
  }

  drawOrder.forEach(({ col, row }) => {
      const cell = grid[row][col];
      const { x, y } = tileCenter(col, row);
      if (!terrainCache){
        drawTerrainTile(x, y, cell.terrain, cell.elevation, col, row, cell.slope);
      }
      if (cell.beauty){
        const alpha = Math.min(0.4, (cell.beauty / BEAUTY_THRESHOLD) * 0.4);
        drawDiamond(x, y, `rgba(214,175,70,${alpha})`, 'rgba(0,0,0,0)');
      }
      if (cell.hasRoad){
        drawRoad(x, y);
        if (cell.patrolBlock) drawPatrolBlock(x, y);
      }
      if (cell.building){
        drawBuilding(x, y, cell.building, col, row);
      }
  });

  // icônes de statut des maisons : passe séparée, après tous les bâtiments, pour
  // qu'une icône ne se retrouve jamais cachée derrière un bâtiment dessiné après elle.
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row][col];
      if (cell.building === 'maison'){
        const { x, y } = tileCenter(col, row);
        drawHouseStatusIcons(x, y, col, row, cell);
      }
    }
  }

  drawWalkers(now);
  drawCreatures(now);

  // surbrillance de la/les case(s) survolée(s) — 2×2 pour les monuments
  if (hoverTile && inBounds(hoverTile.col, hoverTile.row)){
    const def = selectedBuilding ? BUILDING_DEFS[selectedBuilding] : null;
    const fp = (def && def.footprint) || 1;
    const tiles = (fp > 1 && typeof monumentFootprintTiles === 'function')
      ? monumentFootprintTiles(hoverTile.col, hoverTile.row, fp)
      : [{ col: hoverTile.col, row: hoverTile.row }];
    let color = 'rgba(255,255,255,0.35)';
    if (selectedBuilding){
      color = canPlace(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (roadMode){
      color = canPlaceRoad(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (blockMode){
      color = canToggleBlock(hoverTile.col, hoverTile.row) ? 'rgba(120,255,120,0.45)' : 'rgba(255,60,60,0.45)';
    } else if (demolishMode){
      const c = grid[hoverTile.row][hoverTile.col];
      const anchor = (typeof monumentAnchorAt === 'function') ? monumentAnchorAt(hoverTile.col, hoverTile.row) : null;
      color = (c.building || c.hasRoad || anchor) ? 'rgba(255,60,60,0.45)' : 'rgba(255,255,255,0.2)';
    }
    tiles.forEach(t => {
      if (!inBounds(t.col, t.row)) return;
      const { x, y } = tileCenter(t.col, t.row);
      drawDiamond(x, y, color, 'rgba(0,0,0,0.4)');
    });
  }
}
